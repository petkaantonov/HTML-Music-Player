"use strict";

const $ = require("lib/jquery");
const TabController = require("ui/TabController");
const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;

var mainTabs = new TabController([{
    id: "playlist",
    tab: ".playlist-tab",
    content: "#app-playlist-container"
}, {
    id: "search",
    tab: ".search-tab",
    content: ".search-list-container"
}, {
    id: "queue",
    tab: ".queue-tab",
    content: ".queue-list-container"
}], {
    indicator: ".active-tab-indicator"
});

mainTabs.activateTabById("playlist");

$(window).on("resize", function() {
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

module.exports = mainTabs;
