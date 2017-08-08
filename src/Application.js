import withDeps from "ApplicationDependencies";
import {console, matchMedia, performance} from "platform/platform";
import Snackbar, {DISMISSED, ACTION_CLICKED} from "ui/Snackbar";
import Rippler from "ui/Rippler";
import PermissionPrompt from "ui/PermissionPrompt";
import TrackDisplay from "player/TrackDisplay";
import {default as MainTabs, VISIBLE_TAB_PREFERENCE_KEY} from "player/MainTabs";
import PlaylistModeManager from "player/PlaylistModeManager";
import PlayerTimeManager from "player/PlayerTimeManager";
import PlayerVolumeManager from "player/PlayerVolumeManager";
import PlayerPictureManager from "player/PlayerPictureManager";
import PlayerRatingManager from "player/PlayerRatingManager";
import MediaSessionWrapper from "player/MediaSessionWrapper";
import AudioManager from "audio/frontend/AudioManager";
import LocalFileHandler from "platform/LocalFileHandler";
import VisualizerCanvas from "visualization/VisualizerCanvas";
import KeyboardShortcuts from "keyboard/KeyboardShortcuts";
import GestureScreenFlasher from "ui/GestureScreenFlasher";
import DefaultShortcuts from "keyboard/DefaultShortcuts";
import AudioVisualizer from "visualization/AudioVisualizer";
import PopupContext from "ui/PopupContext";
import MetadataManagerFrontend, {timerTick as trackTimerTick} from "metadata/MetadataManagerFrontend";
import GestureEducator from "player/GestureEducator";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import SliderContext from "ui/SliderContext";
import MenuContext from "ui/MenuContext";
import ScrollerContext from "ui/scrolling/ScrollerContext";
import {PlayedTrackOriginContext} from "tracks/TrackContainerController";
import FileInputContext from "platform/FileInputContext";
import PlayerController, {PLAYBACK_STOP_EVENT} from "player/PlayerController";
import PlaylistController from "player/PlaylistController";
import SearchController from "search/SearchController";
import ApplicationPreferencesBindingContext from "ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/EffectPreferencesBindingContext";
import WorkerWrapper from "WorkerWrapper";
import {ACCELERATE_CUBIC_INTERPOLATOR} from "ui/animation/easing";
import {isTextInputElement, isAnyInputElement} from "platform/dom/Page";
import ToolbarManager from "ui/ToolbarManager";
import SelectionStatus from "ui/SelectionStatus";
import MainMenu from "ui/MainMenu";
import {UPDATE_AVAILABLE_EVENT} from "platform/ServiceWorkerManager";
import {ITEM_HEIGHT} from "tracks/TrackView";
import ZipperFrontend from "zip/ZipperFrontend";
import {QUOTA_EXCEEDED_EVENT} from "platform/QuotaExceededEmitterTrait";
import {DATABASE_CLOSED_EVENT} from "platform/DatabaseClosedEmitterTrait";


const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;
const DEFAULT_IMAGE_SRC = `/dist/images/apple-touch-icon-180x180.png`;

const MAIN_TOOLBAR_INDEX = 0;
const SELECTION_TOOLBAR_INDEX = 1;

const DATABASE_CLOSED_TAG = `database-closed`;
const QUOTA_EXCEEDED_TAG = `quota-exceeded`;

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
                serviceWorkerManager,
                timers} = deps;

        if (!env.hasTouch()) {
            page.$(`body`).addClass(`no-touch`);
        } else {
            page.$(`body`).addClass(`has-touch`);
        }

        this.page = page;
        this.env = env;
        this.db = db;
        this.dbValues = dbValues;
        this.defaultTitle = defaultTitle;
        this.globalEvents = globalEvents;
        this.timers = timers;
        this.serviceWorkerManager = serviceWorkerManager;

        const toolbars = [`#main-toolbar`];

        if (env.hasTouch()) {
            toolbars.push(`#selection-toolbar`);
        }

        const recognizerContext = this.recognizerContext = withDeps({
            page,
            env,
            globalEvents
        }, d => new GestureRecognizerContext(d));

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

        const toolbarManager = this.toolbarManager = withDeps({
            page, globalEvents
        }, d => new ToolbarManager({
            toolbars,
            activeToolbar: `#main-toolbar`
        }, d));

        /* eslint-disable no-unused-vars */
        const playedTrackOriginContext = this.playedTrackOriginContext = new PlayedTrackOriginContext();

        const workerWrapper = this.workerWrapper = withDeps({
            page
        }, d => new WorkerWrapper(env.isDevelopment() ? `dist/worker/WorkerBackend.js` : `dist/worker/WorkerBackend.min.js`, d));

        const zipperWorkerWrapper = withDeps({
            page
        }, d => new WorkerWrapper(env.isDevelopment() ? `dist/worker/ZipperWorker.js` : `dist/worker/ZipperWorker.min.js`, d));

        const zipper = this.zipper = withDeps({
            zipperWorkerWrapper
        }, d => new ZipperFrontend(d));

        const permissionPrompt = this.permissionPrompt = withDeps({
            page
        }, d => new PermissionPrompt({
            zIndex: POPUP_ZINDEX + 80,
            target: `body`,
            dimmerClass: `body-dimmer`
        }, d));

        const metadataManager = this.metadataManager = withDeps({
            env, workerWrapper, permissionPrompt, page, zipper
        }, d => new MetadataManagerFrontend(d));

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

        const gestureEducator = this.gestureEducator = withDeps({
            page,
            snackbar,
            db,
            dbValues
        }, d => new GestureEducator(d));

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
            metadataManager,
            playedTrackOriginContext
        }, d => new PlaylistController({
            target: `.playlist-list-container`,
            itemHeight: ITEM_HEIGHT
        }, d));

        const localFileHandler = this.localFileHandler = withDeps({
            page,
            fileInputContext,
            env,
            playlist,
            metadataManager,
            zipper,
            mainMenu
        }, d => new LocalFileHandler(d));

        const audioManager = this.audioManager = withDeps({
            playlist,
            page,
            effectPreferencesBindingContext,
            applicationPreferencesBindingContext,
            workerWrapper,
            timers
        }, d => new AudioManager(d));

        const visualizer = this.visualizer = withDeps({
            workerWrapper, page, audioManager
        }, d => new AudioVisualizer({
            baseSmoothingConstant: 0.00042,
            maxFrequency: 12500,
            minFrequency: 20,
            bufferSize: 1024,
            targetFps: 60
        }, d));

        const player = this.player = withDeps({
            env,
            page,
            globalEvents,
            recognizerContext,
            db,
            dbValues,
            rippler,
            gestureEducator,
            playlist,
            metadataManager,
            audioManager
        }, d => new PlayerController({
            playPauseButtonDom: `.js-play-pause`,
            previousButtonDom: `.js-previous`,
            nextButtonDom: `.js-next`
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
            menuContext,
            playedTrackOriginContext
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
            db,
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
            defaultImageSrc: DEFAULT_IMAGE_SRC,
            enabledMediaMatcher: null
        }, d));

        const playerTimeManager = this.playerTimeManager = withDeps({
            page,
            db,
            player,
            recognizerContext,
            sliderContext,
            dbValues,
            rippler,
            globalEvents
        }, d => new PlayerTimeManager({
            currentTimeDom: `.js-current-time`,
            totalTimeDom: `.js-total-time`,
            timeProgressDom: `.js-track-progress-fill`,
            seekSlider: `.js-seek-slider`
        }, d));

        const playerRatingManager = this.playerRatingManager = withDeps({
            page,
            playlist,
            rippler,
            recognizerContext
        }, d => new PlayerRatingManager({
            target: `.js-favorite`
        }, d));

        const playerVolumeManager = this.playerVolumeManager = withDeps({
            page,
            player,
            recognizerContext,
            sliderContext,
            rippler
        }, d => new PlayerVolumeManager({
            volumeSlider: `.js-volume-slider`,
            muteDom: `.js-mute`
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
            capDropTime: 750,
            ghostOpacity: 0.14,
            capInterpolator: ACCELERATE_CUBIC_INTERPOLATOR,
            enabledMediaMatcher: matchMedia(`(min-height: 500px)`)
        }, d));
        visualizer.setCanvas(visualizerCanvas);

        const trackDisplay = this.trackDisplay = withDeps({
            playlist,
            page,
            defaultTitle,
            globalEvents
        }, d => new TrackDisplay({
            target: `.js-track-ticker-container`,
            displayTarget: `.js-track-ticker`,
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
            target: `#main-toolbar .toolbar-items-section-2`
        }, d));
        /* eslint-enable no-unused-vars */

        this.page.addDocumentListener(`keydown`, this.documentKeydowned.bind(this), true);
        this.page.addDocumentListener(`selectstart`, selectStarted);
        this.player.on(PLAYBACK_STOP_EVENT, this.playerStopped.bind(this));
        this.serviceWorkerManager.on(UPDATE_AVAILABLE_EVENT, this._updateAvailable.bind(this));

        this.page.changeDom(() => {
            page.$(`#app-loader`).remove();
            this.page.setTimeout(() => {
                mainTabs.tabController.activateTabById(this.dbValues[VISIBLE_TAB_PREFERENCE_KEY]);
                this.visualizerCanvas.initialize();
                this.globalEvents._triggerSizeChange();
                const preferenceLoadStart = performance.now();
                console.log(`bootstrap time:`, preferenceLoadStart - bootstrapStart, `ms`);
                this.page.changeDom(async () => {
                    this.page.clearTimeout(loadingIndicatorShowerTimeoutId);
                    await Promise.all([
                        this.player.preferencesLoaded(),
                        this.playlist.preferencesLoaded(),
                        this.search.preferencesLoaded()
                    ]);
                    this.page.$(`#app-container`).removeClass(`initial`);
                    this.globalEvents._triggerSizeChange();
                    console.log(`preferences loaded and rendered time:`, performance.now() - preferenceLoadStart, `ms`);
                });
            }, 10);
        });

        this.tickLongTimers = this.tickLongTimers.bind(this);
        this.tickLongTimers();

        this._quotaExceeded = this._quotaExceeded.bind(this);
        this.zipper.on(QUOTA_EXCEEDED_EVENT, this._quotaExceeded);
        this.metadataManager.on(QUOTA_EXCEEDED_EVENT, this._quotaExceeded);
        this._databaseClosed = this._databaseClosed.bind(this);
        this.zipper.on(DATABASE_CLOSED_EVENT, this._databaseClosed);
        this.metadataManager.on(DATABASE_CLOSED_EVENT, this._databaseClosed);
        this.search.on(DATABASE_CLOSED_EVENT, this._databaseClosed);
        db.on(DATABASE_CLOSED_EVENT, this._databaseClosed);
    }

    tickLongTimers() {
        try {
            const now = Date.now();
            trackTimerTick(now);
        } finally {
            this.page.setTimeout(this.tickLongTimers, 60 * 1000);
        }
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

    _updateAvailable(respondWith) {
        respondWith((async () => {
            const outcome = await this.snackbar.show(`New version available`, {
                action: `refresh`,
                visibilityTime: 15000
            });

            return outcome === ACTION_CLICKED || outcome === DISMISSED;
        })());
    }

    async _quotaExceeded() {
        const outcome = await this.snackbar.show(`Storage space limit has been reached`, {
            action: `Resolve`,
            visibilityTime: 60000 * 3,
            tag: QUOTA_EXCEEDED_TAG
        });
        if (outcome === ACTION_CLICKED) {
            // TODO: show space manager or request somehow more quota?
        }
    }

    async _databaseClosed() {
        if (this.globalEvents.isWindowBackgrounded()) {
            this.page.window().location.reload();
        } else {
            const outcome = await this.snackbar.show(`Connection to storage media lost`, {
                action: `restore`,
                visibilityTime: 15000,
                tag: DATABASE_CLOSED_TAG
            });
            if (outcome === ACTION_CLICKED || outcome === DISMISSED) {
                this.page.window().location.reload();
            }
        }
    }
}
