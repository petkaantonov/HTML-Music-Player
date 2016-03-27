"use strict";

import TabController from "ui/TabController";
import TrackRater from "tracks/TrackRater";
import ApplicationDependencies from "ApplicationDependencies";

const PLAYLIST_TAB_ID = "playlist";
const SEARCH_TAB_ID = "search";
const QUEUE_TAB_ID = "queue";

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

export default function MainTabs(opts, deps) {
    opts = Object(opts);
    this.page = deps.page;
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

    this.playlistTrackRater = new TrackRater(new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    }));

    this.searchTrackRater = new TrackRater(new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    }));

    this.contentInstancesByTabId = Object.create(null);
    this.contentInstancesByTabId[PLAYLIST_TAB_ID] = this.playlist;
    this.contentInstancesByTabId[SEARCH_TAB_ID] = this.search;

    this.tabController = new TabController(opts.tabHolder, [{
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
        content: ".queue-list-container"
    }], {
        indicator: opts.activeTabIndicator
    }, new ApplicationDependencies({
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents,
        page: this.page
    }));
    this.tabController.activateTabById(PLAYLIST_TAB_ID);

    this.tabController.on("tabWillDeactivate", this.tabEventHandler("tabWillHide"));
    this.tabController.on("tabWillActivate", this.tabEventHandler("tabWillShow"));
    this.tabController.on("tabDidDeactivate", this.tabEventHandler("tabDidHide"));
    this.tabController.on("tabDidActivate", this.tabEventHandler("tabDidShow"));

    this.keyboardShortcuts.defaultContext.addShortcut(["mod+f", "alt+s"], function() {
        this.tabController.activateTabById(SEARCH_TAB_ID);
    }.bind(this));

    this.keyboardShortcuts.defaultContext.addShortcut("alt+a", function() {
        this.tabController.activateTabById(PLAYLIST_TAB_ID);
    }.bind(this));

    this.keyboardShortcuts.defaultContext.addShortcut("alt+d", function() {
        this.tabController.activateTabById(QUEUE_TAB_ID);
    }.bind(this));

    this.playlistActionSpec = this.getPlaylistActionSpec();
    this.searchActionSpec = this.getSearchActionSpec();

    this.playlistContextMenu = this.menuContext.createContextMenu(this.playlistActionSpec);
    this.searchContextMenu = this.menuContext.createContextMenu(this.searchActionSpec);

    this.playlistContextMenu.on("beforeOpen", this.beforePlaylistContextMenuOpen.bind(this));
    this.searchContextMenu.on("beforeOpen", this.beforeSearchContextMenuOpen.bind(this));
    this.playlist.on("tracksSelected", this.updatePlaylistContextMenuEnabledStates.bind(this));
    this.playlist.on("lengthChange", this.updatePlaylistContextMenuEnabledStates.bind(this));
    this.search.on("tracksSelected", this.updateSearchContextMenuEnabledStates.bind(this));
    this.search.on("lengthChange", this.updateSearchContextMenuEnabledStates.bind(this));
    this.globalEvents.on("resize", this.layoutChanged.bind(this));
    deps.ensure();
}

MainTabs.prototype.tabEventHandler = function(methodName) {
    return function(tabId) {
        var contentInstance = this.contentInstancesByTabId[tabId];
        if (contentInstance) {
            contentInstance[methodName]();
        }
    }.bind(this);
};

MainTabs.prototype.actionHandler = function(preventDefault, contentInstance, method) {
    if (!contentInstance[method]) {
        throw new Error("no such method: " + method);
    }

    return function(e) {
        if (preventDefault) e.preventDefault();
        contentInstance[method]();
    };
};

MainTabs.prototype.getPlaylistActionSpec = function() {
    return {
        target: this.playlist.$trackContainer(),
        menu: [{
            id: "play",
            disabled: true,
            content: this.menuContext.createMenuItem("Play", "glyphicon glyphicon-play-circle"),
            onClick: this.actionHandler(false, this.playlist, "playPrioritySelection"),
            enabledPredicate: moreThan0Selected
        }, {
            id: "delete",
            disabled: true,
            content: this.menuContext.createMenuItem("Delete", "material-icons small-material-icon delete"),
            onClick: this.actionHandler(false, this.playlist, "removeSelected"),
            enabledPredicate: moreThan0Selected
        }, {
            divider: true,
        }, {
            id: "clear-selection",
            disabled: true,
            content: this.menuContext.createMenuItem("Select none", "material-icons small-material-icon crop_square"),
            onClick: this.actionHandler(true, this.playlist, "clearSelection"),
            enabledPredicate: moreThan0Selected
        }, {
            id: "select-all",
            disabled: true,
            content: this.menuContext.createMenuItem("Select all", "material-icons small-material-icon select_all"),
            onClick: this.actionHandler(true, this.playlist, "selectAll"),
            enabledPredicate: lessThanAllSelected
        }, {
            id: "sort",
            disabled: true,
            content: this.menuContext.createMenuItem("Sort by", "glyphicon glyphicon-sort"),
            enabledPredicate: moreThan1Selected,
            children: [{
                id: "sort-by-album",
                content: this.menuContext.createMenuItem("Album", "material-icons small-material-icon album"),
                onClick: this.actionHandler(true, this.playlist, "sortByAlbum"),
                enabledPredicate: moreThan1Selected
            }, {
                id: "sort-by-artist",
                content: this.menuContext.createMenuItem("Artist", "material-icons small-material-icon mic"),
                onClick: this.actionHandler(true, this.playlist, "sortByArtist"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-album-artist",
                content: this.menuContext.createMenuItem("Album artist", "material-icons small-material-icon perm_camera_mic"),
                onClick: this.actionHandler(true, this.playlist, "sortByAlbumArtist"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-title",
                content: this.menuContext.createMenuItem("Title", "material-icons small-material-icon music_note"),
                onClick: this.actionHandler(true, this.playlist, "sortByTitle"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-rating",
                content: this.menuContext.createMenuItem("Rating", "material-icons small-material-icon grade"),
                onClick: this.actionHandler(true, this.playlist, "sortByRating"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-duration",
                content: this.menuContext.createMenuItem("Duration", "material-icons small-material-icon access_time"),
                onClick: this.actionHandler(true, this.playlist, "sortByDuration"),
                enabledPredicate: moreThan1Selected
            }, {
                divider: true
            }, {
                id: "sort-by-shuffling",
                content: this.menuContext.createMenuItem("Shuffle", "material-icons small-material-icon shuffle"),
                onClick: this.actionHandler(true, this.playlist, "sortByShuffling"),
                enabledPredicate: moreThan1Selected
            }, {
                id: "sort-by-reverse-order",
                content: this.menuContext.createMenuItem("Reverse order", "material-icons small-material-icon undo"),
                onClick: this.actionHandler(true, this.playlist, "sortByReverseOrder"),
                enabledPredicate: moreThan1Selected
            }]
        }, {
            divider: true,
        }, {
            disabled: true,
            id: "track-rating",
            enabledPredicate: exactly1Selected,
            content: function() {
                return this.playlistTrackRater.$();
            }.bind(this),
            onClick: function(e) {
                e.preventDefault();
            }
        }]
    };
};

MainTabs.prototype.getSearchActionSpec = function() {
    return {
        target: this.search.$trackContainer(),
        menu: [{
            id: "play",
            disabled: true,
            content: this.menuContext.createMenuItem("Play", "glyphicon glyphicon-play-circle"),
            onClick: this.actionHandler(false, this.search, "playPrioritySelection"),
            enabledPredicate: moreThan0Selected
        }, {
            divider: true,
        }, {
            id: "clear-selection",
            disabled: true,
            content: this.menuContext.createMenuItem("Select none", "material-icons small-material-icon crop_square"),
            onClick: this.actionHandler(true, this.search, "clearSelection"),
            enabledPredicate: moreThan0Selected
        }, {
            id: "select-all",
            disabled: true,
            content: this.menuContext.createMenuItem("Select all", "material-icons small-material-icon select_all"),
            onClick: this.actionHandler(true, this.search, "selectAll"),
            enabledPredicate: lessThanAllSelected
        }, {
            divider: true,
        }, {
            disabled: true,
            id: "track-rating",
            enabledPredicate: exactly1Selected,
            content: function() {
                return this.searchTrackRater.$();
            }.bind(this),
            onClick: function(e) {
                e.preventDefault();
            }
        }]
    };
};

MainTabs.prototype.layoutChanged = function() {
    var page = this.page;
    var elems = this.tabController.$containers();

    var visible = elems.filter(function(elem) {
        return page.$(elem).style().display !== "none";
    }).get(0);

    var rect = visible.getBoundingClientRect();
    var USED_HEIGHT = rect.top;

    var height = page.height() - USED_HEIGHT;
    height = Math.max(height - this.itemHeight / 2, this.itemHeight + this.itemHeight / 2);
    var remainder = height % this.itemHeight;

    if (remainder !== 0) {
        height -= remainder;
    }

    elems.setStyle("height", height + "px");
    this.tabHolder.setStyle("height", (height + this.tabHeight) + "px");
};

MainTabs.prototype.updatePlaylistContextMenuEnabledStates = function() {
    var selectedCount = this.playlist.getSelectedItemViewCount();
    if (selectedCount === 1) {
        this.playlistTrackRater.enable(this.playlist.getSelectable().first().track());
    } else {
        this.playlistTrackRater.disable();
    }
    this.playlistContextMenu.setEnabledStateFromPredicate(selectedCount, this.playlist.length);
};

MainTabs.prototype.updateSearchContextMenuEnabledStates = function() {
    var selectedCount = this.search.getSelectedItemViewCount();
    if (selectedCount === 1) {
        this.searchTrackRater.enable(this.search.getSelectable().first().track());
    } else {
        this.searchTrackRater.disable();
    }
    this.searchContextMenu.setEnabledStateFromPredicate(selectedCount, this.search.length);
};

MainTabs.prototype.beforePlaylistContextMenuOpen = function(e) {
    this.playlistTrackRater.update();
    if (this.page.$(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
};

MainTabs.prototype.beforeSearchContextMenuOpen = function(e) {
    this.searchTrackRater.update();
    if (this.page.$(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
};
