import { StoredKVValues } from "shared/preferences";
import { debugFor, setDebugConfig } from "shared/src/debug";
import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import Timers from "shared/src/platform/Timers";
import AudioPlayerFrontend from "ui/audio/AudioPlayerFrontend";
import DefaultShortcuts from "ui/keyboard/DefaultShortcuts";
import KeyboardShortcuts from "ui/keyboard/KeyboardShortcuts";
import MetadataManagerFrontend, { timerTick as trackTimerTick } from "ui/metadata/MetadataManagerFrontend";
import Page, { isAnyInputElement, isTextInputElement } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import FileInputContext from "ui/platform/FileInputContext";
import GlobalEvents from "ui/platform/GlobalEvents";
import LocalFileHandler from "ui/platform/LocalFileHandler";
import ServiceWorkerManager from "ui/platform/ServiceWorkerManager";
import GestureEducator from "ui/player/GestureEducator";
import { default as MainTabs } from "ui/player/MainTabs";
import MediaSessionWrapper from "ui/player/MediaSessionWrapper";
import PlayerController from "ui/player/PlayerController";
import PlayerPictureManager from "ui/player/PlayerPictureManager";
import PlayerRatingManager from "ui/player/PlayerRatingManager";
import PlayerTimeManager from "ui/player/PlayerTimeManager";
import PlayerVolumeManager from "ui/player/PlayerVolumeManager";
import PlaylistController from "ui/player/PlaylistController";
import PlaylistModeManager from "ui/player/PlaylistModeManager";
import TrackDisplay from "ui/player/TrackDisplay";
import SearchController from "ui/search/SearchController";
import { PlayedTrackOriginContext } from "ui/tracks/TrackContainerController";
import { ITEM_HEIGHT } from "ui/tracks/TrackView";
import ApplicationPreferencesBindingContext from "ui/ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/ui/EffectPreferencesBindingContext";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import GestureScreenFlasher from "ui/ui/GestureScreenFlasher";
import MainMenu from "ui/ui/MainMenu";
import MenuContext from "ui/ui/MenuContext";
import PermissionPrompt from "ui/ui/PermissionPrompt";
import PopupContext from "ui/ui/PopupContext";
import Rippler from "ui/ui/Rippler";
import ScrollerContext from "ui/ui/scrolling/ScrollerContext";
import SelectionStatus from "ui/ui/SelectionStatus";
import SliderContext from "ui/ui/SliderContext";
import Snackbar, { ACTION_CLICKED, DISMISSED } from "ui/ui/Snackbar";
import ToolbarManager from "ui/ui/ToolbarManager";
import VisualizerCanvas from "ui/visualization/VisualizerCanvas";
import WorkerWrapper from "ui/WorkerWrapper";
import ZipperFrontend from "ui/zip/ZipperFrontend";

const dbg = debugFor("Application");

import AudioVisualizerFrontend from "../src/visualization/AudioVisualizerFrontend";

const debugConfig = {
    //Application: "*",
    //Crossfader: ["fadeout"],
    //AudioSource: ["*", "!Verbose"],
    // AudioPlayerFrontend: "*",
    AudioVisualizerBackend: "*",
    AudioVisualizerFrontend: "*",
    //Resampler: "*",
    //MetadataBackend: "*",
    //MetadataFrontend: "*",
    //demuxer: "*",
    AudioPlayerBackend: ["visualizer"],
    //AudioProcessingPipeline: ["*", "!Verbose"],
};

export interface Deps {
    page?: Page;
    env?: Env;
    db?: KeyValueDatabase;
    dbValues?: StoredKVValues;
    defaultTitle?: string;
    globalEvents?: GlobalEvents;
    timers?: Timers;
    serviceWorkerManager?: ServiceWorkerManager;
    recognizerContext?: GestureRecognizerContext;
    snackbar?: Snackbar;
    toolbarManager?: ToolbarManager;
    playedTrackOriginContext?: PlayedTrackOriginContext;
    generalWorker?: WorkerWrapper;
    audioWorker?: WorkerWrapper;
    zipperWorker?: WorkerWrapper;
    visualizerWorker?: WorkerWrapper;
    zipper?: ZipperFrontend;
    permissionPrompt?: PermissionPrompt;
    metadataManager?: MetadataManagerFrontend;
    sliderContext?: SliderContext;
    gestureScreenFlasher?: GestureScreenFlasher;
    rippler?: Rippler;
    selectionStatus?: SelectionStatus;
    keyboardShortcuts?: KeyboardShortcuts;
    menuContext?: MenuContext;
    fileInputContext?: FileInputContext;
    scrollerContext?: ScrollerContext;
    mainMenu?: MainMenu;
    popupContext?: PopupContext;
    gestureEducator?: GestureEducator;
    applicationPreferencesBindingContext?: ApplicationPreferencesBindingContext;
    effectPreferencesBindingContext?: EffectPreferencesBindingContext;
    playlist?: PlaylistController;
    localFileHandler?: LocalFileHandler;
    audioManager?: AudioPlayerFrontend;
    visualizer?: AudioVisualizerFrontend;
    player?: PlayerController;
    search?: SearchController;
    queue?: null;
    mainTabs?: MainTabs;
    playerPictureManager?: PlayerPictureManager;
    playerTimeManager?: PlayerTimeManager;
    playerRatingManager?: PlayerRatingManager;
    playerVolumeManager?: PlayerVolumeManager;
    mediaSessionWrapper?: MediaSessionWrapper;
    visualizerCanvas?: VisualizerCanvas;
    trackDisplay?: TrackDisplay;
    defaultShortcuts?: DefaultShortcuts;
    playlistModeManager?: PlaylistModeManager;
}

export type SelectDeps<T extends keyof Deps> = Pick<Required<Deps>, T>;

const TAB_HEIGHT = 32;
const POPUP_ZINDEX = 960;
const DEFAULT_IMAGE_SRC = `${process.env.IMAGE_PATH}/apple-touch-icon-180x180.png`;

const MAIN_TOOLBAR_INDEX = 0;
const SELECTION_TOOLBAR_INDEX = 1;

const DATABASE_CLOSED_TAG = `database-closed`;
const QUOTA_EXCEEDED_TAG = `quota-exceeded`;

function selectStarted(e: Event) {
    if (!isTextInputElement(e.target as HTMLElement)) {
        e.preventDefault();
    }
}

export default class Application {
    private page: Page;
    private defaultTitle: string;
    private globalEvents: GlobalEvents;
    private serviceWorkerManager: ServiceWorkerManager;
    private snackbar: Snackbar;
    private zipper: ZipperFrontend;
    private metadataManager: MetadataManagerFrontend;
    private player: PlayerController;
    private search: SearchController;

    constructor(
        deps: {
            env: Env;
            db: KeyValueDatabase;
            dbValues: StoredKVValues;
            defaultTitle: string;
            globalEvents: GlobalEvents;
            page: Page;
            timers: Timers;
            serviceWorkerManager: ServiceWorkerManager;
        },
        loadingIndicatorShowerTimeoutId: number,
        cssLoadTime: number
    ) {
        const bootstrapStart = performance.now();

        const { page, env, db, defaultTitle, globalEvents, dbValues, serviceWorkerManager, timers } = deps;

        if (!env.hasTouch()) {
            page.$(`body`).addClass(`no-touch`);
        } else {
            page.$(`body`).addClass(`has-touch`);
        }

        this.page = page;
        this.defaultTitle = defaultTitle;
        this.globalEvents = globalEvents;
        this.serviceWorkerManager = serviceWorkerManager;

        const toolbars = [`.js-main-toolbar`];

        if (env.hasTouch()) {
            toolbars.push(`.js-selection-toolbar`);
        }

        const recognizerContext = new GestureRecognizerContext({
            page,
            env,
            globalEvents,
        });

        const snackbar = (this.snackbar = new Snackbar(
            {
                target: `.js-snackbar-container`,
                nextDelay: 400,
                visibilityTime: 4400,
                initialUndismissableWindow: 500,
                maxLength: 3,
            },
            {
                page,
                recognizerContext,
                globalEvents,
            }
        ));

        const toolbarManager = new ToolbarManager(
            {
                toolbars,
                activeToolbar: `.js-main-toolbar`,
            },
            {
                page,
                globalEvents,
            }
        );

        /* eslint-disable no-unused-vars */
        const playedTrackOriginContext = new PlayedTrackOriginContext();

        const generalWorker = new WorkerWrapper(process.env.GENERAL_WORKER_PATH!, {
            page,
        });

        const audioWorker = new WorkerWrapper(process.env.AUDIO_WORKER_PATH!, {
            page,
        });

        const zipperWorker = new WorkerWrapper(process.env.ZIPPER_WORKER_PATH!, {
            page,
        });

        const visualizerWorker = new WorkerWrapper(process.env.VISUALIZER_WORKER_PATH!, {
            page,
        });

        setDebugConfig(
            debugConfig,
            [generalWorker, audioWorker, zipperWorker, visualizerWorker].map(v => v.getWorker())
        );

        const zipper = (this.zipper = new ZipperFrontend({
            zipperWorker,
        }));

        const permissionPrompt = new PermissionPrompt(
            {
                zIndex: POPUP_ZINDEX + 80,
                target: `body`,
                dimmerClass: `body-dimmer`,
            },
            {
                page,
            }
        );

        const metadataManager = (this.metadataManager = new MetadataManagerFrontend({
            env,
            generalWorker,
            permissionPrompt,
            page,
            zipper,
        }));

        const sliderContext = new SliderContext(
            {
                knobSelector: `.slider-knob`,
                fillSelector: `.slider-fill`,
            },
            {
                page,
                recognizerContext,
                globalEvents,
            }
        );

        const gestureScreenFlasher = new GestureScreenFlasher({
            page,
        });

        const rippler = new Rippler(
            {
                zIndex: POPUP_ZINDEX - 60,
                target: `body`,
            },
            {
                page,
            }
        );

        const selectionStatus = new SelectionStatus(
            {
                countDisplay: `.js-selected-items-count`,
                closeButton: `.js-unselect-all-menu-button`,
                menuButton: `.js-show-selection-menu-button`,
                selectAllButton: `.js-select-all-menu-button`,
            },
            {
                page,
                recognizerContext,
                rippler,
            }
        );

        if (env.hasTouch()) {
            selectionStatus.on(`emptySelection`, (_count, animationAppropriate) => {
                void toolbarManager.activateToolbar(MAIN_TOOLBAR_INDEX, animationAppropriate);
            });

            selectionStatus.on(`nonEmptySelection`, (_count, animationAppropriate) => {
                void toolbarManager.activateToolbar(SELECTION_TOOLBAR_INDEX, animationAppropriate);
            });
        }

        const keyboardShortcuts = new KeyboardShortcuts({
            page,
        });

        const menuContext = new MenuContext(
            {
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
                menuItemTextClass: `text-container`,
            },
            {
                page,
                recognizerContext,
                rippler,
                globalEvents,
            }
        );

        const fileInputContext = new FileInputContext({
            page,
            recognizerContext,
            rippler,
        });

        const scrollerContext = new ScrollerContext(
            {
                itemHeight: ITEM_HEIGHT,
            },
            {
                page,
            }
        );

        const mainMenu = new MainMenu(
            {
                target: `.js-main-menu`,
            },
            {
                menuContext,
                env,
            }
        );

        const popupContext = new PopupContext(
            {
                zIndex: POPUP_ZINDEX,
            },
            {
                env,
                page,
                globalEvents,
                recognizerContext,
                scrollerContext,
                dbValues,
                db,
                rippler,
                keyboardShortcuts,
            }
        );

        const gestureEducator = new GestureEducator({
            page,
            snackbar,
            db,
            dbValues,
        });

        const applicationPreferencesBindingContext = new ApplicationPreferencesBindingContext({
            page,
            recognizerContext,
            sliderContext,
            dbValues,
            db,
            rippler,
            popupContext,
            mainMenu,
            globalEvents,
            env,
        });

        const effectPreferencesBindingContext = new EffectPreferencesBindingContext({
            page,
            recognizerContext,
            sliderContext,
            dbValues,
            db,
            rippler,
            popupContext,
            mainMenu,
            globalEvents,
            env,
        });

        const playlist = new PlaylistController(
            {
                target: `.js-playlist-pane-container`,
                itemHeight: ITEM_HEIGHT,
            },
            {
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
                playedTrackOriginContext,
            }
        );

        const audioManager = new AudioPlayerFrontend({
            playlist,
            page,
            effectPreferencesBindingContext,
            applicationPreferencesBindingContext,
            audioWorker,
            timers,
        });

        const visualizer = new AudioVisualizerFrontend(
            {
                baseSmoothingConstant: 0.00042,
                maxFrequency: 12500,
                minFrequency: 20,
                bufferSize: 1024,
                targetFps: 60,
                capDropTime: 750,
                interpolator: "ACCELERATE_CUBIC_INTERPOLATOR",
                binWidth: 3,
                gapWidth: 1,
                capHeight: 1,
                capSeparator: 2,
                capStyle: `rgb(37,117,197)`,
                ghostOpacity: 0.14,
                pixelRatio: page.devicePixelRatio() || 1,
            },
            {
                visualizerWorker,
                page,
                audioManager,
            }
        );

        const player = (this.player = new PlayerController(
            {
                playPauseButtonDom: `.js-play-pause`,
                previousButtonDom: `.js-previous`,
                nextButtonDom: `.js-next`,
            },
            {
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
                audioManager,
            }
        ));

        const search = (this.search = new SearchController(
            {
                target: `.js-search-pane-container`,
                itemHeight: ITEM_HEIGHT,
            },
            {
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
                generalWorker,
                rippler,
                menuContext,
                playedTrackOriginContext,
            }
        ));

        const queue = null;

        const mainTabs = new MainTabs(
            {
                itemHeight: ITEM_HEIGHT,
                tabHeight: TAB_HEIGHT,
                tabHolder: `#app-content-holder`,
                playlistTab: `.js-playlist-tab-button`,
                searchTab: `.js-search-tab-button`,
                queueTab: `.js-queue-tab-button`,
                activeTabIndicator: `.active-tab-indicator`,
            },
            {
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
                rippler,
            }
        );

        new PlaylistModeManager({ page, playlist, recognizerContext, rippler });

        const playerPictureManager = new PlayerPictureManager(
            {
                target: `.picture-container`,
                defaultImageSrc: DEFAULT_IMAGE_SRC,
            },
            {
                page,
                playlist,
                applicationPreferencesBindingContext,
                metadataManager,
            }
        );

        const playerTimeManager = new PlayerTimeManager(
            {
                currentTimeDom: `.js-current-time`,
                totalTimeDom: `.js-total-time`,
                timeProgressDom: `.js-track-progress-fill`,
                seekSlider: `.js-seek-slider`,
            },
            {
                page,
                db,
                player,
                recognizerContext,
                sliderContext,
                dbValues,
                rippler,
                globalEvents,
            }
        );

        new DefaultShortcuts({
            page,
            recognizerContext,
            player,
            playlist,
            keyboardShortcuts,
            playerTimeManager,
            rippler,
            gestureScreenFlasher,
        });

        new MediaSessionWrapper({
            player,
            playlist,
            page,
            env,
            playerPictureManager,
            globalEvents,
        });

        new PlayerRatingManager(
            { target: ".js-favorite" },
            {
                page,
                playlist,
                rippler,
                recognizerContext,
            }
        );

        new PlayerVolumeManager(
            {
                volumeSlider: `.js-volume-slider`,
                muteDom: `.js-mute`,
            },
            {
                page,
                player,
                recognizerContext,
                sliderContext,
                rippler,
            }
        );

        new LocalFileHandler({
            page,
            fileInputContext,
            env,
            playlist,
            metadataManager,
            zipper,
            mainMenu,
        });

        new TrackDisplay(
            {
                target: `.js-track-ticker-container`,
                displayTarget: `.js-track-ticker`,
                delay: 3500,
                pixelsPerSecond: 22,
            },
            {
                playlist,
                page,
                defaultTitle,
                globalEvents,
            }
        );

        const visualizerCanvas = new VisualizerCanvas(
            {
                target: `#visualizer`,
                enabledMediaMatcher: matchMedia(`(min-height: 500px)`),
            },
            {
                page,
                globalEvents,
            }
        );

        /* eslint-enable no-unused-vars */
        this.page.addDocumentListener(`keydown`, this.documentKeydowned, { capture: true });
        this.page.addDocumentListener(`selectstart`, selectStarted);
        this.player.on("playbackStopped", this.playerStopped);
        this.serviceWorkerManager.on("updateAvailable", this._updateAvailable);

        this.tickLongTimers();

        this.zipper.on("quotaExceeded", this._quotaExceeded);
        this.metadataManager.on("quotaExceeded", this._quotaExceeded);
        this.zipper.on("databaseClosed", this._databaseClosed);
        this.metadataManager.on("databaseClosed", this._databaseClosed);
        this.search.on("databaseClosed", this._databaseClosed);
        db.on("databaseClosed", this._databaseClosed);

        void (async () => {
            visualizer.initialize(visualizerCanvas);
            dbg("Performance", "css load time", cssLoadTime, "ms");
            page.$(`#app-loader`).remove();
            void mainTabs.tabController.activateTabById(dbValues.visibleTabId);
            globalEvents._triggerSizeChange();

            const preferenceLoadStart = performance.now();
            dbg("Performance", `bootstrap time:`, preferenceLoadStart - bootstrapStart, `ms`);
            await Promise.all([player.preferencesLoaded(), playlist.preferencesLoaded(), search.preferencesLoaded()]);
            page.clearTimeout(loadingIndicatorShowerTimeoutId);
            page.$(`.js-app-container`).removeClass(`initial`);
            dbg("Performance", `preferences loaded and rendered time:`, performance.now() - preferenceLoadStart, `ms`);
        })();
    }

    tickLongTimers = () => {
        try {
            const now = Date.now();
            trackTimerTick(now);
        } finally {
            this.page.setTimeout(this.tickLongTimers, 60 * 1000);
        }
    };

    playerStopped = () => {
        this.page.setTitle(this.defaultTitle);
    };

    documentKeydowned = (e: KeyboardEvent) => {
        const { key } = e;
        if (key === `Escape`) {
            this.globalEvents._fireClear();
        }
        const target = e.target as HTMLElement;
        if (target === this.page.activeElement() && target.tabIndex >= 0 && !isAnyInputElement(target)) {
            if (key === `Spacebar` || key === `Enter`) {
                this.page.emulateClickEventFrom(e);
            } else if (key === `Escape`) {
                target.blur();
            }
        }
    };

    _updateAvailable = (respondWith: (userResponded: Promise<boolean>) => void) => {
        respondWith(
            (async () => {
                const outcome = await this.snackbar.show(`New version available`, {
                    action: `refresh`,
                    visibilityTime: 15000,
                });

                return outcome === ACTION_CLICKED.value || outcome === DISMISSED.value;
            })()
        );
    };

    _quotaExceeded = async () => {
        const outcome = await this.snackbar.show(`Storage space limit has been reached`, {
            action: `Resolve`,
            visibilityTime: 60000 * 3,
            tag: QUOTA_EXCEEDED_TAG,
        });
        if (outcome === ACTION_CLICKED.value) {
            // TODO: show space manager or request somehow more quota?
        }
    };

    _databaseClosed = async () => {
        if (this.globalEvents.isWindowBackgrounded()) {
            this.page.window().location.reload();
        } else {
            const outcome = await this.snackbar.show(`Connection to storage media lost`, {
                action: `restore`,
                visibilityTime: 15000,
                tag: DATABASE_CLOSED_TAG,
            });
            if (outcome === ACTION_CLICKED.value || outcome === DISMISSED.value) {
                this.page.window().location.reload();
            }
        }
    };
}
