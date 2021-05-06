import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import {
    ControllerKey,
    ListControllerPreferences,
    PreferenceArray,
    StoredKVValues,
    TrackOriginName,
} from "shared/src/preferences";
import { EventEmitterInterface } from "shared/src/types/helpers";
import {
    buildConsecutiveRanges,
    buildConsecutiveRangesCompressed,
    buildInverseRanges,
    indexMapper,
    throttle,
} from "shared/util";
import { SelectDeps } from "ui/Application";
import KeyboardShortcuts, { KeyboardShortcutContext } from "ui/keyboard/KeyboardShortcuts";
import { Track } from "ui/metadata/MetadataManagerFrontend";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import PlaylistController, { PlaylistControllerEventsMap } from "ui/player/PlaylistController";
import SearchController, { SearchControllerEventsMap } from "ui/search/SearchController";
import TrackRater from "ui/tracks/TrackRater";
import TrackView from "ui/tracks/TrackView";
import TrackViewOptions from "ui/tracks/TrackViewOptions";
import { VirtualButtonMenu } from "ui/ui/ActionMenu";
import DraggableSelection from "ui/ui/DraggableSelection";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import MenuContext from "ui/ui/MenuContext";
import Rippler from "ui/ui/Rippler";
import FixedItemListScroller from "ui/ui/scrolling/FixedItemListScroller";
import Selectable, { SelectableEventsMap } from "ui/ui/Selectable";
import EventEmitter from "vendor/events";

import { TrackSorterEventsMap } from "./TrackSorterTrait";
export const dummyTrack = {};
export type TrackChangeKind = "implicit" | "explicit";

export class TrackWithOrigin {
    private _track: Track | {};
    private _trackView: TrackView | {};
    private _origin: PlayedTrackOrigin | {};
    _generatedFromShuffle: boolean;
    constructor(
        track: Track | {},
        trackView: TrackView | {},
        origin: PlayedTrackOrigin | {},
        { generatedFromShuffle = false }: { generatedFromShuffle: boolean } = { generatedFromShuffle: false }
    ) {
        this._track = track;
        this._trackView = trackView;
        this._origin = origin;
        this._generatedFromShuffle = generatedFromShuffle;
    }

    isDummy() {
        return this._track === dummyTrack;
    }

    track(): Track | null {
        if (this.isDummy()) {
            return null;
        }
        return this._track as Track;
    }

    trackView(): TrackView | null {
        if (this.isDummy()) {
            return null;
        }
        return this._trackView as TrackView;
    }

    origin() {
        if (this.isDummy()) {
            return null;
        }
        return this._origin as PlayedTrackOrigin;
    }

    isFromOrigin(origin: PlayedTrackOrigin) {
        return this.origin() === origin;
    }

    getIndex() {
        if (this.isDummy()) {
            return -1;
        }
        return this.origin()!.usesTrackViewIndex() ? this.trackView()!.getIndex() : -1;
    }

    formatIndex() {
        return this.getIndex() <= 0 ? `` : `${this.getIndex() + 1}. `;
    }

    formatFullName() {
        return this.isDummy() ? `` : this.track()!.formatFullName();
    }

    hasError() {
        return this.isDummy() ? false : this.track()!.hasError();
    }

    startedPlay() {
        if (this.isDummy()) {
            return;
        }
        this.origin()!.startedPlay(this);
    }

    isValidGeneratedFromShuffle() {
        if (this.isDummy()) return false;
        return this._generatedFromShuffle && this.origin()!.isTrackViewValidInController(this.trackView()!);
    }

    toJSON(): Exclude<StoredKVValues["currentPlaylistTrack"], undefined> | null {
        if (this.isDummy()) {
            return null;
        }
        return {
            index: this.trackView()!.getIndex(),
            trackUid: this.track()!.uid(),
            origin: this.origin()!.name(),
        };
    }
}

function remove(trackViews: TrackView[], selection: number[], indexOffset: number) {
    const trackViewsLength = trackViews.length;
    const tracksToRemove = selection.length;
    const count = trackViewsLength - tracksToRemove;
    const index = selection[0]! - indexOffset;

    for (let i = index; i < count && i + tracksToRemove < trackViewsLength; ++i) {
        const trackView = trackViews[i + tracksToRemove]!;
        trackView.setIndex(i);
        trackViews[i] = trackView;
    }
    trackViews.length = count;
}

interface OriginOpts {
    usesTrackViewIndex: boolean;
}

export type Controller = PlaylistController | SearchController;

export class PlayedTrackOrigin {
    _name: TrackOriginName;
    _controller: Controller;
    _usesTrackViewIndex: boolean;
    _context: PlayedTrackOriginContext;
    constructor(
        name: TrackOriginName,
        controller: Controller,
        context: PlayedTrackOriginContext,
        { usesTrackViewIndex }: OriginOpts
    ) {
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

    trackViewByIndex(index: number) {
        const { _trackViews } = this._controller;
        if (index >= 0 && index < _trackViews.length) {
            return _trackViews[index];
        }
        return null;
    }

    startedPlay(playlistTrack: TrackWithOrigin) {
        this._controller.candidatePlaylistTrackWillPlay(playlistTrack);
    }

    isTrackViewValidInController(trackView: TrackView) {
        const index = trackView.getIndex();
        return index >= 0 && index < this._controller.length && this._controller._trackViews[index] === trackView;
    }

    originInitialTracksLoaded() {
        this._context._originReady(this);
    }
}

export class PlayedTrackOriginContext extends EventEmitter {
    _namesToPlayedTrackOrigins: Map<TrackOriginName, PlayedTrackOrigin>;
    _originsPendingReady: Set<PlayedTrackOrigin>;
    _allOriginsReadyEmitted: boolean;
    constructor() {
        super();
        this._namesToPlayedTrackOrigins = new Map();
        this._originsPendingReady = new Set();
        this._allOriginsReadyEmitted = false;
    }

    createOrigin(name: TrackOriginName, controller: Controller, opts: OriginOpts) {
        const ret = new PlayedTrackOrigin(name, controller, this, opts);
        this._namesToPlayedTrackOrigins.set(name, ret);
        this._originsPendingReady.add(ret);
        return ret;
    }

    originByName(name: TrackOriginName) {
        return this._namesToPlayedTrackOrigins.get(name)!;
    }

    async allOriginsInitialTracksLoaded() {
        if (this._allOriginsReadyEmitted) {
            return;
        }

        await new Promise<void>(resolve => this.once("allOriginsReady", resolve));
    }

    _originReady(origin: PlayedTrackOrigin) {
        this._originsPendingReady.delete(origin);
        if (!this._originsPendingReady.size && !this._allOriginsReadyEmitted) {
            this._allOriginsReadyEmitted = true;
            this.emit("allOriginsReady");
        }
    }
}
export interface PlayedTrackOriginContext
    extends EventEmitterInterface<{
        allOriginsReady: () => void;
    }> {}

interface UndoTrackRemovalState {
    tracksAndPositions: { track: Track; index: number }[];
    invertedRanges: [number, number][];
    selectedIndices: number[];
    priorityTrackViewIndex: number;
}

export interface ChangeTrackOpts {
    trackView: TrackView;
    origin: PlayedTrackOrigin;
    doNotRecordHistory?: boolean;
}

export type TrackContainerControllerDeps = SelectDeps<
    | "playedTrackOriginContext"
    | "page"
    | "rippler"
    | "globalEvents"
    | "menuContext"
    | "env"
    | "recognizerContext"
    | "db"
    | "dbValues"
    | "keyboardShortcuts"
    | "scrollerContext"
>;

export interface TrackContainerControllerOpts {
    trackRaterZIndex: number;
    supportsRemove: boolean;
    supportsDragging: boolean;
    playedTrackOriginUsesTrackViewIndex: boolean;
    itemHeight: number;
    target: DomWrapperSelector;
}

type SubClassEventsMap = PlaylistControllerEventsMap & SearchControllerEventsMap;

export interface TrackContainerControllerEventsMap
    extends SelectableEventsMap,
        SubClassEventsMap,
        TrackSorterEventsMap {
    lengthChanged: (newLength: number, oldLength: number) => void;
    allOriginsReady: () => void;
}

export default interface TrackContainerController<T extends TrackOriginName>
    extends EventEmitterInterface<TrackContainerControllerEventsMap> {}

export default abstract class TrackContainerController<T extends TrackOriginName> extends EventEmitter {
    playedTrackOriginContext: PlayedTrackOriginContext;
    page: Page;
    rippler: Rippler;
    globalEvents: GlobalEvents;
    menuContext: MenuContext;
    env: Env;
    recognizerContext: GestureRecognizerContext;
    db: KeyValueDatabase;
    dbValues: StoredKVValues;
    keyboardShortcuts: KeyboardShortcuts;
    _trackRater: TrackRater;
    _trackListDeletionUndo: UndoTrackRemovalState | null;
    _supportsRemove: boolean;
    _supportsDragging: boolean;
    _playedTrackOrigin: PlayedTrackOrigin;
    _domNode: DomWrapper;
    _trackContainer: DomWrapper;
    _trackViews: TrackView[];
    _singleTrackViewSelected: TrackView | null;
    _singleTrackMenu: VirtualButtonMenu | null;
    _selectable: Selectable;
    _fixedItemListScroller: FixedItemListScroller<TrackView>;
    _keyboardShortcutContext: KeyboardShortcutContext;
    _preferencesLoaded: Promise<void>;
    _trackViewOptions: TrackViewOptions;
    _controllerName: ControllerKey;
    _draggable: DraggableSelection | null;
    protected constructor(
        opts: TrackContainerControllerOpts,
        deps: TrackContainerControllerDeps,
        originName: T,
        controllerName: ControllerKey
    ) {
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

        this._trackRater = new TrackRater(
            { zIndex: opts.trackRaterZIndex },
            {
                page: this.page,
                recognizerContext: this.recognizerContext,
                rippler: this.rippler,
            }
        );

        this._controllerName = controllerName;
        this._trackListDeletionUndo = null;
        this._supportsRemove = opts.supportsRemove;
        this._supportsDragging = opts.supportsDragging;

        this._playedTrackOrigin = this.playedTrackOriginContext.createOrigin(
            originName,
            (this as unknown) as Controller,
            {
                usesTrackViewIndex: opts.playedTrackOriginUsesTrackViewIndex,
            }
        );
        this._domNode = this.page.$(opts.target);
        this._trackContainer = this.$().find(`.js-tracklist`);
        this._trackViews = [];
        this._singleTrackViewSelected = null;
        this._singleTrackMenu = this.env.hasTouch() ? this.createSingleTrackMenu() : null;
        this._selectable = new Selectable({ listView: this }, { page: this.page });
        this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
            target: this.$(),
            itemList: this._trackViews,
            contentContainer: this.$trackContainer(),
            minPrerenderedItems: 2,
            maxPrerenderedItems: 4,
        });

        this.globalEvents.on(`resize`, this._windowLayoutChanged.bind(this));
        this.globalEvents.on(`clear`, this.clearSelection.bind(this));
        this._keyboardShortcutContext = this.keyboardShortcuts.createContext();

        if (!this.length) {
            setTimeout(() => this.listBecameEmpty());
        }
        this._preferencesLoaded = Promise.resolve();
        this._trackViewOptions = new TrackViewOptions(
            opts.itemHeight,
            this.page,
            this._selectable,
            this.env.hasTouch(),
            this
        );

        this.bindKeyboardShortcuts();

        this._draggable = null;
        if (this.supportsDragging()) {
            this._draggable = new DraggableSelection(
                {
                    controller: (this as unknown) as Controller,
                    selectionProvider: this._draggableSelectionProvider.bind(this),
                    beforeDragStartCommitDelay: this._beforeDragStartCommitDelay.bind(this),
                    afterDragEnd: this._afterDragEnd.bind(this),
                    commitDelay: this.env.hasTouch() ? 100 : 300,
                },
                deps
            );
            this._draggable.bindEvents();
        }

        this.globalEvents.on("shutdownSavePreferences", this.shutdownSavePreferences.bind(this));
        const persistPreferencesThrottled = throttle(this._persistPreferences, 2500);
        this._fixedItemListScroller.on("scrollPositionChanged", persistPreferencesThrottled);
        this.on("itemsSelected", persistPreferencesThrottled);
        this._bindListControlEvents();
    }

    abstract listBecameEmpty(): void;
    abstract listBecameNonEmpty(): void;
    abstract trackIndexChanged(): void;
    abstract playingTrackAddedToList(track: Track, trackView: TrackView): void;
    abstract didAddTracksToView(tracks: Track[]): void;
    abstract changeTrackExplicitly(t: Track, opts: ChangeTrackOpts): void;
    abstract undoForTrackRemovalExpired(): void;
    abstract shouldUndoTracksRemoved(tracksRemovedCount: number): Promise<boolean>;

    getScroller() {
        return this._fixedItemListScroller;
    }

    preferencesLoaded() {
        return this._preferencesLoaded;
    }

    loadPreferences() {
        const { dbValues } = this;
        const controllerPrefs = dbValues[this._controllerName];

        if (!controllerPrefs) {
            return;
        }

        const selectionRanges = controllerPrefs.selectionRanges;

        if (Array.isArray(selectionRanges)) {
            this._selectable.selectRanges(selectionRanges);
        }
        if (typeof controllerPrefs.scrollPosition === "number") {
            this._fixedItemListScroller.setScrollTop(controllerPrefs.scrollPosition);
        }
    }

    getListControllerPreferences(): ListControllerPreferences {
        return {
            selectionRanges: buildConsecutiveRangesCompressed(this.getSelection(), indexMapper),
            scrollPosition: this._fixedItemListScroller.getScrollTop(),
        };
    }

    shutdownSavePreferences(preferences: PreferenceArray) {
        preferences.push({
            key: this._controllerName,
            value: this.getListControllerPreferences(),
        });
    }

    $(): DomWrapper {
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

    createSingleTrackMenu(): VirtualButtonMenu {
        return (null as unknown) as VirtualButtonMenu;
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

        [1, 2, 3, 4, 5].forEach(ratingValue => {
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

    openSingleTrackMenu(trackView: TrackView, _eventTarget: HTMLElement, event: MouseEvent | GestureObject) {
        if (this._singleTrackMenu) {
            this._trackRater.enable(trackView.track());
            this._singleTrackViewSelected = trackView;
            this._singleTrackMenu.show(event);
        }
    }

    _afterDragEnd() {
        if (this._singleTrackViewSelected) {
            this._selectable.refresh();
            this._singleTrackViewSelected = null;
        }
    }

    _beforeDragStartCommitDelay = ($target: DomWrapper) => {
        if (!this.env.hasTouch()) {
            return $target.closest(`.js-track-container`).length > 0;
        }
        const isControl = $target.closest(`.js-track-drag-button`).length > 0;
        if (!isControl) {
            return false;
        }

        const trackView = this._fixedItemListScroller.itemByRect($target[0]!.getBoundingClientRect());
        if (!trackView) {
            return false;
        }
        this._singleTrackViewSelected = trackView;
        return true;
    };

    _draggableSelectionProvider = () => {
        if (!this.env.hasTouch()) {
            return this.getSelectedItemViewCount() > 0 ? this.getSelection() : [];
        }

        return this._singleTrackViewSelected ? [this._singleTrackViewSelected] : [];
    };

    _bindListControlEvents() {
        const { page, env, rippler } = this;

        this.$().addEventListener(
            `click`,
            page.delegatedEventHandler<MouseEvent>(e => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                if (this._draggable && this._draggable.recentlyStoppedDragging()) return;
                this._selectable.trackViewClick(e, trackView);
            }, `.js-track-container`)
        );

        this.$().addEventListener(
            `mousedown`,
            page.delegatedEventHandler(e => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                this._selectable.trackViewMouseDown(e, trackView);
            }, `.js-track-container`)
        );

        this.$().addEventListener(
            `dblclick`,
            page.delegatedEventHandler(e => {
                const trackView = this._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
                if (!trackView) return;
                this.changeTrackExplicitly(trackView.track(), {
                    trackView,
                    origin: this.getPlayedTrackOrigin(),
                });
            }, `.js-track-container`)
        );

        if (env.hasTouch()) {
            this.recognizerContext
                .createTapRecognizer(
                    page.delegatedEventHandler(e => {
                        const trackView = this._fixedItemListScroller.itemByRect(
                            e.delegateTarget.getBoundingClientRect()
                        );
                        if (!trackView) return;

                        if (this._selectable.contains(trackView)) {
                            this._selectable.removeTrackView(trackView);
                        } else {
                            this._selectable.addTrackView(trackView);
                            this._selectable.setPriorityTrackView(trackView);
                        }
                        rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
                    }, `.js-track-select-button`)
                )
                .recognizeBubbledOn(this.$());

            this.recognizerContext
                .createTapRecognizer(
                    page.delegatedEventHandler(e => {
                        if (
                            e.target.classList.contains(`js-has-primary-action`) ||
                            e.target.closest(`.js-has-primary-action`)
                        ) {
                            return;
                        }
                        const trackView = this._fixedItemListScroller.itemByRect(
                            e.delegateTarget.getBoundingClientRect()
                        );
                        if (!trackView) return;

                        this.changeTrackExplicitly(trackView.track(), {
                            trackView,
                            origin: this.getPlayedTrackOrigin(),
                        });
                    }, `.js-track-container`)
                )
                .recognizeBubbledOn(this.$());

            this.recognizerContext
                .createTapRecognizer(
                    page.delegatedEventHandler(e => {
                        const trackView = this._fixedItemListScroller.itemByRect(
                            e.delegateTarget.getBoundingClientRect()
                        );
                        if (!trackView) return;
                        rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
                        this.openSingleTrackMenu(trackView, e.delegateTarget, e);
                    }, `.js-track-menu-button`)
                )
                .recognizeBubbledOn(this.$());
        }

        if (this.supportsDragging()) {
            this._draggable!.on(`dragStart`, () => {
                this.$().find(`.js-tracklist`).addClass(`tracks-dragging`);
            });
            this._draggable!.on(`dragEnd`, () => {
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

    tabDidShow(_thereWasNoPreviousTab: boolean) {
        this._fixedItemListScroller.resize();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
    }

    edited() {
        if (!this.supportsRemove()) return;
        this._destroyTrackListDeletionUndo();
    }

    _persistPreferences = () => {
        void this.db.set(this._controllerName, this.getListControllerPreferences());
    };

    _destroyTrackListDeletionUndo() {
        if (this._trackListDeletionUndo) {
            this.undoForTrackRemovalExpired();
            this._trackListDeletionUndo = null;
        }
    }

    _saveStateForUndo(
        trackViews: TrackView[],
        invertedRanges: [number, number][],
        selectedIndices: number[],
        priorityTrackViewIndex: number
    ) {
        if (this._trackListDeletionUndo) throw new Error(`already saved`);
        this._trackListDeletionUndo = {
            tracksAndPositions: trackViews.map(trackView => ({
                track: trackView.track(),
                index: trackView.getIndex(),
            })),
            invertedRanges,
            selectedIndices,
            priorityTrackViewIndex,
        };
    }

    _restoreStateForUndo() {
        if (!this._trackListDeletionUndo) return;
        const currentLength = this.length;
        const {
            tracksAndPositions,
            invertedRanges,
            selectedIndices,
            priorityTrackViewIndex,
        } = this._trackListDeletionUndo;
        const newLength = tracksAndPositions.length + currentLength;
        this._trackViews.length = newLength;

        this.edited();

        let k = currentLength - 1;
        for (let i = invertedRanges.length - 1; i >= 0; --i) {
            const rangeStart = invertedRanges[i]![0];
            const rangeEnd = invertedRanges[i]![1];
            for (let j = rangeEnd; j >= rangeStart; --j) {
                this._trackViews[j] = this._trackViews[k--]!;
                this._trackViews[j]!.setIndex(j);
            }
        }

        for (let i = 0; i < tracksAndPositions.length; ++i) {
            const { track, index } = tracksAndPositions[i]!;
            this._trackViews[index] = new TrackView(track, index, this._trackViewOptions);
        }

        if (currentLength === 0) {
            this.listBecameNonEmpty();
        }
        this.emit("lengthChanged", newLength, currentLength);
        this._fixedItemListScroller.resize();
        this._selectable.selectIndices(selectedIndices);

        let centerOn = null;
        if (priorityTrackViewIndex >= 0) {
            centerOn = this._trackViews[priorityTrackViewIndex]!;
            this._selectable.setPriorityTrackView(centerOn);
        } else {
            const mid = selectedIndices[(selectedIndices.length / 2) | 0]!;
            centerOn = this._trackViews[mid];
        }
        this.centerOnTrackView(centerOn);
    }

    removeTrackView(trackView: TrackView) {
        if (!this.supportsRemove()) return;
        void this.removeTrackViews([trackView]);
    }

    async removeTrackViews(trackViews: TrackView[], { silent = false }: { silent: boolean } = { silent: false }) {
        if (!this.supportsRemove()) return;
        if (trackViews.length === 0) return;
        const oldLength = this.length;
        const indexes = trackViews.map(indexMapper);
        const tracksIndexRanges = buildConsecutiveRanges(indexes);
        const priorityTrackView = this._selectable.getPriorityTrackView();
        this.edited();
        this._saveStateForUndo(
            trackViews,
            buildInverseRanges(indexes, oldLength - 1),
            this.getSelection().map(indexMapper),
            priorityTrackView ? priorityTrackView.getIndex() : -1
        );

        this._selectable.removeIndices(trackViews.map(indexMapper));

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i]!.destroy();
        }

        this.removeTracksBySelectionRanges(tracksIndexRanges);
        const tracksRemovedCount = oldLength - this.length;
        this._fixedItemListScroller.resize();
        this.emit("lengthChanged", this.length, oldLength);

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
        void this.removeTrackViews(selection);
    }

    add(tracks: Track[], { noReport = false }: { noReport: boolean } = { noReport: false }) {
        if (!tracks.length) return;
        this.edited();

        if (!this.length) {
            this.listBecameNonEmpty();
        }

        const oldLength = this.length;
        for (let i = 0; i < tracks.length; ++i) {
            const track = tracks[i]!;
            const index = oldLength + i;
            const trackView = new TrackView(track, index, this._trackViewOptions);
            this._trackViews[index] = trackView;
            if (track.isPlaying()) {
                this.playingTrackAddedToList(track, trackView);
            }
        }
        this.emit("lengthChanged", oldLength + tracks.length, oldLength);
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

    selectTrackView(trackView: TrackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            this.clearSelection();
            this._selectable.addTrackView(trackView);
            this.centerOnTrackView(trackView);
        }
    }

    selectionContainsAnyItemViewsBetween(startY: number, endY: number) {
        const indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
        if (!indices) return false;
        return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
    }

    selectTracksBetween(startY: number, endY: number) {
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
            origin: this.getPlayedTrackOrigin(),
        });
    }

    playFirstSelected() {
        if (!this.length) return;

        const firstTrackView = this._selectable.first();
        if (!firstTrackView) return;
        this.changeTrackExplicitly(firstTrackView.track(), {
            trackView: firstTrackView,
            origin: this.getPlayedTrackOrigin(),
        });
    }

    getTrackViews() {
        return this._trackViews;
    }

    centerOnTrackView(trackView?: TrackView) {
        if (trackView) {
            let y = this._fixedItemListScroller.yByIndex(trackView.getIndex());
            y -= this._fixedItemListScroller.contentHeight() / 2;
            this._fixedItemListScroller.scrollToUnsnapped(y);
        }
    }

    getTrackByIndex(index: number) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index]!.track();
        }
        throw new Error("invalid index");
    }

    getTrackViewByIndex(index: number) {
        if (index >= 0 && index <= this._trackViews.length - 1) {
            return this._trackViews[index]!;
        }
        throw new Error("invalid index");
    }

    getSelectable() {
        return this._selectable;
    }

    getSelectedItemViewCount() {
        return this._selectable.getSelectedItemViewCount();
    }

    isSelected(trackView: TrackView) {
        return this._selectable.contains(trackView) || this._singleTrackViewSelected === trackView;
    }

    toArray() {
        return this._trackViews.slice();
    }

    removeTracksBySelectionRanges(selectionRanges: number[][]) {
        const trackViews = this._trackViews;
        let indexOffset = 0;
        selectionRanges.forEach(selection => {
            remove(trackViews, selection, indexOffset);
            indexOffset += selection.length;
        });
    }

    [Symbol.iterator]() {
        return this._trackViews[Symbol.iterator]();
    }
}

export const DUMMY_PLAYLIST_TRACK = new TrackWithOrigin(dummyTrack, dummyTrack, dummyTrack);
