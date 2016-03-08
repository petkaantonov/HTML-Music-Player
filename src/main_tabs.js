"use strict";

const Playlist = require("Playlist");
const Search = require("Search");
const $ = require("lib/jquery");
const TabController = require("ui/TabController");
const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;

const PLAYLIST_TAB_ID = "playlist";
const SEARCH_TAB_ID = "search";
const QUEUE_TAB_ID = "queue";

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

exports.tabs = mainTabs;
exports.playlist = playlist;
exports.search = search;
