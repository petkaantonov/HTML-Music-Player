import {buildConsecutiveRanges, indexMapper} from "util";
import withDeps from "ApplicationDependencies";
import DraggableSelection from "ui/DraggableSelection";
import Track from "tracks/Track";
import {ACTION_CLICKED} from "ui/Snackbar";
import TrackView from "tracks/TrackView";
import TrackViewOptions from "tracks/TrackViewOptions";
import TrackSorterTrait from "tracks/TrackSorterTrait";
import TrackContainerController from "tracks/TrackContainerController";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";

const PLAYLIST_TRACKS_REMOVED_TAG = `playlist-tracks-removed`;
const PLAYLIST_MODE_KEY = `playlist-mode`;
const SHUFFLE_MODE = `shuffle`;

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;
const MAX_ERRORS = 200;
const MAX_HISTORY = 500;

class PlayingTrack {
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

    hasError() {
        return this._track ? this._track.hasError() : false;
    }

    isDummy() {
        return !this._track && !this._trackView
    }
}

const DUMMY_TRACK = new PlayingTrack();

const Modes = {
    normal(playingTrack) {
        let index = playingTrack.getIndex() + 1;

        let ret;
        let trials = 0;

        do {
            index = Math.max(0, index);
            if (index >= this.length) {
                index = 0;
            }

            const trackView = this._trackViews[index];
            if (trackView) {
                ret = new PlayingTrack(trackView.track(), trackView);
            }
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret || DUMMY_TRACK;
    },

    shuffle(playingTrack) {
        const nextPlayingTrack = this.getNextPlayingTrack();
        const trackViews = this.getTrackViews();
        const currentTrack = nextPlayingTrack.track();
        const nextTrack = nextPlayingTrack.track();

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
            return new PlayingTrack(view.track(), view);
        }
        return nextPlayingTrack || currentPlayingTrack || DUMMY_TRACK;
    },

    repeat(currentPlayingTrack) {
        if (currentPlayingTrack.hasError()) {
            return Modes.normal.call(this, currentPlayingTrack);
        }
        return currentPlayingTrack || DUMMY_TRACK;
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

        this._currentPlayingTrack = DUMMY_TRACK;
        this._nextPlayingTrack = DUMMY_TRACK;

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
        this._highlyRelevantTrackMetadataUpdated = this._highlyRelevantTrackMetadataUpdated.bind(this);


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

    _listContentsChanged() {
        this._fixedItemListScroller.resize();
    }

    tabWillHide() {
        super.tabWillHide();
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidShow() {
        super.tabDidShow();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
    }

    getCurrentPlayingTrack() {
        return this._currentPlayingTrack;
    }

    getNextPlayingTrack() {
        return this._nextPlayingTrack;
    }

    _setNextPlayingTrack(playingTrack) {
        if (!(playingTrack instanceof PlayingTrack)) {
            throw new Error("invalid playingTrack");
        }
        this._nextPlayingTrack = playingTrack;
    }

    _setCurrentPlayingTrack(playingTrack) {
        if (!(playingTrack instanceof PlayingTrack)) {
            throw new Error("invalid playingTrack");
        }
        this._currentPlayingTrack = playingTrack;
    }

    _updateNextTrack(forced) {
        const currentPlayingTrack = this.getCurrentPlayingTrack();
        const nextPlayingTrack = this.getNextPlayingTrack();

        if (!forced && !nextPlayingTrack.isDummy() && this._isUsingShuffleMode()) {
            return;
        }

        if (!nextPlayingTrack.isDummy()) {
            nextPlayingTrack.track().removeListener(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
        }

        this._setNextPlayingTrack(Modes[this._mode].call(this._currentPlayingTrack));

        if (this.getNextPlayingTrack().hasError()) {
            this._setNextPlayingTrack(DUMMY_TRACK);
        } else if (!this.getNextPlayingTrack().isDummy()) {
            this.getNextPlayingTrack().track().on("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
        }

        this.emit(`nextTrackChange`, this.getNextPlayingTrack().track(), this.getNextPlayingTrack().trackView());
    }

    _highlyRelevantTrackMetadataUpdated() {
        this.emit(`highlyRelevantTrackMetadataUpdate`);
    }

    _changeTrack(playingTrack, doNotRecordHistory, trackChangeKind, isUserInitiatedSkip) {
        if (!playingTrack || playingTrack.isDummy() || this._errorCount >= MAX_ERRORS) {
            this._errorCount = 0;
            this._setCurrentTrack(DUMMY_TRACK, trackChangeKind);
            this.emit(`playlistEmpty`);
            return false;
        }
        const currentPlayingTrack = this.getCurrentPlayingTrack();

        if (!currentPlayingTrack.isDummy()) {
            if (!doNotRecordHistory) {
                if (this._trackHistory.push(currentPlayingTrack) > MAX_HISTORY) {
                    this._trackHistory.shift();
                }
                this.emit(`historyChange`);
            }
        }

        this._setCurrentTrack(playingTrack, trackChangeKind);
        const trackHasError = playingTrack.hasError();
        if (trackHasError && trackChangeKind === KIND_IMPLICIT) {
            this._errorCount++;
            if (this._mode === `repeat` && this.length > 1) {
                playingTrack = Modes.normal.call(this, playingTrack);
                this._setCurrentTrack(playingTrack, KIND_IMPLICIT);
            } else {
                return this.next(false);
            }
        }

        this._currentPlayId = nextPlayId++;
        this.emit(`trackPlayingStatusChange`, playingTrack);
        this.emit(`currentTrackChange`, playingTrack.track(), playingTrack.trackView(), !!isUserInitiatedSkip);
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
        const nextPlayingTrack = this.getNextPlayingTrack();

        if (!nextPlayingTrack.isDummy()) {
            this.changeTrackExplicitly(nextPlayingTrack.track(), nextPlayingTrack.trackView());
        } else {
            let firstView = this._trackViews.first();
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
        if (!this._trackListDeletionUndo) return;
        // TODO
    }

    async removeTrackViews(trackViews) {
        if (trackViews.length === 0) return;
        const oldLength = this.length;
        const tracksIndexRanges = buildConsecutiveRanges(trackViews.map(indexMapper));

        this._edited();
        this._saveStateForUndo();

        this._selectable.removeIndices(trackViews.map(indexMapper));

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i].destroy();
        }

        this.removeTracksBySelectionRanges(tracksIndexRanges);
        this.emit(`lengthChange`, this.length, oldLength);

        if (!this.length) {
            this.showPlaylistEmptyIndicator();
        }

        this.emit(`trackPlayingStatusChange`, this.getCurrentPlayingTrack());
        this._updateNextTrack();
        this._fixedItemListScroller.refresh();
        this._listContentsChanged();
        const tracksRemoved = oldLength - this.length;

        const tracksWord = tracksRemoved === 1 ? `track` : `tracks`;

        this.emit(`tracksRemoved`);
        const outcome = await this.snackbar.show(`Removed ${tracksRemoved} ${tracksWord} from the playlist`, {
            action: `undo`,
            visibilityTime: 10000,
            tag: PLAYLIST_TRACKS_REMOVED_TAG
        });

        if (outcome === ACTION_CLICKED) {
            this._restoreStateForUndo();
        } else if (this._trackListDeletionUndo) {
            this._trackListDeletionUndo.destroy();
        }
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

        this.emit(`lengthChange`, this.length, oldLength);
        this._updateNextTrack();
        this._listContentsChanged();
    }

    stop() {
        this._setCurrentTrack(DUMMY_TRACK, KIND_EXPLICIT);
        this._errorCount = 0;
        this._updateNextTrack();
        this.emit(`playlistEmpty`);
    }

    trackIndexChanged() {
        this._edited();
        this.emit(`trackPlayingStatusChange`, this.getCurrentPlayingTrack());
        this._updateNextTrack();
    }

    _setCurrentTrack(playingTrack, trackChangeKind) {
        const currentPlayingTrack = this.getCurrentPlayingTrack();

        if (!currentPlayingTrack.isDummy()) {
            currentPlayingTrack.track().stopPlaying();
            currentPlayingTrack.track().removeListener(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
        }

        this._setCurrentPlayingTrack(playingTrack);

        if (!playingTrack.isDummy()) {
            playingTrack.track().on(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
            playingTrack.track().startPlaying();
        }

        if (this._isUsingShuffleMode() &&
            trackChangeKind === KIND_EXPLICIT &&
            !this._nextTrackIsSameAs(playingTrack)) {
            return;
        }
        this._updateNextTrack(true);
    }

    _nextTrackIsSameAs(playingTrack) {
        const nextPlayingTrack = this.getNextPlayingTrack();
        if (nextPlayingTrack.isDummy()) {
            return playingTrack.isDummy();
        }
        return nextPlayingTrack.track() === playingTrack.track();
    }

    _isUsingShuffleMode() {
        return this._mode === SHUFFLE_MODE;
    }

    _changeTrackImplicitly(playingTrack, doNotRecordHistory, isUserInitiatedSkip) {
        return this._changeTrack(playingTrack, !!doNotRecordHistory, KIND_IMPLICIT, !!isUserInitiatedSkip);
    }

    changeTrackExplicitly(track, trackView, doNotRecordHistory = false) {
        const playingTrack = new PlayingTrack(track, trackView);
        return this._changeTrack(playingTrack, !!doNotRecordHistory, KIND_EXPLICIT);
    }

    getCurrentTrack() {
        return this.getCurrentPlayingTrack().track();
    }

    getNextTrack() {
        return this.getNextPlayingTrack().track();
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
        const currentPlayingTrack = this.getCurrentPlayingTrack();

        if (!currentPlayingTrack.isDummy() && currentPlayingTrack.hasError()) {
            currentPlayingTrack.track().unsetError();
            this.metadataManager.parseMetadata(currentPlayingTrack.track());
        }
        this._errorCount = 0;
    }

    hasHistory() {
        return this._trackHistory.length > 0;
    }

    prev() {
        const history = this._trackHistory;
        const {length} = history;
        if (length > 0) {
            let playingTrack;
            while (history.length > 0) {
                playingTrack = this._trackHistory.pop();
                if (playingTrack.hasError()) {
                    playingTrack = null;
                } else {
                    break;
                }
            }

            if (length !== history.length) {
                this.emit(`historyChange`);
            }

            if (!playingTrack) {
                this.prev();
            } else {
                this.changeTrackExplicitly(playingTrack.track(), playingTrack.trackView(), true);
            }
        } else {
            this.emit(`historyChange`);
        }
    }

    next(userInitiated) {
        const nextPlayingTrack = this.getNextPlayingTrack();
        if (nextPlayingTrack.isDummy()) {
            return this.stop();
        }

        return this._changeTrackImplicitly(nextPlayingTrack, false, userInitiated);
    }

    tryChangeMode(mode) {
        if (this._mode === mode) {
            return false;
        } else if (Modes.hasOwnProperty(mode)) {
            const oldMode = this._mode;
            this._mode = mode;
            this.emit(`modeChange`, mode, oldMode);
            this._updateNextTrack(true);
            this.db.set(PLAYLIST_MODE_KEY, mode);
            return true;
        }
        return false;
    }

    getMode() {
        return this._mode;
    }

    changeTrackOrderWithinSelection(callback) {
        const selectedTrackViews = this.getSelection();
        if (selectedTrackViews.length <= 1) return;

        const indices = selectedTrackViews.map(v => v.getIndex());
        callback(selectedTrackViews);

        for (let i = 0; i < selectedTrackViews.length; ++i) {
            const trackView = selectedTrackViews[i];
            const index = indices[i];
            this._trackViews[index] = trackView;
            trackView.setIndex(index);
        }
        this._selectable.updateOrder(selectedTrackViews);
        this._fixedItemListScroller.refresh();
        this._edited();
        this.trackIndexChanged();
        this.emit(`trackOrderChange`);
    }
}

Object.assign(PlaylistController.prototype, TrackSorterTrait);
