import {NEXT_TRACK_CHANGE_EVENT,
        HISTORY_CHANGE_EVENT,
        PLAYLIST_STOPPED_EVENT,
        CURRENT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import withDeps from "ApplicationDependencies";
import AudioPlayer from "audio/frontend/AudioPlayer";
import AudioManager from "audio/frontend/AudioManager";
import EventEmitter from "events";
import {noUndefinedGet} from "util";
import {URL} from "platform/platform";
import {isTouchEvent} from "platform/dom/Page";
import {generateSilentWavFile} from "platform/LocalFileHandler";
import {MINIMUM_DURATION} from "audio/backend/demuxer";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";

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
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.rippler = deps.rippler;
        this.crossfadePreferencesBindingContext = deps.crossfadePreferencesBindingContext;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.gestureEducator = deps.gestureEducator;
        this.playlist = deps.playlist;
        this.metadataManager = deps.metadataManager;

        this._domNode = this.page.$(opts.target);

        this._playButtonDomNode = this.$().find(opts.playButtonDom);
        this._previousButtonDomNode = this.$().find(opts.previousButtonDom);
        this._nextButtonDomNode = this.$().find(opts.nextButtonDom);

        this.audioManagers = [];
        this.visualizerCanvas = null;
        this.currentAudioManager = null;
        this.volume = 0.15;
        this.isStopped = true;
        this.isPaused = false;
        this.isPlaying = false;
        this.isMutedValue = false;
        this.implicitLoading = false;
        this.queuedNextTrackImplicitly = false;
        this.pictureManager = null;
        this.mediaFocusAudioElement = null;
        this.audioPlayer = withDeps({
            page: this.page,
            env: this.env,
            db: this.db,
            dbValues: this.dbValues,
            crossfadePreferencesBindingContext: this.crossfadePreferencesBindingContext,
            effectPreferencesBindingContext: this.effectPreferencesBindingContext,
            applicationPreferencesBindingContext: this.applicationPreferencesBindingContext,
            workerWrapper: deps.workerWrapper,
            timers: deps.timers
        }, d => new AudioPlayer(d));

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

        this.ready = (async () => {
            await this.audioPlayer.ready();
            this.ready = null;
        })();

        if (this.env.mediaSessionSupport()) {
            this.mediaFocusAudioElement = this.page.createElement(`audio`, {
                loop: true,
                controls: false,
                src: URL.createObjectURL(generateSilentWavFile())
            })[0];

        }

        this.audioPlayer.on(`audioContextReset`, this.audioContextReset.bind(this));
        this.effectPreferencesBindingContext.on(`change`, this.effectPreferencesChanged.bind(this));
        this.crossfadePreferencesBindingContext.on(`change`, this.crossfadePreferencesChanged.bind(this));
        this.applicationPreferencesBindingContext.on(`change`, this.applicationPreferencesChanged.bind(this));
        this.globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));
        this._checkDbValues();
    }

    audioContextReset() {
        if (this.currentAudioManager) {
            this.currentAudioManager.audioContextReset();
        }
        this.emit(PLAYBACK_RESUME_AFTER_IDLE_EVENT);
    }

    effectPreferencesChanged() {
        this.forEachAudioManager((am) => {
            am.effectsChanged(this.effectPreferencesBindingContext);
        });
    }

    crossfadePreferencesChanged() {
        this.forEachAudioManager((am) => {
            am.crossfadingChanged(this.crossfadePreferencesBindingContext);
        });
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

    audioManagerDestroyed(audioManager) {
        const index = this.audioManagers.indexOf(audioManager);
        if (index >= 0) {
            this.audioManagers.splice(index, 1);
        }
        if (audioManager === this.currentAudioManager) {
            this.currentAudioManager = null;
            if (!this.playlist.getCurrentTrack() &&
                !this.playlist.getNextTrack() &&
                this.isPlaying) {
                this.stop();
            }
        }
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

        this.implicitLoading = true;
        if (!this.playlist.next(false)) {
            this.implicitLoading = false;
        }
    }

    audioManagerErrored(audioManager, e) {
        if (audioManager.track) {
            audioManager.track.setError(e.message);
        }
        this.destroyAudioManagers();
        this.currentAudioManager = null;
        this.nextTrackImplicitly();
    }

    getProgress() {
        if (!this.currentAudioManager) return -1;
        const duration = this.currentAudioManager.getDuration();
        if (!duration) return -1;
        const currentTime = this.currentAudioManager.getCurrentTime();
        return Math.round((currentTime / duration) * 100) / 100;
    }

    setProgress(p) {
        if (!this.currentAudioManager || !this.currentAudioManager.isSeekable()) return;
        p = Math.min(Math.max(p, 0), 1);
        const duration = this.currentAudioManager.getDuration();
        if (!duration) return;
        this.seek(p * duration);
    }

    seekIntent(p) {
        if (!this.currentAudioManager) return;
        p = Math.min(Math.max(p, 0), 1);
        const duration = this.currentAudioManager.getDuration();
        if (!duration) return;
        this.seek(p * duration, true);
    }

    getFadeInTimeForNextTrack() {
        const preferences = this.crossfadePreferencesBindingContext.preferences();
        const fadeInTime = preferences.getInTime();
        if (fadeInTime <= 0 || !preferences.getInEnabled()) return 0;

        const audioManager = this.currentAudioManager;

        if (!audioManager) return 0;

        const nextTrack = this.playlist.getNextTrack();
        if (!nextTrack) return 0;
        if (preferences.getShouldAlbumNotCrossFade() &&
            audioManager.track.comesBeforeInSameAlbum(nextTrack)) {
            return 0;
        }

        const duration = nextTrack.getDuration();
        return !duration ? fadeInTime
                         : Math.max(Math.min(duration - MINIMUM_DURATION - preferences.getOutTime(), fadeInTime), 0);
    }

    audioManagerSeekIntent(audioManager, time) {
        if (audioManager === this.currentAudioManager) {
            this.emit(PROGRESS_EVENT, time, audioManager.getDuration());
        }
    }

    trackFinished() {
        this.playlist.trackPlayedSuccessfully();
        this.nextTrackImplicitly();
    }

    audioManagerEnded(audioManager, haveGaplessPreloadPending) {
        if (audioManager === this.currentAudioManager) {
            const alreadyFinished = haveGaplessPreloadPending && !audioManager.hasGaplessPreload();
            if (!haveGaplessPreloadPending) {
                audioManager.destroy();
            }

            if (!alreadyFinished) {
                this.trackFinished();
                return true;
            }
        } else {
            audioManager.destroy();
        }
        return false;
    }

    audioManagerProgressed(audioManager, currentTime, totalTime, shouldHandleEnding) {
        if (audioManager === this.currentAudioManager) {
            const fadeInTime = this.getFadeInTimeForNextTrack();

            if (shouldHandleEnding &&
                (currentTime >= totalTime && totalTime > 0 && currentTime > 0) ||
                (fadeInTime > 0 && totalTime > 0 && currentTime > 0 && (totalTime - currentTime > 0) &&
                (totalTime - currentTime <= fadeInTime))) {
                this.trackFinished();
                return true;
            } else if (this.isPlaying && !this.globalEvents.isWindowBackgrounded()) {
                this.emit(PROGRESS_EVENT, currentTime, totalTime);
            }
        }
        return false;
    }

    getSampleRate() {
        const track = this.playlist.getCurrentTrack();
        if (!track) return 44100;
        return track.getSampleRate();
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPaused = true;
        this.isStopped = false;
        this.isPlaying = false;
        this.forEachAudioManager((am) => {
            am.pause();
        });
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
            this.playlist.playFirst();
            return;
        }

        this.emit(TRACK_PLAYING_EVENT);
        this.isPaused = false;
        this.isStopped = false;
        this.isPlaying = true;
        this.forEachAudioManager((am) => {
            am.updateSchedules();
            am.resume();
        });
        this.startedPlay();
    }

    stop() {
        if (this.isStopped) return;
        this.isStopped = true;
        this.isPaused = false;
        this.isPlaying = false;
        this.currentAudioManager = null;
        this.destroyAudioManagers();
        this.playlist.stop();
        this.emit(PROGRESS_EVENT, 0, 0);
        this.stoppedPlay();
    }

    async loadTrack(track, isUserInitiatedSkip) {
        if (this.ready) {
            const id = ++loadId;
            await this.ready;
            if (id !== loadId) {
                return;
            }
        }
        ++loadId;

        if (isUserInitiatedSkip &&
            this.currentAudioManager &&
            !this.currentAudioManager.hasPlaythroughBeenTriggered()) {

            if (this.currentAudioManager.track) {
                this.currentAudioManager.track.recordSkip();
            }
        }

        this.isStopped = false;
        this.isPlaying = true;
        this.isPaused = false;

        const implicit = this.implicitLoading;
        if (implicit) {
            this.implicitLoading = false;
        } else {
            this.destroyAudioManagers(this.currentAudioManager);
        }

        // Should never be true but there are too many moving parts to figure it out.
        if (this.currentAudioManager && this.currentAudioManager.destroyed) {
            this.currentAudioManager = null;
        }


        const explicit = !implicit;
        if (this.currentAudioManager &&
            (explicit || this.currentAudioManager.hasGaplessPreload())) {
            this.currentAudioManager.replaceTrack(track, explicit);
            this.startedPlay();
            this.emit(TRACK_PLAYING_EVENT);
            this.emit(NEW_TRACK_LOAD_EVENT, track);
            return;
        }

        if (this.currentAudioManager) {
            this.currentAudioManager.background();
        }
        this.currentAudioManager = new AudioManager(this, track, implicit);
        this.audioManagers.push(this.currentAudioManager);
        this.startedPlay();
        this.emit(TRACK_PLAYING_EVENT);
        this.emit(NEW_TRACK_LOAD_EVENT, track);
        this.currentAudioManager.start();
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
        if (isTouchEvent(e)) {
            this.gestureEducator.educate(`playpause`);
        }
    }

    checkButtonState() {
        this.$allButtons().addClass(`disabled`);

        if (this.playlist.getNextTrack()) {
            this.$next().removeClass(`disabled`);
        }

        if (this.playlist.hasHistory()) {
            this.$previous().removeClass(`disabled`);
        }

        if (!this.isStopped) {
            this.$play().removeClass(`disabled`);
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

            if (this.playlist.getNextTrack()) {
                this.$play().removeClass(`disabled`);
            }
        }

    }

    startedPlay() {
        this.checkButtonState();
        if (this.mediaFocusAudioElement) {
            try {
                this.mediaFocusAudioElement.play();
            } catch (e) {
                this.env.logError(e);
            }
        }
        this.emit(PLAYBACK_PLAY_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
    }

    stoppedPlay() {
        this.checkButtonState();
        if (this.mediaFocusAudioElement) {
            try {
                this.mediaFocusAudioElement.pause();
            } catch (e) {
                this.env.logError(e);
            }
        }
        this.emit(PLAYBACK_STOP_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
    }

    pausedPlay() {
        this.checkButtonState();
        if (this.mediaFocusAudioElement) {
            this.mediaFocusAudioElement.pause();
        }
        this.emit(PLAYBACK_PAUSE_EVENT);
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
    }

    seek(seconds, intent) {
        if (!this.isPlaying && !this.isPaused) return;
        if (!this.currentAudioManager || !this.currentAudioManager.isSeekable()) return;
        const maxSeek = this.currentAudioManager.getDuration();
        if (!isFinite(maxSeek)) return;
        seconds = Math.max(0, Math.min(seconds, maxSeek));

        if (intent) {
            this.currentAudioManager.seekIntent(seconds);
        } else {
            this.currentAudioManager.seek(seconds);
        }
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
            this.forEachAudioManager((am) => {
                am.mute();
            });
        } else {
            this.emit(VOLUME_MUTE_EVENT, false);
            this.forEachAudioManager((am) => {
                am.unmute();
            });
        }
    }

    getDuration() {
        if (!this.currentAudioManager) throw new Error(`cannot get duration no audioManager`);
        return this.currentAudioManager.getDuration();
    }

    getProbableDuration() {
        if (!this.currentAudioManager) throw new Error(`cannot get duration no audioManager`);
        const ret = this.currentAudioManager.getDuration();
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
        this.forEachAudioManager((am) => {
            am.updateVolume(volume);
        });
        this.emit(VOLUME_CHANGE_EVENT);
        return this;
    }

    async _checkDbValues() {
        await Promise.all([this.ready, this.metadataManager.ready()]);


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
            const startedToPlayTrack = await this.playlist.playSerializedPlaylistTrack(serializedPlaylistTrack);
            if (startedToPlayTrack) {
                const {currentAudioManager} = this;
                await currentAudioManager.durationKnown();
                this.pause();
                if (CURRENT_TRACK_PROGRESS_KEY in this.dbValues) {
                    this.setProgress(this.dbValues[CURRENT_TRACK_PROGRESS_KEY]);
                    this.emit(PROGRESS_EVENT,
                              currentAudioManager.getCurrentTime(),
                              currentAudioManager.getDuration());
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

        if (playlistTrack && !playlistTrack.isDummy() && this.metadataManager.areAllFilesPersisted()) {
            preferences.push({
                key: CURRENT_PLAYLIST_TRACK_KEY,
                value: playlistTrack.toJSON()
            });

            preferences.push({
                key: CURRENT_TRACK_PROGRESS_KEY,
                value: this.getProgress()
            });
        }
    }

    // Supports deletion mid-iteration.
    forEachAudioManager(fn) {
        let currentLength = this.audioManagers.length;
        for (let i = 0; i < this.audioManagers.length; ++i) {
            fn.call(this, this.audioManagers[i], i, this.audioManagers);
            // Deleted from the array.
            if (currentLength > this.audioManagers.length) {
                i -= (currentLength - this.audioManagers.length);
                currentLength = this.audioManagers.length;
            }
        }
    }

    destroyAudioManagers(exceptThisOne) {
        this.forEachAudioManager((am) => {
            if (am !== exceptThisOne) {
                am.destroy();
            }
        });
    }

    getAudioContext() {
        return this.audioPlayer.getAudioContext();
    }
}
