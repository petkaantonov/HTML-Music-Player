"use strict";

import Snackbar from "ui/Snackbar";
import Rippler from "ui/Rippler";
import Spinner from "ui/Spinner";
import TrackDisplay from "ui/TrackDisplay";
import MainTabs from "ui/MainTabs";
import PlaylistModeManager from "ui/PlaylistModeManager";
import PlayerTimeManager from "ui/PlayerTimeManager";
import PlayerVolumeManager from "ui/PlayerVolumeManager";
import PlayerPictureManager from "ui/PlayerPictureManager";
import PlaylistNotifications from "ui/PlaylistNotifications";
import LocalFileHandler from "ui/LocalFileHandler";
import VisualizerCanvas from "ui/VisualizerCanvas";
import KeyboardShortcuts from "ui/KeyboardShortcuts";
import OpenableSubmenu from "ui/OpenableSubmenu";
import GestureScreenFlasher from "ui/GestureScreenFlasher";
import DefaultShortcuts from "ui/DefaultShortcuts";
import AndroidKeyboardFixer from "ui/AndroidKeyboardFixer";
import PopupMaker from "ui/PopupMaker";
import TooltipMaker from "ui/TooltipMaker";
import TrackAnalyzer from "audio/TrackAnalyzer";
import GestureEducator from "GestureEducator";
import GestureRecognizerMaker from "ui/gestures/GestureRecognizerMaker";
import ScrollEvents from "ui/ScrollEvents";
import SliderMaker from "ui/SliderMaker";
import MenuMaker from "ui/MenuMaker";
import ScrollerMaker from "ui/ScrollerMaker";
import FileInputContext from "ui/FileInputContext";
import Player from "Player";
import Playlist from "Playlist";
import Search from "Search";
import ApplicationPreferences from "ApplicationPreferences";
import EffectPreferences from "EffectPreferences";
import CrossfadingPreferences from "CrossfadingPreferences";
import ServiceWorkerManager from "ServiceWorkerManager";
import { onCapture, offCapture } from "lib/util";
import { isTextInputElement } from "lib/DomUtil";

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;

export default function Application(env, db, dbValues, defaultTitle) {
    dbValues = Object(dbValues);

    if (!env.hasTouch()) {
        $("body").addClass("no-touch");
    }

    this.env = env;
    this.db = db;
    this.dbValues = dbValues;
    this.defaultTitle = defaultTitle;

    this.recognizerMaker = new GestureRecognizerMaker(this.env);
    this.sliderMaker = new SliderMaker(this.recognizerMaker);
    this.scrollEvents = new ScrollEvents(this.env, this.recognizerMaker);
    this.androidKeyboardFixer = new AndroidKeyboardFixer();
    this.gestureScreenFlasher = new GestureScreenFlasher();
    this.rippler = new Rippler("body");
    this.keyboardShortcuts = new KeyboardShortcuts();
    this.menuMaker = new MenuMaker(this.recognizerMaker, this.rippler);
    this.fileInputContext = new FileInputContext(this.recognizerMaker, this.rippler);

    this.scrollEvents = new ScrollEvents(this.recognizerMaker);
    this.scrollerMaker = new ScrollerMaker(this.recognizerMaker, this.scrollEvents, ITEM_HEIGHT);

    this.tooltipMaker = new TooltipMaker(this.env);

    this.snackbar = new Snackbar({
        transitionInClass: "transition-in",
        transitionOutClass: "transition-out",
        nextDelay: 400,
        visibilityTime: 4400,
        recognizerMaker: this.recognizerMaker
    });

    this.toolbarSubmenu = new OpenableSubmenu(".toolbar-submenu", ".menul-submenu-open", {
        openerActiveClass: "toolbar-item-active",
        recognizerMaker: this.recognizerMaker
    });

    this.popupMaker = new PopupMaker({
        recognizerMaker: this.recognizerMaker,
        scrollerMaker: this.scrollerMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        keyboardShortcuts: this.keyboardShortcuts
    });

    this.spinner = new Spinner({
        clockwise: "#clockwise-spinner",
        counterclockwise: "#counterclockwise-spinner",
        recognizerMaker: this.recognizerMaker
    });

    this.gestureEducator = new GestureEducator(this.snackbar, this.db, this.dbValues);

    this.serviceWorkerManager = new ServiceWorkerManager({
        snackbar: this.snackbar,
        recognizerMaker: this.recognizerMaker
    });
    this.serviceWorkerManager.start();

    this.applicationPreferences = new ApplicationPreferences({
        snackbar: this.snackbar,
        recognizerMaker: this.recognizerMaker,
        sliderMaker: this.sliderMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupMaker: this.popupMaker,
        preferencesButton: ".menul-preferences",
        env: this.env
    });

    this.effectPreferences = new EffectPreferences({
        snackbar: this.snackbar,
        recognizerMaker: this.recognizerMaker,
        sliderMaker: this.sliderMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupMaker: this.popupMaker,
        preferencesButton: ".menul-effects"
    });

    this.crossfadingPreferences = new CrossfadingPreferences({
        snackbar: this.snackbar,
        recognizerMaker: this.recognizerMaker,
        sliderMaker: this.sliderMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupMaker: this.popupMaker,
        preferencesButton: ".menul-crossfade"
    });

    this.playlist = new Playlist("#app-playlist-container", {
        itemHeight: ITEM_HEIGHT,
        db: this.db,
        dbValues: this.dbValues,
        recognizerMaker: this.recognizerMaker,
        scrollerMaker: this.scrollerMaker,
        rippler: this.rippler,
        snackbar: this.snackbar,
        keyboardShortcuts: this.keyboardShortcuts,
        crossfadingPreferences: this.crossfadingPreferences,
        effectPreferences: this.effectPreferences,
        applicationPreferences: this.applicationPreferences,
        tooltipMaker: this.tooltipMaker
    });

    this.trackAnalyzer = new TrackAnalyzer(this.playlist, {
        src: window.DEBUGGING
            ? "dist/worker/TrackAnalyzerWorker.js" : "dist/worker/TrackAnalyzerWorker.min.js"
    });

    this.search = new Search(".search-list-container", {
        playlist: this.playlist,
        itemHeight: ITEM_HEIGHT,
        db: this.db,
        dbValues: this.dbValues,
        recognizerMaker: this.recognizerMaker,
        scrollerMaker: this.scrollerMaker,
        keyboardShortcuts: this.keyboardShortcuts,
        rippler: this.rippler,
        snackbar: this.snackbar,
        crossfadingPreferences: this.crossfadingPreferences,
        effectPreferences: this.effectPreferences,
        applicationPreferences: this.applicationPreferences,
        trackAnalyzer: this.trackAnalyzer
    });

    this.queue = null;

    this.mainTabs = new MainTabs({
        keyboardShortcuts: this.keyboardShortcuts,
        playlist: this.playlist,
        search: this.search,
        queue: this.queue,
        itemHeight: ITEM_HEIGHT,
        tabHeight: TAB_HEIGHT,
        tabHolder: "#app-content-holder",
        playlistTab: ".playlist-tab",
        searchTab: ".search-tab",
        queueTab: ".queue-tab",
        activeTabIndicator: ".active-tab-indicator",
        recognizerMaker: this.recognizerMaker,
        rippler: this.rippler
    });

    this.localFileHandler = new LocalFileHandler({
        fileInputContext: this.fileInputContext,
        env: this.env,
        playlist: this.playlist,
        directoryButton: ".menul-folder, .add-folder-link",
        fileButton: ".menul-files, .add-files-link"
    });

    if (false && window.DEBUGGING) {
        this.localFileHandler.generateFakeFiles(8);
    }

    this.player = new Player(".app-player-controls", this.playlist, {
        playButtonDom: ".play-button",
        pauseButtonDom: ".pause-button",
        previousButtonDom: ".previous-button",
        stopButtonDom: ".stop-button",
        nextButtonDom: ".next-button",
        snackbar: this.snackbar,
        env: this.env,
        recognizerMaker: this.recognizerMaker,
        dbValues: this.dbValues,
        db: this.db,
        snackbar: this.snackbar,
        gestureEducator: this.gestureEducator,
        rippler: this.rippler,
        crossfadingPreferences: this.crossfadingPreferences,
        effectPreferences: this.effectPreferences,
        applicationPreferences: this.applicationPreferences,
        tooltipMaker: this.tooltipMaker,
        src: window.DEBUGGING
            ? "dist/worker/AudioPlayerWorker.js" : "dist/worker/AudioPlayerWorker.min.js"
    });

    this.playerPictureManager = new PlayerPictureManager(".picture-container", this.player, {
        recognizerMaker: this.recognizerMaker,
        db: this.db,
        dbValues: this.dbValues
    });

    this.playerTimeManager = new PlayerTimeManager(".player-upper-container", this.player, {
        seekSlider: ".time-progress-container",
        currentTimeDom: ".current-time",
        totalTimeDom: ".total-time",
        timeContainerDom: ".playback-status-wrapper",
        timeProgressDom: ".time-progress",
        recognizerMaker: this.recognizerMaker,
        sliderMaker: this.sliderMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler
    });

    this.playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", this.player, {
        volumeSlider: ".volume-slider",
        muteDom: ".volume-mute",
        recognizerMaker: this.recognizerMaker,
        sliderMaker: this.sliderMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        tooltipMaker: this.tooltipMaker
    });

    this.playlistNotifications = new PlaylistNotifications(".notification-setting", this.player, {
        recognizerMaker: this.recognizerMaker,
        rippler: this.rippler,
        db: this.db,
        dbValues: this.dbValues,
        tooltipMaker: this.tooltipMaker
    });

    this.visualizerCanvas = new VisualizerCanvas("#visualizer", this.player, {
        recognizerMaker: this.recognizerMaker,
        dbValues: this.dbValues,
        db: this.db,
        snackbar: this.snackbar,
        rippler: this.rippler,
        popupMaker: this.popupMaker,
        menuMaker: this.menuMaker,
        sliderMaker: this.sliderMaker,
        binWidth: 3,
        gapWidth: 1,
        capHeight: 1,
        capSeparator: 2,
        capStyle: "rgb(37,117,197)",
        targetFps: 60,
        capDropTime: 750,
        ghostOpacity: 0.14,
        capInterpolator: "ACCELERATE_CUBIC",
        enabledMediaMatcher: matchMedia("(min-height: 500px)"),
        binSizeChangeMatcher: matchMedia("(min-width: 320px) or (min-width: 568px) or (min-width: 760px)")
    });

    this.trackDisplay = new TrackDisplay(".track-display-container", this.playlist, {
        delay: 3500,
        target: ".track-display",
        defaultTitle: this.defaultTitle
    });

    this.defaultShortcuts = new DefaultShortcuts({
        recognizerMaker: this.recognizerMaker,
        player: this.player,
        playlist: this.playlist,
        keyboardShortcuts: this.keyboardShortcuts,
        playerTimeManager: this.playerTimeManager,
        rippler: this.rippler,
        gestureScreenFlasher: this.gestureScreenFlasher
    });

    this.playlistModeManager = new PlaylistModeManager(".playlist-controls-container", this.playlist, {
        recognizerMaker: this.recognizerMaker,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        tooltipMaker: this.tooltipMaker
    });

    $(document).on("longPressStart", this.longTapStarted.bind(this));
    $(document).on("longPressEnd", this.longTapEnded.bind(this));
    $(document).on("selectstart", this.selectStarted.bind(this));
    window.onbeforeunload = this.beforeUnload.bind(this);
    this.player.on("stop", this.playerStopped.bind(this));
    onCapture(document, "keydown", documentKeydowned);

    var self = this;
    requestAnimationFrame(function() {
        self.androidKeyboardFixer.triggerSizeChange();
        self.visualizerCanvas.initialize();
    });
}

Application.prototype.selectStarted = function(e) {
    if (!isTextInputElement(e.target)) {
        e.preventDefault();
    }
};

Application.prototype.longTapStarted = function(e, touch) {
    this.spinner.spinAt(touch.clientX|0, touch.clientY|0);
};

Application.prototype.longTapEnded = function() {
    this.spinner.stop();
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

const rinput = /^(input|select|textarea|button)$/i;
Application.prototype.documentKeydowned = function(e) {
    var key = e.key;
    if (key === "Escape") {
        $(window).trigger("clear");
    }

    if (e.target === document.activeElement &&
        e.target.tabIndex >= 0 &&
        !rinput.test(e.target.nodeName)) {

        if (key === "Spacebar" || key === "Enter") {
            var box = e.target.getBoundingClientRect();
            var x = (((box.left + box.right) / 2) | 0) - window.scrollX;
            var y = (((box.top + box.bottom) / 2) | 0) - window.scrollY;
            var ev = new MouseEvent("click", {
                view: window,
                bubbles: true,
                cancelable: true,
                ctrlKey: e.ctrlKey,
                shiftKey: e.shiftKey,
                altKey: e.altKey,
                metaKey: e.metaKey,
                button: -1,
                buttons: 0,
                screenX: x,
                clientX: x,
                screenY: y,
                clientY: y
            });
            e.target.dispatchEvent(ev);
        } else if (key === "Escape") {
            e.target.blur();
        }
    }
};
