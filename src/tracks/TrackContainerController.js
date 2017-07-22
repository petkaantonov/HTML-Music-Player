import EventEmitter from "events";
import withDeps from "ApplicationDependencies";
import TrackContainerTrait from "tracks/TrackContainerTrait";
import Selectable from "ui/Selectable";
import TrackRater from "tracks/TrackRater";

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

        this._playedTrackOrigin = new PlayedTrackOrigin(this.constructor.name, this, {
            usesTrackViewIndex: opts.playedTrackOriginUsesTrackViewIndex
        });
        this._domNode = this.page.$(opts.target);
        this._trackContainer = this.$().find(`.tracklist-transform-container`);
        this._trackViews = [];
        this._singleTrackViewSelected = null;
        this._singleTrackMenu = this.env.hasTouch() ? this._createSingleTrackMenu() : null;
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
    }

    $() {
        return this._domNode;
    }

    $trackContainer() {
        return this._trackContainer;
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
    }

    tabDidShow() {
        this._fixedItemListScroller.resize();
    }
}

Object.assign(TrackContainerController.prototype, TrackContainerTrait);
