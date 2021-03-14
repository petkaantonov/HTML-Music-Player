import AudioPlayerFrontend from "audio/AudioPlayerFrontend";
import * as io from "io-ts";
import DefaultShortcuts from "keyboard/DefaultShortcuts";
import KeyboardShortcuts from "keyboard/KeyboardShortcuts";
import MetadataManagerFrontend, { timerTick as trackTimerTick } from "metadata/MetadataManagerFrontend";
import Page, { isAnyInputElement, isTextInputElement } from "platform/dom/Page";
import Env from "platform/Env";
import FileInputContext from "platform/FileInputContext";
import GlobalEvents from "platform/GlobalEvents";
import KeyValueDatabase from "platform/KeyValueDatabase";
import LocalFileHandler from "platform/LocalFileHandler";
import ServiceWorkerManager from "platform/ServiceWorkerManager";
import Timers from "platform/Timers";
import GestureEducator from "player/GestureEducator";
import { default as MainTabs } from "player/MainTabs";
import MediaSessionWrapper from "player/MediaSessionWrapper";
import PlayerController from "player/PlayerController";
import PlayerPictureManager from "player/PlayerPictureManager";
import PlayerRatingManager from "player/PlayerRatingManager";
import PlayerTimeManager from "player/PlayerTimeManager";
import PlayerVolumeManager from "player/PlayerVolumeManager";
import PlaylistController from "player/PlaylistController";
import PlaylistModeManager from "player/PlaylistModeManager";
import TrackDisplay from "player/TrackDisplay";
import SearchController from "search/SearchController";
import { PlayedTrackOriginContext } from "tracks/TrackContainerController";
import { ITEM_HEIGHT } from "tracks/TrackView";
import { ioTypeFromClass, NumberValueBetween } from "types/helpers";
import { ACCELERATE_CUBIC_INTERPOLATOR } from "ui/animation/easing";
import ApplicationPreferencesBindingContext from "ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/EffectPreferencesBindingContext";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import GestureScreenFlasher from "ui/GestureScreenFlasher";
import MainMenu from "ui/MainMenu";
import MenuContext from "ui/MenuContext";
import PermissionPrompt from "ui/PermissionPrompt";
import PopupContext from "ui/PopupContext";
import Rippler from "ui/Rippler";
import ScrollerContext from "ui/scrolling/ScrollerContext";
import SelectionStatus from "ui/SelectionStatus";
import SliderContext from "ui/SliderContext";
import Snackbar, { ACTION_CLICKED, DISMISSED } from "ui/Snackbar";
import ToolbarManager from "ui/ToolbarManager";
import VisualizerCanvas from "visualization/VisualizerCanvas";
import WorkerWrapper from "WorkerWrapper";
import ZipperFrontend from "zip/ZipperFrontend";

import AudioVisualizerFrontend from "../src/visualization/AudioVisualizerFrontend";

const Xy = io.type({
    x: io.number,
    y: io.number,
});
export type Xy = io.TypeOf<typeof Xy>;

export const PopupPreference = io.intersection([
    io.partial({ screenPosition: Xy }),
    io.type({
        scrollPosition: Xy,
    }),
]);
export type PopupPreference = io.TypeOf<typeof PopupPreference>;

const PopupPreferences = {
    effectPreferencesPopup: PopupPreference,
    applicationPreferencesPopup: PopupPreference,
};

export const PopupPreferenceKey = io.keyof(PopupPreferences);
export type PopupPreferenceKey = io.TypeOf<typeof PopupPreferenceKey>;

export const ApplicationPreferences = io.type({
    enableAlbumArt: io.boolean,
    enableLoudnessNormalization: io.boolean,
    enableSilenceTrimming: io.boolean,
    enableOffline: io.boolean,
    bufferLengthMilliSeconds: io.number,
});
export type ApplicationPreferences = io.TypeOf<typeof ApplicationPreferences>;
export const EffectPreferences = io.type({
    equalizer: io.array(io.number),
    bassBoostStrength: io.number,
    bassBoostEnabled: io.boolean,
    noiseSharpeningStrength: io.number,
    noiseSharpeningEnabled: io.boolean,
    shouldAlbumNotCrossfade: io.boolean,
    crossfadeEnabled: io.boolean,
    crossfadeDuration: io.number,
});
export type EffectPreferences = io.TypeOf<typeof EffectPreferences>;

export const Preferences = io.union([ApplicationPreferences, EffectPreferences]);
export type Preferences = io.TypeOf<typeof Preferences>;

const PreferenceCategories = {
    applicationPreferences: ApplicationPreferences,
    effectPreferences: EffectPreferences,
};

export const PreferenceCategoryKey = io.keyof(PreferenceCategories);
export type PreferenceCategoryKey = io.TypeOf<typeof PreferenceCategoryKey>;

export const gestureEducationMessages = {
    next: io.literal(`Swipe right to play the next track`),
    previous: io.literal(`Swip left to play the previous track`),
};
export const StoredGestureEducationMessages = io.partial(gestureEducationMessages);
export type StoredGestureEducationMessages = io.TypeOf<typeof StoredGestureEducationMessages>;
export const GestureEducationMessage = io.keyof(gestureEducationMessages);
export type GestureEducationMessage = io.TypeOf<typeof GestureEducationMessage>;

export const TimeDisplayPreference = io.keyof({
    elapsed: null,
    remaining: null,
});
export type TimeDisplayPreference = io.TypeOf<typeof TimeDisplayPreference>;

export const TabId = io.keyof({
    playlist: null,
    search: null,
    queue: null,
});
export type TabId = io.TypeOf<typeof TabId>;

export const PlaylistMode = io.keyof({
    shuffle: null,
    normal: null,
    repeat: null,
});
export type PlaylistMode = io.TypeOf<typeof PlaylistMode>;

export const TrackOriginName = io.keyof({
    playlist: null,
    search: null,
});
export type TrackOriginName = io.TypeOf<typeof TrackOriginName>;

const IoArrayBuffer = ioTypeFromClass(ArrayBuffer);

export const ListControllerPreferences = io.partial({
    selectionRanges: io.array(io.tuple([io.number, io.number])),
    scrollPosition: io.number,
});
export type ListControllerPreferences = io.TypeOf<typeof ListControllerPreferences>;
const ListControllerPreferenceTypes = {
    playlistController: ListControllerPreferences,
    searchController: ListControllerPreferences,
};
export const ControllerKey = io.keyof(ListControllerPreferenceTypes);
export type ControllerKey = io.TypeOf<typeof ControllerKey>;
export const SerializedPlaylistTrack = io.type({
    index: io.number,
    trackUid: IoArrayBuffer,
    origin: TrackOriginName,
});
export type SerializedPlaylistTrack = io.TypeOf<typeof SerializedPlaylistTrack>;
export const StoredKVValues = io.partial({
    volume: NumberValueBetween(0, 1),
    muted: io.boolean,
    currentPlaylistTrack: SerializedPlaylistTrack,
    currentTrackProgress: NumberValueBetween(0, 1),
    playlistContents: io.array(IoArrayBuffer),
    playlistHistory: io.array(SerializedPlaylistTrack),
    playlistMode: PlaylistMode,
    searchHistory: io.array(io.string),
    searchQuery: io.string,
    visibleTabId: TabId,
    timeDisplayPreference: TimeDisplayPreference,
    gestureEducations: io.partial(gestureEducationMessages),
    ...PopupPreferences,
    ...PreferenceCategories,
    ...ListControllerPreferenceTypes,
});
export type StoredKVValues = io.TypeOf<typeof StoredKVValues>;

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
    workerWrapper?: WorkerWrapper;
    zipperWorkerWrapper?: WorkerWrapper;
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
    scrollerContext?: any;
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
// Const DEFAULT_IMAGE_SRC = `/dist/images/apple-touch-icon-180x180.png`;

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
        loadingIndicatorShowerTimeoutId: number
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

        const workerWrapper = new WorkerWrapper(
            env.isDevelopment() ? `dist/worker/WorkerBackend.js` : `dist/worker/WorkerBackend.min.js`,
            {
                page,
            }
        );

        const zipperWorkerWrapper = new WorkerWrapper(
            env.isDevelopment() ? `dist/worker/ZipperWorker.js` : `dist/worker/ZipperWorker.min.js`,
            {
                page,
            }
        );

        const zipper = (this.zipper = new ZipperFrontend({
            zipperWorkerWrapper,
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
            workerWrapper,
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

        /* Const gestureScreenFlasher = new GestureScreenFlasher({
            page,
        });*/

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

        /* Const fileInputContext = new FileInputContext({
            page,
            recognizerContext,
            rippler,
        });*/

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
            workerWrapper,
            timers,
        });

        const visualizer = new AudioVisualizerFrontend(
            {
                baseSmoothingConstant: 0.00042,
                maxFrequency: 12500,
                minFrequency: 20,
                bufferSize: 1024,
                targetFps: 60,
            },
            {
                workerWrapper,
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
                workerWrapper,
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

        /*
        Const playerPictureManager = new PlayerPictureManager(
            {
                target: `.picture-container`,
                defaultImageSrc: DEFAULT_IMAGE_SRC,
                enabledMediaMatcher: null,
            },
            {
                page,
                player,
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
        );*/

        const visualizerCanvas = new VisualizerCanvas(
            {
                target: `#visualizer`,
                binWidth: 3,
                gapWidth: 1,
                capHeight: 1,
                capSeparator: 2,
                capStyle: `rgb(37,117,197)`,
                capDropTime: 750,
                ghostOpacity: 0.14,
                capInterpolator: ACCELERATE_CUBIC_INTERPOLATOR,
                enabledMediaMatcher: matchMedia(`(min-height: 500px)`),
            },
            {
                player,
                page,
                globalEvents,
                recognizerContext,
                snackbar,
                env,
                rippler,
                menuContext,
                sliderContext,
            }
        );
        visualizer.setCanvas(visualizerCanvas);

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
            page.$(`#app-loader`).remove();
            void mainTabs.tabController.activateTabById(dbValues.visibleTabId);
            void visualizerCanvas.initialize();
            globalEvents._triggerSizeChange();

            const preferenceLoadStart = performance.now();
            // eslint-disable-next-line no-console
            console.log(`bootstrap time:`, preferenceLoadStart - bootstrapStart, `ms`);
            await Promise.all([player.preferencesLoaded(), playlist.preferencesLoaded(), search.preferencesLoaded()]);
            page.clearTimeout(loadingIndicatorShowerTimeoutId);
            page.$(`.js-app-container`).removeClass(`initial`);
            // eslint-disable-next-line no-console
            console.log(`preferences loaded and rendered time:`, performance.now() - preferenceLoadStart, `ms`);
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
