"use strict";

import ApplicationDependencies from "ApplicationDependencies";
import { console, matchMedia } from "platform/platform";
import AnimationContext from "ui/animation/AnimationContext";
import Snackbar from "ui/Snackbar";
import Rippler from "ui/Rippler";
import Spinner from "ui/Spinner";
import PermissionPrompt from "ui/PermissionPrompt";
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

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;
const IMAGE_DIMENSIONS = 97;
const DEFAULT_IMAGE_SRC = "/dist/images/apple-touch-icon-180x180.png";

export default function Application(deps) {
    var bootstrapStart = Date.now();

    var page = deps.page;
    var env = deps.env;
    var db = deps.db;
    var dbValues = Object(deps.dbValues);
    var defaultTitle = deps.defaultTitle;
    var globalEvents = deps.globalEvents;

    if (!env.hasTouch()) {
        page.$("body").addClass("no-touch");
    }

    this.page = page;
    this.env = env;
    this.db = db;
    this.dbValues = dbValues;
    this.defaultTitle = defaultTitle;
    this.globalEvents = globalEvents;

    this.animationContext = new AnimationContext(new ApplicationDependencies({
        page: this.page
    }));

    this.recognizerContext = new GestureRecognizerContext(new ApplicationDependencies({
        page: this.page,
        env: this.env,
        globalEvents: this.globalEvents
    }));

    this.sliderContext = new SliderContext({
        knobSelector: ".slider-knob",
        fillSelector: ".slider-fill"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }));

    this.scrollEvents = new ScrollEvents(new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext
    }));

    this.gestureScreenFlasher = new GestureScreenFlasher(new ApplicationDependencies({
        page: this.page,
        animationContext: this.animationContext
    }));

    this.permissionPrompt = new PermissionPrompt({
        zIndex: POPUP_ZINDEX + 80,
        target: "body",
        dimmerClass: "body-dimmer"
    }, new ApplicationDependencies({
        page: this.page
    }));

    this.rippler = new Rippler({
        zIndex: POPUP_ZINDEX - 60,
        target: "body"
    }, new ApplicationDependencies({
        page: this.page,
        animationContext: this.animationContext
    }));

    this.keyboardShortcuts = new KeyboardShortcuts(new ApplicationDependencies({
        page: this.page
    }));

    this.menuContext = new MenuContext({
        rootClass: "action-menu-root",
        containerClass: "action-menu-submenu",
        itemClass: "action-menu-item",
        disabledClass: "action-menu-disabled",
        dividerClass: "action-menu-divider",
        activeSubMenuClass: "action-menu-active",
        subMenuShowDelay: 300,
        subMenuHideDelay: 800,
        menuItemIconContainerClass: "icon-container",
        menuItemIconClass: "icon",
        menuItemContentClass: "action-menu-item-content",
        menuItemTextClass: "text-container"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));

    this.fileInputContext = new FileInputContext(new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    }));

    this.scrollerContext = new ScrollerContext({
        itemHeight: ITEM_HEIGHT
    }, new ApplicationDependencies({
        page: this.page,
        scrollEvents: this.scrollEvents
    }));

    this.tooltipContext = new TooltipContext({
        activation: "hover",
        transitionClass: "fade-in",
        preferredDirection: "up",
        preferredAlign: "middle",
        arrow: false,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        container: this.page.$("body"),
        gap: 0
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }));

    this.snackbar = new Snackbar({
        transitionInClass: "transition-in",
        transitionOutClass: "transition-out",
        containerClass: "snackbar-container",
        actionClass: "snackbar-action",
        titleClass: "snackbar-title",
        textContainerClass: "text-container",
        textClass: "text",
        nextDelay: 400,
        visibilityTime: 4400,
        initialUndismissableWindow: 500
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }));

    this.toolbarSubmenu = new OpenableSubmenu({
        target: ".toolbar-submenu",
        openerTarget: ".menul-submenu-open",
        openerActiveClass: "toolbar-item-active",
        activeClass: "shown",
        transitionClass: "transition-in"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        globalEvents: this.globalEvents
    }));

    this.popupContext = new PopupContext({
        zIndex: POPUP_ZINDEX,
        containerClass: "popup-container",
        headerClass: "popup-header",
        footerClass: "popup-footer",
        bodyClass: "popup-body",
        scrollAreaContainerClass: "scrollbar-scrollarea",
        bodyContentClass: "popup-body-content",
        closerContainerClass: "popup-closer-container",
        scrollbarContainerClass: "scrollbar-container",
        scrollbarRailClass: "scrollbar-rail",
        scrollbarKnobClass: "scrollbar-knob",
        popupButtonClass: "popup-button",
        buttonDisabledClass: "popup-button-disabled"
    }, new ApplicationDependencies({
        animationContext: this.animationContext,
        page: this.page,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        keyboardShortcuts: this.keyboardShortcuts
    }));

    this.spinner = new Spinner({
        clockwise: "#clockwise-spinner",
        counterclockwise: "#counterclockwise-spinner"
    }, new ApplicationDependencies({
        page: this.page
    }));

    this.gestureEducator = new GestureEducator(new ApplicationDependencies({
        page: this.page,
        snackbar: this.snackbar,
        db: this.db,
        dbValues: this.dbValues
    }));

    this.serviceWorkerManager = new ServiceWorkerManager(new ApplicationDependencies({
        env: this.env,
        page: this.page,
        snackbar: this.snackbar,
        globalEvents: this.globalEvents
    }));
    this.serviceWorkerManager.start();

    this.applicationPreferences = new ApplicationPreferences({
        preferencesButton: ".menul-preferences"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        env: this.env
    }));

    this.effectPreferences = new EffectPreferences({
        preferencesButton: ".menul-effects"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        env: this.env
    }));

    this.crossfadingPreferences = new CrossfadingPreferences({
        preferencesButton: ".menul-crossfade"
    }, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler,
        popupContext: this.popupContext,
        env: this.env
    }));

    this.playlist = new Playlist({
        target: "#app-playlist-container",
        itemHeight: ITEM_HEIGHT
    }, new ApplicationDependencies({
        env: this.env,
        page: this.page,
        db: this.db,
        dbValues: this.dbValues,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        rippler: this.rippler,
        snackbar: this.snackbar,
        globalEvents: this.globalEvents,
        tooltipContext: this.tooltipContext,
        keyboardShortcuts: this.keyboardShortcuts,
        applicationPreferences: this.applicationPreferences
    }));

    this.trackAnalyzer = new TrackAnalyzer({
        src: env.isDevelopment() ? "dist/worker/TrackAnalyzerBackend.js" : "dist/worker/TrackAnalyzerBackend.min.js"
    }, new ApplicationDependencies({
        page: this.page,
        playlist: this.playlist,
        globalEvents: this.globalEvents,
    }));

    this.search = new Search({
        target: ".search-list-container",
        itemHeight: ITEM_HEIGHT
    }, new ApplicationDependencies({
        env: this.env,
        page: this.page,
        playlist: this.playlist,
        db: this.db,
        dbValues: this.dbValues,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        scrollerContext: this.scrollerContext,
        keyboardShortcuts: this.keyboardShortcuts,
        tooltipContext: this.tooltipContext,
        trackAnalyzer: this.trackAnalyzer
    }));

    this.queue = null;

    this.mainTabs = new MainTabs({
        itemHeight: ITEM_HEIGHT,
        tabHeight: TAB_HEIGHT,
        tabHolder: "#app-content-holder",
        playlistTab: ".playlist-tab",
        searchTab: ".search-tab",
        queueTab: ".queue-tab",
        activeTabIndicator: ".active-tab-indicator"
    }, new ApplicationDependencies({
        page: this.page,
        keyboardShortcuts: this.keyboardShortcuts,
        globalEvents: this.globalEvents,
        menuContext: this.menuContext,
        playlist: this.playlist,
        search: this.search,
        queue: this.queue,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler
    }));

    this.localFileHandler = new LocalFileHandler({
        directoryButton: ".menul-folder, .add-folder-link",
        fileButton: ".menul-files, .add-files-link"
    }, new ApplicationDependencies({
        page: this.page,
        fileInputContext: this.fileInputContext,
        env: this.env,
        playlist: this.playlist
    }));

    if (false && env.isDevelopment()) {
        this.localFileHandler.generateFakeFiles(30);
    }

    this.player = new Player({
        target: ".app-player-controls",
        playButtonDom: ".play-button",
        pauseButtonDom: ".pause-button",
        previousButtonDom: ".previous-button",
        stopButtonDom: ".stop-button",
        nextButtonDom: ".next-button",
        src: env.isDevelopment() ? "dist/worker/AudioPlayerBackend.js" : "dist/worker/AudioPlayerBackend.min.js"
    }, new ApplicationDependencies({
        page: this.page,
        playlist: this.playlist,
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
        localFileHandler: this.localFileHandler
    }));

    this.playerPictureManager = new PlayerPictureManager({
        target: ".picture-container",
        imageDimensions: IMAGE_DIMENSIONS,
        defaultImageSrc: DEFAULT_IMAGE_SRC
    }, new ApplicationDependencies({
        page: this.page,
        player: this.player
    }));

    this.playerTimeManager = new PlayerTimeManager({
        target: ".player-upper-container",
        seekSlider: ".time-progress-container",
        currentTimeDom: ".current-time",
        totalTimeDom: ".total-time",
        timeContainerDom: ".playback-status-wrapper",
        timeProgressDom: ".time-progress"
    }, new ApplicationDependencies({
        page: this.page,
        player: this.player,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        dbValues: this.dbValues,
        db: this.db,
        rippler: this.rippler
    }));

    this.playerVolumeManager = new PlayerVolumeManager({
        target: ".volume-controls-container",
        volumeSlider: ".volume-slider",
        muteDom: ".volume-mute",
    }, new ApplicationDependencies({
        page: this.page,
        player: this.player,
        recognizerContext: this.recognizerContext,
        sliderContext: this.sliderContext,
        rippler: this.rippler,
        tooltipContext: this.tooltipContext
    }));

    this.playlistNotifications = new PlaylistNotifications({
        target: ".notification-setting"
    }, new ApplicationDependencies({
        permissionPrompt: this.permissionPrompt,
        player: this.player,
        playlist: this.playlist,
        page: this.page,
        env: this.env,
        serviceWorkerManager: this.serviceWorkerManager,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        db: this.db,
        dbValues: this.dbValues,
        tooltipContext: this.tooltipContext,
        playerPictureManager: this.playerPictureManager
    }));

    this.visualizerCanvas = new VisualizerCanvas({
        target: "#visualizer",
        binWidth: 3,
        gapWidth: 1,
        capHeight: 1,
        capSeparator: 2,
        capStyle: "rgb(37,117,197)",
        targetFps: 60,
        capDropTime: 750,
        ghostOpacity: 0.14,
        capInterpolator: "ACCELERATE_CUBIC",
        enabledMediaMatcher: matchMedia("(min-height: 500px)")
    }, new ApplicationDependencies({
        player: this.player,
        page: this.page,
        animationContext: this.animationContext,
        globalEvents: this.globalEvents,
        recognizerContext: this.recognizerContext,
        applicationPreferences: this.applicationPreferences,
        snackbar: this.snackbar,
        rippler: this.rippler,
        popupContext: this.popupContext,
        menuContext: this.menuContext,
        sliderContext: this.sliderContext
    }));

    this.trackDisplay = new TrackDisplay({
        target: ".track-display-container",
        displayTarget: ".track-display",
        delay: 3500
    }, new ApplicationDependencies({
        playlist: this.playlist,
        page: this.page,
        defaultTitle: this.defaultTitle,
        globalEvents: this.globalEvents
    }));

    this.defaultShortcuts = new DefaultShortcuts(new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        player: this.player,
        playlist: this.playlist,
        keyboardShortcuts: this.keyboardShortcuts,
        playerTimeManager: this.playerTimeManager,
        rippler: this.rippler,
        gestureScreenFlasher: this.gestureScreenFlasher
    }));

    this.playlistModeManager = new PlaylistModeManager({
        target: ".playlist-controls-container"
    }, new ApplicationDependencies({
        playlist: this.playlist,
        page: this.page,
        recognizerContext: this.recognizerContext,
        rippler: this.rippler,
        tooltipContext: this.tooltipContext
    }));

    this.globalEvents.on("longPressStart", this.longTapStarted.bind(this));
    this.globalEvents.on("longPressEnd", this.longTapEnded.bind(this));
    this.globalEvents.addBeforeUnloadListener(this.beforeUnload.bind(this));
    this.page.addDocumentListener("keydown", this.documentKeydowned.bind(this), true);
    this.page.addDocumentListener("selectstart", this.selectStarted.bind(this));
    this.player.on("stop", this.playerStopped.bind(this));

    var self = this;
    this.page.changeDom(function() {
        self.globalEvents._triggerSizeChange();
        self.visualizerCanvas.initialize();
        console.log("bootstrap time:", Date.now() - bootstrapStart, "ms");
    });
    deps.ensure();
}

Application.prototype.selectStarted = function(e) {
    if (!this.page.isTextInputElement(e.target)) {
        e.preventDefault();
    }
};

Application.prototype.longTapStarted = function(touch) {
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
    this.page.setTitle(this.defaultTitle);
};

Application.prototype.documentKeydowned = function(e) {
    var key = e.key;
    if (key === "Escape") {
        this.globalEvents._fireClear();
    }

    if (e.target === this.page.activeElement() &&
        e.target.tabIndex >= 0 &&
        !this.page.isAnyInputElement(e.target)) {
        if (key === "Spacebar" || key === "Enter") {
            this.page.emulateClickEventFrom(e);
        } else if (key === "Escape") {
            e.target.blur();
        }
    }
};
