"use strict";

import $ from "jquery";
import Snackbar from "ui/Snackbar";
import Rippler from "ui/Rippler";
import Spinner from "ui/Spinner";
import TrackDisplay from "player/TrackDisplay";
import MainTabs from "player/MainTabs";
import PlaylistModeManager from "player/PlaylistModeManager";
import PlayerTimeManager from "player/PlayerTimeManager";
import PlayerVolumeManager from "player/PlayerVolumeManager";
import PlayerPictureManager from "player/PlayerPictureManager";
import PlaylistNotifications from "player/PlaylistNotifications";
import LocalFileHandler from "platform/LocalFileHandler";
import VisualizerCanvas from "visualization/VisualizerCanvas";
import KeyboardShortcuts from "keyboard/KeyboardShortcuts";
import OpenableSubmenu from "ui/OpenableSubmenu";
import GestureScreenFlasher from "ui/GestureScreenFlasher";
import DefaultShortcuts from "keyboard/DefaultShortcuts";
import PopupContext from "ui/PopupContext";
import TooltipContext from "ui/TooltipContext";
import TrackAnalyzer from "tracks/TrackAnalyzer";
import GestureEducator from "player/GestureEducator";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import ScrollEvents from "ui/scrolling/ScrollEvents";
import SliderContext from "ui/SliderContext";
import MenuContext from "ui/MenuContext";
import ScrollerContext from "ui/scrolling/ScrollerContext";
import FileInputContext from "platform/FileInputContext";
import Player from "player/Player";
import Playlist from "player/Playlist";
import Search from "search/Search";
import ApplicationPreferences from "preferences/ApplicationPreferences";
import EffectPreferences from "preferences/EffectPreferences";
import CrossfadingPreferences from "preferences/CrossfadingPreferences";
import ServiceWorkerManager from "platform/ServiceWorkerManager";
import { onCapture } from "util";
import { isTextInputElement } from "platform/DomUtil";

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;

export default function Application(opts) {
    var bootstrapStart = Date.now();
    opts = Object(opts);
    var env = opts.env;
    var db = opts.db;
    var dbValues = Object(opts.dbValues);
    var defaultTitle = opts.defaultTitle;
    var globalEvents = opts.globalEvents;

    if (!env.hasTouch()) {
        $("body").addClass("no-touch");
    }

    this.env = env;
    this.db = db;
    this.dbValues = dbValues;
    this.defaultTitle = defaultTitle;
    this.globalEvents = globalEvents;

    this.recognizerContext = new GestureRecognizerContext(this.env, this.globalEvents);
    this.sliderContext = new SliderContext(this.recognizerContext, this.globalEvents);
    this.scrollEvents = new ScrollEvents(this.env, this.recognizerContext);
    this.gestureScreenFlasher = new GestureScreenFlasher();
    this.rippler = new Rippler("body");
    this.keyboardShortcuts = new KeyboardShortcuts();
    this.menuContext = new MenuContext(this.recognizerContext, this.rippler, this.globalEvents);
    this.fileInputContext = new FileInputContext(this.recognizerContext, this.rippler);
    this.scrollEvents = new ScrollEvents(this.recognizerContext);
    this.scrollerContext = new ScrollerContext(this.recognizerContext, this.scrollEvents, ITEM_HEIGHT);
    this.tooltipContext = new TooltipContext(this.recognizerContext, this.globalEvents);

    this.snackbar = new Snackbar({
        transitionInClass: "transition-in",
        transitionOutClass: "transition-out",
        nextDelay: 400,
        visibilityTime: 4400,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    });

    this.toolbarSubmenu = new OpenableSubmenu(".toolbar-submenu", ".menul-submenu-open", {
        openerActiveClass: "toolbar-item-active",
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    });

    this.popupContext = new PopupContext({
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        keyboardShortcuts: this.keyboardShortcuts,
        zIndex: POPUP_ZINDEX
    });

    this.spinner = new Spinner({
        clockwise: "#clockwise-spinner",
        counterclockwise: "#counterclockwise-spinner",
        recognizerContext: this.recognizerContext
    });

    this.gestureEducator = new GestureEducator(this.snackbar, this.db, this.dbValues);

    this.serviceWorkerManager = new ServiceWorkerManager({
        snackbar: this.snackbar,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    });
    this.serviceWorkerManager.start();

    this.applicationPreferences = new ApplicationPreferences({
        snackbar: this.snackbar,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        preferencesButton: ".menul-preferences",
        env: this.env
    });

    this.effectPreferences = new EffectPreferences({
        snackbar: this.snackbar,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        preferencesButton: ".menul-effects"
    });

    this.crossfadingPreferences = new CrossfadingPreferences({
        snackbar: this.snackbar,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        preferencesButton: ".menul-crossfade"
    });

    this.playlist = new Playlist("#app-playlist-container", {
        itemHeight: ITEM_HEIGHT,
        db: this.db,
        dbValues: this.dbValues,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        rippler: this.rippler,
        snackbar: this.snackbar,
        globalEvents: this.globalEvents,
        keyboardShortcuts: this.keyboardShortcuts,
        crossfadingPreferences: this.crossfadingPreferences,
        effectPreferences: this.effectPreferences,
        applicationPreferences: this.applicationPreferences,
        tooltipContext: this.tooltipContext
    });

    this.trackAnalyzer = new TrackAnalyzer(this.playlist, {
        globalEvents: this.globalEvents,
        src: env.isDevelopment() ? "dist/worker/TrackAnalyzerBackend.js" : "dist/worker/TrackAnalyzerBackend.min.js"
    });

    this.search = new Search(".search-list-container", {
        playlist: this.playlist,
        itemHeight: ITEM_HEIGHT,
        db: this.db,
        dbValues: this.dbValues,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
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
        globalEvents: this.globalEvents,
        menuContext: this.menuContext,
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
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    });

    this.localFileHandler = new LocalFileHandler({
        fileInputContext: this.fileInputContext,
        env: this.env,
        playlist: this.playlist,
        directoryButton: ".menul-folder, .add-folder-link",
        fileButton: ".menul-files, .add-files-link"
    });

    if (false && env.isDevelopment()) {
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
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        dbValues: this.dbValues,
        db: this.db,
        gestureEducator: this.gestureEducator,
        rippler: this.rippler,
        crossfadingPreferences: this.crossfadingPreferences,
        effectPreferences: this.effectPreferences,
        applicationPreferences: this.applicationPreferences,
        tooltipContext: this.tooltipContext,
        src: env.isDevelopment() ? "dist/worker/AudioPlayerBackend.js" : "dist/worker/AudioPlayerBackend.min.js"
    });

    this.playerPictureManager = new PlayerPictureManager(".picture-container", this.player, {
        recognizerContext: this.recognizerContext,
        db: this.db,
        dbValues: this.dbValues
    });

    this.playerTimeManager = new PlayerTimeManager(".player-upper-container", this.player, {
        seekSlider: ".time-progress-container",
        currentTimeDom: ".current-time",
        totalTimeDom: ".total-time",
        timeContainerDom: ".playback-status-wrapper",
        timeProgressDom: ".time-progress",
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler
    });

    this.playerVolumeManager = new PlayerVolumeManager(".volume-controls-container", this.player, {
        volumeSlider: ".volume-slider",
        muteDom: ".volume-mute",
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        tooltipContext: this.tooltipContext
    });

    this.playlistNotifications = new PlaylistNotifications(".notification-setting", this.player, {
        serviceWorkerManager: this.serviceWorkerManager,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        db: this.db,
        dbValues: this.dbValues,
        tooltipContext: this.tooltipContext
    });

    this.visualizerCanvas = new VisualizerCanvas("#visualizer", this.player, {
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        dbValues: this.dbValues,
        db: this.db,
        snackbar: this.snackbar,
        rippler: this.rippler,
        popupContext: this.popupContext,
        menuContext: this.menuContext,
        sliderContext: this.sliderContext,
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
        defaultTitle: this.defaultTitle,
        globalEvents: this.globalEvents
    });

    this.defaultShortcuts = new DefaultShortcuts({
        recognizerContext: this.recognizerContext,
        player: this.player,
        playlist: this.playlist,
        keyboardShortcuts: this.keyboardShortcuts,
        playerTimeManager: this.playerTimeManager,
        rippler: this.rippler,
        gestureScreenFlasher: this.gestureScreenFlasher
    });

    this.playlistModeManager = new PlaylistModeManager(".playlist-controls-container", this.playlist, {
        recognizerContext: this.recognizerContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        tooltipContext: this.tooltipContext
    });

    this.globalEvents.on("longPressStart", this.longTapStarted.bind(this));
    this.globalEvents.on("longPressEnd", this.longTapEnded.bind(this));
    $(document).on("selectstart", this.selectStarted.bind(this));
    window.onbeforeunload = this.beforeUnload.bind(this);
    this.player.on("stop", this.playerStopped.bind(this));
    onCapture(document, "keydown", this.documentKeydowned.bind(this));

    var self = this;
    requestAnimationFrame(function() {
        self.globalEvents._triggerSizeChange();
        self.visualizerCanvas.initialize();
        console.log("bootstrap time:", Date.now() - bootstrapStart, "ms");
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
    if (!this.env.isDevelopment() && (this.playlist.length > 0 ||
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
        this.globalEvents._fireClear();
    }

    if (e.target === document.activeElement &&
        e.target.tabIndex >= 0 &&
        !rinput.test(e.target.nodeName)) {

        if (key === "Spacebar" || key === "Enter") {
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
