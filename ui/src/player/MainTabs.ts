import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import { PreferenceArray, TabId } from "shared/src/preferences";
import KeyboardShortcuts from "ui/keyboard/KeyboardShortcuts";
import Page, { DomWrapper } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import SearchController from "ui/search/SearchController";
import { Controller } from "ui/tracks/TrackContainerController";
import { ButtonMenu, ContextMenu } from "ui/ui/ActionMenu";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import MenuContext, { ButtonMenuCallerOptions } from "ui/ui/MenuContext";
import Rippler from "ui/ui/Rippler";
import SelectionStatus from "ui/ui/SelectionStatus";
import TabController from "ui/ui/TabController";

import PlaylistController from "./PlaylistController";

export const VISIBLE_TAB_PREFERENCE_KEY = `visibleTabId`;

interface MainTabsOptions {
    itemHeight: number;
    tabHeight: number;
    tabHolder: string;
    playlistTab: string;
    searchTab: string;
    queueTab: string;
    activeTabIndicator: string;
}

interface MainTabsDeps {
    page: Page;
    env: Env;
    selectionStatus: SelectionStatus;
    globalEvents: GlobalEvents;
    menuContext: MenuContext;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    keyboardShortcuts: KeyboardShortcuts;
    playlist: PlaylistController;
    search: SearchController;
    queue: null;
    db: KeyValueDatabase;
}

interface Tabs {
    playlist: PlaylistController;
    search: SearchController;
    queue: null;
}

type Menus = Record<TabId, ButtonMenu | ContextMenu>;
export default class MainTabs {
    private readonly page: Page;
    private readonly env: Env;
    private readonly selectionStatus: SelectionStatus;
    private readonly globalEvents: GlobalEvents;
    private readonly menuContext: MenuContext;
    private readonly recognizerContext: GestureRecognizerContext;
    private readonly rippler: Rippler;
    private readonly keyboardShortcuts: KeyboardShortcuts;
    private readonly playlist: PlaylistController;
    private readonly search: SearchController;
    private readonly db: KeyValueDatabase;
    private readonly tabHolder: DomWrapper;
    private readonly contentInstancesByTabId: Tabs;
    readonly tabController: TabController;
    private readonly playlistActionSpec: ButtonMenuCallerOptions;
    private readonly searchActionSpec: ButtonMenuCallerOptions;
    private readonly menuInstancesByTabId: Menus;
    private readonly playlistContextMenu: ButtonMenu | ContextMenu;
    private readonly searchContextMenu: ButtonMenu | ContextMenu;

    constructor(opts: MainTabsOptions, deps: MainTabsDeps) {
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
        this.db = deps.db;

        this.tabHolder = this.page.$(opts.tabHolder);

        this.contentInstancesByTabId = {
            playlist: this.playlist,
            search: this.search,
            queue: null,
        };
        this.tabController = new TabController(
            this.tabHolder,
            [
                {
                    id: "playlist",
                    tab: opts.playlistTab,
                    content: this.playlist.$(),
                },
                {
                    id: "search",
                    tab: opts.searchTab,
                    content: this.search.$(),
                },
                {
                    id: "queue",
                    tab: opts.queueTab,
                    content: `.js-queue-pane-container`,
                },
            ],
            {
                indicator: opts.activeTabIndicator,
            },
            {
                recognizerContext: this.recognizerContext,
                rippler: this.rippler,
                globalEvents: this.globalEvents,
                page: this.page,
            }
        );

        this.tabController.on(`tabWillDeactivate`, this.tabEventHandler(`tabWillHide`));
        this.tabController.on(`tabWillActivate`, this.tabEventHandler(`tabWillShow`));
        this.tabController.on(`tabDidDeactivate`, this.tabEventHandler(`tabDidHide`));
        this.tabController.on(`tabDidActivate`, this.tabEventHandler(`tabDidShow`));

        this.keyboardShortcuts.defaultContext.addShortcut([`mod+f`, `alt+s`], () => {
            void this.tabController.activateTabById("search");
        });

        this.keyboardShortcuts.defaultContext.addShortcut(`alt+a`, () => {
            void this.tabController.activateTabById("playlist");
        });

        this.keyboardShortcuts.defaultContext.addShortcut(`alt+d`, () => {
            void this.tabController.activateTabById("queue");
        });

        this.playlistActionSpec = this.playlist.createMultiSelectionMenuSpec(
            this.env.hasTouch() ? this.selectionStatus.$menuButton() : this.playlist.$trackContainer()
        );
        this.searchActionSpec = this.search.createMultiSelectionMenuSpec(
            this.env.hasTouch() ? this.selectionStatus.$menuButton() : this.search.$trackContainer()
        );

        this.menuInstancesByTabId = Object.create(null);
        if (this.env.hasTouch()) {
            this.playlistContextMenu = this.menuContext.createButtonMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createButtonMenu(this.searchActionSpec);
            this.selectionStatus.on(`menuClick`, e => {
                this.withActiveMenuInstance(m => m.show(e));
            });

            this.selectionStatus.on(`unselectAll`, () => this.withActiveContentInstance(m => m.clearSelection()));
            this.selectionStatus.on(`selectAll`, () => this.withActiveContentInstance(m => m.selectAll()));
            this.selectionStatus.on(`emptySelection`, () => this.withActiveMenuInstance(m => m.hide()));
        } else {
            this.playlistContextMenu = this.menuContext.createContextMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createContextMenu(this.searchActionSpec);
            this.playlistContextMenu.on(`beforeOpen`, this.beforePlaylistContextMenuOpen);
            this.searchContextMenu.on(`beforeOpen`, this.beforeSearchContextMenuOpen);
        }
        this.menuInstancesByTabId.playlist = this.playlistContextMenu;
        this.menuInstancesByTabId.search = this.searchContextMenu;

        this.playlist.on("itemsSelected", this.updatePlaylistContextMenuEnabledStates);
        this.playlist.on("lengthChanged", this.updatePlaylistContextMenuEnabledStates);
        this.search.on("itemsSelected", this.updateSearchContextMenuEnabledStates);
        this.search.on("lengthChanged", this.updateSearchContextMenuEnabledStates);
        this.globalEvents.on("shutdownSavePreferences", this._shutdownSavePreferences);
    }

    withActiveMenuInstance = (fn: (e: ContextMenu | ButtonMenu) => void) => {
        const tabId = this.tabController.getActiveTabId();
        const instance = this.menuInstancesByTabId[tabId];
        if (tabId) {
            fn(instance);
        }
    };

    withActiveContentInstance = (fn: (e: PlaylistController | SearchController) => void) => {
        const tabId = this.tabController.getActiveTabId();
        const instance = this.contentInstancesByTabId[tabId];
        if (instance) {
            fn(instance);
        }
    };

    tabEventHandler = <T extends keyof Controller>(methodName: T | "tabWillShow" | "tabDidShow" | "tabDidHide") => (
        tabId: TabId,
        ...args: any[]
    ) => {
        const contentInstance = this.contentInstancesByTabId[tabId];
        if (contentInstance) {
            if (methodName in contentInstance) {
                (contentInstance[methodName as T] as AnyFunction)(...args);
            }

            if (methodName === `tabWillShow`) {
                this.playlistContextMenu.hide(true);
                this.searchContextMenu.hide(true);
                this.selectionStatus.setSelectionCount(
                    contentInstance.getSelectedItemViewCount(),
                    contentInstance.length,
                    false
                );
            }
        } else {
            if (methodName === `tabWillShow`) {
                this.playlistContextMenu.hide(true);
                this.searchContextMenu.hide(true);
                this.selectionStatus.setSelectionCount(0, 0, false);
            }
            this.page.warn(`no tab id ${tabId}`);
        }

        if (methodName === `tabDidShow`) {
            this._persistActiveTabId();
        }
    };

    updatePlaylistContextMenuEnabledStates = () => {
        const selectedCount = this.playlist.getSelectedItemViewCount();
        this.selectionStatus.setSelectionCount(selectedCount, this.playlist.length);
        if (selectedCount === 1) {
            this.playlist.getTrackRater().enable(this.playlist.getSelectable().first()!.track());
        } else {
            this.playlist.getTrackRater().disable();
        }
        this.playlistContextMenu.setEnabledStateFromPredicate(selectedCount, this.playlist.length);
    };

    updateSearchContextMenuEnabledStates = () => {
        const selectedCount = this.search.getSelectedItemViewCount();
        this.selectionStatus.setSelectionCount(selectedCount, this.search.length);
        if (selectedCount === 1) {
            this.search.getTrackRater().enable(this.search.getSelectable().first()!.track());
        } else {
            this.search.getTrackRater().disable();
        }
        this.searchContextMenu.setEnabledStateFromPredicate(selectedCount, this.search.length);
    };

    beforePlaylistContextMenuOpen = () => {
        this.playlist.getTrackRater().update();
    };

    beforeSearchContextMenuOpen = () => {
        this.search.getTrackRater().update();
    };

    _shutdownSavePreferences = (preferences: PreferenceArray) => {
        preferences.push({
            key: VISIBLE_TAB_PREFERENCE_KEY,
            value: this.tabController.getActiveTabId(),
        });
    };

    _persistActiveTabId = () => {
        void this.db.set(VISIBLE_TAB_PREFERENCE_KEY, this.tabController.getActiveTabId());
    };
}
