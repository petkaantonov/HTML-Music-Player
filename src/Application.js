"use strict";

import Snackbar from "ui/Snackbar";
import Rippler from "ui/Rippler";
import Spinner from "ui/Spinner";
import TrackDisplay from "ui/TrackDisplay";
import MainTabs from "ui/MainTabs";
import PlaylistModeManager from "ui/PlaylistModeManager";
import PlayerTimeManager from "ui/PlayerTimeManager";
import PlayerTimeManager from "ui/PlayerTimeManager";
import PlayerVolumeManager from "ui/PlayerVolumeManager";
import PlayerPictureManager from "ui/PlayerPictureManager";
import PlaylistNotifications from "ui/PlaylistNotifications";
import LocalFileHandler from "ui/LocalFileHandler";
import GestureEducator from "GestureEducator";
import Player from "Player";
import ServiceWorkerManager from "ServiceWorkerManager";
import KeyboardShortcuts from "ui/KeyboardShortcuts";
import initializeFileinput from "lib/jquery.fileinput";
import initializeReflow from "lib/jquery.reflow";
import initializeUaparser from "lib/ua-parser";

export default function Application(env, db, dbValues, defaultTitle) {
    initializeFileinput();
    initializeUaparser();
    initializeReflow();

    if (!env.hasTouch()) {
        $("body").addClass("no-touch");
    }

    this.env = env;
    this.db = db;
    this.dbValues = dbValues;
    this.defaultTitle = defaultTitle;

    this.keyboardShortcuts = new KeyboardShortcuts();

    this.snackbar = new Snackbar({
        transitionInClass: "transition-in",
        transitionOutClass: "transition-out",
        nextDelay: 400,
        visibilityTime: 4400
    });

    this.rippler = new Rippler();

    this.spinner = new Spinner({
        clockwise: "#clockwise-spinner",
        counterclockwise: "#counterclockwise-spinner"
    });

    this.gestureEducator = new GestureEducator(this.snackbar, this.db, this.dbValues);

    this.serviceWorkerManager = new ServiceWorkerManager({
        snackbar: this.snackbar,
        env: this.env
    });
    this.serviceWorkerManager.start();

    this.mainTabs = new MainTabs({
        keyboardShortcuts: this.keyboardShortcuts,
        playlistContainer: "#app-playlist-container",
        searchContainer: ".search-list-container",
        queueContainer: ".queue-list-container",
        tabHolder: "#app-content-holder",
        playlistTab: ".playlist-tab",
        searchTab: ".search-tab",
        queueTab: ".queue-tab",
        activeTabIndicator: ".active-tab-indicator",
        snackbar: this.snackbar,
        env: this.env,
        dbValues: this.dbValues,
        db: this.db
    });

    this.playlist = this.mainTabs.playlist;
    this.search = this.mainTabs.search;
    this.queue = this.mainTabs.queue;

    this.localFileHandler = new LocalFileHandler({
        env: this.env,
        playlist: this.playlist,
        directoryButton: ".menul-folder, .add-folder-link",
        fileButton: ".menul-files, .add-files-link"
    });

    this.player = new Player(".app-player-controls", this.playlist, {
        playButtonDom: ".play-button",
        pauseButtonDom: ".pause-button",
        previousButtonDom: ".previous-button",
        stopButtonDom: ".stop-button",
        nextButtonDom: ".next-button"
        snackbar: this.snackbar,
        env: this.env,
        dbValues: this.dbValues,
        db: this.db
    });

    this.playerTimeManager = new PlayerTimeManager(".player-upper-container", this.player, {
        seekSlider: ".time-progress-container",
        currentTimeDom: ".current-time",
        totalTimeDom: ".total-time",
        timeContainerDom: ".playback-status-wrapper",
        timeProgressDom: ".time-progress"
    });

    this.playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", this.player, {
        volumeSlider: ".volume-slider",
        muteDom: ".volume-mute"
    });

    this.playlistNotifications = new PlaylistNotifications(".notification-setting", this.player);

    const visualizerEnabledMediaMatcher = matchMedia("(min-height: 500px)");

    this.visualizerCanvas = new VisualizerCanvas("#visualizer", this.player, {
        db: this.db,
        snackbar: this.snackbar,
        binWidth: 3,
        gapWidth: 1,
        capHeight: 1,
        capSeparator: 2,
        capStyle: "rgb(37,117,197)",
        targetFps: 60,
        capDropTime: 750,
        ghostOpacity: 0.14,
        capInterpolator: "ACCELERATE_CUBIC",
        enabledMediaMatcher: visualizerEnabledMediaMatcher,
        binSizeChangeMatcher: matchMedia("(min-width: 320px) or (min-width: 568px) or (min-width: 760px)")
    });

    this.trackDisplay = new TrackDisplay(".track-display-container", this.playlist, {
        delay: 3500,
        target: ".track-display",
        defaultTitle: this.defaultTitle
    });

    this.playlistModeManager = new PlaylistModeManager(".playlist-controls-container", this.playlist);

    $(document).on("longPressStart", this.longTapStarted.bind(this));
    $(document).on("longPressEnd", this.longTapEnded.bind(this));
    window.onbeforeunload = this.beforeUnload.bind(this);
    this.player.on("stop", this.playerStopped.bind(this));
}

Application.prototype.longTapStarted = function(e, touch) {
    this.spinner.spinAt(touch.clientX|0, touch.clientY|0);
};

Application.prototype.longTapEnded = function() {
    this.spinner.stop();
};

Application.prototype.windowCleared = function() {
    this.playli
};

Application.prototype.beforeUnload = function() {
    if (!window.DEBUGGING && (this.playlist.length > 0 ||
        ((this.player.isPlaying  || this.player.isPaused) && !this.player.isStopped))) {
        return "Are you sure you want to exit?";
    }
};

Application.prototype.playerStopped = function() {
    document.title = this.defaultTitle;
};
