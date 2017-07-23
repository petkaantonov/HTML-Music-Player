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
import MediaSessionWrapper from "player/MediaSessionWrapper";
import LocalFileHandler from "platform/LocalFileHandler";
import VisualizerCanvas from "visualization/VisualizerCanvas";
import KeyboardShortcuts from "keyboard/KeyboardShortcuts";
import GestureScreenFlasher from "ui/GestureScreenFlasher";
import DefaultShortcuts from "keyboard/DefaultShortcuts";
import PopupContext from "ui/PopupContext";
import MetadataManagerFrontend, {timerTick as trackTimerTick} from "metadata/MetadataManagerFrontend";
import GestureEducator from "player/GestureEducator";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import SliderContext from "ui/SliderContext";
import MenuContext from "ui/MenuContext";
import ScrollerContext from "ui/scrolling/ScrollerContext";
import FileInputContext from "platform/FileInputContext";
import PlayerController, {PLAYBACK_STOP_EVENT} from "player/PlayerController";
import PlaylistController from "player/PlaylistController";
import SearchController from "search/SearchController";
import ApplicationPreferencesBindingContext from "ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/EffectPreferencesBindingContext";
import CrossfadePreferencesBindingContext from "ui/CrossfadePreferencesBindingContext";
import ServiceWorkerManager from "platform/ServiceWorkerManager";
import WorkerWrapper from "WorkerWrapper";
import {ACCELERATE_CUBIC_INTERPOLATOR} from "ui/animation/easing";
import {isTextInputElement, isAnyInputElement} from "platform/dom/Page";
import ToolbarManager from "ui/ToolbarManager";
import SelectionStatus from "ui/SelectionStatus";
import MainMenu from "ui/MainMenu";

const ITEM_HEIGHT = 44;
const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;
const IMAGE_DIMENSIONS = 97;
const DEFAULT_IMAGE_SRC = `/dist/images/apple-touch-icon-180x180.png`;

const MAIN_TOOLBAR_INDEX = 0;
const SELECTION_TOOLBAR_INDEX = 1;

function selectStarted(e) {
    if (!isTextInputElement(e.target)) {
        e.preventDefault();
    }
}

export default class Application {
    constructor(deps, loadingIndicatorShowerTimeoutId) {
        const bootstrapStart = performance.now();

        const {page,
                env,
                db,
                defaultTitle,
                globalEvents,
                dbValues,
                timers} = deps;

        if (!env.hasTouch()) {
            page.$(`body`).addClass(`no-touch`);
        }

        this.page = page;
        this.env = env;
        this.db = db;
        this.dbValues = dbValues;
        this.defaultTitle = defaultTitle;
        this.globalEvents = globalEvents;
        this.timers = timers;

        const toolbars = [`#main-toolbar`];

        if (env.hasTouch()) {
            toolbars.push(`#selection-toolbar`);
        }

        const toolbarManager = this.toolbarManager = withDeps({
            page, globalEvents
        }, d => new ToolbarManager({
            toolbars,
            activeToolbar: `#main-toolbar`
        }, d));

        /* eslint-disable no-unused-vars */
        const workerWrapper = this.workerWrapper = withDeps({
            page
        }, d => new WorkerWrapper(env.isDevelopment() ? `dist/worker/WorkerBackend.js` : `dist/worker/WorkerBackend.min.js`, d));

        const permissionPrompt = this.permissionPrompt = withDeps({
            page
        }, d => new PermissionPrompt({
            zIndex: POPUP_ZINDEX + 80,
            target: `body`,
            dimmerClass: `body-dimmer`
        }, d));

        const metadataManager = this.metadataManager = withDeps({
            env, workerWrapper, permissionPrompt, page
        }, d => new MetadataManagerFrontend(d));

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

        const gestureScreenFlasher = this.gestureScreenFlasher = withDeps({
            page
        }, d => new GestureScreenFlasher(d));

        const rippler = this.rippler = withDeps({
            page
        }, d => new Rippler({
            zIndex: POPUP_ZINDEX - 60,
            target: `body`
        }, d));

        const selectionStatus = this.selectionStatus = withDeps({
            page, recognizerContext, rippler
        }, d => new SelectionStatus({
            countDisplay: `#selected-items-count`,
            closeButton: `#unselect-all-menu-button`,
            menuButton: `#show-selection-menu-button`,
            selectAllButton: `#select-all-menu-button`
        }, d));

        if (env.hasTouch()) {
            selectionStatus.on(`emptySelection`, (count, animationAppropriate) => {
                toolbarManager.activateToolbar(MAIN_TOOLBAR_INDEX, animationAppropriate);
            });

            selectionStatus.on(`nonEmptySelection`, (count, animationAppropriate) => {
                toolbarManager.activateToolbar(SELECTION_TOOLBAR_INDEX, animationAppropriate);
            });
        }

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
            page
        }, d => new ScrollerContext({
            itemHeight: ITEM_HEIGHT
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

        const mainMenu = this.mainMenu = withDeps({
            menuContext, env
        }, d => new MainMenu({
            target: `#main-menu`
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
            bodyContentClass: `popup-body-content`,
            closerContainerClass: `popup-closer-container`,
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

        const applicationPreferencesBindingContext = this.applicationPreferencesBindingContext = withDeps({
            page,
            recognizerContext,
            sliderContext,
            dbValues,
            db,
            rippler,
            popupContext,
            mainMenu,
            globalEvents,
            env
        }, d => new ApplicationPreferencesBindingContext(d));

        const effectPreferencesBindingContext = this.effectPreferencesBindingContext = withDeps({
            page,
            recognizerContext,
            sliderContext,
            dbValues,
            db,
            rippler,
            popupContext,
            mainMenu,
            globalEvents,
            env
        }, d => new EffectPreferencesBindingContext(d));

        const crossfadePreferencesBindingContext = this.crossfadePreferencesBindingContext = withDeps({
            page,
            recognizerContext,
            sliderContext,
            dbValues,
            db,
            rippler,
            mainMenu,
            popupContext,
            globalEvents,
            env
        }, d => new CrossfadePreferencesBindingContext(d));

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
            keyboardShortcuts,
            applicationPreferencesBindingContext,
            menuContext,
            metadataManager
        }, d => new PlaylistController({
            target: `#app-playlist-container`,
            itemHeight: ITEM_HEIGHT
        }, d));

        const localFileHandler = this.localFileHandler = withDeps({
            page,
            fileInputContext,
            env,
            playlist,
            metadataManager,
            mainMenu
        }, d => new LocalFileHandler(d));

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
            crossfadePreferencesBindingContext,
            effectPreferencesBindingContext,
            applicationPreferencesBindingContext,
            localFileHandler,
            workerWrapper,
            metadataManager,
            timers
        }, d => new PlayerController({
            target: `.app-player-controls`,
            playButtonDom: `.play-button`,
            pauseButtonDom: `.pause-button`,
            previousButtonDom: `.previous-button`,
            stopButtonDom: `.stop-button`,
            nextButtonDom: `.next-button`
        }, d));

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
            metadataManager,
            workerWrapper,
            rippler,
            menuContext
        }, d => new SearchController({
            target: `.search-list-container`,
            itemHeight: ITEM_HEIGHT
        }, d));

        const queue = this.queue = null;

        const mainTabs = this.mainTabs = withDeps({
            page,
            env,
            keyboardShortcuts,
            globalEvents,
            selectionStatus,
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


        const playerPictureManager = this.playerPictureManager = withDeps({
            page,
            player,
            playlist,
            applicationPreferencesBindingContext,
            metadataManager
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
            rippler,
            globalEvents
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
            rippler
        }, d => new PlayerVolumeManager({
            target: `.volume-controls-container`,
            volumeSlider: `.volume-slider`,
            muteDom: `.volume-mute`
        }, d));

        const mediaSessionWrapper = this.mediaSessionWrapper = withDeps({
            player,
            playlist,
            page,
            env,
            playerPictureManager,
            globalEvents
        }, d => new MediaSessionWrapper(d));

        const visualizerCanvas = this.visualizerCanvas = withDeps({
            player,
            page,
            globalEvents,
            recognizerContext,
            snackbar,
            env,
            rippler,
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
            rippler
        }, d => new PlaylistModeManager({
            target: `.playlist-controls-container`
        }, d));
        /* eslint-enable no-unused-vars */

        this.globalEvents.on(`longPressStart`, this.longTapStarted.bind(this));
        this.globalEvents.on(`longPressEnd`, this.longTapEnded.bind(this));
        this.page.addDocumentListener(`keydown`, this.documentKeydowned.bind(this), true);
        this.page.addDocumentListener(`selectstart`, selectStarted);
        this.player.on(PLAYBACK_STOP_EVENT, this.playerStopped.bind(this));

        this.page.changeDom(() => {
            page.$(`#app-loader`).remove();
            this.page.setTimeout(() => {
                mainTabs.tabController.activateTabById(PLAYLIST_TAB_ID);
                this.visualizerCanvas.initialize();
                this.globalEvents._triggerSizeChange();
                console.log(`bootstrap time:`, performance.now() - bootstrapStart, `ms`);
                this.page.changeDom(() => {
                    this.page.clearTimeout(loadingIndicatorShowerTimeoutId);
                    this.page.$(`#app-container`).removeClass(`initial`);
                    this.globalEvents._triggerSizeChange();
                });
            }, 10);
        });

        this.tickLongTimers = this.tickLongTimers.bind(this);
        this.tickLongTimers();
    }

    tickLongTimers() {
        try {
            const now = Date.now();
            trackTimerTick(now);
        } finally {
            this.page.setTimeout(this.tickLongTimers, 60 * 1000);
        }
    }

    longTapStarted(touch) {
        this.spinner.spinAt(touch.clientX | 0, touch.clientY | 0);
    }

    longTapEnded() {
        this.spinner.stop();
    }

    playerStopped() {
        this.page.setTitle(this.defaultTitle);
    }

    documentKeydowned(e) {
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
    }

}
