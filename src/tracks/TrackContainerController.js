import EventEmitter from "events";
import withDeps from "ApplicationDependencies";
import Selectable, {ITEMS_SELECTED_EVENT} from "ui/Selectable";
import DraggableSelection from "ui/DraggableSelection";
import TrackRater from "tracks/TrackRater";
import TrackView from "tracks/TrackView";
import TrackViewOptions from "tracks/TrackViewOptions";
import {buildConsecutiveRanges, indexMapper, buildInverseRanges,
        buildConsecutiveRangesCompressed, throttle} from "util";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";
import {SCROLL_POSITION_CHANGE_EVENT} from "ui/scrolling/ContentScroller";
import {Symbol} from "platform/platform";

export const ITEM_ORDER_CHANGE_EVENT = `itemOrderChange`;
export const LENGTH_CHANGE_EVENT = `lengthChange`;
export const ALL_ORIGINS_READY_EVENT = `allOriginsReady`;

const SCROLL_POSITION_KEY_SUFFIX = `_scrollPosition`;
const SELECTED_INDEX_RANGES_SUFFIX = `_selectedIndexRanges`;

function remove(trackViews, selection, indexOffset) {
    const trackViewsLength = trackViews.length;
    const tracksToRemove = selection.length;
    const count = trackViewsLength - tracksToRemove;
    const index = selection[0] - indexOffset;

    for (let i = index; i < count && i + tracksToRemove < trackViewsLength; ++i) {
        const trackView = trackViews[i + tracksToRemove];
        trackView.setIndex(i);
        trackViews[i] = trackView;
    }
    trackViews.length = count;
}

class PlayedTrackOrigin {
    constructor(name, controller, context, {usesTrackViewIndex}) {
        this._name = name;
        this._controller = controller;
        this._usesTrackViewIndex = usesTrackViewIndex;
        this._context = context;
    }

    toString() {
        return `Played track originating from ${this._name}`;
    }

    usesTrackViewIndex() {
        return this._usesTrackViewIndex;
    }

    name() {
        return this._name;
    }

    trackViewByIndex(index) {
        const {_trackViews} = this._controller;
        if (index >= 0 && index < _trackViews.length) {
            return _trackViews[index];
        }
        return null;
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

    originInitialTracksLoaded() {
        this._context._originReady(this);
    }
}

export class PlayedTrackOriginContext extends EventEmitter {
    constructor() {
        super();
        this._namesToPlayedTrackOrigins = new Map();
        this._originsPendingReady = new Set();
        this._allOriginsReadyEmitted = false;
    }

    createOrigin(name, controller, opts) {
        const ret = new PlayedTrackOrigin(name, controller, this, opts);
        this._namesToPlayedTrackOrigins.set(name, ret);
        this._originsPendingReady.add(ret);
        return ret;
    }

    originByName(name) {
        return this._namesToPlayedTrackOrigins.get(name);
    }

    async allOriginsInitialTracksLoaded() {
        if (this._allOriginsReadyEmitted) {
            return;
        }

        await new Promise(resolve => this.once(ALL_ORIGINS_READY_EVENT, resolve));
    }

    _originReady(origin) {
        this._originsPendingReady.delete(origin);
        if (!this._originsPendingReady.size && !this._allOriginsReadyEmitted) {
            this._allOriginsReadyEmitted = true;
            this.emit(ALL_ORIGINS_READY_EVENT);
        }
    }
}


export default class TrackContainerController extends EventEmitter {
    constructor(opts, deps) {
        super();
        this.playedTrackOriginContext = deps.playedTrackOriginContext;
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
        this._supportsDragging = opts.supportsDragging;

        this._playedTrackOrigin = this.playedTrackOriginContext.createOrigin(this.constructor.name, this, {
            usesTrackViewIndex: opts.playedTrackOriginUsesTrackViewIndex
        });
        this._domNode = this.page.$(opts.target);
        this._trackContainer = this.$().find(`.js-tracklist`);
        this._trackViews = [];
        this._singleTrackViewSelected = null;
        this._singleTrackMenu = this.env.hasTouch() ? this.createSingleTrackMenu() : null;
        this._selectable = withDeps({page: this.page}, d => new Selectable({listView: this}, d));
        this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
            target: this.$(),
            itemList: this._trackViews,
            contentContainer: this.$trackContainer(),
            minPrerenderedItems: 2,
            maxPrerenderedItems: 4
        });

        this.globalEvents.on(`resize`, this._windowLayoutChanged.bind(this));
        this.globalEvents.on(`clear`, this.clearSelection.bind(this));
        this._keyboardShortcutContext = this.keyboardShortcuts.createContext();

        if (!this.length) {
            this.listBecameEmpty();
        }
        this._preferencesLoaded = Promise.resolve();
        this._trackViewOptions = new TrackViewOptions(opts.itemHeight, this.page, this._selectable,
                                                      this.env.hasTouch(), this);

        this.bindKeyboardShortcuts();

        this._draggable = null;
        if (this.supportsDragging()) {
            this._draggable = withDeps({
                recognizerContext: this.recognizerContext,
                page: this.page,
                globalEvents: this.globalEvents,
                env: this.env
            }, d => new DraggableSelection({
                controller: this,
                scroller: this._fixedItemListScroller,
                selectionProvider: this._draggableSelectionProvider.bind(this),
                beforeDragStartCommitDelay: this._beforeDragStartCommitDelay.bind(this),
                afterDragEnd: this._afterDragEnd.bind(this),
                commitDelay: this.env.hasTouch() ? 100 : 300
            }, d));
            this._draggable.bindEvents();
        }

        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this.shutdownSavePreferences.bind(this));
        this._fixedItemListScroller.on(SCROLL_POSITION_CHANGE_EVENT, throttle(this._persistScrollPosition, 500, this));
        this.on(ITEMS_SELECTED_EVENT, throttle(this._persistSelection, 500, this));
        this._bindListControlEvents();
    }

    getScroller() {
        return this._fixedItemListScroller;
    }

    preferencesLoaded() {
        return this._preferencesLoaded;
    }

    loadPreferences() {
        const {dbValues} = this;

        const selectionRanges = dbValues[`${this.constructor.name}${SELECTED_INDEX_RANGES_SUFFIX}`];

        if (Array.isArray(selectionRanges)) {
            this._selectable.selectRanges(selectionRanges);
        }

        const scrollPosition = dbValues[`${this.constructor.name}${SCROLL_POSITION_KEY_SUFFIX}`];
        this._fixedItemListScroller.setScrollTop(scrollPosition);
    }

    shutdownSavePreferences(preferences) {
        preferences.push({
            key: this._selectionKey(),
            value: buildConsecutiveRangesCompressed(this.getSelection(), indexMapper)
        });

        preferences.push({
            key: this._scrollPositionKey(),
            value: this._fixedItemListScroller.getScrollTop()
        });
    }

    $() {
        return this._domNode;
    }

    $trackContainer() {
        return this._trackContainer;
    }

    supportsDragging() {
        return this._supportsDragging;
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
                x: box.left,
                y: box.top
            };
        });
    }

    _afterDragEnd() {
        if (this._singleTrackViewSelected) {
            this._selectable.refresh();
            this._singleTrackViewSelected = null;
        }
    }

    _beforeDragStartCommitDelay($target) {
        if (!this.env.hasTouch()) {
            return $target.closest(`.js-track-container`).length > 0;
        }
        const isControl = $target.closest(`.js-track-drag-button`).length > 0;
        if (!isControl) {
            return false;
        }

        const trackView = this._fixedItemListScroller.itemByRect($target[0].getBoundingClientRect());
        if (!trackView) {
            return false;
        }
        this._singleTrackViewSelected = trackView;
        return true;
    }

    _draggableSelectionProvider() {
        if (!this.env.hasTouch()) {
            return this.getSelectedItemViewCount() > 0 ? this.getSelection() : [];
        }

        return this._singleTrackViewSelected ? [this._singleTrackViewSelected] : [];
    }

    _bindListControlEvents() {
        const {page, env, rippler} = this;

        this.$().addEventListener(`click`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            if (this._draggable && this._draggable.recentlyStoppedDragging()) return;
            if (this._selectable.trackViewClick(e, trackView) === false) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, `.js-track-container`));

        this.$().addEventListener(`mousedown`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            this._selectable.trackViewMouseDown(e, trackView);
        }, `.js-track-container`));

        this.$().addEventListener(`dblclick`, page.delegatedEventHandler((e) => {
            const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
            if (!trackView) return;
            this.changeTrackExplicitly(trackView.track(), {
                trackView,
                origin: this.getPlayedTrackOrigin()
            });
        }, `.js-track-container`));

        if (env.hasTouch()) {
            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;

                if (this._selectable.contains(trackView)) {
                    this._selectable.removeTrackView(trackView);
                } else {
                    this._selectable.addTrackView(trackView);
                    this._selectable.setPriorityTrackView(trackView);
                }
                rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
            }, `.js-track-select-button`)).recognizeBubbledOn(this.$());

            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {

                if (e.target.classList.contains(`js-has-primary-action`) ||
                    e.target.closest(`.js-has-primary-action`)) {
                    return;
                }
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;

                this.changeTrackExplicitly(trackView.track(), {
                    trackView,
                    origin: this.getPlayedTrackOrigin()
                });
            }, `.js-track-container`)).recognizeBubbledOn(this.$());

            this.recognizerContext.createTapRecognizer(page.delegatedEventHandler((e) => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
                this.openSingleTrackMenu(trackView, e.delegateTarget, e);
            }, `.js-track-menu-button`)).recognizeBubbledOn(this.$());
        }

        if (this.supportsDragging()) {
            this._draggable.on(`dragStart`, () => {
                this.$().find(`.js-tracklist`).addClass(`tracks-dragging`);
            });
            this._draggable.on(`dragEnd`, () => {
                this.$().find(`.js-tracklist`).removeClass(`tracks-dragging`);
            });
        }
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

    _scrollPositionKey() {
        return `${this.constructor.name}${SCROLL_POSITION_KEY_SUFFIX}`;
    }

    _selectionKey() {
        return `${this.constructor.name}${SELECTED_INDEX_RANGES_SUFFIX}`;
    }

    _persistScrollPosition(scrollPosition) {
        this.db.set(this._scrollPositionKey(),
                    scrollPosition);
    }

    _persistSelection() {
        this.db.set(this._selectionKey(),
                    buildConsecutiveRangesCompressed(this.getSelection(), indexMapper));
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

    async removeTrackViews(trackViews, {silent = false} = {silent: false}) {
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

        if (!silent) {
            const shouldUndo = await this.shouldUndoTracksRemoved(tracksRemovedCount);

            if (shouldUndo) {
                this._restoreStateForUndo();
            } else {
                this._destroyTrackListDeletionUndo();
            }
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
        this.emit(LENGTH_CHANGE_EVENT, oldLength + tracks.length, oldLength);
        if (!noReport) {
            this.didAddTracksToView(tracks);
        }
        this._fixedItemListScroller.resize();
    }

    getSelection() {
        return this._selectable.getSelection();
    }

    clearSelection() {
        this._selectable.clearSelection();
    }

    selectAll() {
        if (this.length) {
            this._selectable.all();
        }
    }

    selectFirst() {
        if (this.length) {
            this._selectable.selectFirst();
        }
    }

    selectLast() {
        if (this.length) {
            this._selectable.selectLast();
        }
    }

    selectAllUp() {
        if (this.length) {
            this._selectable.appendPrev(this.length);
        }
    }

    selectAllDown() {
        if (this.length) {
            this._selectable.appendNext(this.length);
        }
    }

    selectPrev() {
        if (this.length) {
            this._selectable.prev();
        }
    }

    selectNext() {
        if (this.length) {
            this._selectable.next();
        }
    }

    selectPrevAppend() {
        if (this.length) {
            this._selectable.appendPrev();
        }
    }

    selectNextAppend() {
        if (this.length) {
            this._selectable.appendNext();
        }
    }

    removeTopmostSelection() {
        if (this.length) {
            this._selectable.removeTopmostSelection();
        }
    }

    removeBottommostSelection() {
        if (this.length) {
            this._selectable.removeBottommostSelection();
        }
    }

    moveSelectionUp() {
        if (this.length) {
            this._selectable.moveUp();
        }
    }

    moveSelectionDown() {
        if (this.length) {
            this._selectable.moveDown();
        }
    }

    tracksVisibleInContainer() {
        return this._fixedItemListScroller.itemsVisibleInContainer();
    }

    halfOfTracksVisibleInContainer() {
        return Math.ceil(this.tracksVisibleInContainer() / 2);
    }

    selectPagePrevAppend() {
        if (this.length) {
            this._selectable.appendPrev(this.halfOfTracksVisibleInContainer());
        }
    }

    selectPageNextAppend() {
        if (this.length) {
            this._selectable.appendNext(this.halfOfTracksVisibleInContainer());
        }
    }

    selectPagePrev() {
        if (this.length) {
            this._selectable.prev(this.halfOfTracksVisibleInContainer());
        }
    }

    selectPageNext() {
        if (this.length) {
            this._selectable.next(this.halfOfTracksVisibleInContainer());
        }
    }

    removeTopmostPageSelection() {
        if (this.length) {
            this._selectable.removeTopmostSelection(this.halfOfTracksVisibleInContainer());
        }
    }

    removeBottommostPageSelection() {
        if (this.length) {
            this._selectable.removeBottommostSelection(this.halfOfTracksVisibleInContainer());
        }
    }

    moveSelectionPageUp() {
        if (this.length) {
            this._selectable.moveUp(this.halfOfTracksVisibleInContainer());
        }
    }

    moveSelectionPageDown() {
        if (this.length) {
            this._selectable.moveDown(this.halfOfTracksVisibleInContainer());
        }
    }

    selectTrackView(trackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            this.clearSelection();
            this._selectable.addTrackView(trackView);
            this.centerOnTrackView(trackView);
        }
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

    playPrioritySelection() {
        if (!this.length) return;

        const trackView = this._selectable.getPriorityTrackView();
        if (!trackView) {
            this.playFirstSelected();
            return;
        }
        this.changeTrackExplicitly(trackView.track(), {
            trackView,
            origin: this.getPlayedTrackOrigin()
        });
    }

    playFirstSelected() {
        if (!this.length) return;

        const firstTrackView = this._selectable.first();
        if (!firstTrackView) return;
        this.changeTrackExplicitly(firstTrackView.track(), {
            trackView: firstTrackView,
            origin: this.getPlayedTrackOrigin()
        });
    }

    getTrackViews() {
        return this._trackViews;
    }

    centerOnTrackView(trackView) {
        if (trackView) {
            let y = this._fixedItemListScroller.yByIndex(trackView.getIndex());
            y -= (this._fixedItemListScroller.contentHeight() / 2);
            this._fixedItemListScroller.scrollToUnsnapped(y, false);
        }
    }

    getTrackByIndex(index) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index].track();
        }
        return null;
    }

    getTrackViewByIndex(index) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index];
        }
        return null;
    }

    getSelectable() {
        return this._selectable;
    }

    getSelectedItemViewCount() {
        return this._selectable.getSelectedItemViewCount();
    }

    isSelected(trackView) {
        return this._selectable.contains(trackView) ||
                this._singleTrackViewSelected === trackView;
    }

    toArray() {
        return this._trackViews.slice();
    }

    removeTracksBySelectionRanges(selectionRanges) {
        const trackViews = this._trackViews;
        let indexOffset = 0;
        selectionRanges.forEach((selection) => {
            remove(trackViews, selection, indexOffset);
            indexOffset += selection.length;
        });
    }

    [Symbol.iterator]() {
        return this._trackViews[Symbol.iterator]();
    }
}
