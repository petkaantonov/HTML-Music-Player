import {buildConsecutiveRanges, indexMapper} from "util";
import withDeps from "ApplicationDependencies";
import DraggableSelection from "ui/DraggableSelection";
import {ACTION_CLICKED} from "ui/Snackbar";
import TrackView from "tracks/TrackView";
import TrackViewOptions from "tracks/TrackViewOptions";
import TrackSorterTrait from "tracks/TrackSorterTrait";
import TrackContainerController, {LENGTH_CHANGE_EVENT} from "tracks/TrackContainerController";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";

export const NEXT_TRACK_CHANGE_EVENT = `nextTrackChange`;
export const CURRENT_TRACK_CHANGE_EVENT = `currentTrackChange`;
export const TRACK_PLAYING_STATUS_CHANGE_EVENT = `trackPlayingStatusChange`;
export const HISTORY_CHANGE_EVENT = `historyChange`;
export const MODE_CHANGE_EVENT = `modeChange`;
export const PLAYLIST_STOPPED_EVENT = `playlistStopped`;

const PLAYLIST_TRACKS_REMOVED_TAG = `playlist-tracks-removed`;
const PLAYLIST_MODE_KEY = `playlist-mode`;
const SHUFFLE_MODE = `shuffle`;

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;
const MAX_ERRORS = 200;
const MAX_HISTORY = 500;

class PlaylistTrack {
    constructor(track = null,
                trackView = null) {
        this._track = track;
        this._trackView = trackView;
    }

    track() {
        return this._track;
    }

    trackView() {
        return this._trackView;
    }

    getIndex() {
        return this._trackView ? this._trackView.getIndex() : -1;
    }

    formatIndex() {
        return this.getIndex() <= 0 ? `` : `${this.getIndex() + 1}. `;
    }

    formatFullName() {
        return this.track() ? this.track().formatFullName() : ``;
    }

    hasError() {
        return this._track ? this._track.hasError() : false;
    }

    isDummy() {
        return !this._track && !this._trackView;
    }
}

const DUMMY_PLAYLIST_TRACK = new PlaylistTrack();

const Modes = {
    normal(playlistTrack) {
        let index = playlistTrack.getIndex() + 1;

        let ret;
        let trials = 0;

        do {
            index = Math.max(0, index);
            if (index >= this.length) {
                index = 0;
            }

            const trackView = this._trackViews[index];
            if (trackView) {
                ret = new PlaylistTrack(trackView.track(), trackView);
            }
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret || DUMMY_PLAYLIST_TRACK;
    },

    shuffle(playlistTrack) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        const trackViews = this.getTrackViews();
        const currentTrack = playlistTrack.track();
        const nextTrack = nextPlaylistTrack.track();

        let maxWeight = 0;
        for (let i = 0; i < trackViews.length; ++i) {
            maxWeight += trackViews[i].track().getWeight(currentTrack, nextTrack);
        }

        let target = (Math.random() * maxWeight) | 0;
        for (let i = 0; i < trackViews.length; ++i) {
            const track = trackViews[i].track();
            const weight = track.getWeight(currentTrack, nextTrack);

            if (target < weight) {
                return track;
            }
            target -= weight;
        }

        target = (Math.random() * trackViews.length) | 0;
        const view = trackViews[target];

        if (view && view.track()) {
            return new PlaylistTrack(view.track(), view);
        }
        return nextPlaylistTrack;
    },

    repeat(currentPlaylistTrack) {
        if (currentPlaylistTrack.hasError()) {
            return Modes.normal.call(this, currentPlaylistTrack);
        }
        return currentPlaylistTrack || DUMMY_PLAYLIST_TRACK;
    }
};

let nextPlayId = 10;

export default class PlaylistController extends TrackContainerController {
    constructor(opts, deps) {
        opts.trackRaterZIndex = zIndex;
        super(opts, deps);
        this.snackbar = deps.snackbar;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.tooltipContext = deps.tooltipContext;
        this.metadataManager = deps.metadataManager;

        this._mode = Modes.hasOwnProperty(opts.mode) ? opts.mode : `normal`;

        this._currentPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;

        this._trackListDeletionUndo = null;
        this._currentPlayId = -1;
        this._trackHistory = [];

        this._trackViewOptions = new TrackViewOptions(opts.itemHeight,
                                                      this,
                                                      this.page,
                                                      deps.tooltipContext,
                                                      this._selectable,
                                                      null,
                                                      this.env.hasTouch());
        this._errorCount = 0;




        this._draggable = withDeps({
            recognizerContext: this.recognizerContext,
            page: this.page,
            globalEvents: this.globalEvents
        }, d => new DraggableSelection({
            target: this.$(),
            listView: this,
            scroller: this._fixedItemListScroller,
            mustNotMatchSelector: `.track-rating`,
            mustMatchSelector: `.track-container`
        }, d));

        if (PLAYLIST_MODE_KEY in this.dbValues) {
            this.tryChangeMode(this.dbValues[PLAYLIST_MODE_KEY]);
        }

        if (!this.length) {
            this.showPlaylistEmptyIndicator();
        }

        this._draggable.bindEvents();
    }

    bindKeyboardShortcuts() {
        super.bindKeyboardShortcuts();
        this._keyboardShortcutContext.addShortcut(`Delete`, this.removeSelected.bind(this));
    }

    _createSingleTrackMenu() {
        const menu = [];

        menu.push({
            id: `play`,
            content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
            onClick: () => {
                this.changeTrackExplicitly(this._singleTrackViewSelected.track(), this._singleTrackViewSelected);
                this._singleTrackMenu.hide();
            }
        });

        menu.push({
            id: `delete`,
            content: this.menuContext.createMenuItem(`Delete`, `material-icons small-material-icon delete`),
            onClick: () => {
                this.removeTrackView(this._singleTrackViewSelected);
                this._singleTrackMenu.hide();
            }
        });

        menu.push({
            divider: true
        });

        menu.push({
            id: `track-rating`,
            content: () => this._trackRater.$(),
            onClick(e) {
                e.preventDefault();
                e.preventRipple();
            }
        });

        const ret = this.menuContext.createVirtualButtonMenu({menu, zIndex});
        ret.on(`willHideMenu`, () => {
            this._singleTrackViewSelected = null;
        });
        return ret;
    }

    tabWillHide() {
        super.tabWillHide();
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidShow() {
        super.tabDidShow();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
    }

    getCurrentPlaylistTrack() {
        return this._currentPlaylistTrack;
    }

    getNextPlaylistTrack() {
        return this._nextPlaylistTrack;
    }

    _setNextPlaylistTrack(playlistTrack) {
        if (!(playlistTrack instanceof PlaylistTrack)) {
            throw new Error(`invalid playlistTrack`);
        }
        this._nextPlaylistTrack = playlistTrack;
    }

    _setCurrentPlaylistTrack(playlistTrack) {
        if (!(playlistTrack instanceof PlaylistTrack)) {
            throw new Error(`invalid playlistTrack`);
        }
        this._currentPlaylistTrack = playlistTrack;
    }

    _updateNextTrack() {
        this._setNextPlaylistTrack(Modes[this._mode].call(this.getCurrentPlaylistTrack()));

        if (this.getNextPlaylistTrack().hasError()) {
            this._setNextPlaylistTrack(DUMMY_PLAYLIST_TRACK);
        }

        this.emit(NEXT_TRACK_CHANGE_EVENT);
    }

    _changeTrack(playlistTrack, doNotRecordHistory, trackChangeKind, isUserInitiatedSkip) {
        if (!playlistTrack || playlistTrack.isDummy() || this._errorCount >= MAX_ERRORS) {
            this._errorCount = 0;
            this._setCurrentTrack(DUMMY_PLAYLIST_TRACK, trackChangeKind);
            this.emit(PLAYLIST_STOPPED_EVENT);
            return false;
        }
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            if (!doNotRecordHistory) {
                if (this._trackHistory.push(currentPlaylistTrack) > MAX_HISTORY) {
                    this._trackHistory.shift();
                }
                this.emit(HISTORY_CHANGE_EVENT);
            }
        }

        this._setCurrentTrack(playlistTrack, trackChangeKind);
        const trackHasError = playlistTrack.hasError();
        if (trackHasError && trackChangeKind === KIND_IMPLICIT) {
            this._errorCount++;
            if (this._mode === `repeat` && this.length > 1) {
                playlistTrack = Modes.normal.call(this, playlistTrack);
                this._setCurrentTrack(playlistTrack, KIND_IMPLICIT);
            } else {
                return this.next(false);
            }
        }

        this._currentPlayId = nextPlayId++;
        this.emit(TRACK_PLAYING_STATUS_CHANGE_EVENT, playlistTrack);
        this.emit(CURRENT_TRACK_CHANGE_EVENT, playlistTrack.track(), !!isUserInitiatedSkip);
        return true;
    }

    selectionContainsAnyItemViewsBetween(startY, endY) {
        const indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
        if (!indices) return false;
        return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
    }

    selectTracksBetween(startY, endY) {
        const indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
        if (!indices) return;
        this._selectable.selectRange(indices.startIndex, indices.endIndex);
    }

    getItemHeight() {
        return this._fixedItemListScroller.itemHeight();
    }

    hidePlaylistEmptyIndicator() {
        this.$().find(`.playlist-empty`).hide();
        this.$().find(`.playlist-spacer`).show();
        this.$().find(`.tracklist-transform-container`).show();
    }

    showPlaylistEmptyIndicator() {
        this.$().find(`.playlist-spacer`).hide();
        this.$().find(`.playlist-empty`).show();
        this.$().find(`.tracklist-transform-container`).hide();
    }

    playFirst() {
        if (!this.length) return;
        const firstSelectedTrackView = this._selectable.first();
        if (firstSelectedTrackView) {
            this.changeTrackExplicitly(firstSelectedTrackView.track(), firstSelectedTrackView);
            return;
        }
        const nextPlaylistTrack = this.getNextPlaylistTrack();

        if (!nextPlaylistTrack.isDummy()) {
            this.changeTrackExplicitly(nextPlaylistTrack.track(), nextPlaylistTrack.trackView());
        } else {
            const firstView = this._trackViews.first();
            if (firstView) {
                this.changeTrackExplicitly(firstView.track(), firstView);
            }
        }
    }

    removeTrackView(trackView) {
        this.removeTrackViews([trackView]);
    }

    _edited() {
        if (this._trackListDeletionUndo) {
            this._trackListDeletionUndo.destroy();
            this._trackListDeletionUndo = null;
        }
    }

    _saveStateForUndo() {
        if (this._trackListDeletionUndo) throw new Error(`already saved`);
        this._trackListDeletionUndo = new TrackListDeletionUndo(this);
    }

    _restoreStateForUndo() {
        // TODO
    }

    removeTrackViews(trackViews) {
        // TODO
    }

    removeSelected() {
        const selection = this.getSelection();
        if (!selection.length) return;
        this.removeTrackViews(selection);
    }

    add(tracks) {
        if (!tracks.length) return;

        this._edited();

        if (!this.length) {
            this.hidePlaylistEmptyIndicator();
        }

        const oldLength = this.length;

        tracks.forEach(function(track) {
            const view = new TrackView(track, this._trackViewOptions);
            const len = this._trackViews.push(view);
            view.setIndex(len - 1);
        }, this);

        this.emit(LENGTH_CHANGE_EVENT, this.length, oldLength);
        this._updateNextTrack();
        this._fixedItemListScroller.resize();
    }

    stop() {
        this._setCurrentTrack(DUMMY_PLAYLIST_TRACK, KIND_EXPLICIT);
        this._errorCount = 0;
        this._updateNextTrack();
        this.emit(PLAYLIST_STOPPED_EVENT);
    }

    trackIndexChanged() {
        this._edited();
        this.emit(TRACK_PLAYING_STATUS_CHANGE_EVENT, this.getCurrentPlaylistTrack());
        this._updateNextTrack();
    }

    _setCurrentTrack(playlistTrack, trackChangeKind) {
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            currentPlaylistTrack.track().stopPlaying();
        }

        this._setCurrentPlaylistTrack(playlistTrack);

        if (!playlistTrack.isDummy()) {
            playlistTrack.track().startPlaying();
        }

        if (this._isUsingShuffleMode() &&
            trackChangeKind === KIND_EXPLICIT &&
            !this._nextTrackIsSameAs(playlistTrack)) {
            return;
        }
        this._updateNextTrack();
    }

    _nextTrackIsSameAs(playlistTrack) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            return playlistTrack.isDummy();
        }
        return nextPlaylistTrack.track() === playlistTrack.track();
    }

    _isUsingShuffleMode() {
        return this._mode === SHUFFLE_MODE;
    }

    _changeTrackImplicitly(playlistTrack, doNotRecordHistory, isUserInitiatedSkip) {
        return this._changeTrack(playlistTrack, !!doNotRecordHistory, KIND_IMPLICIT, !!isUserInitiatedSkip);
    }

    changeTrackExplicitly(track, trackView, doNotRecordHistory = false) {
        const playlistTrack = new PlaylistTrack(track, trackView);
        return this._changeTrack(playlistTrack, !!doNotRecordHistory, KIND_EXPLICIT);
    }

    getCurrentTrack() {
        return this.getCurrentPlaylistTrack().track();
    }

    getNextTrack() {
        return this.getNextPlaylistTrack().track();
    }

    getPreviousTrack() {
        if (this._trackHistory.length > 1) {
            return this._trackHistory[this._trackHistory.length - 2].track();
        }
        return null;
    }

    getCurrentPlayId() {
        return this._currentPlayId;
    }

    trackPlayedSuccessfully() {
        this._errorCount = 0;
    }

    hasHistory() {
        return this._trackHistory.length > 0;
    }

    prev() {
        const history = this._trackHistory;
        const {length} = history;
        if (length > 0) {
            let playlistTrack;
            while (history.length > 0) {
                playlistTrack = this._trackHistory.pop();
                if (playlistTrack.hasError()) {
                    playlistTrack = null;
                } else {
                    break;
                }
            }

            if (length !== history.length) {
                this.emit(HISTORY_CHANGE_EVENT);
            }

            if (!playlistTrack) {
                this.prev();
            } else {
                this.changeTrackExplicitly(playlistTrack.track(), playlistTrack.trackView(), true);
            }
        } else {
            this.emit(HISTORY_CHANGE_EVENT);
        }
    }

    next(userInitiated) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            return this.stop();
        }

        return this._changeTrackImplicitly(nextPlaylistTrack, false, userInitiated);
    }

    tryChangeMode(mode) {
        if (this._mode === mode) {
            return false;
        } else if (Modes.hasOwnProperty(mode)) {
            const oldMode = this._mode;
            this._mode = mode;
            this.emit(MODE_CHANGE_EVENT, mode, oldMode);
            this._updateNextTrack();
            this.db.set(PLAYLIST_MODE_KEY, mode);
            return true;
        }
        return false;
    }

    getMode() {
        return this._mode;
    }
}

Object.assign(PlaylistController.prototype, TrackSorterTrait);
