import {noUndefinedGet} from "util";
import TabController from "ui/TabController";
import TrackRater from "tracks/TrackRater";
import withDeps from "ApplicationDependencies";

export const PLAYLIST_TAB_ID = `playlist`;
export const SEARCH_TAB_ID = `search`;
export const QUEUE_TAB_ID = `queue`;

const lessThanAllSelected = function(selectedCount, totalCount) {
    return selectedCount < totalCount && totalCount > 0;
};

const exactly1Selected = function(selectedCount, totalCount) {
    return selectedCount === 1 && totalCount > 0;
};

const moreThan0Selected = function(selectedCount, totalCount) {
    return selectedCount > 0 && totalCount > 0;
};

const moreThan1Selected = function(selectedCount, totalCount) {
    return selectedCount > 1 && totalCount > 1;
};

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

        this.playlistTrackRater = withDeps({
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler
        }, d => new TrackRater(d));

        this.searchTrackRater = withDeps({
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler
        }, d => new TrackRater(d));

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

        this.playlistActionSpec = this.getPlaylistActionSpec();
        this.searchActionSpec = this.getSearchActionSpec();

        if (this.env.hasTouch()) {
            this.playlistContextMenu = this.menuContext.createButtonMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createButtonMenu(this.searchActionSpec);
            this.selectionStatus.on(`menuClick`, (e) => {
                const tabId = this.tabController.getActiveTabId();
                if (tabId === SEARCH_TAB_ID) {
                    this.searchContextMenu.show(e);
                } else if (tabId === PLAYLIST_TAB_ID) {
                    this.playlistContextMenu.show(e);
                }
            });
        } else {
            this.playlistContextMenu = this.menuContext.createContextMenu(this.playlistActionSpec);
            this.searchContextMenu = this.menuContext.createContextMenu(this.searchActionSpec);
            this.playlistContextMenu.on(`beforeOpen`, this.beforePlaylistContextMenuOpen.bind(this));
            this.searchContextMenu.on(`beforeOpen`, this.beforeSearchContextMenuOpen.bind(this));
        }

        this.playlist.on(`tracksSelected`, this.updatePlaylistContextMenuEnabledStates.bind(this));
        this.playlist.on(`lengthChange`, this.updatePlaylistContextMenuEnabledStates.bind(this));
        this.search.on(`tracksSelected`, this.updateSearchContextMenuEnabledStates.bind(this));
        this.search.on(`lengthChange`, this.updateSearchContextMenuEnabledStates.bind(this));
        this.globalEvents.on(`resize`, this.layoutChanged.bind(this));
    }

    tabEventHandler(methodName) {
        return function(tabId) {
            const contentInstance = this.contentInstancesByTabId[tabId];
            if (contentInstance) {
                if (contentInstance[methodName]) {
                    contentInstance[methodName]();
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

    actionHandler(preventDefault, contentInstance, method) {
        if (!contentInstance[method]) {
            throw new Error(`no such method: ${method}`);
        }

        return function(e) {
            if (preventDefault) e.preventDefault();
            contentInstance[method]();
        };
    }

    getPlaylistActionSpec() {
        const haveTouch = this.env.hasTouch();
        const target = haveTouch ? this.selectionStatus.$menuButton() : this.playlist.$trackContainer();
        const menu = [];

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: this.actionHandler(false, this.playlist, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected
            });
        }

        menu.push({
            id: `delete`,
            disabled: true,
            content: this.menuContext.createMenuItem(`Delete`, `material-icons small-material-icon delete`),
            onClick: this.actionHandler(false, this.playlist, `removeSelected`),
            enabledPredicate: moreThan0Selected
        });

        menu.push({
            divider: true
        });

        if (!haveTouch) {
            menu.push({
                id: `clear-selection`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select none`, `material-icons small-material-icon crop_square`),
                onClick: this.actionHandler(true, this.playlist, `clearSelection`),
                enabledPredicate: moreThan0Selected
            });

            menu.push({
                id: `select-all`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select all`, `material-icons small-material-icon select_all`),
                onClick: this.actionHandler(true, this.playlist, `selectAll`),
                enabledPredicate: lessThanAllSelected
            });
        }

        menu.push({
            id: `sort`,
            disabled: true,
            content: this.menuContext.createMenuItem(`Sort by`, `glyphicon glyphicon-sort`),
            enabledPredicate: moreThan1Selected,
            children: [{
                id: `sort-by-album`,
                content: this.menuContext.createMenuItem(`Album`, `material-icons small-material-icon album`),
                onClick: this.actionHandler(true, this.playlist, `sortByAlbum`),
                enabledPredicate: moreThan1Selected
            }, {
                id: `sort-by-artist`,
                content: this.menuContext.createMenuItem(`Artist`, `material-icons small-material-icon mic`),
                onClick: this.actionHandler(true, this.playlist, `sortByArtist`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-album-artist`,
                content: this.menuContext.createMenuItem(`Album artist`, `material-icons small-material-icon perm_camera_mic`),
                onClick: this.actionHandler(true, this.playlist, `sortByAlbumArtist`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-title`,
                content: this.menuContext.createMenuItem(`Title`, `material-icons small-material-icon music_note`),
                onClick: this.actionHandler(true, this.playlist, `sortByTitle`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-rating`,
                content: this.menuContext.createMenuItem(`Rating`, `material-icons small-material-icon grade`),
                onClick: this.actionHandler(true, this.playlist, `sortByRating`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-duration`,
                content: this.menuContext.createMenuItem(`Duration`, `material-icons small-material-icon access_time`),
                onClick: this.actionHandler(true, this.playlist, `sortByDuration`),
                enabledPredicate: moreThan1Selected
            }, {
                divider: true
            }, {
                id: `sort-by-shuffling`,
                content: this.menuContext.createMenuItem(`Shuffle`, `material-icons small-material-icon shuffle`),
                onClick: this.actionHandler(true, this.playlist, `sortByShuffling`),
                enabledPredicate: moreThan1Selected
            }, {
                id: `sort-by-reverse-order`,
                content: this.menuContext.createMenuItem(`Reverse order`, `material-icons small-material-icon undo`),
                onClick: this.actionHandler(true, this.playlist, `sortByReverseOrder`),
                enabledPredicate: moreThan1Selected
            }]
        });

        if (!haveTouch) {
            menu.push({
                divider: true
            });

            menu.push({
                disabled: true,
                id: `track-rating`,
                enabledPredicate: exactly1Selected,
                content: function() {
                    return this.playlistTrackRater.$();
                }.bind(this),
                onClick(e) {
                    e.preventDefault();
                }
            });
        }

        return {target, menu};
    }

    getSearchActionSpec() {
        const haveTouch = this.env.hasTouch();
        const target = haveTouch ? this.selectionStatus.$menuButton() : this.search.$trackContainer();
        const menu = [];

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: this.actionHandler(false, this.search, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected
            });

            menu.push({
                divider: true
            });

            menu.push({
                id: `clear-selection`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select none`, `material-icons small-material-icon crop_square`),
                onClick: this.actionHandler(true, this.search, `clearSelection`),
                enabledPredicate: moreThan0Selected
            });

            menu.push({
                id: `select-all`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select all`, `material-icons small-material-icon select_all`),
                onClick: this.actionHandler(true, this.search, `selectAll`),
                enabledPredicate: lessThanAllSelected
            });

            menu.push({
                divider: true
            });

            menu.push({
                disabled: true,
                id: `track-rating`,
                enabledPredicate: exactly1Selected,
                content: function() {
                    return this.searchTrackRater.$();
                }.bind(this),
                onClick(e) {
                    e.preventDefault();
                }
            });
        }

        if (haveTouch) {
            menu.push({
                divider: true
            });
        }

        return {target, menu};
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
            this.playlistTrackRater.enable(this.playlist.getSelectable().first().track());
        } else {
            this.playlistTrackRater.disable();
        }
        this.playlistContextMenu.setEnabledStateFromPredicate(selectedCount, this.playlist.length);
    }

    updateSearchContextMenuEnabledStates() {
        const selectedCount = this.search.getSelectedItemViewCount();
        this.selectionStatus.setSelectionCount(selectedCount, this.search.length);
        if (selectedCount === 1) {
            this.searchTrackRater.enable(this.search.getSelectable().first().track());
        } else {
            this.searchTrackRater.disable();
        }
        this.searchContextMenu.setEnabledStateFromPredicate(selectedCount, this.search.length);
    }

    beforePlaylistContextMenuOpen() {
        this.playlistTrackRater.update();
    }

    beforeSearchContextMenuOpen() {
        this.searchTrackRater.update();
    }
}
