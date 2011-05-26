var filter = {};

filter.show = function() {
    if (playlist.main.length > 0) {
        popup.open("<div class='popup-content-container'>                                                            \
                        <div class='popup-header'>                                                                   \
                            <h2 class='app-header-2'>Filter</h2>                                                     \
                        </div>                                                                                       \
                        <div class='popup-body'>                                                                     \
                            <div class='app-bread-text'>Find tracks on the playlist that match the given text.</div> \
                            <div id='track-searcher-container'></div>                                                \
                        </div>                                                                                       \
                    </div>",
        415, 495);

        var trackSearcher = new TrackSearcher(playlist.main, "#track-searcher-container");

        popup.closeEvent(function() {
            trackSearcher.destroy();
        });

        trackSearcher.on("destroy", function() {
            popup.closeAll();
        });

        setTimeout(function() {
            trackSearcher.input().val("").focus();
        }, 10);
    }
};

$(".menul-filter").bind("click", filter.show)
hotkeyManager.addDescriptor({
    category: "Playlist management",
    action: "Filter",
    description: "Shortcut for activating filter.",
    handler: filter.show
});
