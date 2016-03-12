"use strict";

import KeyboardShortcuts from "ui/KeyboardShortcuts";
import Playlist from "Playlist";
import Search from "Search";
import $ from "lib/jquery";
import TabController from "ui/TabController";
import { ContextMenu } from "ui/ActionMenu";
import { contextMenuItem } from "ui/GlobalUi";
import TrackRating from "TrackRating";

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;

const PLAYLIST_TAB_ID = "playlist";
const SEARCH_TAB_ID = "search";
const QUEUE_TAB_ID = "queue";

const noneSelected = function(selectedCount, totalCount) {
    return selectedCount === 0;
};

const allSelected = function(selectedCount, totalCount) {
    return selectedCount === totalCount && totalCount > 0;
};

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

export default function MainTabs(opts) {
    opts = Object(opts);
    this.opts = opts;
    this.keyboardShortcuts = opts.keyboardShortcuts;
    this.playlistTrackRating = new TrackRating();
    this.searchTrackRating = new TrackRating();
    this.playlist = new Playlist(opts.playlistContainer, {
        itemHeight: ITEM_HEIGHT,
        db: opts.db,
        dbValues: opts.dbValues,
        env: opts.env,
        rippler: opts.rippler,
        snackbar: opts.snackbar
    });
    this.search = new Search(opts.searchContainer, {
        playlist: this.playlist,
        itemHeight: ITEM_HEIGHT,
        db: opts.db,
        dbValues: opts.dbValues,
        env: opts.env,
        rippler: opts.rippler,
        snackbar: opts.snackbar
    });
    this.queue = null;
    this.contentInstancesByTabId = Object.create(null);
    this.contentInstancesByTabId[PLAYLIST_TAB_ID] = this.playlist;
    this.contentInstancesByTabId[SEARCH_TAB_ID] = this.search;

    this.tabController = new TabController(opts.tabHolder, [{
        id: PLAYLIST_TAB_ID,
        tab: opts.playlistTab,
        content: opts.playlistContainer
    }, {
        id: SEARCH_TAB_ID,
        tab: opts.searchTab,
        content: opts.searchContainer
    }, {
        id: QUEUE_TAB_ID,
        tab: opts.queueTab,
        content: opts.queueContainer
    }], {
        indicator: opts.activeTabIndicator
    });

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

    this.playlistContextMenu = new ContextMenu(this.playlist.$(), this.playlistActionSpec);
    this.searchContextMenu = new ContextMenu(this.search.$(), this.searchActionSpec);

    this.playlistContextMenu.on("beforeOpen", this.beforePlaylistContextMenuOpen.bind(this));
    this.searchContextMenu.on("beforeOpen", this.beforeSearchContextMenuOpen.bind(this));
    this.playlist.on("tracksSelected", this.updatePlaylistContextMenuEnabledStates.bind(this));
    this.playlist.on("lengthChange", this.updatePlaylistContextMenuEnabledStates.bind(this));
    this.search.on("tracksSelected", updateSearchContextMenuEnabledStates.bind(this));
    this.search.on("lengthChange", updateSearchContextMenuEnabledStates.bind(this));
    $(window).on("sizechange", this.layoutChanged.bind(this));
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
        menu: [{
            id: "play",
            disabled: true,
            content: contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
            onClick: this.actionHandler(false, this.playlist, "playPrioritySelection")
            enabledPredicate: moreThan0Selected
        }, {
            id: "delete",
            disabled: true,
            content: contextMenuItem("Delete", "material-icons small-material-icon delete"),
            onClick: this.actionHandler(false, this.playlist, "removeSelected"),
            enabledPredicate: moreThan0Selected
        }, {
            divider: true,
        }, {
            id: "clear-selection",
            disabled: true,
            content: contextMenuItem("Select none", "material-icons small-material-icon crop_square"),
            onClick: this.actionHandler(true, this.playlist, "clearSelection"),
            enabledPredicate: moreThan0Selected
        }, {
            id: "select-all",
            disabled: true,
            content: contextMenuItem("Select all", "material-icons small-material-icon select_all"),
            onClick: this.actionHandler(true, this.playlist, "selectAll"),
            enabledPredicate: lessThanAllSelected
        }, {
            id: "sort",
            disabled: true,
            content: contextMenuItem("Sort by", "glyphicon glyphicon-sort"),
            enabledPredicate: moreThan1Selected,
            children: [{
                id: "sort-by-album",
                content: contextMenuItem("Album", "material-icons small-material-icon album"),
                onClick: this.actionHandler(true, this.playlist, "sortByAlbum"),
                enabledPredicate: moreThan1Selected
            }, {
                id: "sort-by-artist",
                content: contextMenuItem("Artist", "material-icons small-material-icon mic"),
                onClick: this.actionHandler(true, this.playlist, "sortByArtist"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-album-artist",
                content: contextMenuItem("Album artist", "material-icons small-material-icon perm_camera_mic"),
                onClick: this.actionHandler(true, this.playlist, "sortByAlbumArtist"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-title",
                content: contextMenuItem("Title", "material-icons small-material-icon music_note"),
                onClick: this.actionHandler(true, this.playlist, "sortByTitle"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-rating",
                content: contextMenuItem("Rating", "material-icons small-material-icon grade"),
                onClick: this.actionHandler(true, this.playlist, "sortByRating"),
                enabledPredicate: moreThan1Selected

            }, {
                id: "sort-by-duration",
                content: contextMenuItem("Duration", "material-icons small-material-icon access_time"),
                onClick: this.actionHandler(true, this.playlist, "sortByDuration"),
                enabledPredicate: moreThan1Selected
            }, {
                divider: true
            }, {
                id: "sort-by-shuffling",
                content: contextMenuItem("Shuffle", "material-icons small-material-icon shuffle"),
                onClick: this.actionHandler(true, this.playlist, "sortByShuffling"),
                enabledPredicate: moreThan1Selected
            }, {
                id: "sort-by-reverse-order",
                content: contextMenuItem("Reverse order", "material-icons small-material-icon undo"),
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
                return this.playlistTrackRating.$();
            }.bind(this),
            onClick: function(e) {
                e.preventDefault();
            }
        }]
    };
};

MainTabs.prototype.getSearchActionSpec = function() {
    return {
        menu: [{
            id: "play",
            disabled: true,
            content: contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
            onClick: this.actionHandler(false, this.search, "playPrioritySelection"),
            enabledPredicate: moreThan0Selected
        }, {
            divider: true,
        }, {
            id: "clear-selection",
            disabled: true,
            content: contextMenuItem("Select none", "material-icons small-material-icon crop_square"),
            onClick: this.actionHandler(true, this.search, "clearSelection"),
            enabledPredicate: moreThan0Selected
        }, {
            id: "select-all",
            disabled: true,
            content: contextMenuItem("Select all", "material-icons small-material-icon select_all"),
            onClick: this.actionHandler(true, this.search, "selectAll"),
            enabledPredicate: lessThanAllSelected
        }, {
            divider: true,
        }, {
            disabled: true,
            id: "track-rating",
            enabledPredicate: exactly1Selected,
            content: function() {
                return this.searchTrackRating.$();
            }.bind(this),
            onClick: function(e) {
                e.preventDefault();
            }
        }]
    };
};

MainTabs.prototype.layoutChanged = function() {
    var elems = this.tabController.$containers();

    var visible = elems.filter(function() {
        return $(this).css("display") !== "none";
    }).first();

    var rect = visible[0].getBoundingClientRect();
    var USED_HEIGHT = rect.top;

    var height = $(window).height() - USED_HEIGHT;
    height = Math.max(height - ITEM_HEIGHT / 2, ITEM_HEIGHT + ITEM_HEIGHT / 2);
    var remainder = height % ITEM_HEIGHT;

    if (remainder !== 0) {
        height -= remainder;
    }

    elems.css("height", height);
    $(this.opts.tabHolder).height(height + TAB_HEIGHT);
};

MainTabs.prototype.updatePlaylistContextMenuEnabledStates = function() {
    var selectedCount = this.playlist.getSelectedItemViewCount();
    if (selectedCount === 1) {
        this.playlistTrackRating.enable(this.playlist.getSelectable().first().track());
    } else {
        this.playlistTrackRating.disable();
    }
    this.playlistContextMenu.setEnabledStateFromPredicate(selectedCount, this.playlist.length);
};

MainTabs.prototype.updateSearchContextMenuEnabledStates = function() {
    var selectedCount = this.search.getSelectedItemViewCount();
    if (selectedCount === 1) {
        this.searchTrackRating.enable(this.search.getSelectable().first().track());
    } else {
        this.searchTrackRating.disable();
    }
    this.searchContextMenu.setEnabledStateFromPredicate(selectedCount, this.search.length);
};

MainTabs.prototype.beforePlaylistContextMenuOpen = function(e) {
    this.playlistTrackRating.update();
    if ($(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
};

MainTabs.prototype.beforeSearchContextMenuOpen = function(e) {
    this.searchTrackRating.update();
    if ($(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
};
