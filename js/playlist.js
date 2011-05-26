var playlist = playlist || {};
var popup;

popup = new BlockingPopup(500, 300, {
    closerClass: "app-popup-closer glyphicon glyphicon-remove",
    addClass: "app-popup-container thick-shadow"
});

popup.on("beforeOpen", function(id) {
    $("#" + id)
        .hide()
        .fadeIn(400);
});
popup.on("close", function() {
    hotkeyManager.enableHotkeys();
    if (!this.length) {
        $("#app-container")
            .fadeTo(0, 1);
    }
});
popup.on("open", function() {
    hotkeyManager.disableHotkeys();
    if (this.length < 2) {
        $("#app-container")
            .fadeTo(0, 0.3);
    }
});

$(window).on("resize", function() {
    $(window).trigger("relayout");
});

(function() {
    const DEFAULT_ITEM_HEIGHT = 21;

    playlist.trackDisplay = new TrackDisplay("app-track-display");

    playlist.main = new Playlist("#app-playlist-container", {
        itemHeight: DEFAULT_ITEM_HEIGHT
    });

    const actions = {
        selectAll: function(e) {
            if (e && e.preventDefault) e.preventDefault();
            playlist.main.selectAll();
        },
        filter: function() { filter.show(); },
        play: function() { playlist.main.playFirstSelected(); },
        delete: function() { playlist.main.removeSelected(); },
        sortByTitle: function() { playlist.main.sortByTitle(); },
        sortByArtist: function() { playlist.main.sortByArtist(); },
        sortByAlbum: function() { playlist.main.sortByAlbum(); },
        sortByRating: function() { playlist.main.sortByRating(); },
        sortByDuration: function() { playlist.main.sortByDuration(); },
        sortByReverseOrder: function() { playlist.main.sortByReverseOrder(); },
    };

    const trackActionsSpec = {
        menu: [{
            id: "select-all",
            disabled: true,
            content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">select_all</span> Select all</div>',
            onClick: actions.selectAll
        }, {
            id: "filter",
            disabled: true,
            content: '<div class="action-menu-item-content"><span class="icon glyphicon glyphicon-filter"></span> Filter</div>',
            onClick: actions.filter
        }, {
            id: "play",
            disabled: true,
            content: '<div class="action-menu-item-content"><span class="icon glyphicon glyphicon-play-circle"></span> Play</div>',
            onClick: actions.play
        }, {
            id: "delete",
            disabled: true,
            content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">delete</span> Delete</div>',
            onClick: actions.delete
        }, {
            id: "sort",
            disabled: true,
            content: '<div class="action-menu-item-content"><span class="icon glyphicon glyphicon-sort"></span> Sort by</div>',
            children: [{
                id: "sort-by-album",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">album</span> Album</div>',
                onClick: actions.sortByTitle

            }, {
                id: "sort-by-artist",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">mic</span> Artist</div>',
                onClick: actions.sortByArtist

            }, {
                id: "sort-by-title",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">music_note</span> Title</div>',
                onClick: actions.sortByAlbum

            }, {
                id: "sort-by-rating",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">grade</span> Rating</div>',
                onClick: actions.sortByRating

            }, {
                id: "sort-by-duration",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">access_time</span> Duration</div>',
                onClick: actions.sortByDuration
            }, {
                divider: true
            }, {
                id: "sort-by-reverse-order",
                content: '<div class="action-menu-item-content"><span class="icon material-icons small-material-icon">undo</span> Reverse order</div>',
                onClick: actions.sortByReverseOrder
            }]
        }]
    };

    var trackActionMenu = new ActionMenu(trackActionsSpec);
    var trackContextMenu = new ActionMenu.ContextMenu(playlist.main.$(), trackActionsSpec);

    if (features.touch) {
        trackActionMenu.$().appendTo(".tracks-menu-container");
    }

    playlist.main.on("tracksSelected", function(selectable) {
        var selectedItemsCount = selectable.getSelectedItemCount();
        $("#app-selection-count").text(util.shortNumber(selectedItemsCount));

        var actionsToDisable = [];
        var actionsToEnable = [];

        if (selectedItemsCount === 0) {
            actionsToDisable.push("play", "delete", "sort");
        } else if (selectedItemsCount === 1) {
            actionsToEnable.push("play", "delete");
            actionsToDisable.push("sort");
        } else {
            actionsToEnable.push("play", "delete", "sort");
        }

        if (playlist.main.length === playlist.main.getSelectedTrackCount()) {
            actionsToDisable.push("select-all");
        } else {
            actionsToEnable.push("select-all");
        }

        trackActionMenu.enable(actionsToEnable);
        trackActionMenu.disable(actionsToDisable);
        trackContextMenu.enable(actionsToEnable);
        trackContextMenu.disable(actionsToDisable);
    });

    playlist.main.on("lengthChange", function(newLength, oldLength) {
        var haveTracks = newLength > 0;
        var actionsToDisable = [];
        var actionsToEnable = [];

        if (haveTracks) {
            if (newLength === playlist.main.getSelectedTrackCount()) {
                actionsToDisable.push("select-all");
            } else {
                actionsToEnable.push("select-all");
            }
            actionsToEnable.push("filter");
        } else {
            actionsToDisable.push("select-all", "filter");
        }

        trackActionMenu.enable(actionsToEnable);
        trackActionMenu.disable(actionsToDisable);
        trackContextMenu.enable(actionsToEnable);
        trackContextMenu.disable(actionsToDisable);
    });

    var playlistModeManager = new PlaylistModeManager(".playlist-controls-container", playlist.main);

    PanelControls.makeTooltip($(".menul-folder"), "Add a folder");
    PanelControls.makeTooltip($(".menul-files"), "Add files");
    PanelControls.makeTooltip($(".menul-hotkeys"), "Configure hotkeys");
    PanelControls.makeTooltip($(".menul-crossfade"), "Configure crossfading");
    PanelControls.makeTooltip($(".menul-equalizer"), "Configure equalizer");

    playlist.main.on("trackChange", function(track) {
        if (!track) return;
        var index = track.getIndex();
        var trackNumber = index >= 0 ? (index + 1) + "." : "";
        playlist.trackDisplay.newTitle(trackNumber + " " + track.formatFullName()).beginMarquee();
    });

    $(document).ready(function() {
        if (features.directories) {
            $('.menul-folder, .add-folder-link').fileInput("create", {
                onchange: function() {
                    localFiles.handle(this.files);
                    $(".menul-folder").fileInput("clearFiles");
                },
                webkitdirectory: true,
                directory: true,
                mozdirectory: true
            });
        } else {
            $(".menul-folder, .suggestion-folders").remove();
        }

        $('.menul-files, .add-files-link').fileInput("create", {
            onchange: function() {
                localFiles.handle(this.files);
                $(".menul-files").fileInput("clearFiles");
            },
            multiple: true,
            accept: features.allowMimes.join(",")
        });
    });


    $(window).on("load", function() {
        keyValueDatabase.getInitialValues().then(function() {
            $("#app-loader").remove();
            $("#app-container").show();
            playlist.main.windowLayoutChanged();
        });
    });

    window.addEventListener("beforeunload", function(e) {
        e.preventDefault();
        e.returnValue = "Are you sure you want to exit?";
        return e.returnValue;
    }, false);

    hotkeyManager.addDescriptor({
        category: "General actions",
        action: "Open directory picker",
        description: "Open a directory picker to pick a directory to load audio files from.",
        handler: function() {
            $(".menul-folder").click();
        }
    });

    hotkeyManager.addDescriptor({
        category: "General actions",
        action: "Open file picker",
        description: "Open a file picker to pick a directory to load audio files from.",
        handler: function() {
            $(".menul-files").click();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Play selected",
        description: "Starts playing the selected track. If multiple tracks are selected, the first track of the selection is played.",
        handler: actions.play
    });

    // Arrow up and arrow down selection stuff.
    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select next up",
        description: "Select the next track up.",
        handler: function() {
            playlist.main.selectPrev();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select next down",
        description: "Select the next track down.",
        handler: function() {
            playlist.main.selectNext();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add next up",
        description: "Add the next track up to selection.",
        handler: function() {
            playlist.main.selectPrevAppend();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add next down",
        description: "Add next track down to selection.",
        handler: function() {
            playlist.main.selectNextAppend();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove topmost",
        description: "Remove the topmost track from selection",
        handler: function() {
            playlist.main.removeTopmostSelection();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove bottommost",
        description: "Remove the bottommost track from selection",
        handler: function() {
            playlist.main.removeBottommostSelection();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Move up",
        description: "Move selected tracks up.",
        handler: function() {
            playlist.main.moveSelectionUp();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Move down",
        description: "Move selected tracks down.",
        handler: function() {
            playlist.main.moveSelectionDown();
        }
    });

    // Page up and page down selection stuff.
    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select next page up",
        description: "Select the track next page up. Can be used to move around a long playlist quickly.",
        handler: function() {
            playlist.main.selectPagePrev();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select next page down",
        description: "Select the track next page down. Can be used to move around a long playlist quickly.",
        handler: function() {
            playlist.main.selectPageNext();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add next page up",
        description: "Add all tracks next page up to selection.",
        handler: function() {
            playlist.main.selectPagePrevAppend();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add next page down",
        description: "Add all tracks next page down to selection.",
        handler: function() {
            playlist.main.selectPageNextAppend();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove topmost page",
        description: "Remove the topmost pageful of tracks from selection",
        handler: function() {
            playlist.main.removeTopmostPageSelection();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove bottommost page",
        description: "Remove the bottommost pageful of tracks from selection",
        handler: function() {
            playlist.main.removeBottommostPageSelection();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Move page up",
        description: "Move selected tracks up by a page.",
        handler: function() {
            playlist.main.moveSelectionPageUp();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Move page down",
        description: "Move selected tracks down by a page.",
        handler: function() {
            playlist.main.moveSelectionPageDown();
        }
    });

    // Home and End selection stuff.

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select first",
        description: "Select first track in the playlist.",
        handler: function() {
            playlist.main.selectFirst();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select last",
        description: "Select last track in the playlist.",
        handler: function() {
            playlist.main.selectLast();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add all up",
        description: "Add all tracks up to selection",
        handler: function() {
            playlist.main.selectAllUp();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Add all down",
        description: "Add all tracks down to selection",
        handler: function() {
            playlist.main.selectAllDown();
        }
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove",
        description: "Delete the currently selected tracks from the playlist.",
        handler: actions.delete
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Sort by album",
        description: "Sorts the selected tracks by their album's name in alphabetical order.",
        handler: actions.sortByAlbum
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Sort by artist",
        description: "Sorts the selected tracks by their artist's name in alphabetical order.",
        handler: actions.sortByArtist
    });


    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Sort by title",
        description: "Sorts the selected tracks by their titles's name in alphabetical order.",
        handler: actions.sortByTitle
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Select all",
        description: "Selects all tracks in the playlist.",
        handler: actions.selectAll
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Center on current track",
        description: "Center the playlist to the currently plaing track. If no track is playing, the currently selected track is played.",
        handler: function() {
            if (!playlist.main.getCurrentTrack()) {
                actions.play();
            }
            if (playlist.main.getCurrentTrack()) {
                playlist.main.centerOnTrack(playlist.main.getCurrentTrack());
                playlist.main.selectTrack(playlist.main.getCurrentTrack());
            }

        }
    });

    [1, 2, 3, 4, 5].forEach(function(ratingValue) {
        var starWord = ratingValue + " " + (ratingValue === 1 ? "star" : "stars");
        hotkeyManager.addDescriptor({
            category: "Playlist management",
            action: "Rate " + starWord,
            description: "Give a rating of " + starWord + " to the currently selected track. To select the currently playing track, press space.",
            handler: function() {
                var track = playlist.main.getSelection().first();
                if (track) track.rate(ratingValue);
            }
        });
    });

    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Remove rating",
        description: "Remove the currently selected track's rating.",
        handler: function() {
            var track = playlist.main.getSelection().first();
            if (track) track.rate(-1);
        }
    });
})();
