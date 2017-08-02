import {NEXT_TRACK_CHANGE_EVENT,
        HISTORY_CHANGE_EVENT,
        PLAYLIST_STOPPED_EVENT,
        CURRENT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import {PLAYBACK_STATE_CHANGE_EVENT,
         PLAYBACK_PROGRESS_EVENT,
         PLAYBACK_END_EVENT,
         ERROR_EVENT,
         AUDIO_CONTEXT_RESET_EVENT} from "audio/frontend/AudioManager";
import EventEmitter from "events";
import {noUndefinedGet, throttle} from "util";
import {URL, performance} from "platform/platform";
import {isTouchEvent} from "platform/dom/Page";
import {generateSilentWavFile} from "platform/LocalFileHandler";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";
import {ALL_FILES_PERSISTED_EVENT} from "metadata/MetadataManagerFrontend";
import PlaythroughTickCounter from "player/PlaythroughTickCounter";
import {IMAGE_DIMENSIONS} from "player/PlayerPictureManager";
import {TIMER_HEIGHT} from "player/PlayerTimeManager";
import {SNACKBAR_HEIGHT} from "ui/Snackbar";


export const PLAYBACK_RESUME_AFTER_IDLE_EVENT = `playbackResumeAfterIdle`;
export const PLAYBACK_PAUSE_EVENT = `pause`;
export const PLAYBACK_PLAY_EVENT = `play`;
export const PLAYBACK_STOP_EVENT = `stop`;
export const VOLUME_CHANGE_EVENT = `volumeChange`;
export const VOLUME_MUTE_EVENT = `muted`;
export const NEW_TRACK_LOAD_EVENT = `newTrackLoad`;
export const PROGRESS_EVENT = `progress`;
export const PLAYER_CONTROLLER_HEIGHT = IMAGE_DIMENSIONS + TIMER_HEIGHT + SNACKBAR_HEIGHT + 12;

const PLAYTHROUGH_COUNTER_THRESHOLD = 30;

const VOLUME_KEY = `volume`;
const MUTED_KEY = `muted`;
const CURRENT_TRACK_PROGRESS_KEY = `currentTrackProgress`;
const CURRENT_PLAYLIST_TRACK_KEY = `currentPlaylistTrack`;

export default class PlayerController extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
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
        this._domNode = this.page.$(opts.target);
        this._mediaFocusAudioElement = null;

        this._playButtonDomNode = this.$().find(opts.playButtonDom);
        this._previousButtonDomNode = this.$().find(opts.previousButtonDom);
        this._nextButtonDomNode = this.$().find(opts.nextButtonDom);

        this._progressLastPersisted = performance.now();
        this._lastPersistedProgressValue = -1;

        this._persistMute = throttle(this._persistMute, 500, this);
        this._persistVolume = throttle(this._persistVolume, 500, this);
        this.nextTrackChanged = this.nextTrackChanged.bind(this);

        this.$play().addEventListener(`click`, this.playButtonClicked.bind(this));
        this.$next().addEventListener(`click`, this.nextButtonClicked.bind(this));
        this.$previous().addEventListener(`click`, this.prevButtonClicked.bind(this));
        this.recognizerContext.createTapRecognizer(this.playButtonClicked.bind(this)).recognizeBubbledOn(this.$play());
        this.recognizerContext.createTapRecognizer(this.nextButtonClicked.bind(this)).recognizeBubbledOn(this.$next());
        this.recognizerContext.createTapRecognizer(this.prevButtonClicked.bind(this)).recognizeBubbledOn(this.$previous());
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));
        this.playlist.on(CURRENT_TRACK_CHANGE_EVENT, this.loadTrack.bind(this));
        this.playlist.on(PLAYLIST_STOPPED_EVENT, this.stop.bind(this));
        this.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.nextTrackChanged);
        this.playlist.on(HISTORY_CHANGE_EVENT, this.historyChanged.bind(this));
        this.metadataManager.on(ALL_FILES_PERSISTED_EVENT, this._persistTrack.bind(this));
        this.audioManager.on(PLAYBACK_STATE_CHANGE_EVENT, this._playbackStateChanged.bind(this));
        this.audioManager.on(PLAYBACK_PROGRESS_EVENT, this._playbackProgressed.bind(this));
        this.audioManager.on(PLAYBACK_END_EVENT, this._trackFinished.bind(this));
        this.audioManager.on(ERROR_EVENT, this._errored.bind(this));
        this.audioManager.on(AUDIO_CONTEXT_RESET_EVENT, this._audioContextReseted.bind(this));

        if (this.env.mediaSessionSupport()) {
            this._mediaFocusAudioElement = this.page.createElement(`audio`, {
                loop: true,
                controls: false,
                src: URL.createObjectURL(generateSilentWavFile())
            })[0];
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

    $next() {
        return this._nextButtonDomNode;
    }

    historyChanged() {
        this.checkButtonState();
    }

    nextTrackChanged() {
        this.checkButtonState();
    }

    nextTrackImplicitly() {
        this.playlist.next(false);
    }

    loadTrack(track, {isUserInitiatedSkip, initialProgress, resumeIfPaused}) {
        if (isUserInitiatedSkip && !this._tickCounter.hasTriggered() && this._loadedTrack) {
            this._loadedTrack.recordSkip();
        }
        this._tickCounter.reset();
        this._loadedTrack = track;
        this.audioManager.loadTrack(track, isUserInitiatedSkip, initialProgress);
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
        this.togglePlayback();
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

    getProgress() {
        const duration = this.audioManager.getDuration();
        if (!duration) return -1;
        const currentTime = this.audioManager.getCurrentTime();
        return Math.round((currentTime / duration) * 100) / 100;
    }

    setProgress(p) {
        if (this.isStopped || !this.audioManager.isSeekable()) return;
        p = Math.min(Math.max(p, 0), 1);
        const duration = this.audioManager.getDuration();
        if (!duration) return;
        this.seek(p * duration);
    }

    seek(seconds) {
        if (this.isStopped || !this.audioManager.isSeekable()) return;
        const maxSeek = this.audioManager.getDuration();
        if (!isFinite(maxSeek)) return;
        seconds = Math.max(0, Math.min(seconds, maxSeek));
        this.audioManager.setCurrentTime(seconds);
    }

    stop() {
        if (this.isStopped) return;
        this._loadedTrack = null;
        this._persistTrack();
        this.emit(PROGRESS_EVENT, 0, 0);
        if (!this.audioManager.isPaused()) {
            this.pause();
        } else {
            this._playbackStateChanged();
        }

    }

    pause() {
        this.audioManager.pause();
    }

    play() {
        if (this.isStopped) {
            if (!this.playlist.next(true)) {
                return;
            }
        }
        this.audioManager.resume();
    }

    togglePlayback() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    toggleMute() {
        if (this.isMuted()) {
            this.audioManager.setMuted(false);
            this.emit(VOLUME_MUTE_EVENT, false);
        } else {
            this.audioManager.setMuted(true);
            this.emit(VOLUME_MUTE_EVENT, true);
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
        return track.getDuration();
    }

    isMuted() {
        return this.audioManager.isMuted();
    }

    getVolume() {
        return this.audioManager.getVolume();
    }

    setVolume(val) {
        val = Math.min(Math.max(0, val), 1);
        this.audioManager.setVolume(val);
        this.emit(VOLUME_CHANGE_EVENT);
        this._persistVolume();
        return this;
    }

    _playbackStateChanged() {
        this.checkButtonState();
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        if (this.isStopped) {
            this._tickCounter.pause();
            this._callMediaFocusAction(`pause`);
            this.emit(PLAYBACK_STOP_EVENT);
        } else if (this.isPaused) {
            this._tickCounter.pause();
            this._callMediaFocusAction(`pause`);
            this.emit(PLAYBACK_PAUSE_EVENT);
        } else {
            this._callMediaFocusAction(`play`);
            this.emit(PLAYBACK_PLAY_EVENT);
        }
    }

    _errored(e) {
        if (this._loadedTrack) {
            this._loadedTrack.setError(e.message);
        }
        this.nextTrackImplicitly();
    }

    _trackFinished() {
        this.playlist.trackPlayedSuccessfully();
        this.nextTrackImplicitly();
    }

    _playbackProgressed(currentTime, totalTime) {
        if (!this._tickCounter.hasTriggered() &&
            this._loadedTrack && currentTime >= 5 && totalTime >= 10) {
            if (this._tickCounter.tick()) {
                this._loadedTrack.triggerPlaythrough();
            }
        }

        const now = performance.now();
        if (now - this._progressLastPersisted > 500 &&
            this._lastPersistedProgressValue !== this._getUnroundedProgress()) {
            this._progressLastPersisted = now;
            this._lastPersistedProgressValue = this._getUnroundedProgress();
            this._persistProgress();
        }

        this.emit(PROGRESS_EVENT, currentTime, totalTime);
    }


    async _callMediaFocusAction(method) {
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
            value: this.getVolume()
        });
        preferences.push({
            key: MUTED_KEY,
            value: this.isMuted()
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
        this.db.set(VOLUME_KEY, this.getVolume());
    }

    _persistMute() {
        this.db.set(MUTED_KEY, this.isMuted());
    }

    _getUnroundedProgress() {
        const duration = this.audioManager.getDuration();
        if (!duration) return 0;
        const currentTime = this.audioManager.getCurrentTime();
        return currentTime / duration;
    }

    _audioContextReseted() {
        this.emit(PLAYBACK_RESUME_AFTER_IDLE_EVENT);
    }
}
