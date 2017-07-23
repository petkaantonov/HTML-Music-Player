import EventEmitter from "events";
import withDeps from "ApplicationDependencies";
import TrackContainerTrait from "tracks/TrackContainerTrait";
import Selectable from "ui/Selectable";
import TrackRater from "tracks/TrackRater";
import TrackView from "tracks/TrackView";
import {buildConsecutiveRanges, indexMapper, buildInverseRanges} from "util";

export const ITEM_ORDER_CHANGE_EVENT = `itemOrderChange`;
export const LENGTH_CHANGE_EVENT = `lengthChange`;

export class PlayedTrackOrigin {
    constructor(name, controller, {usesTrackViewIndex}) {
        this._name = name;
        this._controller = controller;
        this._usesTrackViewIndex = usesTrackViewIndex;
    }

    toString() {
        return `Played track originating from ${this._name}`;
    }

    usesTrackViewIndex() {
        return this._usesTrackViewIndex;
    }

    startedPlay(playlistTrack) {
        this._controller.candidatePlaylistTrackWillPlay(playlistTrack);
    }

    isTrackViewValidInController(trackView) {
        const index = trackView.getIndex();
        return index >= 0 &&
               index < this._controller.length &&
               this._controller._trackViews[index] === trackView;
    }
}


export default class TrackContainerController extends EventEmitter {
    constructor(opts, deps) {
        super();
        this.page = deps.page;
        this.rippler = deps.rippler;
        this.globalEvents = deps.globalEvents;
        this.menuContext = deps.menuContext;
        this.env = deps.env;
        this.recognizerContext = deps.recognizerContext;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.keyboardShortcuts = deps.keyboardShortcuts;

        this._trackRater = withDeps({
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler
        }, d => new TrackRater({zIndex: opts.trackRaterZIndex}, d));

        this._trackListDeletionUndo = null;
        this._supportsRemove = opts.supportsRemove;

        this._playedTrackOrigin = new PlayedTrackOrigin(this.constructor.name, this, {
            usesTrackViewIndex: opts.playedTrackOriginUsesTrackViewIndex
        });
        this._domNode = this.page.$(opts.target);
        this._trackContainer = this.$().find(`.tracklist-transform-container`);
        this._trackViews = [];
        this._singleTrackViewSelected = null;
        this._singleTrackMenu = this.env.hasTouch() ? this.createSingleTrackMenu() : null;
        this._selectable = withDeps({page: this.page}, d => new Selectable({listView: this}, d));
        this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
            target: this.$(),
            itemList: this._trackViews,
            contentContainer: this.$trackContainer(),
            minPrerenderedItems: 6,
            maxPrerenderedItems: 12
        });

        this.globalEvents.on(`resize`, this._windowLayoutChanged.bind(this));
        this.globalEvents.on(`clear`, this.clearSelection.bind(this));
        this._keyboardShortcutContext = this.keyboardShortcuts.createContext();
        this.bindKeyboardShortcuts();
        this._bindListEvents();

        if (!this.length) {
            this.listBecameEmpty();
        }
    }

    $() {
        return this._domNode;
    }

    $trackContainer() {
        return this._trackContainer;
    }

    supportsRemove() {
        return this._supportsRemove;
    }

    getPlayedTrackOrigin() {
        return this._playedTrackOrigin;
    }

    bindKeyboardShortcuts() {
        this._keyboardShortcutContext.addShortcut(`mod+a`, this.selectAll.bind(this));
        this._keyboardShortcutContext.addShortcut(`Enter`, this.playPrioritySelection.bind(this));
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

        if (this.supportsRemove()) {
            this._keyboardShortcutContext.addShortcut(`Delete`, this.removeSelected.bind(this));
        }
    }

    getTrackRater() {
        return this._trackRater;
    }

    openSingleTrackMenu(trackView, eventTarget, event) {
        this._trackRater.enable(trackView.track());
        this._singleTrackViewSelected = trackView;
        this._singleTrackMenu.show(event, () => {
            const box = eventTarget.getBoundingClientRect();
            return {
                x: box.right,
                y: box.top
            };
        });
    }

    _windowLayoutChanged() {
        this.page.requestAnimationFrame(() => this._fixedItemListScroller.resize());
    }

    get length() {
        return this._trackViews.length;
    }

    tabWillHide() {
        if (this._singleTrackMenu) {
            this._singleTrackMenu.hide();
        }
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidShow() {
        this._fixedItemListScroller.resize();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
    }

    edited() {
        if (!this.supportsRemove()) return;
        this._destroyTrackListDeletionUndo();
    }

    _destroyTrackListDeletionUndo() {
        if (this._trackListDeletionUndo) {
            this.undoForTrackRemovalExpired();
            this._trackListDeletionUndo = null;
        }
    }

    _saveStateForUndo(trackViews, invertedRanges, selectedIndices, priorityTrackViewIndex) {
        if (this._trackListDeletionUndo) throw new Error(`already saved`);
        this._trackListDeletionUndo = {
            tracksAndPositions: trackViews.map(trackView => ({
                track: trackView.track(),
                index: trackView.getIndex()
            })),
            invertedRanges,
            selectedIndices,
            priorityTrackViewIndex
        };
    }

    _restoreStateForUndo() {
        if (!this._trackListDeletionUndo) return;
        const currentLength = this.length;
        const {tracksAndPositions,
            invertedRanges,
            selectedIndices,
            priorityTrackViewIndex} = this._trackListDeletionUndo;
        const newLength = tracksAndPositions.length + currentLength;
        this._trackViews.length = newLength;

        this.edited();

        let k = currentLength - 1;
        for (let i = invertedRanges.length - 1; i >= 0; --i) {
            const rangeStart = invertedRanges[i][0];
            const rangeEnd = invertedRanges[i][1];
            for (let j = rangeEnd; j >= rangeStart; --j) {
                this._trackViews[j] = this._trackViews[k--];
                this._trackViews[j].setIndex(j);
            }
        }

        for (let i = 0; i < tracksAndPositions.length; ++i) {
            const {track, index} = tracksAndPositions[i];
            this._trackViews[index] = new TrackView(track, index, this._trackViewOptions);
        }

        if (currentLength === 0) {
            this.listBecameNonEmpty();
        }
        this.emit(LENGTH_CHANGE_EVENT, currentLength, newLength);
        this._fixedItemListScroller.resize();
        this._selectable.selectIndices(selectedIndices);

        let centerOn = null;
        if (priorityTrackViewIndex >= 0) {
            centerOn = this._trackViews[priorityTrackViewIndex];
            this._selectable.setPriorityTrackView(centerOn);
        } else {
            const mid = selectedIndices[selectedIndices.length / 2 | 0];
            centerOn = this._trackViews[mid];
        }
        this.centerOnTrackView(centerOn);
    }

    removeTrackView(trackView) {
        if (!this.supportsRemove()) return;
        this.removeTrackViews([trackView]);
    }

    async removeTrackViews(trackViews) {
        if (!this.supportsRemove()) return;
        if (trackViews.length === 0) return;
        const oldLength = this.length;
        const indexes = trackViews.map(indexMapper);
        const tracksIndexRanges = buildConsecutiveRanges(indexes);
        const priorityTrackView = this._selectable.getPriorityTrackView();
        this.edited();
        this._saveStateForUndo(trackViews,
                               buildInverseRanges(indexes, oldLength - 1),
                               this.getSelection().map(indexMapper),
                               priorityTrackView ? priorityTrackView.getIndex() : -1);

        this._selectable.removeIndices(trackViews.map(indexMapper));

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i].destroy();
        }

        this.removeTracksBySelectionRanges(tracksIndexRanges);
        const tracksRemovedCount = oldLength - this.length;
        this._fixedItemListScroller.resize();
        this.emit(LENGTH_CHANGE_EVENT, this.length, oldLength);

        if (!this.length) {
            this.listBecameEmpty();
        }

        const shouldUndo = await this.shouldUndoTracksRemoved(tracksRemovedCount);

        if (shouldUndo) {
            this._restoreStateForUndo();
        } else {
            this._destroyTrackListDeletionUndo();
        }
    }

    removeSelected() {
        if (!this.supportsRemove()) return;
        const selection = this.getSelection();
        if (!selection.length) return;
        this.removeTrackViews(selection);
    }

    add(tracks, {noReport = false} = {noReport: false}) {
        if (!tracks.length) return;
        this.edited();

        if (!this.length) {
            this.listBecameNonEmpty();
        }

        const oldLength = this.length;
        for (let i = 0; i < tracks.length; ++i) {
            const track = tracks[i];
            const index = oldLength + i;
            const trackView = new TrackView(track, index, this._trackViewOptions);
            this._trackViews[index] = trackView;
            if (track.isPlaying()) {
                this.playingTrackAddedToList(track, trackView);
            }
        }
        this._fixedItemListScroller.resize();
        this.emit(LENGTH_CHANGE_EVENT, oldLength + tracks.length, oldLength);
        if (!noReport) {
            this.didAddTracksToView(tracks);
        }
    }
}

Object.assign(TrackContainerController.prototype, TrackContainerTrait);
