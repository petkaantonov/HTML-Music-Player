import KeyValueDatabase from "shared/src/idb/KeyValueDatabase";
import { PreferenceArray, StoredKVValues } from "shared/src/preferences";
import { EventEmitterInterface } from "shared/src/types/helpers";
import { throttle } from "shared/src/util";
import { SelectDeps } from "ui/Application";
import AudioPlayerFrontend from "ui/audio/AudioPlayerFrontend";
import MetadataManagerFrontend, { Track } from "ui/metadata/MetadataManagerFrontend";
import Page, { DomWrapper, DomWrapperSelector, isTouchEvent } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import { generateSilentWavFile } from "ui/platform/LocalFileHandler";
import PlaythroughTickCounter from "ui/player/PlaythroughTickCounter";
import { TrackWithOrigin } from "ui/tracks/TrackContainerController";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import Rippler from "ui/ui/Rippler";
import EventEmitter from "vendor/events";

import GestureEducator from "./GestureEducator";
import PlaylistController from "./PlaylistController";

const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

type Deps = SelectDeps<
    | "env"
    | "page"
    | "globalEvents"
    | "recognizerContext"
    | "db"
    | "dbValues"
    | "rippler"
    | "gestureEducator"
    | "playlist"
    | "metadataManager"
    | "audioManager"
>;

interface Opts {
    playPauseButtonDom: DomWrapperSelector;
    previousButtonDom: DomWrapperSelector;
    nextButtonDom: DomWrapperSelector;
}

export default class PlayerController extends EventEmitter {
    env: Env;
    page: Page;
    globalEvents: GlobalEvents;
    recognizerContext: GestureRecognizerContext;
    db: KeyValueDatabase;
    dbValues: StoredKVValues;
    rippler: Rippler;
    gestureEducator: GestureEducator;
    playlist: PlaylistController;
    metadataManager: MetadataManagerFrontend;
    audioManager: AudioPlayerFrontend;
    private _loadedTrack: null | Track;
    private _tickCounter: PlaythroughTickCounter;
    private _mediaFocusAudioElement: null | HTMLAudioElement;
    private _playPauseButtonDomNode: DomWrapper;
    private _previousButtonDomNode: DomWrapper;
    private _nextButtonDomNode: DomWrapper;
    private _progressLastPersisted: number;
    private _lastPersistedProgressValue: number;
    private _preferencesLoaded: Promise<void>;

    constructor(opts: Opts, deps: Deps) {
        super();
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.rippler = deps.rippler;
        this.gestureEducator = deps.gestureEducator;
        this.playlist = deps.playlist;
        this.metadataManager = deps.metadataManager;
        this.audioManager = deps.audioManager;

        this._loadedTrack = null;
        this._tickCounter = new PlaythroughTickCounter(PLAYTHROUGH_COUNTER_THRESHOLD);
        this._mediaFocusAudioElement = null;

        this._playPauseButtonDomNode = this.page.$(opts.playPauseButtonDom);
        this._previousButtonDomNode = this.page.$(opts.previousButtonDom);
        this._nextButtonDomNode = this.page.$(opts.nextButtonDom);

        this._progressLastPersisted = performance.now();
        this._lastPersistedProgressValue = -1;

        this._persistMute = throttle(this._persistMute, 500, this);
        this._persistVolume = throttle(this._persistVolume, 500, this);

        this.$playPause().addEventListener(`click`, this.playPauseButtonClicked);
        this.$next().addEventListener(`click`, this.nextButtonClicked);
        this.$previous().addEventListener(`click`, this.prevButtonClicked);
        this.recognizerContext.createTapRecognizer(this.playPauseButtonClicked).recognizeBubbledOn(this.$playPause());
        this.recognizerContext.createTapRecognizer(this.nextButtonClicked).recognizeBubbledOn(this.$next());
        this.recognizerContext.createTapRecognizer(this.prevButtonClicked).recognizeBubbledOn(this.$previous());
        this.globalEvents.on("shutdownSavePreferences", this._shutdownSavePreferences);
        this.playlist.on("playlistCurrentTrackChanged", this.loadTrack);
        this.playlist.on("playlistStopped", this.stop);
        this.playlist.on("playlistNextTrackChanged", this.nextTrackChanged);
        this.playlist.on("playlistHistoryChanged", this.historyChanged);
        this.metadataManager.on("allFilesPersisted", this._persistTrack);
        this.audioManager.on("playbackStateChanged", this._playbackStateChanged);
        this.audioManager.on("playbackProgressed", this._playbackProgressed);
        this.audioManager.on("preloadedTrackPlaybackStarted", this._trackFinished);
        this.audioManager.on("errored", this._errored);
        this.audioManager.on("audioContextDidReset", this._audioContextReseted);

        if (this.env.mediaSessionSupport()) {
            this._mediaFocusAudioElement = this.page.createElement(`audio`, {
                loop: "true",
                controls: "false",
                src: URL.createObjectURL(generateSilentWavFile()),
            })[0]! as HTMLAudioElement;
        }

        this._preferencesLoaded = this._loadPreferences();
    }

    ready() {
        return this.audioManager.ready();
    }

    get isStopped() {
        return this.audioManager.isPaused() && !this._loadedTrack;
    }

    get isPaused() {
        return this.audioManager.isPaused() && !!this._loadedTrack;
    }

    get isPlaying() {
        return !this.audioManager.isPaused() && !!this._loadedTrack;
    }

    preferencesLoaded() {
        return this._preferencesLoaded;
    }

    $allButtons() {
        return this.$playPause().add(this.$previous(), this.$next());
    }

    $playPause() {
        return this._playPauseButtonDomNode;
    }

    $previous() {
        return this._previousButtonDomNode;
    }

    $next() {
        return this._nextButtonDomNode;
    }

    historyChanged = () => {
        this.checkButtonState();
    };

    nextTrackChanged = () => {
        this.checkButtonState();
    };

    nextTrackImplicitly() {
        this.playlist.next(false);
    }

    loadTrack = (
        track: Track,
        {
            isUserInitiatedSkip,
            initialProgress,
            resumeIfPaused,
        }: { isUserInitiatedSkip: boolean; initialProgress: number; resumeIfPaused: boolean }
    ) => {
        if (isUserInitiatedSkip && !this._tickCounter.hasTriggered() && this._loadedTrack) {
            this._loadedTrack.recordSkip();
        }
        this._tickCounter.reset();
        this._loadedTrack = track;
        this.audioManager.loadTrack(track, initialProgress, resumeIfPaused && (this.isPaused || this.isStopped));
        this.emit("newTrackLoaded", track);
        this._persistTrack();
    };

    nextButtonClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        this.playlist.next(true);
        if (isTouchEvent(e)) {
            void this.gestureEducator.educate(`next`);
        }
    };

    prevButtonClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        this.playlist.prev();
        if (isTouchEvent(e)) {
            void this.gestureEducator.educate(`previous`);
        }
    };

    playPauseButtonClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        this.togglePlayback("originalEvent" in e ? e.originalEvent : e);
    };

    canPlayPause() {
        return !this.isStopped || !!this.playlist.getNextTrack();
    }

    checkButtonState() {
        this.$allButtons().addClass(`disabled`);

        if (this.playlist.getNextTrack()) {
            this.$next().removeClass(`disabled`);
        }

        if (this.playlist.hasHistory()) {
            this.$previous().removeClass(`disabled`);
        }

        if (this.canPlayPause()) {
            this.$playPause().removeClass(`disabled`);
        }

        if (!this.isStopped) {
            if (this.isPlaying) {
                this.$playPause().find(`.play-pause-morph-icon`).removeClass(`play`).addClass(`pause`);
            } else if (this.isPaused) {
                this.$playPause().find(`.play-pause-morph-icon`).removeClass(`pause`).addClass(`play`);
            }
        } else {
            this.$playPause()
                .removeClass(`active`)
                .find(`.play-pause-morph-icon`)
                .removeClass(`pause`)
                .addClass(`play`);
        }
    }

    getProgress() {
        const duration = this.audioManager.getDuration();
        if (!duration) return -1;
        const currentTime = this.audioManager.getCurrentTime();
        return Math.round((currentTime / duration) * 100) / 100;
    }

    getTimeAsProgress(timeSeconds: number) {
        const duration = this.audioManager.getDuration();
        if (!duration) return 0;
        return Math.round((timeSeconds / duration) * 100) / 100;
    }

    setProgress(p: number) {
        if (this.isStopped) return;
        p = Math.min(Math.max(p, 0), 1);
        const duration = this.audioManager.getDuration();
        if (!duration) return;
        this.seek(p * duration);
    }

    seek(seconds: number) {
        if (this.isStopped) return;
        const maxSeek = this.audioManager.getDuration();
        if (!isFinite(maxSeek)) return;
        seconds = Math.max(0, Math.min(seconds, maxSeek));
        this.audioManager.setCurrentTime(seconds);
    }

    stop = () => {
        if (this.isStopped) return;
        this._loadedTrack = null;
        this._persistTrack();
        this.emit("playbackProgressed", 0, 0);
        if (!this.audioManager.isPaused()) {
            this.pause();
        } else {
            this._playbackStateChanged();
        }
    };

    pause() {
        this.audioManager.pause();
    }

    play(e: Event) {
        if (!e.isTrusted && e.type !== "click") {
            throw new Error("play() must be called from trusted user event");
        }
        if (this.isStopped) {
            if (!this.playlist.next(true)) {
                return;
            }
        }
        this.audioManager.resume();
    }

    togglePlayback(e: Event) {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play(e);
        }
    }

    toggleMute() {
        if (this.isMuted()) {
            this.audioManager.setMuted(false);
            this.emit("volumeMuted", false);
        } else {
            this.audioManager.setMuted(true);
            this.emit("volumeMuted", true);
        }
        this._persistMute();
    }

    getDuration() {
        return this.audioManager.getDuration();
    }

    getProbableDuration() {
        const ret = this.audioManager.getDuration();
        if (ret) return ret;
        const track = this.playlist.getCurrentTrack();
        if (track) {
            return track.getDuration();
        }
        return 0;
    }

    isMuted() {
        return this.audioManager.isMuted();
    }

    getVolume() {
        return this.audioManager.getVolume();
    }

    setVolume(val: number) {
        val = Math.min(Math.max(0, val), 1);
        this.audioManager.setVolume(val);
        this.emit("volumeChanged");
        this._persistVolume();
        return this;
    }

    _playbackStateChanged = () => {
        this.checkButtonState();
        this.emit("playbackStateChanged");
        if (this.isStopped) {
            this._tickCounter.pause();
            void this._callMediaFocusAction(`pause`);
            this.emit("playbackStopped");
        } else if (this.isPaused) {
            this._tickCounter.pause();
            void this._callMediaFocusAction(`pause`);
            this.emit("playbackPaused");
        } else {
            void this._callMediaFocusAction(`play`);
            this.emit("playbackStarted");
        }
    };

    _errored = (e: { message: string }) => {
        if (this._loadedTrack) {
            this._loadedTrack.setError(e.message);
        }
        this.nextTrackImplicitly();
    };

    _trackFinished = () => {
        this.playlist.trackPlayedSuccessfully();
        this.nextTrackImplicitly();
    };

    _playbackProgressed = (currentTime: number, totalTime: number) => {
        if (!this._tickCounter.hasTriggered() && this._loadedTrack && currentTime >= 5 && totalTime >= 10) {
            if (this._tickCounter.tick()) {
                this._loadedTrack.triggerPlaythrough();
            }
        }

        const now = performance.now();
        if (
            now - this._progressLastPersisted > 500 &&
            this._lastPersistedProgressValue !== this._getUnroundedProgress()
        ) {
            this._progressLastPersisted = now;
            this._lastPersistedProgressValue = this._getUnroundedProgress();
            this._persistProgress();
        }

        this.emit("playbackProgressed", currentTime, totalTime);
    };

    async _callMediaFocusAction(method: "pause" | "play") {
        if (this._mediaFocusAudioElement) {
            try {
                await this._mediaFocusAudioElement[method]();
            } catch (e) {
                // NOOP
            }
        }
    }

    async _loadPreferences() {
        await Promise.all([this.ready(), this.metadataManager.ready()]);

        if (this.dbValues.volume !== undefined) {
            this.setVolume(this.dbValues.volume);
        }

        if (this.dbValues.muted !== undefined && this.dbValues.muted) {
            this.toggleMute();
        }
        if (this.dbValues.currentPlaylistTrack) {
            let progress = 0;
            if (this.dbValues.currentTrackProgress !== undefined) {
                progress = this.dbValues.currentTrackProgress;
            }

            const validTrackFound = await this.playlist.restoreSerializedPlaylistTrack(
                this.dbValues.currentPlaylistTrack,
                progress
            );
            if (validTrackFound) {
                this.pause();
            }
        }
    }

    _shutdownSavePreferences = (preferences: PreferenceArray) => {
        preferences.push({
            key: "volume",
            value: this.getVolume(),
        });
        preferences.push({
            key: "muted",
            value: this.isMuted(),
        });

        const playlistTrack = this.playlist.getCurrentPlaylistTrack();

        if (this._canPersistPlaylistTrack(playlistTrack)) {
            preferences.push({
                key: "currentPlaylistTrack",
                value: playlistTrack.toJSON()!,
            });

            preferences.push({
                key: "currentTrackProgress",
                value: this._getUnroundedProgress(),
            });
        }
    };

    _canPersistPlaylistTrack(playlistTrack: TrackWithOrigin) {
        return playlistTrack && this.metadataManager.areAllFilesPersisted();
    }

    _persistTrack = () => {
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        if (this._canPersistPlaylistTrack(playlistTrack)) {
            void this.db.set("currentPlaylistTrack", playlistTrack.toJSON()!);
            void this.db.set("currentTrackProgress", this._getUnroundedProgress());
        }
    };

    _persistProgress() {
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        if (this._canPersistPlaylistTrack(playlistTrack)) {
            void this.db.set("currentTrackProgress", this._getUnroundedProgress());
        }
    }

    _persistVolume() {
        void this.db.set("volume", this.getVolume());
    }

    _persistMute() {
        void this.db.set("muted", this.isMuted());
    }

    _getUnroundedProgress() {
        const duration = this.audioManager.getDuration();
        if (!duration) return 0;
        const currentTime = this.audioManager.getCurrentTime();
        return currentTime / duration;
    }

    _audioContextReseted = () => {
        this.emit("playbackResumedAfterIdle");
    };
}

interface PlayerEventsMap {
    playbackStopped: () => void;
    playbackPaused: () => void;
    playbackStarted: () => void;
    volumeChanged: () => void;
    playbackProgressed: (currentTime: number, totalTime: number) => void;
    playbackResumedAfterIdle: () => void;
    newTrackLoaded: (track: Track) => void;
    volumeMuted: (muted: boolean) => void;
    playbackStateChanged: () => void;
}

export default interface PlayerController extends EventEmitterInterface<PlayerEventsMap> {}
