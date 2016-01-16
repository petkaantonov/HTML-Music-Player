"use strict";
const $ = require("../lib/jquery");
const hotkeyManager = require("./HotkeyManager");
const GlobalUi = require("./GlobalUi");
const TrackSearcher = require("./TrackSearcher");

var filter = module.exports;
var filterPopup = GlobalUi.makePopup("Filter",
            "<div class='filter-container'>                                                             \
                <div class='app-bread-text'>Find tracks on the playlist that match the given text.</div> \
                <div id='track-searcher-container'></div></div>",
                ".menul-filter");

filter.show = function() {
    if (playlist.main.length > 0) {
        filterPopup.open();

        var trackSearcher = new TrackSearcher(playlist.main, filterPopup.$().find(".filter-container"));

        filterPopup.once("close", function() {
            trackSearcher.destroy();
        });

        trackSearcher.once("destroy", function() {
            filterPopup.close();
        });

        setTimeout(function() {
            trackSearcher.input().val("").focus();
        }, 10);
    }
};

$(".menul-filter").on("click", filter.show);
hotkeyManager.addDescriptor({
    category: "Playlist management",
    action: "Filter",
    description: "Shortcut for activating filter.",
    handler: filter.show
});
