import {buildConsecutiveRanges, indexMapper} from "util";
import Selectable from "ui/Selectable";
import DraggableSelection from "ui/DraggableSelection";
import Track from "tracks/Track";
import {ACTION_CLICKED} from "ui/Snackbar";
import TrackView from "tracks/TrackView";
import TrackViewOptions from "tracks/TrackViewOptions";
import TrackContainerTrait from "tracks/TrackContainerTrait";
import TrackSorterTrait from "tracks/TrackSorterTrait";
import withDeps from "ApplicationDependencies";
import EventEmitter from "events";

const PLAYLIST_TRACKS_REMOVED_TAG = `playlist-tracks-removed`;
const PLAYLIST_MODE_KEY = `playlist-mode`;
const SHUFFLE_MODE = `shuffle`;

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;
const MAX_ERRORS = 200;
const MAX_HISTORY = 500;
const EMPTY_ARRAY = Object.freeze([]);

const DUMMY_TRACK = {
    getIndex() {
        return -1;
    },

    isDetachedFromPlaylist() {
        return true;
    },

    hasError() {
        return false;
    }
};

const Modes = {
    normal(currentTrack) {
        let index = currentTrack.getIndex() + 1;

        let ret;
        let trials = 0;

        do {
            index = Math.max(0, index);
            if (index >= this.length) {
                index = 0;
            }

            ret = this.getTrackByIndex(index);
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret;
    },

    shuffle(currentTrack) {
        const nextTrack = this.getNextTrack();
        const trackViews = this.getTrackViews();

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
        return nextTrack || currentTrack || null;
    },

    repeat(currentTrack) {
        if (currentTrack.isDetachedFromPlaylist() || currentTrack.hasError()) {
            return Modes.normal.call(this, currentTrack);
        }
        return currentTrack;
    }
};

let nextPlayId = 10;

class TrackListDeletionUndo {
    constructor(playlist) {
        this.playlist = playlist;
        this.tracksAndViews = playlist.getTrackViews().map(v => ({
            track: v.track(),
            view: v
        }));
        this.selectionIndices = playlist.getSelection().map(v => v.getIndex());
        const priorityTrackView = playlist._selectable.getPriorityTrackView();
        this.priorityTrackViewIndex = priorityTrackView ? priorityTrackView.getIndex() : -1;
    }

    destroy() {
        this.playlist.snackbar.removeByTag(PLAYLIST_TRACKS_REMOVED_TAG);
        for (let i = 0; i < this.tracksAndViews.length; ++i) {
            const {track} = this.tracksAndViews[i];
            if (track.isDetachedFromPlaylist()) {
                track.destroy();
            }
        }
    }
}

export default class Playlist extends EventEmitter {
    constructor(opts, deps) {
        super();
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.keyboardShortcuts = deps.keyboardShortcuts;
        this.env = deps.env;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.rippler = deps.rippler;
        this.snackbar = deps.snackbar;
        this.applicationPreferences = deps.applicationPreferences;
        this.tooltipContext = deps.tooltipContext;

        this._trackViews = [];
        this._unparsedTrackList = [];

        this._mode = Modes.hasOwnProperty(opts.mode) ? opts.mode : `normal`;
        this._currentTrack = null;
        this._trackListDeletionUndo = null;
        this._currentPlayId = -1;
        this._trackHistory = [];
        this._selectable = withDeps({page: this.page}, d => new Selectable({listView: this}, d));

        this._trackViewOptions = new TrackViewOptions(true,
                                                      opts.itemHeight,
                                                      this,
                                                      this.page,
                                                      deps.tooltipContext,
                                                      this._selectable,
                                                      null);
        this._errorCount = 0;
        this._$domNode = this.page.$(opts.target);
        this._$trackContainer = this.$().find(`.tracklist-transform-container`);
        this._nextTrack = null;

        this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
            target: this.$(),
            itemList: this._trackViews,
            contentContainer: this.$trackContainer(),

            minPrerenderedItems: 6,
            maxPrerenderedItems: 12,

            shouldScroll: () => !this._draggable.isDragging(),

            scrollerOpts: {
                scrollingX: false,
                snapping: true,
                zooming: false,
                paging: false
            },
            scrollbarOpts: {
                target: this.$().find(`.scrollbar-container`),
                railSelector: `.scrollbar-rail`,
                knobSelector: `.scrollbar-knob`
            }
        });

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

        this.globalEvents.on(`resize`, this._windowLayoutChanged.bind(this));
        this.globalEvents.on(`clear`, this.clearSelection.bind(this));

        if (PLAYLIST_MODE_KEY in this.dbValues) {
            this.tryChangeMode(this.dbValues[PLAYLIST_MODE_KEY]);
        }


        this._keyboardShortcutContext = this.keyboardShortcuts.createContext();
        this._keyboardShortcutContext.addShortcut(`mod+a`, this.selectAll.bind(this));
        this._keyboardShortcutContext.addShortcut(`Enter`, this.playPrioritySelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`Delete`, this.removeSelected.bind(this));
        this._keyboardShortcutContext.addShortcut(`ArrowUp`, this.selectPrev.bind(this));
        this._keyboardShortcutContext.addShortcut(`ArrowDown`, this.selectNext.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+ArrowUp`, this.selectPrevAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+ArrowDown`, this.selectNextAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+ArrowDown`, this.removeTopmostSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+ArrowUp`, this.removeBottommostSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+ArrowUp`, this.moveSelectionUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+ArrowDown`, this.moveSelectionDown.bind(this));
        this._keyboardShortcutContext.addShortcut(`PageUp`, this.selectPagePrev.bind(this));
        this._keyboardShortcutContext.addShortcut(`PageDown`, this.selectPageNext.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+PageUp`, this.selectPagePrevAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+PageDown`, this.selectPageNextAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+PageDown`, this.removeTopmostPageSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+PageUp`, this.removeBottommostPageSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+PageUp`, this.moveSelectionPageUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+PageDown`, this.moveSelectionPageDown.bind(this));
        this._keyboardShortcutContext.addShortcut(`Home`, this.selectFirst.bind(this));
        this._keyboardShortcutContext.addShortcut(`End`, this.selectLast.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+Home`, this.selectAllUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+End`, this.selectAllDown.bind(this));

        [1, 2, 3, 4, 5].forEach((ratingValue) => {
            this._keyboardShortcutContext.addShortcut(`alt+${ratingValue}`, () => {
                if (this._selectable.getSelectedItemViewCount() !== 1) return;
                const trackView = this._selectable.first();
                if (trackView) {
                    trackView.track().rate(ratingValue);
                }
            });
        });

        this._keyboardShortcutContext.addShortcut(`alt+0`, () => {
            if (this._selectable.getSelectedItemViewCount() !== 1) return;
            const trackView = this._selectable.first();
            if (trackView) trackView.track().rate(-1);
        });

        if (!this.length) {
            this.showPlaylistEmptyIndicator();
        }

        this._bindListEvents();
        this._draggable.bindEvents();
    }

    _windowLayoutChanged() {
        this.page.requestAnimationFrame(() => this._fixedItemListScroller.resize());
    }

    _listContentsChanged() {
        this._fixedItemListScroller.resize();
        if (this._fixedItemListScroller.needScrollbar()) {
            this.$().addClass(`has-scrollbar`);
        } else {
            this.$().removeClass(`has-scrollbar`);
        }
    }

    tabWillHide() {
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidShow() {
        this._fixedItemListScroller.resize();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
    }

    $trackContainer() {
        return this._$trackContainer;
    }

    _updateNextTrack(forced) {
        const currentTrack = this.getCurrentTrack() || DUMMY_TRACK;
        const nextTrack = this._nextTrack;

        if (!forced && nextTrack && !nextTrack.isDetachedFromPlaylist() &&
            this.isUsingShuffleMode()) {
            return;
        }

        if (nextTrack && nextTrack !== DUMMY_TRACK) {
            nextTrack.removeListener(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
        }

        this._nextTrack = Modes[this._mode].call(this, currentTrack) || DUMMY_TRACK;

        if (this._nextTrack === DUMMY_TRACK ||
            this._nextTrack.isDetachedFromPlaylist() ||
            this._nextTrack.hasError()) {
            this._nextTrack = DUMMY_TRACK;
        } else {
            this._nextTrack.on(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
        }

        this.emit(`nextTrackChange`, this._nextTrack === DUMMY_TRACK ? null : this._nextTrack);
    }

    _highlyRelevantTrackMetadataUpdated() {
        this.emit(`highlyRelevantTrackMetadataUpdate`);
    }


    _changeTrack(track, doNotRecordHistory, trackChangeKind, isUserInitiatedSkip) {
        if (track === undefined || track === null || this._errorCount >= MAX_ERRORS) {
            this._errorCount = 0;
            this.setCurrentTrack(null, trackChangeKind);
            this.emit(`playlistEmpty`);
            return false;
        }

        if (!(track instanceof Track)) {
            throw new Error(`invalid track`);
        }

        const currentTrack = this.getCurrentTrack();

        if (currentTrack && currentTrack !== DUMMY_TRACK) {
            currentTrack.willBeReplaced();
            if (!doNotRecordHistory) {
                if (this._trackHistory.push(currentTrack) > MAX_HISTORY) {
                    this._trackHistory.shift();
                }
                this.emit(`historyChange`);
            }
        }

        this.setCurrentTrack(track, trackChangeKind);
        const trackHasError = track.hasError();
        if (trackHasError && trackChangeKind === KIND_IMPLICIT) {
            this._errorCount++;
            if (this._mode === `repeat` && this.length > 1) {
                track = Modes.normal.call(this, track);
                this.setCurrentTrack(track, KIND_IMPLICIT);
            } else {
                return this.next(false);
            }
        }

        this._currentPlayId = nextPlayId++;
        this.emit(`trackPlayingStatusChange`, track);
        this.emit(`currentTrackChange`, track, !!isUserInitiatedSkip);
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

    $() {
        return this._$domNode;
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
        const firstSelectedTrack = this._selectable.first();
        if (firstSelectedTrack) {
            this.changeTrackExplicitly(firstSelectedTrack.track());
            return;
        }
        const nextTrack = this.getNextTrack();
        if (nextTrack) {
            this.changeTrackExplicitly(nextTrack);
        } else {
            let first = this._trackViews.first();
            if (first) first = first.track();
            this.changeTrackExplicitly(first);
        }
    }

    getUnparsedTracks() {
        const tracks = this._unparsedTrackList;
        if (!tracks.length) return EMPTY_ARRAY;
        const ret = new Array(tracks.length);
        ret.length = 0;
        while (tracks.length > 0) {
            const track = tracks.shift();
            if (!track.isDetachedFromPlaylist() && track.needsParsing()) {
                ret.push(track);
            }
        }
        return ret;
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
        const oldLength = this.length;

        if (oldLength === 0) {
            this.hidePlaylistEmptyIndicator();
        }

        const previousTracksAndViews = this._trackListDeletionUndo.tracksAndViews;
        const {selectionIndices, priorityTrackViewIndex} = this._trackListDeletionUndo;

        for (let i = 0; i < previousTracksAndViews.length; ++i) {
            const trackAndView = previousTracksAndViews[i];

            if (trackAndView.track.isDetachedFromPlaylist()) {
                if (!trackAndView.view._isDestroyed) {
                    throw new Error(`should be destroyed`);
                }
                trackAndView.track.unstageRemoval();
                this._trackViews[i] = new TrackView(trackAndView.track, this._trackViewOptions);
            } else {
                if (trackAndView.view._isDestroyed) {
                    throw new Error(`should not be destroyed`);
                }
                this._trackViews[i] = trackAndView.view;
            }
        }
        this._trackViews.length = previousTracksAndViews.length;
        this._trackListDeletionUndo = null;

        for (let i = 0; i < this._trackViews.length; ++i) {
            const trackView = this._trackViews[i];
            if (trackView.isDetachedFromPlaylist()) {
                this._unparsedTrackList.push(trackView.track());
            }
            trackView.setIndex(i);
        }

        this.emit(`trackPlayingStatusChange`, this.getCurrentTrack());
        this.emit(`lengthChange`, this.length, oldLength);
        this._updateNextTrack();
        this._fixedItemListScroller.refresh();
        this._listContentsChanged();
        this._selectable.selectIndices(selectionIndices);

        if (priorityTrackViewIndex >= 0) {
            this._selectable.setPriorityTrackView(this._trackViews[priorityTrackViewIndex]);
            this.centerOnTrackView(this._trackViews[priorityTrackViewIndex]);
        } else {
            const mid = selectionIndices[selectionIndices.length / 2 | 0];
            this.centerOnTrackView(this._trackViews[mid]);
        }
        this.emit(`unparsedTracksAvailable`);
    }

    async removeTrackViews(trackViews) {
        trackViews = trackViews.filter(v => !v.isDetachedFromPlaylist());
        if (trackViews.length === 0) return;
        const oldLength = this.length;
        const tracksIndexRanges = buildConsecutiveRanges(trackViews.map(indexMapper));

        this._edited();
        this._saveStateForUndo();

        this._selectable.removeIndices(trackViews.map(indexMapper));

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i].track().stageRemoval();
        }

        this.removeTracksBySelectionRanges(tracksIndexRanges);
        this.emit(`lengthChange`, this.length, oldLength);

        if (!this.length) {
            this.showPlaylistEmptyIndicator();
            if (this.getCurrentTrack()) {
                this.getCurrentTrack().setIndex(-1);
            }
        }

        this.emit(`trackPlayingStatusChange`, this.getCurrentTrack());
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

    isTrackHighlyRelevant(track) {
        if (!track || !(track instanceof Track)) {
            return false;
        }
        return track.isDetachedFromPlaylist() ? false
                                              : (track === this.getCurrentTrack() ||
                                                 track === this.getNextTrack());
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
            this._unparsedTrackList.push(track);
            view.setIndex(len - 1);
        }, this);

        this.emit(`lengthChange`, this.length, oldLength);
        this._updateNextTrack();
        this._listContentsChanged();
        this.emit(`unparsedTracksAvailable`);
    }

    stop() {
        this.setCurrentTrack(null, KIND_EXPLICIT);
        this._errorCount = 0;
        this._updateNextTrack();
        this.emit(`playlistEmpty`);
    }

    trackIndexChanged() {
        this._edited();
        this.emit(`trackPlayingStatusChange`, this.getCurrentTrack());
        this._updateNextTrack();
    }

    setCurrentTrack(track, trackChangeKind) {
        const current = this.getCurrentTrack();

        if (current) {
            current.stopPlaying();
            current.removeListener(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
        }

        this._currentTrack = track;

        if (track) {
            track.on(`tagDataUpdate`, this._highlyRelevantTrackMetadataUpdated);
            track.startPlaying();
        }

        if (this.isUsingShuffleMode() &&
            trackChangeKind === KIND_EXPLICIT &&
            !this.nextTrackIsSameAs(track)) {
            return;
        }
        this._updateNextTrack(true);
    }

    nextTrackIsSameAs(track) {
        if (!this.getNextTrack()) return false;
        return this.getNextTrack() === track;
    }

    isUsingShuffleMode() {
        return this._mode === SHUFFLE_MODE;
    }

    changeTrackImplicitly(track, doNotRecordHistory, isUserInitiatedSkip) {
        return this._changeTrack(track, !!doNotRecordHistory, KIND_IMPLICIT, !!isUserInitiatedSkip);
    }

    changeTrackExplicitly(track, doNotRecordHistory) {
        return this._changeTrack(track, !!doNotRecordHistory, KIND_EXPLICIT);
    }

    getPreviousTrack() {
        if (this._trackHistory.length > 1) {
            return this._trackHistory[this._trackHistory.length - 2];
        }
        return null;
    }

    getCurrentTrack() {
        return this._currentTrack;
    }

    getNextTrack() {
        if (this._nextTrack === DUMMY_TRACK) return null;
        return this._nextTrack;
    }

    getCurrentPlayId() {
        return this._currentPlayId;
    }

    trackPlayedSuccessfully() {
        const currentTrack = this.getCurrentTrack();
        if (currentTrack && currentTrack.hasError()) {
            currentTrack.unsetError();
            this._unparsedTrackList.push(currentTrack);
            this.emit(`unparsedTracksAvailable`);
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
            let track;
            while (history.length > 0) {
                track = this._trackHistory.pop();
                if (track.hasError() || track.isDetachedFromPlaylist()) {
                    track = null;
                } else {
                    break;
                }
            }

            if (length !== history.length) {
                this.emit(`historyChange`);
            }

            if (!track) {
                this.prev();
            } else {
                this.changeTrackExplicitly(track, true);
            }
        } else {
            this.emit(`historyChange`);
        }
    }

    next(userInitiated) {
        if (!this.getNextTrack()) return this.stop();
        return this.changeTrackImplicitly(this.getNextTrack(), false, userInitiated);
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

        const indices = selectedTrackViews.map(v => v.track().getIndex());
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

    get length() {
        return this._trackViews.length;
    }
}

Object.assign(Playlist.prototype, TrackSorterTrait);
Object.assign(Playlist.prototype, TrackContainerTrait);
