import {NEXT_TRACK_CHANGE_EVENT,
        HISTORY_CHANGE_EVENT,
        PLAYLIST_STOPPED_EVENT,
        CURRENT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import withDeps from "ApplicationDependencies";
import AudioPlayer from "audio/frontend/AudioPlayer";
import AudioManager from "audio/frontend/AudioManager";
import EventEmitter from "events";
import {noUndefinedGet, throttle} from "util";
import {URL, performance} from "platform/platform";
import {isTouchEvent} from "platform/dom/Page";
import {generateSilentWavFile} from "platform/LocalFileHandler";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";
import {ALL_FILES_PERSISTED_EVENT} from "metadata/MetadataManagerFrontend";

export const PLAYBACK_STATE_CHANGE_EVENT = `playbackStateChange`;
export const PLAYBACK_RESUME_AFTER_IDLE_EVENT = `playbackResumeAfterIdle`;
export const PLAYBACK_PAUSE_EVENT = `pause`;
export const PLAYBACK_PLAY_EVENT = `play`;
export const PLAYBACK_STOP_EVENT = `stop`;
export const VOLUME_CHANGE_EVENT = `volumeChange`;
export const VOLUME_MUTE_EVENT = `muted`;
export const TRACK_PLAYING_EVENT = `trackPlaying`;
export const NEW_TRACK_LOAD_EVENT = `newTrackLoad`;
export const PROGRESS_EVENT = `progress`;

let loadId = 0;
const VOLUME_KEY = `volume`;
const MUTED_KEY = `muted`;
const CURRENT_TRACK_PROGRESS_KEY = `currentTrackProgress`;
const CURRENT_PLAYLIST_TRACK_KEY = `currentPlaylistTrack`;

export default class PlayerController extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this.localFileHandler = deps.localFileHandler;
        this.visualizer = deps.visualizer;
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.rippler = deps.rippler;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.gestureEducator = deps.gestureEducator;
        this.playlist = deps.playlist;
        this.metadataManager = deps.metadataManager;

        this._domNode = this.page.$(opts.target);

        this._playButtonDomNode = this.$().find(opts.playButtonDom);
        this._previousButtonDomNode = this.$().find(opts.previousButtonDom);
        this._nextButtonDomNode = this.$().find(opts.nextButtonDom);

        this._progressLastPersisted = performance.now();
        this._lastPersistedProgressValue = -1;

        this.visualizerCanvas = null;
        this.volume = 0.15;
        this.isStopped = true;
        this.isPaused = false;
        this.isPlaying = false;
        this.isMutedValue = false;
        this.queuedNextTrackImplicitly = false;
        this.pictureManager = null;
        this.mediaFocusAudioElement = null;
        this.audioPlayer = withDeps({
            page: this.page,
            env: this.env,
            db: this.db,
            dbValues: this.dbValues,
            effectPreferencesBindingContext: this.effectPreferencesBindingContext,
            applicationPreferencesBindingContext: this.applicationPreferencesBindingContext,
            workerWrapper: deps.workerWrapper,
            timers: deps.timers
        }, d => new AudioPlayer(d));

        this._persistMute = throttle(this._persistMute, 500, this);
        this._persistVolume = throttle(this._persistVolume, 500, this);
        this.nextTrackChanged = this.nextTrackChanged.bind(this);

        this.$play().addEventListener(`click`, this.playButtonClicked.bind(this));
        this.$next().addEventListener(`click`, this.nextButtonClicked.bind(this));
        this.$previous().addEventListener(`click`, this.prevButtonClicked.bind(this));
        this.recognizerContext.createTapRecognizer(this.playButtonClicked.bind(this)).recognizeBubbledOn(this.$play());
        this.recognizerContext.createTapRecognizer(this.nextButtonClicked.bind(this)).recognizeBubbledOn(this.$next());
        this.recognizerContext.createTapRecognizer(this.prevButtonClicked.bind(this)).recognizeBubbledOn(this.$previous());

        this.playlist.on(CURRENT_TRACK_CHANGE_EVENT, this.loadTrack.bind(this));
        this.playlist.on(PLAYLIST_STOPPED_EVENT, this.stop.bind(this));
        this.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChanged);
        this.playlist.on(HISTORY_CHANGE_EVENT, this.historyChanged.bind(this));
        this.metadataManager.on(ALL_FILES_PERSISTED_EVENT, this._persistTrack.bind(this));

        this._audioManager = null;
        this.ready = (async () => {
            await this.audioPlayer.ready();
            this.ready = null;
            this._audioManager = new AudioManager(this, this.visualizer);
        })();

        if (this.env.mediaSessionSupport()) {
            this.mediaFocusAudioElement = this.page.createElement(`audio`, {
                loop: true,
                controls: false,
                src: URL.createObjectURL(generateSilentWavFile())
            })[0];
        }

        this.audioPlayer.on(`audioContextReset`, this.audioContextReset.bind(this));
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));
        this._preferencesLoaded = this._loadPreferences();
    }

    preferencesLoaded() {
        return this._preferencesLoaded;
    }

    audioContextReset() {
        this._audioManager.audioContextReset();
        this.emit(PLAYBACK_RESUME_AFTER_IDLE_EVENT);
    }

    effectPreferencesChanged() {
        this._audioManager.effectsChanged(this.effectPreferencesBindingContext);
    }

    /* eslint-disable class-methods-use-this */
    applicationPreferencesChanged() {
        // EMPTYFORNOW
    }
    /* eslint-enable class-methods-use-this */

    setVisualizerCanvas(value) {
        this.visualizerCanvas = value;
    }

    setPictureManager(pictureManager) {
        this.pictureManager = pictureManager;
    }

    $allButtons() {
        return this.$play().add(this.$previous(), this.$next());
    }

    $() {
        return this._domNode;
    }

    $play() {
        return this._playButtonDomNode;
    }

    $previous() {
        return this._previousButtonDomNode;
    }

    decodingLatencyValue(decodingLatency) {
        this.applicationPreferencesBindingContext.decodingLatencyValue(decodingLatency);
    }

    $next() {
        return this._nextButtonDomNode;
    }

    historyChanged() {
        this.checkButtonState();
    }

    getPictureManager() {
        return this.pictureManager;
    }

    nextTrackChanged() {
        this.checkButtonState();
    }

    nextTrackStartedPlaying() {
        return new Promise(resolve => this.once(TRACK_PLAYING_EVENT, resolve));
    }

    async nextTrackImplicitly() {
        if (this.isPaused) {
            if (this.queuedNextTrackImplicitly) return;
            this.queuedNextTrackImplicitly = true;
            const playId = this.playlist.getCurrentPlayId();
            // Queue the next track load when the player resumes.
            await this.nextTrackStartedPlaying();
            this.queuedNextTrackImplicitly = false;
            // If it was exactly the same track playthrough that was resumed.
            if (!this.isPaused && this.playlist.getCurrentPlayId() === playId) {
                this.nextTrackImplicitly();
            }
            return;
        }

        this.playlist.next(false);
    }

    audioManagerErrored() {
        this.nextTrackImplicitly();
    }

    getProgress() {
        const duration = this._audioManager.getDuration();
        if (!duration) return -1;
        const currentTime = this._audioManager.getCurrentTime();
        return Math.round((currentTime / duration) * 100) / 100;
    }

    setProgress(p) {
        if (!this._audioManager.isSeekable()) return;
        p = Math.min(Math.max(p, 0), 1);
        const duration = this._audioManager.getDuration();
        if (!duration) return;
        this.seek(p * duration);
    }

    trackFinished() {
        this.playlist.trackPlayedSuccessfully();
        this.nextTrackImplicitly();
    }

    getFadeInTimeForNextTrack(currentTrack) {
        const {effectPreferencesBindingContext} = this;
        const crossfadeDuration = effectPreferencesBindingContext.getCrossfadeDuration();

        if (crossfadeDuration === 0) {
            return 0;
        }

        if (effectPreferencesBindingContext.getShouldAlbumNotCrossfade()) {
            const nextTrack = this.playlist.getNextTrack();
            if (nextTrack && currentTrack.comesBeforeInSameAlbum(nextTrack)) {
                return 0;
            }
        }

        return crossfadeDuration;
    }

    audioManagerProgressed(currentTime, totalTime) {
        this.emit(PROGRESS_EVENT, currentTime, totalTime);

        const now = performance.now();
        if (now - this._progressLastPersisted > 500 &&
            this._lastPersistedProgressValue !== this._getUnroundedProgress()) {
            this._progressLastPersisted = now;
            this._lastPersistedProgressValue = this._getUnroundedProgress();
            this._persistProgress();
        }
    }

    getSampleRate() {
        const track = this.playlist.getCurrentTrack();
        if (!track) return 44100;
        return track.getSampleRate();
    }

    pause() {
        if (this.isPaused) return;
        this.isPaused = true;
        this.isStopped = false;
        this.isPlaying = false;
        this._audioManager.pause();
        this.pausedPlay();
    }

    resume() {
        if (this.isPaused) {
            this.emit(TRACK_PLAYING_EVENT);
            this.play();
        }
    }

    play() {
        if (this.isPlaying) return;

        if (!this.playlist.getCurrentTrack()) {
            this.playlist.next(true);
            return;
        }

        this.emit(TRACK_PLAYING_EVENT);
        this.isPaused = false;
        this.isStopped = false;
        this.isPlaying = true;
        this._audioManager.resume();
        this.startedPlay();
    }

    stop() {
        if (this.isStopped) return;
        this.isStopped = true;
        this.isPaused = false;
        this.isPlaying = false;
        this._audioManager.pause();
        this.playlist.stop();
        this.emit(PROGRESS_EVENT, 0, 0);
        this.stoppedPlay();
        this._persistTrack();
    }

    async loadTrack(track, {isUserInitiatedSkip, initialProgress, resumeIfPaused}) {
        if (this.ready) {
            const id = ++loadId;
            await this.ready;
            if (id !== loadId) {
                return;
            }
        }
        ++loadId;
        this._audioManager.loadTrack(track, isUserInitiatedSkip, initialProgress);
        this.emit(TRACK_PLAYING_EVENT);
        this.emit(NEW_TRACK_LOAD_EVENT, track);

        if (resumeIfPaused) {
            this.play();
        }
        this._persistTrack();
    }

    nextButtonClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.playlist.next(true);
        if (isTouchEvent(e)) {
            this.gestureEducator.educate(`next`);
        }
    }

    prevButtonClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.playlist.prev();
        if (isTouchEvent(e)) {
            this.gestureEducator.educate(`previous`);
        }
    }

    playButtonClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

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
            this.$play().removeClass(`disabled`);
        }

        if (!this.isStopped) {
            if (this.isPlaying) {
                this.$play().
                    find(`.play-pause-morph-icon`).
                    removeClass(`play`).
                    addClass(`pause`);
            } else if (this.isPaused) {
                this.$play().
                    find(`.play-pause-morph-icon`).
                    removeClass(`pause`).
                    addClass(`play`);
            }
        } else {
            this.$play().removeClass(`active`).
                    find(`.play-pause-morph-icon`).
                    removeClass(`pause`).
                    addClass(`play`);
        }

    }

    async _callMediaFocusAction(method) {
        if (this.mediaFocusAudioElement) {
            try {
                await this.mediaFocusAudioElement[method]();
            } catch (e) {
                // NOOP
            }
        }
    }

    startedPlay() {
        this.checkButtonState();
        this.emit(PLAYBACK_PLAY_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        this._callMediaFocusAction(`play`);
    }

    stoppedPlay() {
        this.checkButtonState();
        this.emit(PLAYBACK_STOP_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        this._callMediaFocusAction(`pause`);
    }

    pausedPlay() {
        this.checkButtonState();
        this.emit(PLAYBACK_PAUSE_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        this._callMediaFocusAction(`pause`);
    }

    seek(seconds) {
        if (!this.isPlaying && !this.isPaused) return;
        if (!this._audioManager.isSeekable()) return;
        const maxSeek = this._audioManager.getDuration();
        if (!isFinite(maxSeek)) return;
        seconds = Math.max(0, Math.min(seconds, maxSeek));
        this._audioManager.seek(seconds);
    }

    isMuted() {
        return this.isMutedValue;
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    toggleMute() {
        this.isMutedValue = !this.isMutedValue;
        if (this.isMutedValue) {
            this.emit(VOLUME_MUTE_EVENT, true);
            this._audioManager.mute();
        } else {
            this.emit(VOLUME_MUTE_EVENT, false);
            this._audioManager.unmute();
        }
        this._persistMute();
    }

    getDuration() {
        return this._audioManager.getDuration();
    }

    getProbableDuration() {
        const ret = this._audioManager.getDuration();
        if (ret) return ret;
        const track = this.playlist.getCurrentTrack();
        return track.getDuration();
    }

    getVolume() {
        return this.volume;
    }

    setVolume(val) {
        val = Math.min(Math.max(0, val), 1);
        const volume = this.volume = val;
        this._audioManager.updateVolume(volume);
        this.emit(VOLUME_CHANGE_EVENT);
        this._persistVolume();
        return this;
    }

    async _loadPreferences() {
        await Promise.all([this.ready, this.metadataManager.ready()]);
        this.effectPreferencesBindingContext.on(`change`, this.effectPreferencesChanged.bind(this));
        this.applicationPreferencesBindingContext.on(`change`, this.applicationPreferencesChanged.bind(this));


        if (VOLUME_KEY in this.dbValues) {
            this.setVolume(this.dbValues[VOLUME_KEY]);
        }

        if (MUTED_KEY in this.dbValues) {
            if (this.dbValues[MUTED_KEY]) {
                this.toggleMute();
            }
        }

        if (CURRENT_PLAYLIST_TRACK_KEY in this.dbValues) {
            const serializedPlaylistTrack = this.dbValues[CURRENT_PLAYLIST_TRACK_KEY];
            if (serializedPlaylistTrack) {
                let progress = 0;
                if (CURRENT_TRACK_PROGRESS_KEY in this.dbValues) {
                    progress = this.dbValues[CURRENT_TRACK_PROGRESS_KEY];
                }

                const validTrackFound = await this.playlist.restoreSerializedPlaylistTrack(serializedPlaylistTrack,
                                                                                              progress);
                if (validTrackFound) {
                    this.pause();
                }
            }
        }
    }

    _shutdownSavePreferences(preferences) {
        preferences.push({
            key: VOLUME_KEY,
            value: this.volume
        });
        preferences.push({
            key: MUTED_KEY,
            value: this.isMutedValue
        });

        const playlistTrack = this.playlist.getCurrentPlaylistTrack();

        if (this._canPersistPlaylistTrack(playlistTrack)) {
            preferences.push({
                key: CURRENT_PLAYLIST_TRACK_KEY,
                value: playlistTrack.toJSON()
            });

            preferences.push({
                key: CURRENT_TRACK_PROGRESS_KEY,
                value: this._getUnroundedProgress()
            });
        }
    }

    _canPersistPlaylistTrack(playlistTrack) {
        return playlistTrack && this.metadataManager.areAllFilesPersisted();
    }

    _persistTrack() {
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        if (this._canPersistPlaylistTrack(playlistTrack)) {
            this.db.set(CURRENT_PLAYLIST_TRACK_KEY, playlistTrack.toJSON());
            this.db.set(CURRENT_TRACK_PROGRESS_KEY, this._getUnroundedProgress());
        }
    }

    _persistProgress() {
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        if (this._canPersistPlaylistTrack(playlistTrack)) {
            this.db.set(CURRENT_TRACK_PROGRESS_KEY, this._getUnroundedProgress());
        }
    }

    _persistVolume() {
        this.db.set(VOLUME_KEY, this.volume);
    }

    _persistMute() {
        this.db.set(MUTED_KEY, this.isMutedValue);
    }

    getAudioContext() {
        return this.audioPlayer.getAudioContext();
    }

    _getUnroundedProgress() {
        const duration = this._audioManager.getDuration();
        if (!duration) return 0;
        const currentTime = this._audioManager.getCurrentTime();
        return currentTime / duration;
    }
}
