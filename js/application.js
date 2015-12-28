"use strict";

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
const GlobalUi = require("./GlobalUi");
const keyValueDatabase = require("./KeyValueDatabase");
const PlayerTimeManager = require("./PlayerTimeManager");
const Slider = require("./Slider");
const PlayerVolumeManager = require("./PlayerVolumeManager");
const PlayerPictureManager = require("./PlayerPictureManager");
const PlaylistNotifications = require("./PlaylistNotifications");

const WorkerPool = require("./WorkerPool");
const FingerprintCalculator = require("./FingerprintCalculator");
const LoudnessCalculator = require("./LoudnessCalculator");
const TrackAnalyzer = require("./TrackAnalyzer");
const LocalFiles = require("./LocalFiles");
const ID3Process = require("./ID3Process");

serviceWorkerManager.start();

window.playlist = {};
window.player = {};

const DEFAULT_ITEM_HEIGHT = 44;

playlist.trackDisplay = new TrackDisplay("track-display");

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

    trackActionMenu.enable(actionsToEnable);
    trackActionMenu.disable(actionsToDisable);
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


$(window).on("load", function() {
    keyValueDatabase.getInitialValues().then(function() {
        $("#app-loader").remove();
        $("#app-container").show();
        playlist.main.windowLayoutChanged();
    });
});

$(window).on("beforeunload", function(e) {
    e.preventDefault();
    e.originalEvent.returnValue = "Are you sure you want to exit?";
    return e.returnValue;
}, false);

player.main = new Player(".app-player-controls", playlist.main, {
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

var playerPictureManager = new PlayerPictureManager(".picture-container", player.main);

var playlistNotifications = new PlaylistNotifications(".notification-setting", player.main);

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
    playlist.trackDisplay.newTitle("");
    document.title = __PROJECT__TITLE;
});

const canvas = document.getElementById("visualizer");
const context = canvas.getContext("2d");

const TARGET_FPS = 48;
const MIN_ELAPSED = (1000 / TARGET_FPS) - 1;

const CAP_DROP_TIME_DEFAULT = 550;
const ALPHA_TIME_DEFAULT = 385;
const CAP_HOLDOUT_TIME = 55;
const CAP_DROP_TIME_IDLE = CAP_DROP_TIME_DEFAULT;


const WIDTH = parseInt(canvas.width, 10);
const HEIGHT = parseInt(canvas.height, 10);

const BIN_WIDTH = 4;
const GAP_WIDTH = 1;
const BIN_SPACE = BIN_WIDTH + GAP_WIDTH;

const CAP_HEIGHT = 1;
const CAP_SEPARATOR = 2;
const CAP_SPACE = CAP_HEIGHT + CAP_SEPARATOR;

const HIGHEST_Y = HEIGHT - CAP_SPACE;
const gradients = new Array(HEIGHT + 1);

// Someone please tell me there is a better way....
for (var i = 0; i < gradients.length; ++i) {
    var gradient = context.createLinearGradient(0, HEIGHT - i, 0, HEIGHT);
    gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
    gradient.addColorStop(0.2, "rgb(219, 241, 251)");
    gradient.addColorStop(0.8, "rgb(184, 228, 246)");
    gradient.addColorStop(1, 'rgb(166, 202, 238)');
    gradients[i] = gradient;
}

context.shadowBlur = 2;
context.shadowColor = "rgb(11,32,53)";

const NUM_BINS = Math.floor(WIDTH / BIN_SPACE);
Player.visualizerBins(NUM_BINS);
Player.targetFps(TARGET_FPS);
const CAP_STYLE = "rgb(37,117,197)";

const capInfoArray = new Array(NUM_BINS);

for (var i = 0; i < capInfoArray.length; ++i) {
    capInfoArray[i] = {
        started: -1,
        binValue: -1
    };
}

function easeInQuad(x, t, b, c, d) {
    return c*(t/=d)*t + b;
}

var capDropTime = CAP_DROP_TIME_DEFAULT;

function getCapPosition(position, now) {
    if (position.binValue === -1) {
        return 0;
    }
    if (position.started === -1 || ((now - position.started) > capDropTime)) {
        position.binValue = -1;
        return 0;
    }
    var elapsed = now - position.started;
    var duration = capDropTime;
    if (elapsed < CAP_HOLDOUT_TIME) return position.binValue;
    return (1 - easeInQuad(0, elapsed, 0, 1, duration)) * position.binValue;
}

function resetCaps() {
    for (var i = 0; i < capInfoArray; ++i) {
        capInfoArray[i].started = -1;
        capInfoArray[i].binValue = -1;
    }
}

function drawCap(x, capSample, capInfo, now) {
    var alpha = 1 - (capInfo.started >= 0 ?
        Math.min(1, (now - capInfo.started) / ALPHA_TIME_DEFAULT) : 0);
    var capY = capSample * HIGHEST_Y + CAP_SPACE;
    context.fillRect(x, HEIGHT - capY, BIN_WIDTH, CAP_HEIGHT);
    var originalY = capY - CAP_SPACE - 1;
    context.fillStyle = "rgb(184, 228, 246)";
    context.save();
    context.globalAlpha = alpha * 0.9;
    context.shadowBlur = 0;
    context.fillRect(x, HEIGHT - originalY, BIN_WIDTH, originalY);
    context.restore();
}

function drawBins(event) {
    var bins = event.bins;
    var now = event.now;
    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var capInfo = capInfoArray[i];
        var y = binValue * HIGHEST_Y;
        var x = i * BIN_SPACE;

        var capSample = -1;
        if (capInfo.binValue === -1) {
            capInfo.binValue = binValue;
        } else {
            capSample = getCapPosition(capInfo, now);
        }

        context.fillStyle = CAP_STYLE;
        if (binValue < capSample) {
            drawCap(x, capSample, capInfo, now);
        } else {
            context.fillRect(x, HEIGHT - y - CAP_SPACE, BIN_WIDTH, CAP_HEIGHT);
            capInfo.binValue = binValue;
            capInfo.started = now;
        }
        context.fillStyle = gradients[y|0];
        context.fillRect(x, HEIGHT - y, BIN_WIDTH, y);
    }
}

var needToDrawIdleBins = true;
function drawIdleBins(event) {
    var drewSomething = false;
    for (var i = 0; i < NUM_BINS; ++i) {
        var capInfo = capInfoArray[i];
        if (capInfo.binValue !== -1) {
            drewSomething = true;
        }
        context.fillStyle = CAP_STYLE;
        drawCap(i * BIN_SPACE, getCapPosition(capInfo, event.now), capInfo);
    }

    if (!drewSomething) {
        needToDrawIdleBins = false;
    }
}

var nothingToDraw = 0;
var lastDrew = 0;
player.main.on("visualizerData", function(event) {
    if (event.now - lastDrew < MIN_ELAPSED) return;
    lastDrew = event.now;

    var fresh = false;

    if (event.paused) {
        capDropTime = CAP_DROP_TIME_IDLE;
        nothingToDraw++;

        if (needToDrawIdleBins) {
            context.clearRect(0, 0, WIDTH, HEIGHT);
            drawIdleBins(event);
        }
        return;
    } else {
        needToDrawIdleBins = true;
        if (nothingToDraw > 0) {
            fresh = true;
        }
        nothingToDraw = 0;
    }
    capDropTime = CAP_DROP_TIME_DEFAULT;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (fresh) resetCaps();
    drawBins(event);
});

player.main.on("stop", function() {
    var frame;
    player.main.once("play", function() {
        if (frame) cancelAnimationFrame(frame);
    });
    frame = requestAnimationFrame(function loop(now) {
        if (needToDrawIdleBins) {
            frame = requestAnimationFrame(loop);
            context.clearRect(0, 0, WIDTH, HEIGHT);
            drawIdleBins({now: now});
        } else {
            frame = null;
        }
    });
});

resetCaps();
drawIdleBins({now: Date.now()});

const loudnessCalculator = new LoudnessCalculator(new WorkerPool(1, "worker/worker_api.js"));
const fingerprintCalculator = new FingerprintCalculator(new WorkerPool(1, "worker/worker_api.js"));
const trackAnalyzer = new TrackAnalyzer(loudnessCalculator, fingerprintCalculator, playlist.main);
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


hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek forward",
    description: "Seeks forward by 1%.",
    handler: function() {
        var p = player.main.getProgress();
        if (p !== -1) {
            player.main.setProgress(p + 0.01);
        }
    }
});

hotkeyManager.addDescriptor({
    category: "Music player",
    action: "Seek back",
    description: "Seeks back by 1%.",
    handler: function() {
        var p = player.main.getProgress();
        if (p !== -1) {
            player.main.setProgress(p - 0.01);
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
