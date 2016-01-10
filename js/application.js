"use strict";
var desc = {value: function() {return ""}, writable: false, configurable: false};
try {
    Object.defineProperties(window, {
        alert: desc,
        prompt: desc,
        confirm: desc
    });
} catch (e) {}
window.$ = window.jQuery = require("../lib/jquery");
window.Promise = require("../lib/bluebird");
require("./BluebirdConfig");
require("../lib/perfect-scrollbar.jquery.min");
require("./jquery.fileinput");

const $ = window.$;

window.__PROJECT__TITLE = "HTML Music Player";

const util = require("./util");
const serviceWorkerManager = require("./ServiceWorkerManager");
const hotkeyManager = require("./HotkeyManager");
const filter = require("./filter");
const TrackDisplay = require("./TrackDisplay");
const Player = require("./Player");
const Playlist = require("./Playlist");
const ActionMenu = require("./ActionMenu");
const features = require("./features");
const PlaylistModeManager = require("./PlaylistModeManager");
const keyValueDatabase = require("./KeyValueDatabase");
const PlayerTimeManager = require("./PlayerTimeManager");
const Slider = require("./Slider");
const PlayerVolumeManager = require("./PlayerVolumeManager");
const PlayerPictureManager = require("./PlayerPictureManager");
const PlaylistNotifications = require("./PlaylistNotifications");
const VisualizerCanvas = require("./VisualizerCanvas");
const TrackAnalyzer = require("./TrackAnalyzer");
const LocalFiles = require("./LocalFiles");
const ID3Process = require("./ID3Process");
const GlobalUi = require("./GlobalUi");

const visualizerEnabledMediaMatcher = matchMedia("(min-height: 568px)");

serviceWorkerManager.start();

window.playlist = {};
window.player = {};

const DEFAULT_ITEM_HEIGHT = 44;

playlist.trackDisplay = new TrackDisplay("track-display", {
    delay: 5
});

playlist.main = new Playlist("#app-playlist-container", {
    itemHeight: DEFAULT_ITEM_HEIGHT
});

$(window).on("clear", function() {
    playlist.main.clearSelection();
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
        content: GlobalUi.contextMenuItem("Select all", "material-icons small-material-icon", "select_all"),
        onClick: actions.selectAll
    }, {
        id: "filter",
        disabled: true,
        content: GlobalUi.contextMenuItem("Filter", "glyphicon glyphicon-filter"),
        onClick: actions.filter
    }, {
        id: "play",
        disabled: true,
        content: GlobalUi.contextMenuItem("Play", "glyphicon glyphicon-play-circle"),
        onClick: actions.play
    }, {
        id: "delete",
        disabled: true,
        content: GlobalUi.contextMenuItem("Delete", "material-icons small-material-icon", "delete"),
        onClick: actions.delete
    }, {
        id: "sort",
        disabled: true,
        content: GlobalUi.contextMenuItem("Sort by", "glyphicon glyphicon-sort"),
        children: [{
            id: "sort-by-album",
            content: GlobalUi.contextMenuItem("Album", "material-icons small-material-icon", "album"),
            onClick: actions.sortByTitle

        }, {
            id: "sort-by-artist",
            content: GlobalUi.contextMenuItem("Artist", "material-icons small-material-icon", "mic"),
            onClick: actions.sortByArtist

        }, {
            id: "sort-by-title",
            content: GlobalUi.contextMenuItem("Title", "material-icons small-material-icon", "music_note"),
            onClick: actions.sortByAlbum

        }, {
            id: "sort-by-rating",
            content: GlobalUi.contextMenuItem("Rating", "material-icons small-material-icon", "grade"),
            onClick: actions.sortByRating

        }, {
            id: "sort-by-duration",
            content: GlobalUi.contextMenuItem("Duration", "material-icons small-material-icon", "access_time"),
            onClick: actions.sortByDuration
        }, {
            divider: true
        }, {
            id: "sort-by-reverse-order",
            content: GlobalUi.contextMenuItem("Reverse order", "material-icons small-material-icon", "undo"),
            onClick: actions.sortByReverseOrder
        }]
    }]
};

var trackContextMenu = new ActionMenu.ContextMenu(playlist.main.$(), trackActionsSpec);

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

    trackContextMenu.enable(actionsToEnable);
    trackContextMenu.disable(actionsToDisable);
});

playlist.main.on("lengthChange", function(newLength) {
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

    trackContextMenu.enable(actionsToEnable);
    trackContextMenu.disable(actionsToDisable);
});

var playlistModeManager = new PlaylistModeManager(".playlist-controls-container", playlist.main);

GlobalUi.makeTooltip($(".menul-folder"), "Add a folder");
GlobalUi.makeTooltip($(".menul-files"), "Add files");
GlobalUi.makeTooltip($(".menul-hotkeys"), "Configure shortcuts");
GlobalUi.makeTooltip($(".menul-crossfade"), "Configure crossfading");
GlobalUi.makeTooltip($(".menul-equalizer"), "Configure equalizer");

playlist.main.on("trackChange", function(track) {
    if (!track) return;
    playlist.trackDisplay.setTrack(track);
});

function startApp() {
    $("#app-loader").remove();
    $("#app-container").show();
    playlist.main.windowLayoutChanged();
}

var windowLoaded = new Promise(function(resolve) {
    $(window).on("load", resolve);
});

var requiredFeaturesChecked = Promise.map(Object.keys(features.requiredFeatures), function(description) {
    var checker = features.requiredFeatures[description][0];
    var canIUseUrl = features.requiredFeatures[description][1];
    var apiName = features.requiredFeatures[description][2];
    return checker().catch(function(e) {return false}).then(function(result) {
        return {
            supported: result,
            canIUseUrl: canIUseUrl,
            apiName: apiName,
            description: description
        };
    });
}).then(function(featureResults) {
    var featureMissing = featureResults.some(function(v) {return !v.supported;});

    if (featureMissing) {
        $("#app-load-text").remove();
        $("#app-loader .missing-features").removeClass("no-display");
    }

    featureResults.forEach(function(v) {
        if (!v.supported) {
            var link = $("<a>", {
                target: "_blank",
                class: "link-text",
                href: v.canIUseUrl
            }).text(v.apiName);

            var children = [
                $("<span>").text(v.description),
                $("<sup>").append(link)
            ];

            $("<li>", {class: "missing-feature-list-item"})
                .append(children)
                .appendTo($("#app-loader .missing-features .missing-feature-list"));
        }
    });

    if (featureMissing) {
        throw new Error("missing features");
    }
});

var databaseInitialValuesLoaded = requiredFeaturesChecked.then(function() {
    return keyValueDatabase.getInitialValues();
});

window.onbeforeunload = function(e) {
    if (playlist.main.length > 0 ||
        ((player.main.isPlaying  || player.main.isPaused) && !player.main.isStopped)) {
        return "Are you sure you want to exit?";
    }
};

player.main = new Player(".app-player-controls", playlist.main, {
    visualizerCanvas: visualizerCanvas,
    playButtonDom: ".play-button",
    pauseButtonDom: ".pause-button",
    previousButtonDom: ".previous-button",
    stopButtonDom: ".stop-button",
    nextButtonDom: ".next-button",
});

var playerTimeManager = new PlayerTimeManager(".player-upper-container", player.main, {
    seekSlider: new Slider(".time-progress-container"),
    currentTimeDom: ".current-time",
    totalTimeDom: ".total-time",
    timeContainerDom: ".playback-status-wrapper",
    timeProgressDom: ".time-progress"
});

var playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", player.main, {
    volumeSlider: new Slider(".volume-slider-container"),
    muteDom: ".volume-mute"
});

var playerPictureManager = new PlayerPictureManager(".picture-container", player.main, {
    enabledMediaMatcher: visualizerEnabledMediaMatcher
});

var playlistNotifications = new PlaylistNotifications(".notification-setting", player.main);

var visualizerCanvas = new VisualizerCanvas("#visualizer", player.main, {
    binWidth: 3,
    gapWidth: 1,
    capHeight: 1,
    capSeparator: 2,
    capStyle: "rgb(37,117,197)",
    targetFps: 48,
    capDropTime: 750,
    ghostOpacity: 0.14,
    capInterpolator: "ACCELERATE_CUBIC",
    enabledMediaMatcher: visualizerEnabledMediaMatcher,
    binSizeChangeMatcher: matchMedia("(min-width: 320px) or (min-width: 568px) or (min-width: 760px)")
});

player.visualizerCanvas = visualizerCanvas;

/* To be used both with hotkeys and click binds */
player.methodPause = function() {
    player.main.pause();
};
player.methodPlay = function() {
    player.main.play();
};

player.methodStop = function() {
    player.main.stop();
};

player.methodNext = function() {
    playlist.main.next();
};

player.methodPrev = function() {
    playlist.main.prev();
};

player.main.on("stop", function() {
    document.title = __PROJECT__TITLE;
});

const trackAnalyzer = new TrackAnalyzer(playlist.main);
const localFiles = new LocalFiles(playlist.main, features.allowMimes, features.allowExtensions);
new ID3Process(playlist.main, player.main, trackAnalyzer);



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

$(document)
    .on('dragenter', function() {
        return false;
    })
    .on("dragleave", function() {
        return false;
    })
    .on("dragover", function() {
        return false;
    })
    .on("drop", function(ev) {
        localFiles.handle(ev.originalEvent.dataTransfer.files);
        ev.preventDefault();
        ev.stopPropagation();
        return false;
    })
    .on("selectstart", function(e) {
        if (!util.isTextInputNode(e.target)) {
            e.preventDefault();
        }
    });

Promise.join(windowLoaded, requiredFeaturesChecked, databaseInitialValuesLoaded,
             trackAnalyzer.ready, player.main.ready, startApp).catch(function(e){});


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
    action: "Toggle pause",
    description: "Toggle pause.",
    handler: function() {
        player.main.togglePlayback();

    }
});

[1, 2, 3, 4, 5].forEach(function(ratingValue) {
    var starWord = ratingValue + " " + (ratingValue === 1 ? "star" : "stars");
    hotkeyManager.addDescriptor({
        category: "Playlist management",
        action: "Rate " + starWord,
        description: "Give a rating of " + starWord + " to the currently selected track.",
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

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Volume up",
    description: "Increases volume by 1%.",
    handler: function() {
        player.main.setVolume(player.main.getVolume() + 0.01);
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Volume down",
    description: "Decreases volume by 1%.",
    handler: function() {
        player.main.setVolume(player.main.getVolume() - 0.01);
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Toggle mute",
    description: "Toggles mute.",
    handler: function() {
        player.main.toggleMute();
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Previous track",
    description: "Jumps to the previous track or, if no previous track is available, to the first track in the current playlist.",
    handler: player.methodPrev
});


hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Next track",
    description: "Jumps to the next track.",
    handler: player.methodNext
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Play",
    description: "Start playback.",
    handler: player.methodPlay
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Pause",
    description: "Pauses playback.",
    handler: player.methodPause
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Stop",
    description: "Stops playback.",
    handler: player.methodStop
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Normal mode",
    description: "Activate normal mode. In normal mode tracks are played consecutively in the order they appear on the playlist as a track finishes.",
    handler: function() {
        playlist.main.tryChangeMode("normal");
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Shuffle mode",
    description: "Activate shuffle mode. In shuffle mode the next track is randomly chosen from the playlist, preferring those tracks that haven't been played recently.",
    handler: function() {
        playlist.main.tryChangeMode("shuffle");
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Repeat mode",
    description: "Activate repeat mode. In repeat mode the next track picked is always the same track that just finished.",
    handler: function() {
        playlist.main.tryChangeMode("repeat");
    }
});


var seekHotkey;
var seekValueToCommit = -1;
var commitSeek = function(e) {
    if (e.which !== seekHotkey) return;
    util.offCapture(document, "keyup", commitSeek);
    player.main.setProgress(seekValueToCommit);
    seekValueToCommit = -1;
};

player.main.on("newTrackLoad", function() {
    util.offCapture(document, "keyup", commitSeek);
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek forward",
    description: "Seeks forward by 1%.",
    handler: function(e) {
        util.offCapture(document, "keyup", commitSeek);

        var p;
        if (seekValueToCommit !== -1) {
            p = seekValueToCommit;
        } else {
            p = player.main.getProgress();    
        }
        
        if (p !== -1) {
            seekValueToCommit = Math.max(Math.min(1, p + 0.01), 0);
            seekHotkey = e.which;
            util.onCapture(document, "keyup", commitSeek);
            player.main.seekIntent(seekValueToCommit);
        }
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek back",
    description: "Seeks back by 1%.",
    handler: function(e) {
        util.offCapture(document, "keyup", commitSeek);

        var p;
        if (seekValueToCommit !== -1) {
            p = seekValueToCommit;
        } else {
            p = player.main.getProgress();    
        }

        if (p !== -1) {
            seekValueToCommit = Math.max(Math.min(1, p - 0.01), 0);
            seekHotkey = e.which;
            util.onCapture(document, "keyup", commitSeek);
            player.main.seekIntent(seekValueToCommit);
        }
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Toggle time display mode",
    description: "Toggle the time display mode between elapsed time and remaining time.",
    handler: function() {
        playerTimeManager.toggleDisplayMode();
    }
});

hotkeyManager.enableHotkeys();
hotkeyManager.enablePersistentHotkeys();
