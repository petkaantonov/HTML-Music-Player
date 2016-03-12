"use strict";

const KeyboardShortcuts = require("ui/KeyboardShortcuts");
const Playlist = require("Playlist");
const Search = require("Search");
import $ from "lib/jquery";
const TabController = require("ui/TabController");
import { ContextMenu } from "ui/ActionMenu";
import { contextMenuItem } from "ui/GlobalUi";
const TrackRating = require("TrackRating");
const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;

const PLAYLIST_TAB_ID = "playlist";
const SEARCH_TAB_ID = "search";
const QUEUE_TAB_ID = "queue";

const playlistTrackRating = new TrackRating();
const searchTrackRating = new TrackRating();

const playlist = new Playlist("#app-playlist-container", {
    itemHeight: ITEM_HEIGHT
});

const search = new Search(".search-list-container", {
    itemHeight: ITEM_HEIGHT,
    playlist: playlist
});

var mainTabs = new TabController("#app-content-holder", [{
    id: PLAYLIST_TAB_ID,
    tab: ".playlist-tab",
    content: "#app-playlist-container"
}, {
    id: SEARCH_TAB_ID,
    tab: ".search-tab",
    content: ".search-list-container"
}, {
    id: QUEUE_TAB_ID,
    tab: ".queue-tab",
    content: ".queue-list-container"
}], {
    indicator: ".active-tab-indicator"
});

$(window).on("sizechange", function() {
    var elems = $("#app-playlist-container,.queue-list-container,.search-list-container");
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
    $("#app-content-holder").height(height + TAB_HEIGHT);
});

const contentInstancesByTabId = {};
contentInstancesByTabId[PLAYLIST_TAB_ID] = playlist;
contentInstancesByTabId[SEARCH_TAB_ID] = search;

const tabEventHandler = function(methodName) {
    return function(tabId) {
        var contentInstance = contentInstancesByTabId[tabId];
        if (contentInstance) {
            contentInstance[methodName]();
        }
    };
};

mainTabs.on("tabWillDeactivate", tabEventHandler("tabWillHide"));
mainTabs.on("tabWillActivate", tabEventHandler("tabWillShow"));
mainTabs.on("tabDidDeactivate", tabEventHandler("tabDidHide"));
mainTabs.on("tabDidActivate", tabEventHandler("tabDidShow"));

mainTabs.activateTabById(PLAYLIST_TAB_ID);

KeyboardShortcuts.defaultContext.addShortcut(["mod+f", "alt+s"], function() {
    mainTabs.activateTabById(SEARCH_TAB_ID);
});

KeyboardShortcuts.defaultContext.addShortcut("alt+a", function() {
    mainTabs.activateTabById(PLAYLIST_TAB_ID);
});

KeyboardShortcuts.defaultContext.addShortcut("alt+d", function() {
    mainTabs.activateTabById(QUEUE_TAB_ID);
});

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

const playlistActions = {
    selectNone: function(e) {
        e.preventDefault();
        playlist.clearSelection();
    },
    selectAll: function(e) {
        e.preventDefault();
        playlist.selectAll();
    },
    play: function() {
        playlist.playPrioritySelection();
    },
    delete: function() {
        playlist.removeSelected();
    },
    sortByTitle: function(e) {
        e.preventDefault();
        playlist.sortByTitle();
    },
    sortByArtist: function(e) {
        e.preventDefault();
        playlist.sortByArtist();
    },
    sortByAlbumArtist: function(e) {
        e.preventDefault();
        playlist.sortByAlbumArtist();
    },
    sortByAlbum: function(e) {
        e.preventDefault();
        playlist.sortByAlbum();
    },
    sortByRating: function(e) {
        e.preventDefault();
        playlist.sortByRating();
    },
    sortByDuration: function(e) {
        e.preventDefault();
        playlist.sortByDuration();
    },
    sortByReverseOrder: function(e) {
        e.preventDefault();
        playlist.sortByReverseOrder();
    },
    sortByShuffling: function(e) {
        e.preventDefault();
        playlist.sortByShuffling();
    }
};

const playlistActionSpec = {
    menu: [{
        id: "play",
        disabled: true,
        content: contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
        onClick: playlistActions.play,
        enabledPredicate: moreThan0Selected
    }, {
        id: "delete",
        disabled: true,
        content: contextMenuItem("Delete", "material-icons small-material-icon delete"),
        onClick: playlistActions.delete,
        enabledPredicate: moreThan0Selected
    }, {
        divider: true,
    }, {
        id: "clear-selection",
        disabled: true,
        content: contextMenuItem("Select none", "material-icons small-material-icon crop_square"),
        onClick: playlistActions.selectNone,
        enabledPredicate: moreThan0Selected
    }, {
        id: "select-all",
        disabled: true,
        content: contextMenuItem("Select all", "material-icons small-material-icon select_all"),
        onClick: playlistActions.selectAll,
        enabledPredicate: lessThanAllSelected
    }, {
        id: "sort",
        disabled: true,
        content: contextMenuItem("Sort by", "glyphicon glyphicon-sort"),
        enabledPredicate: moreThan1Selected,
        children: [{
            id: "sort-by-album",
            content: contextMenuItem("Album", "material-icons small-material-icon album"),
            onClick: playlistActions.sortByAlbum,
            enabledPredicate: moreThan1Selected
        }, {
            id: "sort-by-artist",
            content: contextMenuItem("Artist", "material-icons small-material-icon mic"),
            onClick: playlistActions.sortByArtist,
            enabledPredicate: moreThan1Selected

        }, {
            id: "sort-by-album-artist",
            content: contextMenuItem("Album artist", "material-icons small-material-icon perm_camera_mic"),
            onClick: playlistActions.sortByAlbumArtist,
            enabledPredicate: moreThan1Selected

        }, {
            id: "sort-by-title",
            content: contextMenuItem("Title", "material-icons small-material-icon music_note"),
            onClick: playlistActions.sortByAlbum,
            enabledPredicate: moreThan1Selected

        }, {
            id: "sort-by-rating",
            content: contextMenuItem("Rating", "material-icons small-material-icon grade"),
            onClick: playlistActions.sortByRating,
            enabledPredicate: moreThan1Selected

        }, {
            id: "sort-by-duration",
            content: contextMenuItem("Duration", "material-icons small-material-icon access_time"),
            onClick: playlistActions.sortByDuration,
            enabledPredicate: moreThan1Selected
        }, {
            divider: true
        }, {
            id: "sort-by-shuffling",
            content: contextMenuItem("Shuffle", "material-icons small-material-icon shuffle"),
            onClick: playlistActions.sortByShuffling,
            enabledPredicate: moreThan1Selected
        }, {
            id: "sort-by-reverse-order",
            content: contextMenuItem("Reverse order", "material-icons small-material-icon undo"),
            onClick: playlistActions.sortByReverseOrder,
            enabledPredicate: moreThan1Selected
        }]
    }, {
        divider: true,
    }, {
        disabled: true,
        id: "track-rating",
        enabledPredicate: exactly1Selected,
        content: function() {
            return playlistTrackRating.$();
        },
        onClick: function(e) {
            e.preventDefault();
        }
    }]
};

const searchActions = {
    selectNone: function(e) {
        e.preventDefault();
        search.clearSelection();
    },
    selectAll: function(e) {
        e.preventDefault();
        search.selectAll();
    },
    play: function() {
        search.playPrioritySelection();
    }
};

const searchActionSpec = {
    menu: [{
        id: "play",
        disabled: true,
        content: contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
        onClick: searchActions.play,
        enabledPredicate: moreThan0Selected
    }, {
        divider: true,
    }, {
        id: "clear-selection",
        disabled: true,
        content: contextMenuItem("Select none", "material-icons small-material-icon crop_square"),
        onClick: searchActions.selectNone,
        enabledPredicate: moreThan0Selected
    }, {
        id: "select-all",
        disabled: true,
        content: contextMenuItem("Select all", "material-icons small-material-icon select_all"),
        onClick: searchActions.selectAll,
        enabledPredicate: lessThanAllSelected
    }, {
        divider: true,
    }, {
        disabled: true,
        id: "track-rating",
        enabledPredicate: exactly1Selected,
        content: function() {
            return searchTrackRating.$();
        },
        onClick: function(e) {
            e.preventDefault();
        }
    }]
};

const playlistContextMenu = new ContextMenu(playlist.$(), playlistActionSpec);

const updatePlaylistContextMenuEnabledStates = function() {
    var selectedCount = playlist.getSelectedItemViewCount();
    if (selectedCount === 1) {
        playlistTrackRating.enable(playlist.getSelectable().first().track());
    } else {
        playlistTrackRating.disable();
    }
    playlistContextMenu.setEnabledStateFromPredicate(selectedCount, playlist.length);
};


playlistContextMenu.on("beforeOpen", function(e) {
    playlistTrackRating.update();
    if ($(e.originalEvent.target).closest(".unclickable").length > 0) {
        e.preventDefault();
    }
});

playlist.on("tracksSelected", updatePlaylistContextMenuEnabledStates);
playlist.on("lengthChange", updatePlaylistContextMenuEnabledStates);

const searchContextMenu = new ContextMenu(search.$(), searchActionSpec);

const updateSearchContextMenuEnabledStates = function() {
    var selectedCount = search.getSelectedItemViewCount();
    if (selectedCount === 1) {
        searchTrackRating.enable(search.getSelectable().first().track());
    } else {
        searchTrackRating.disable();
    }
    searchContextMenu.setEnabledStateFromPredicate(selectedCount, search.length);
};

search.on("tracksSelected", updateSearchContextMenuEnabledStates);
search.on("lengthChange", updateSearchContextMenuEnabledStates);

exports.tabs = mainTabs;
exports.playlist = playlist;
exports.search = search;
