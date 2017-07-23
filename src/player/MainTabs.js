import {noUndefinedGet, _call} from "util";
import TabController from "ui/TabController";
import withDeps from "ApplicationDependencies";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";

import {ITEMS_SELECTED_EVENT} from "ui/Selectable";
import {LENGTH_CHANGE_EVENT} from "tracks/TrackContainerController";

export const PLAYLIST_TAB_ID = `playlist`;
export const SEARCH_TAB_ID = `search`;
export const QUEUE_TAB_ID = `queue`;

export const VISIBLE_TAB_PREFERENCE_KEY = `visibleTabId`;

export default class MainTabs {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.env = deps.env;
        this.selectionStatus = deps.selectionStatus;
        this.globalEvents = deps.globalEvents;
        this.menuContext = deps.menuContext;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.keyboardShortcuts = deps.keyboardShortcuts;
        this.playlist = deps.playlist;
        this.search = deps.search;
        this.queue = deps.queue;

        this.itemHeight = opts.itemHeight;
        this.tabHeight = opts.tabHeight;
        this.tabHolder = this.page.$(opts.tabHolder);

        this.contentInstancesByTabId = Object.create(null);
        this.contentInstancesByTabId[PLAYLIST_TAB_ID] = this.playlist;
        this.contentInstancesByTabId[SEARCH_TAB_ID] = this.search;


        this.tabController = withDeps({
            recognizerContext: this.recognizerContext,
            rippler: this.rippler,
            globalEvents: this.globalEvents,
            page: this.page
        }, d => new TabController(opts.tabHolder, [{
            id: PLAYLIST_TAB_ID,
            tab: opts.playlistTab,
            content: this.playlist.$()
        }, {
            id: SEARCH_TAB_ID,
            tab: opts.searchTab,
            content: this.search.$()
        }, {
            id: QUEUE_TAB_ID,
            tab: opts.queueTab,
            content: `.queue-list-container`
        }], {
            indicator: opts.activeTabIndicator
        }, d));
        this.tabController.on(`tabWillDeactivate`, this.tabEventHandler(`tabWillHide`));
        this.tabController.on(`tabWillActivate`, this.tabEventHandler(`tabWillShow`));
        this.tabController.on(`tabDidDeactivate`, this.tabEventHandler(`tabDidHide`));
        this.tabController.on(`tabDidActivate`, this.tabEventHandler(`tabDidShow`));

        this.keyboardShortcuts.defaultContext.addShortcut([`mod+f`, `alt+s`], () => {
            this.tabController.activateTabById(SEARCH_TAB_ID);
        });

        this.keyboardShortcuts.defaultContext.addShortcut(`alt+a`, () => {
            this.tabController.activateTabById(PLAYLIST_TAB_ID);
        });

        this.keyboardShortcuts.defaultContext.addShortcut(`alt+d`, () => {
            this.tabController.activateTabById(QUEUE_TAB_ID);
        });

        this.playlistActionSpec = this.playlist.createMultiSelectionMenuSpec(
            this.env.hasTouch() ? this.selectionStatus.$menuButton() : this.playlist.$trackContainer());
        this.searchActionSpec = this.search.createMultiSelectionMenuSpec(
            this.env.hasTouch() ? this.selectionStatus.$menuButton() : this.search.$trackContainer());

        this.menuInstancesByTabId = Object.create(null);
        if (this.env.hasTouch()) {
            this.playlistContextMenu = this.menuContext.createButtonMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createButtonMenu(this.searchActionSpec);
            this.selectionStatus.on(`menuClick`, (e) => {
                this.withActiveMenuInstance(_call.show(e));
            });

            this.selectionStatus.on(`unselectAll`,
                                    this.withActiveContentInstance.bind(this, _call.clearSelection()));
            this.selectionStatus.on(`selectAll`,
                                    this.withActiveContentInstance.bind(this, _call.selectAll()));
            this.selectionStatus.on(`emptySelection`,
                                    this.withActiveMenuInstance.bind(this, _call.hide()));
        } else {
            this.playlistContextMenu = this.menuContext.createContextMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createContextMenu(this.searchActionSpec);
            this.playlistContextMenu.on(`beforeOpen`, this.beforePlaylistContextMenuOpen.bind(this));
            this.searchContextMenu.on(`beforeOpen`, this.beforeSearchContextMenuOpen.bind(this));
        }
        this.menuInstancesByTabId[PLAYLIST_TAB_ID] = this.playlistContextMenu;
        this.menuInstancesByTabId[SEARCH_TAB_ID] = this.searchContextMenu;


        this.playlist.on(ITEMS_SELECTED_EVENT, this.updatePlaylistContextMenuEnabledStates.bind(this));
        this.playlist.on(LENGTH_CHANGE_EVENT, this.updatePlaylistContextMenuEnabledStates.bind(this));
        this.search.on(ITEMS_SELECTED_EVENT, this.updateSearchContextMenuEnabledStates.bind(this));
        this.search.on(LENGTH_CHANGE_EVENT, this.updateSearchContextMenuEnabledStates.bind(this));
        this.globalEvents.on(`resize`, this.layoutChanged.bind(this));
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));
    }

    withActiveMenuInstance(fn) {
        const tabId = this.tabController.getActiveTabId();
        const instance = this.menuInstancesByTabId[tabId];
        if (tabId) {
            fn(instance);
        }
    }

    withActiveContentInstance(fn) {
        const tabId = this.tabController.getActiveTabId();
        const instance = this.contentInstancesByTabId[tabId];
        if (instance) {
            fn(instance);
        }
    }

    tabEventHandler(methodName) {
        return function(tabId, ...args) {
            const contentInstance = this.contentInstancesByTabId[tabId];
            if (contentInstance) {
                if (contentInstance[methodName]) {
                    contentInstance[methodName](...args);
                }

                if (methodName === `tabWillShow`) {
                    this.playlistContextMenu.hide(true);
                    this.searchContextMenu.hide(true);
                    this.selectionStatus.setSelectionCount(contentInstance.getSelectedItemViewCount(),
                                                           contentInstance.length,
                                                           false);
                }
            } else {
                if (methodName === `tabWillShow`) {
                    this.playlistContextMenu.hide(true);
                    this.searchContextMenu.hide(true);
                    this.selectionStatus.setSelectionCount(0, 0, false);
                }
                this.page.warn(`no tab id ${tabId}`);
            }
        }.bind(this);
    }

    layoutChanged() {
        const {page} = this;
        const elems = this.tabController.$containers();

        const visible = elems.filter(elem => page.$(elem).style().display !== `none`).get(0);

        const rect = visible.getBoundingClientRect();
        const USED_HEIGHT = rect.top;

        let height = page.height() - USED_HEIGHT;
        height = Math.max(height - this.itemHeight / 2, this.itemHeight + this.itemHeight / 2);
        const remainder = height % this.itemHeight;

        if (remainder !== 0) {
            height -= remainder;
        }

        elems.setStyle(`height`, `${height}px`);
        this.tabHolder.setStyle(`height`, `${height + this.tabHeight}px`);
    }

    updatePlaylistContextMenuEnabledStates() {
        const selectedCount = this.playlist.getSelectedItemViewCount();
        this.selectionStatus.setSelectionCount(selectedCount, this.playlist.length);
        if (selectedCount === 1) {
            this.playlist.getTrackRater().enable(this.playlist.getSelectable().first().track());
        } else {
            this.playlist.getTrackRater().disable();
        }
        this.playlistContextMenu.setEnabledStateFromPredicate(selectedCount, this.playlist.length);
    }

    updateSearchContextMenuEnabledStates() {
        const selectedCount = this.search.getSelectedItemViewCount();
        this.selectionStatus.setSelectionCount(selectedCount, this.search.length);
        if (selectedCount === 1) {
            this.search.getTrackRater().enable(this.search.getSelectable().first().track());
        } else {
            this.search.getTrackRater().disable();
        }
        this.searchContextMenu.setEnabledStateFromPredicate(selectedCount, this.search.length);
    }

    beforePlaylistContextMenuOpen() {
        this.playlist.getTrackRater().update();
    }

    beforeSearchContextMenuOpen() {
        this.search.getTrackRater().update();
    }

    _shutdownSavePreferences(preferences) {
        preferences.push({
            key: VISIBLE_TAB_PREFERENCE_KEY,
            value: this.tabController.getActiveTabId()
        });
    }
}
