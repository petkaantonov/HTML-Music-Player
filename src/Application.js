import withDeps from "ApplicationDependencies";
import {console, matchMedia, performance} from "platform/platform";
import Snackbar from "ui/Snackbar";
import Rippler from "ui/Rippler";
import Spinner from "ui/Spinner";
import PermissionPrompt from "ui/PermissionPrompt";
import TrackDisplay from "player/TrackDisplay";
import {default as MainTabs, PLAYLIST_TAB_ID} from "player/MainTabs";
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
import WorkerWrapper from "WorkerWrapper";
import UsageData from "usageData/UsageData";
import TagDataContext from "tracks/TagData";
import {ACCELERATE_CUBIC_INTERPOLATOR} from "ui/animation/easing";
import {isTextInputElement, isAnyInputElement} from "platform/dom/Page";

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;
const IMAGE_DIMENSIONS = 97;
const DEFAULT_IMAGE_SRC = `/dist/images/apple-touch-icon-180x180.png`;


export default function Application(deps, loadingIndicatorShowerTimeoutId) {
    const bootstrapStart = performance.now();

    const {page,
            env,
            db,
            defaultTitle,
            globalEvents,
            dbValues} = deps;

    if (!env.hasTouch()) {
        page.$(`body`).addClass(`no-touch`);
    }

    this.page = page;
    this.env = env;
    this.db = db;
    this.dbValues = dbValues;
    this.defaultTitle = defaultTitle;
    this.globalEvents = globalEvents;



    /* eslint-disable no-unused-vars */
    const workerWrapper = this.workerWrapper = new WorkerWrapper(env.isDevelopment() ? `dist/worker/WorkerBackend.js` : `dist/worker/WorkerBackend.min.js`);

    const recognizerContext = this.recognizerContext = withDeps({
        page,
        env,
        globalEvents
    }, d => new GestureRecognizerContext(d));

    const sliderContext = this.sliderContext = withDeps({
        page,
        recognizerContext,
        globalEvents
    }, d => new SliderContext({
        knobSelector: `.slider-knob`,
        fillSelector: `.slider-fill`
    }, d));

    const scrollEvents = this.scrollEvents = withDeps({
        page,
        recognizerContext
    }, d => new ScrollEvents(d));

    const gestureScreenFlasher = this.gestureScreenFlasher = withDeps({
        page
    }, d => new GestureScreenFlasher(d));

    const permissionPrompt = this.permissionPrompt = withDeps({
        page
    }, d => new PermissionPrompt({
        zIndex: POPUP_ZINDEX + 80,
        target: `body`,
        dimmerClass: `body-dimmer`
    }, d));

    const rippler = this.rippler = withDeps({
        page
    }, d => new Rippler({
        zIndex: POPUP_ZINDEX - 60,
        target: `body`
    }, d));

    const keyboardShortcuts = this.keyboardShortcuts = withDeps({
        page
    }, d => new KeyboardShortcuts(d));

    const menuContext = this.menuContext = withDeps({
        page,
        recognizerContext,
        rippler,
        globalEvents
    }, d => new MenuContext({
        rootClass: `action-menu-root`,
        containerClass: `action-menu-submenu`,
        itemClass: `action-menu-item`,
        disabledClass: `action-menu-disabled`,
        dividerClass: `action-menu-divider`,
        activeSubMenuClass: `action-menu-active`,
        subMenuShowDelay: 300,
        subMenuHideDelay: 800,
        menuItemIconContainerClass: `icon-container`,
        menuItemIconClass: `icon`,
        menuItemContentClass: `action-menu-item-content`,
        menuItemTextClass: `text-container`
    }, d));

    const fileInputContext = this.fileInputContext = withDeps({
        page,
        recognizerContext,
        rippler
    }, d => new FileInputContext(d));

    const scrollerContext = this.scrollerContext = withDeps({
        page,
        scrollEvents
    }, d => new ScrollerContext({
        itemHeight: ITEM_HEIGHT
    }, d));

    const tooltipContext = this.tooltipContext = withDeps({
        page,
        recognizerContext,
        globalEvents
    }, d => new TooltipContext({
        activation: `hover`,
        transitionClass: `fade-in`,
        preferredDirection: `up`,
        preferredAlign: `middle`,
        arrow: false,
        delay: 600,
        classPrefix: `app-tooltip autosized-tooltip minimal-size-tooltip`,
        container: this.page.$(`body`),
        gap: 0
    }, d));

    const snackbar = this.snackbar = withDeps({
        page,
        recognizerContext,
        globalEvents
    }, d => new Snackbar({
        transitionInClass: `transition-in`,
        transitionOutClass: `transition-out`,
        containerClass: `snackbar-container`,
        actionClass: `snackbar-action`,
        titleClass: `snackbar-title`,
        textContainerClass: `text-container`,
        textClass: `text`,
        nextDelay: 400,
        visibilityTime: 4400,
        initialUndismissableWindow: 500,
        beforeTransitionIn: null,
        beforeTransitionOut: null,
        maxLength: 3
    }, d));

    const toolbarSubmenu = this.toolbarSubmenu = withDeps({
        page,
        recognizerContext,
        rippler,
        globalEvents
    }, d => new OpenableSubmenu({
        target: `.toolbar-submenu`,
        openerTarget: `.menul-submenu-open`,
        openerActiveClass: `toolbar-item-active`,
        activeClass: `shown`,
        transitionClass: `transition-in`
    }, d));

    const popupContext = this.popupContext = withDeps({
        env,
        page,
        globalEvents,
        recognizerContext,
        scrollerContext,
        dbValues,
        db,
        rippler,
        keyboardShortcuts
    }, d => new PopupContext({
        zIndex: POPUP_ZINDEX,
        containerClass: `popup-container`,
        headerClass: `popup-header`,
        footerClass: `popup-footer`,
        bodyClass: `popup-body`,
        scrollAreaContainerClass: `scrollbar-scrollarea`,
        bodyContentClass: `popup-body-content`,
        closerContainerClass: `popup-closer-container`,
        scrollbarContainerClass: `scrollbar-container`,
        scrollbarRailClass: `scrollbar-rail`,
        scrollbarKnobClass: `scrollbar-knob`,
        popupButtonClass: `popup-button`,
        buttonDisabledClass: `popup-button-disabled`
    }, d));

    const spinner = this.spinner = withDeps({
        page
    }, d => new Spinner({
        clockwise: `#clockwise-spinner`,
        counterclockwise: `#counterclockwise-spinner`
    }, d));

    const gestureEducator = this.gestureEducator = withDeps({
        page,
        snackbar,
        db,
        dbValues
    }, d => new GestureEducator(d));

    const serviceWorkerManager = this.serviceWorkerManager = withDeps({
        env,
        page,
        snackbar,
        globalEvents
    }, d => new ServiceWorkerManager(d));
    this.serviceWorkerManager.start();

    const applicationPreferences = this.applicationPreferences = withDeps({
        page,
        recognizerContext,
        sliderContext,
        dbValues,
        db,
        rippler,
        popupContext,
        toolbarSubmenu,
        env
    }, d => new ApplicationPreferences({
        preferencesButton: `.menul-preferences`
    }, d));

    const effectPreferences = this.effectPreferences = withDeps({
        page,
        recognizerContext,
        sliderContext,
        dbValues,
        db,
        rippler,
        popupContext,
        toolbarSubmenu,
        env
    }, d => new EffectPreferences({
        preferencesButton: `.menul-effects`
    }, d));

    const crossfadingPreferences = this.crossfadingPreferences = withDeps({
        page,
        recognizerContext,
        sliderContext,
        dbValues,
        db,
        rippler,
        toolbarSubmenu,
        popupContext,
        env
    }, d => new CrossfadingPreferences({
        preferencesButton: `.menul-crossfade`
    }, d));

    const playlist = this.playlist = withDeps({
        env,
        page,
        db,
        dbValues,
        recognizerContext,
        scrollerContext,
        rippler,
        snackbar,
        globalEvents,
        tooltipContext,
        keyboardShortcuts,
        applicationPreferences
    }, d => new Playlist({
        target: `#app-playlist-container`,
        itemHeight: ITEM_HEIGHT
    }, d));

    const usageData = this.usageData = withDeps({
        workerWrapper
    }, d => new UsageData(d));

    const tagDataContext = this.tagDataContext = new TagDataContext();

    const localFileHandler = this.localFileHandler = withDeps({
        page,
        fileInputContext,
        env,
        playlist
    }, d => new LocalFileHandler({
        directoryButton: `.menul-folder, .add-folder-link`,
        fileButton: `.menul-files, .add-files-link`
    }, d));


    const player = this.player = withDeps({
        page,
        playlist,
        env,
        globalEvents,
        recognizerContext,
        dbValues,
        db,
        gestureEducator,
        rippler,
        crossfadingPreferences,
        effectPreferences,
        applicationPreferences,
        tooltipContext,
        localFileHandler,
        workerWrapper
    }, d => new Player({
        target: `.app-player-controls`,
        playButtonDom: `.play-button`,
        pauseButtonDom: `.pause-button`,
        previousButtonDom: `.previous-button`,
        stopButtonDom: `.stop-button`,
        nextButtonDom: `.next-button`
    }, d));

    const trackAnalyzer = this.trackAnalyzer = withDeps({
        page,
        env,
        playlist,
        globalEvents,
        workerWrapper,
        tagDataContext,
        player
    }, d => new TrackAnalyzer(d));

    const search = this.search = withDeps({
        env,
        page,
        playlist,
        db,
        dbValues,
        globalEvents,
        recognizerContext,
        scrollerContext,
        keyboardShortcuts,
        tooltipContext,
        trackAnalyzer,
        workerWrapper
    }, d => new Search({
        target: `.search-list-container`,
        itemHeight: ITEM_HEIGHT
    }, d));

    withDeps({
        usageData, search
    }, d => tagDataContext.setDeps(d));

    const queue = this.queue = null;

    const mainTabs = this.mainTabs = withDeps({
        page,
        keyboardShortcuts,
        globalEvents,
        menuContext,
        playlist,
        search,
        queue,
        recognizerContext,
        rippler
    }, d => new MainTabs({
        itemHeight: ITEM_HEIGHT,
        tabHeight: TAB_HEIGHT,
        tabHolder: `#app-content-holder`,
        playlistTab: `.playlist-tab`,
        searchTab: `.search-tab`,
        queueTab: `.queue-tab`,
        activeTabIndicator: `.active-tab-indicator`
    }, d));

    /* eslint-disable no-constant-condition */
    if (false && env.isDevelopment()) {
        this.localFileHandler.generateFakeFiles(30);
    }
    /* eslint-enable no-constant-condition */

    const playerPictureManager = this.playerPictureManager = withDeps({
        page,
        player
    }, d => new PlayerPictureManager({
        target: `.picture-container`,
        imageDimensions: IMAGE_DIMENSIONS,
        defaultImageSrc: DEFAULT_IMAGE_SRC,
        enabledMediaMatcher: null
    }, d));

    const playerTimeManager = this.playerTimeManager = withDeps({
        page,
        player,
        recognizerContext,
        sliderContext,
        dbValues,
        db,
        rippler
    }, d => new PlayerTimeManager({
        target: `.player-upper-container`,
        seekSlider: `.time-progress-container`,
        currentTimeDom: `.current-time`,
        totalTimeDom: `.total-time`,
        timeContainerDom: `.playback-status-wrapper`,
        timeProgressDom: `.time-progress`
    }, d));

    const playerVolumeManager = this.playerVolumeManager = withDeps({
        page,
        player,
        recognizerContext,
        sliderContext,
        rippler,
        tooltipContext
    }, d => new PlayerVolumeManager({
        target: `.volume-controls-container`,
        volumeSlider: `.volume-slider`,
        muteDom: `.volume-mute`
    }, d));

    const playlistNotifications = this.playlistNotifications = withDeps({
        permissionPrompt,
        player,
        playlist,
        page,
        env,
        serviceWorkerManager,
        recognizerContext,
        rippler,
        db,
        dbValues,
        tooltipContext,
        playerPictureManager
    }, d => new PlaylistNotifications({
        target: `.notification-setting`
    }, d));

    const visualizerCanvas = this.visualizerCanvas = withDeps({
        player,
        page,
        globalEvents,
        recognizerContext,
        applicationPreferences,
        snackbar,
        rippler,
        popupContext,
        menuContext,
        sliderContext
    }, d => new VisualizerCanvas({
        target: `#visualizer`,
        binWidth: 3,
        gapWidth: 1,
        capHeight: 1,
        capSeparator: 2,
        capStyle: `rgb(37,117,197)`,
        targetFps: 60,
        capDropTime: 750,
        ghostOpacity: 0.14,
        capInterpolator: ACCELERATE_CUBIC_INTERPOLATOR,
        enabledMediaMatcher: matchMedia(`(min-height: 500px)`)
    }, d));

    const trackDisplay = this.trackDisplay = withDeps({
        playlist,
        page,
        defaultTitle,
        globalEvents
    }, d => new TrackDisplay({
        target: `.track-display-container`,
        displayTarget: `.track-display`,
        delay: 3500,
        pixelsPerSecond: 22
    }, d));

    const defaultShortcuts = this.defaultShortcuts = withDeps({
        page,
        recognizerContext,
        player,
        playlist,
        keyboardShortcuts,
        playerTimeManager,
        rippler,
        gestureScreenFlasher
    }, d => new DefaultShortcuts(d));

    const playlistModeManager = this.playlistModeManager = withDeps({
        playlist,
        page,
        recognizerContext,
        rippler,
        tooltipContext
    }, d => new PlaylistModeManager({
        target: `.playlist-controls-container`
    }, d));
    /* eslint-enable no-unused-vars */

    this.globalEvents.on(`longPressStart`, this.longTapStarted.bind(this));
    this.globalEvents.on(`longPressEnd`, this.longTapEnded.bind(this));
    this.globalEvents.addBeforeUnloadListener(this.beforeUnload.bind(this));
    this.page.addDocumentListener(`keydown`, this.documentKeydowned.bind(this), true);
    this.page.addDocumentListener(`selectstart`, this.selectStarted.bind(this));
    this.player.on(`stop`, this.playerStopped.bind(this));

    this.page.changeDom(() => {
        page.$(`#app-loader`).remove();
        this.page.setTimeout(() => {
            mainTabs.tabController.activateTabById(PLAYLIST_TAB_ID);
            this.globalEvents._triggerSizeChange();
            this.visualizerCanvas.initialize();
            console.log(`bootstrap time:`, performance.now() - bootstrapStart, `ms`);
            this.page.changeDom(() => {
                this.page.clearTimeout(loadingIndicatorShowerTimeoutId);
                this.page.$(`#app-container`).removeClass(`initial`);
            });
        }, 10);
    });
}

Application.prototype.selectStarted = function(e) {
    if (!isTextInputElement(e.target)) {
        e.preventDefault();
    }
};

Application.prototype.longTapStarted = function(touch) {
    this.spinner.spinAt(touch.clientX | 0, touch.clientY | 0);
};

Application.prototype.longTapEnded = function() {
    this.spinner.stop();
};

Application.prototype.beforeUnload = function() {
    if (!this.env.isDevelopment() && (this.playlist.length > 0 ||
        ((this.player.isPlaying || this.player.isPaused) && !this.player.isStopped))) {
        return `Are you sure you want to exit?`;
    }
    return null;
};

Application.prototype.playerStopped = function() {
    this.page.setTitle(this.defaultTitle);
};

Application.prototype.documentKeydowned = function(e) {
    const {key} = e;
    if (key === `Escape`) {
        this.globalEvents._fireClear();
    }

    if (e.target === this.page.activeElement() &&
        e.target.tabIndex >= 0 &&
        !isAnyInputElement(e.target)) {
        if (key === `Spacebar` || key === `Enter`) {
            this.page.emulateClickEventFrom(e);
        } else if (key === `Escape`) {
            e.target.blur();
        }
    }
};
