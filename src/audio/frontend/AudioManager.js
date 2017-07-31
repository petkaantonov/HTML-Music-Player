import {NEXT_TRACK_CHANGE_EVENT} from "player/PlaylistController";
import {roundSampleTime, ensureArray} from "util";
import {AudioContext, performance, Float32Array} from "platform/platform";
import {PLAYER_READY_EVENT_NAME,
        BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER,
        BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER} from "audio/backend/AudioPlayerBackend";
import WorkerFrontend from "WorkerFrontend";
import {WEB_AUDIO_BLOCK_SIZE,
        SUSTAINED_BUFFERED_AUDIO_RATIO,
        MIN_SUSTAINED_AUDIO_SECONDS} from "audio/frontend/buffering";
import {cancelAndHold} from "platform/audio";
import SourceDescriptor from "audio/frontend/SourceDescriptor";

export const FADE_MINIMUM_VOLUME = 0.2;
export const CURVE_LENGTH = 8;
export const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);
export const PLAYBACK_STATE_CHANGE_EVENT = `playbackStateChange`;
export const PLAYBACK_PROGRESS_EVENT = `playbackProgress`;
export const PLAYBACK_END_EVENT = `playbackEnd`;
export const ERROR_EVENT = `error`;
export const AUDIO_CONTEXT_RESET_EVENT = `audioContextReset`;

const SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS = 20;
const MAX_DIFFERENT_AUDIO_BUFFER_KEYS = 10;
const SEEK_FADE_TIME = 0.2;
const TRACK_CHANGE_FADE_TIME = 0.2;
const PAUSE_RESUME_FADE_TIME = 0.4;
const MUTE_UNMUTE_FADE_TIME = 0.4;
const VOLUME_RATIO = 2;

function getCurve(v0, v1) {
    const t0 = 0;
    const t1 = CURVE_LENGTH;
    const ret = CURVE_HOLDER;
    for (let t = t0; t <= t1; ++t) {
        const value = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
        ret[t] = value;
    }
    return ret;
}

function getFadeOutCurve(startValue) {
    return getCurve(startValue, FADE_MINIMUM_VOLUME);
}

function getFadeInCurve() {
    return getCurve(FADE_MINIMUM_VOLUME, 1);
}

function audioBufferCacheKey(channelCount, sampleRate) {
    return `${channelCount}-${sampleRate}`;
}

function lruCmp(a, b) {
    return b.lastUsed - a.lastUsed;
}

export default class AudioManager extends WorkerFrontend {
    constructor(deps) {
        super(PLAYER_READY_EVENT_NAME, deps.workerWrapper);
        this.playlist = deps.playlist;
        this.page = deps.page;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.timers = deps.timers;

        this._nextTrackChangedWhilePreloading = this._nextTrackChangedWhilePreloading.bind(this);
        this._suspend = this._suspend.bind(this);
        this._timeUpdate = this._timeUpdate.bind(this);
        this._sourceEnded = this._sourceEnded.bind(this);
        this._ended = this._ended.bind(this);

        this._audioContext = null;
        this._unprimedAudioContext = null;
        this._silentBuffer = null;
        this._outputSampleRate = -1;
        this._outputChannelCount = -1;
        this._scheduleAheadTime = -1;
        this._volumeValue = 0.15;
        this._mutedValue = false;
        this._paused = true;
        this._preloadingTrack = null;
        this._bufferFrameCount = 0;
        this._playedAudioBuffersNeededForVisualization = 0;
        this._loadingNext = false;
        this._sourceStopped = true;
        this._fadeInOutNode = null;
        this._volumeNode = null;
        this._currentTime = 0;
        this._baseTime = 0;
        this._duration = 0;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;
        this._lastBufferLoadedHandled = false;
        this._endedEmitted = false;
        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._previousUpcomingSamplesTime = -1;
        this._timeUpdateEmittedCurrentTime = -1;
        this._timeUpdateEmittedDuration = -1;
        this._preloadedNextTrackArgs = null;
        this._sourceDescriptorQueue = [];
        this._playedSourceDescriptors = [];
        this._backgroundSourceDescriptors = [];
        this._audioBufferTime = -1;
        this._audioBufferCache = new Map();
        this._audioBufferCacheKeys = [];
        this._suspensionTimeoutMs = SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS * 1000;
        this._currentStateModificationAction = null;
        this._lastAudioContextRefresh = 0;
        this._targetBufferLengthSeconds = -1;
        this._sustainedBufferedAudioSeconds = -1;
        this._sustainedBufferCount = -1;
        this._minBuffersToRequest = -1;
        this._suspensionTimerStartedTime = performance.now();

        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
        this._timeUpdater = this.page.setInterval(this._timeUpdate, 100);
        this.effectPreferencesBindingContext.on(`change`, this._effectPreferencesChanged.bind(this));
        this.applicationPreferencesBindingContext.on(`change`, this._applicationPreferencesChanged.bind(this));
        this.page.addDocumentListener(`touchend`, this._touchended.bind(this), true);

        this._resetAudioContext();
        this._initBackend();
        Object.seal(this);
    }

    isSeekable() {
        return !this._lastBufferLoadedHandled && !this._loadingNext;
    }

    isPaused() {
        return this._paused;
    }

    resume() {
        if (!this.isPaused()) {
            return;
        }
        this._paused = false;
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        this._checkAudioContextStaleness();

        if (this._sourceDescriptorQueue.length > 0 && this._sourceStopped) {
            this._clearSuspensionTimer();
            const scheduledStartTime = Math.max(this._getAudioContextTimeScheduledAhead(), this._fadeOutEnded);
            this._startSources(scheduledStartTime);
            this._maybeFadeIn(SEEK_FADE_TIME, scheduledStartTime);
        }
        this._emitPlaybackProgress(this._currentTime, this._duration);
    }

    pause() {
        if (this.isPaused()) {
            return;
        }
        this._paused = true;
        this.emit(PLAYBACK_STATE_CHANGE_EVENT);
        if (this._maybeFadeOut(PAUSE_RESUME_FADE_TIME)) {
            this._stopSources(this._fadeOutEnded);
        } else {
            this._stopSources();
        }
    }

    getVolume() {
        return this._volumeValue;
    }

    isMuted() {
        return this._mutedValue;
    }

    setVolume(volume) {
        this._volumeValue = volume;
        this._volumeChanged(this._mutedValue, this._mutedValue);
    }

    setMuted(muted) {
        const prev = this._mutedValue;
        this._mutedValue = muted;
        this._volumeChanged(prev, muted);
    }

    getAudioLatency() {
        return (this._audioContext.baseLatency || 0) +
                (this._audioContext.outputLatency || 0);
    }

    loadTrack(track, isUserInitiatedSkip, initialProgress = 0) {
        this.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this._nextTrackChangedWhilePreloading);
        const {_preloadingTrack} = this;
        this._preloadingTrack = null;

        if (track === _preloadingTrack && this._hasPreloadedNextTrack()) {
            const args = this._preloadedNextTrackArgs;
            this._preloadedNextTrackArgs = null;
            this._applyTrackInfo(args);
        } else {
            this._load(track.getFileReference(), false, initialProgress);
        }
    }

    setCurrentTime(time) {
        if (!this.isSeekable()) {
            return;
        }
        time = Math.max(0, time);
        time = Math.min(this._getMaximumSeekTime(this._duration), time);

        this._currentTime = time;
        this._baseTime = this._currentTime - this._getCurrentAudioBufferBaseTimeDelta();
        this._timeUpdate();
        time = this._currentTime;
        const bufferFillCount = this._getSustainedBufferCount();
        this._message(`seek`, {bufferFillCount, time});
    }

    getCurrentTime() {
        return this._currentTime;
    }

    getDuration() {
        return this._duration;
    }

    receiveMessage(event) {
        const {methodName, args, transferList} = event.data;
        this[methodName](args, transferList);
    }

    getSamplesScheduledAtOffsetRelativeToNow(channelData, offsetSeconds = 0) {
        const ret = {
            sampleRate: 44100,
            channelCount: channelData.length,
            channelDataFilled: false
        };

        if (this._sourceStopped) {
            return ret;
        }
        const timestamp = this._audioContext.getOutputTimestamp();
        let currentTime = timestamp.contextTime;
        const hr = timestamp.performanceTime;
        const prevHr = this._previousHighResTime;

        // Workaround for bad values from polyfill
        if (currentTime === this._previousAudioContextTime) {
            const reallyElapsed = Math.round(((hr - prevHr) * 1000)) / 1e6;
            currentTime += reallyElapsed;
            this._previousCombinedTime = currentTime;
        } else {
            this._previousAudioContextTime = currentTime;
            this._previousHighResTime = hr;
        }

        if (currentTime < this._previousCombinedTime) {
            currentTime = this._previousCombinedTime + Math.round(((hr - prevHr) * 1000)) / 1e6;
        }

        if (!this._sourceDescriptorQueue.length) {
            return ret;
        }

        const targetStartTime = currentTime + offsetSeconds;
        if (targetStartTime < 0) {
            return ret;
        }

        const [nextSourceDescriptor] = this._sourceDescriptorQueue;
        const {sampleRate, channelCount} = nextSourceDescriptor;
        const duration = channelData[0].length / sampleRate;
        let lowerBoundSourceDescriptor, upperBoundSourceDescriptor;

        // Assume `duration` is always less than bufferDuration. Which it is.
        if (duration > this._getBufferDuration()) {
            self.uiLog(`duration > this._getBufferDuration() ${duration} ${this._getBufferDuration()}`);
            return ret;
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            const sourceDescriptor = this._playedSourceDescriptors[i];
            if (sourceDescriptor.started <= targetStartTime && targetStartTime <= sourceDescriptor.stopped) {
                lowerBoundSourceDescriptor = sourceDescriptor;

                if (targetStartTime + duration <= sourceDescriptor.stopped) {
                    upperBoundSourceDescriptor = sourceDescriptor;
                } else if (i + 1 < this._playedSourceDescriptors.length) {
                    upperBoundSourceDescriptor = this._playedSourceDescriptors[i + 1];
                }
                break;
            }
        }

        if (!lowerBoundSourceDescriptor || !upperBoundSourceDescriptor) {
            for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
                const sourceDescriptor = this._sourceDescriptorQueue[i];
                if (!lowerBoundSourceDescriptor &&
                    sourceDescriptor.started <= targetStartTime && targetStartTime <= sourceDescriptor.stopped) {
                    lowerBoundSourceDescriptor = sourceDescriptor;
                    if (targetStartTime + duration <= sourceDescriptor.stopped) {
                        upperBoundSourceDescriptor = lowerBoundSourceDescriptor;
                    } else if (i + 1 < this._sourceDescriptorQueue.length) {
                        upperBoundSourceDescriptor = this._sourceDescriptorQueue[i + 1];
                    } else {
                        return ret;
                    }
                    break;
                }

                if (lowerBoundSourceDescriptor && !upperBoundSourceDescriptor) {
                    upperBoundSourceDescriptor = this._sourceDescriptorQueue[i];
                    break;
                }
            }
        }

        if (!lowerBoundSourceDescriptor || !upperBoundSourceDescriptor) {
            return ret;
        }

        ret.sampleRate = sampleRate;
        ret.channelCount = channelCount;

        const length = duration * sampleRate | 0;
        const bufferLength = lowerBoundSourceDescriptor.duration * sampleRate | 0;
        let offset;
        if (lowerBoundSourceDescriptor === upperBoundSourceDescriptor) {
            offset = (targetStartTime - lowerBoundSourceDescriptor.started) * sampleRate | 0;
            const {audioBuffer} = lowerBoundSourceDescriptor;

                for (let ch = 0; ch < channelData.length; ++ch) {
                    audioBuffer.copyFromChannel(channelData[ch], ch, offset);
                }

        } else {
            offset = (lowerBoundSourceDescriptor.duration -
                            (lowerBoundSourceDescriptor.stopped - targetStartTime)) * sampleRate | 0;
            let {audioBuffer} = lowerBoundSourceDescriptor;

            for (let ch = 0; ch < channelData.length; ++ch) {
                audioBuffer.copyFromChannel(channelData[ch], ch, offset);
            }
            ({audioBuffer} = upperBoundSourceDescriptor);
            const samplesCopied = bufferLength - offset;
            const remainingLength = length - samplesCopied;
            for (let ch = 0; ch < channelData.length; ++ch) {
                const dst = new Float32Array(channelData[ch].buffer,
                                             samplesCopied * 4,
                                             remainingLength);
                audioBuffer.copyFromChannel(dst, ch, 0);
            }
        }

        ret.channelDataFilled = true;
        return ret;
    }

    createAudioBuffer(channelCount, length, sampleRate) {
        const key = audioBufferCacheKey(channelCount, sampleRate);
        const {_audioBufferCacheKeys, _audioBufferCache} = this;
        const lastUsed = performance.now();
        let keyExists = false;

        for (let i = 0; i < _audioBufferCacheKeys.length; ++i) {
            if (_audioBufferCacheKeys[i].key === key) {
                _audioBufferCacheKeys[i].lastUsed = lastUsed;
                keyExists = true;
                break;
            }
        }

        if (!keyExists) {
            const entry = {key, lastUsed};
            if (_audioBufferCacheKeys.length >= MAX_DIFFERENT_AUDIO_BUFFER_KEYS) {
                _audioBufferCacheKeys.sort(lruCmp);
                const removedKey = _audioBufferCacheKeys.pop().key;
                _audioBufferCache.delete(removedKey);
            }
            _audioBufferCacheKeys.push(entry);
            _audioBufferCache.set(key, []);
        }

        const audioBuffers = _audioBufferCache.get(key);
        if (!audioBuffers.length) {
            return this._audioContext.createBuffer(channelCount, length, sampleRate);
        } else {
            while (audioBuffers.length > 0) {
                const audioBuffer = audioBuffers.pop();
                if (audioBuffer.length === length) {
                    return audioBuffer;
                }
            }
            return this._audioContext.createBuffer(channelCount, length, sampleRate);
        }
    }

    freeAudioBuffer(audioBuffer) {
        const {numberOfChannels, sampleRate} = audioBuffer;
        const key = audioBufferCacheKey(numberOfChannels, sampleRate);
        this._audioBufferCache.get(key).push(audioBuffer);
    }

    _getCrossfadeDuration() {
        return this.effectPreferencesBindingContext.getCrossfadeDuration();
    }

    _getSustainedBufferCount() {
        return this._sustainedBufferCount;
    }

    _getMinBuffersToRequest() {
        return this._minBuffersToRequest;
    }

    _getScheduleAheadTime() {
        return this._scheduleAheadTime;
    }

    _getMaximumSeekTime(duration) {
        return Math.max(0, duration - (this._audioBufferTime + (2048 / this._audioContext.sampleRate)));
    }

    _getBufferDuration() {
        return this._audioBufferTime;
    }

    _lastBufferLoaded(descriptor) {
        if (!this._lastBufferLoadedHandled) {
            this._lastBufferLoadedHandled = true;
            if (descriptor.endTime < this._duration - this._getBufferDuration() - this._getCrossfadeDuration()) {
                this._duration = descriptor.endTime;
                this._emitPlaybackProgress(this._currentTime, this._duration);
            }

            if (this.playlist.getNextTrack() && !this._isPreloadingNextTrack()) {
                this.playlist.on(NEXT_TRACK_CHANGE_EVENT, this._nextTrackChangedWhilePreloading);
                this._updatePreloadTrack();
            }
        }
    }

    _hasPreloadedNextTrack() {
        return this._preloadedNextTrackArgs !== null;
    }

    _volume() {
        if (this._mutedValue) {
            return 0;
        }
        return this._volumeValue * VOLUME_RATIO;
    }

    _volumeChanged(previousMuted, currentMuted) {
        if (previousMuted !== currentMuted) {
            let scheduledTime;
            if (previousMuted) {
                scheduledTime = this._unmuteRequested();
            } else {
                scheduledTime = this._muteRequested();
            }
            this._volumeNode.gain.cancelScheduledValues(scheduledTime);
            this._volumeNode.gain.setValueAtTime(this._volume(), scheduledTime);
        } else if (!this._mutedValue) {
            this._volumeNode.gain.cancelScheduledValues(this._getAudioContextCurrentTime());
            this._volumeNode.gain.value = this._volume();
        }
    }

    _updatePreloadTrack() {
        this._preloadingTrack = this.playlist.getNextTrack();
        if (this._preloadingTrack) {
            this._load(this._preloadingTrack.getFileReference(), true);
        }
    }

    _nextTrackChangedWhilePreloading() {
        this._updatePreloadTrack();
    }

    _bufferFrameCountForSampleRate(sampleRate) {
        return this._targetBufferLengthSeconds * sampleRate;
    }

    _isPreloadingNextTrack() {
        return !!this._preloadingTrack;
    }

    async _effectPreferencesChanged() {
        await this.ready();
        this._updateBackendConfig({
            effects: ensureArray(this.effectPreferencesBindingContext.getAudioPlayerEffects()),
            crossfadeDuration: this._getCrossfadeDuration()
        });
    }

    async _applicationPreferencesChanged() {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferences();
        this._setBufferSize(preferences.getBufferLengthMilliSeconds());
        this._updateBackendConfig({
            loudnessNormalization: preferences.getEnableLoudnessNormalization(),
            silenceTrimming: preferences.getEnableSilenceTrimming()
        });
    }

    async _touchended() {
        if (this._unprimedAudioContext) {
            const audioCtx = this._unprimedAudioContext;
            try {
                await audioCtx.resume();
            } catch (e) {
                // Noop
            }

            const source = audioCtx.createBufferSource();
            source.buffer = this._silentBuffer;
            source.connect(audioCtx.destination);
            source.start(0);
            this._unprimedAudioContext = null;
        }
    }

    async _updateBackendConfig(config) {
        await this.ready();
        this._message(`audioConfiguration`, config);
    }

    async _initBackend() {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferences();
        this._updateBackendConfig({
            loudnessNormalization: preferences.getEnableLoudnessNormalization(),
            silenceTrimming: preferences.getEnableSilenceTrimming(),
            effects: ensureArray(this.effectPreferencesBindingContext.getAudioPlayerEffects()),
            crossfadeDuration: this._getCrossfadeDuration()
        });
    }

    _resetAudioContext() {
        const oldAudioContextTime = this._audioContext ? this._audioContext.currentTime : 0;
        try {
            if (this._audioContext) {
                this._audioContext.close();
            }
        } catch (e) {
            // NOOP
        } finally {
            this._audioContext = null;
        }
        const audioContext = this._audioContext = new AudioContext({latencyHint: `playback`});
        this._unprimedAudioContext = this._audioContext;

        const {channelCount} = audioContext.destination;
        const {sampleRate} = audioContext;

        if (this._setAudioOutputParameters({channelCount, sampleRate})) {
            this._setBufferSize(this.applicationPreferencesBindingContext.preferences().getBufferLengthMilliSeconds());
        }

        this._volumeNode = audioContext.createGain();
        this._fadeInOutNode = audioContext.createGain();
        this._fadeInOutNode.connect(this._volumeNode);
        this._volumeNode.connect(audioContext.destination);

        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._previousUpcomingSamplesTime = -1;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        const timeDiff = audioContext.currentTime - oldAudioContextTime;

        const sourceDescriptors = this._sourceDescriptorQueue;

        let lowestOriginalTime = Infinity;
        for (let i = 0; i < sourceDescriptors.length; ++i) {
            const sourceDescriptor = sourceDescriptors[i];
            if (sourceDescriptor.started !== -1) {
                lowestOriginalTime = Math.min(sourceDescriptor.started, lowestOriginalTime, sourceDescriptor.stopped);
            }
        }

        for (let i = 0; i < sourceDescriptors.length; ++i) {
            sourceDescriptors[i].readjustTime(timeDiff, lowestOriginalTime);
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            this._playedSourceDescriptors[i].started = this._playedSourceDescriptors[i].stopped = -1;
        }

        this.emit(AUDIO_CONTEXT_RESET_EVENT);
        this._volumeChanged(this._mutedValue, this._mutedValue);
    }

    _setAudioOutputParameters({sampleRate, channelCount}) {
        let changed = false;
        if (this._outputSampleRate !== sampleRate) {
            this._outputSampleRate = sampleRate;
            changed = true;
        }
        if (this._outputChannelCount !== channelCount) {
            this._outputChannelCount = channelCount;
            changed = true;
        }
        this._scheduleAheadTime = Math.max(this._scheduleAheadTime,
                                           roundSampleTime(WEB_AUDIO_BLOCK_SIZE * 8, sampleRate) / sampleRate);
        return changed;
    }

    async _setBufferSize(bufferLengthMilliSecondsPreference) {
        if (this._targetBufferLengthSeconds / 1000 === bufferLengthMilliSecondsPreference) {
            return;
        }
        const sampleRate = this._outputSampleRate;
        const channelCount = this._outputChannelCount;
        this._targetBufferLengthSeconds = bufferLengthMilliSecondsPreference / 1000;
        this._sustainedBufferedAudioSeconds = Math.max(MIN_SUSTAINED_AUDIO_SECONDS,
                                                     this._targetBufferLengthSeconds * SUSTAINED_BUFFERED_AUDIO_RATIO);
        this._sustainedBufferCount = Math.ceil(this._sustainedBufferedAudioSeconds / this._targetBufferLengthSeconds);
        this._minBuffersToRequest = Math.ceil(this._sustainedBufferCount / 4);
        this._bufferFrameCount = this._bufferFrameCountForSampleRate(this._outputSampleRate);
        this._audioBufferTime = this._bufferFrameCount / this._outputSampleRate;
        this._playedAudioBuffersNeededForVisualization = Math.ceil(this.getAudioLatency() / this._audioBufferTime) + 1;

        if (!this._silentBuffer) {
            this._silentBuffer = this._audioContext.createBuffer(channelCount, this._bufferFrameCount, sampleRate);
        }
        await this._updateBackendConfig({bufferTime: this._audioBufferTime});
    }

    _suspend() {
        if (this._audioContext.state === `suspended`) return Promise.resolve();

        if (!this._currentStateModificationAction) {
            this._currentStateModificationAction = {
                type: `suspend`,
                promise: (async () => {
                    try {
                        await Promise.resolve(this._audioContext.suspend());
                    } finally {
                        this._currentStateModificationAction = null;
                    }
                })()
            };
            return this._currentStateModificationAction.promise;
        } else if (this._currentStateModificationAction.type === `resume`) {
            this._currentStateModificationAction.promise = (async () => {
                try {
                    try {
                        await this._currentStateModificationAction.promise;
                    } finally {
                        await this._suspend();
                    }
                } finally {
                    this._currentStateModificationAction = null;
                }
            })();
        }
        return this._currentStateModificationAction.promise;
    }

    _clearSuspensionTimer() {
        this._suspensionTimerStartedTime = -1;
        this.page.clearTimeout(this._suspensionTimeoutId);
        this._suspensionTimeoutId = -1;
    }

    _message(action, args) {
        this.postMessage({action, args});
    }

    _getAudioContextCurrentTime() {
        return this._audioContext.currentTime;
    }

    _getCurrentAudioBufferBaseTimeDelta(now) {
        const sourceDescriptor = this._sourceDescriptorQueue[0];
        if (!sourceDescriptor) return 0;
        if (now === undefined) now = this._getAudioContextCurrentTime();
        const {started} = sourceDescriptor;
        if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
            return 0;
        }

        if (this._paused || this._sourceStopped) return 0;
        return Math.min((now - started) + sourceDescriptor.playedSoFar, this._getBufferDuration());
    }

    _load(fileReference, isPreloadForNextTrack, progress = 0) {
        this._loadingNext = true;
        this._preloadedNextTrackArgs = null;
        if (!isPreloadForNextTrack) {
            this._endedEmitted = false;
        }
        const bufferFillCount = this._getSustainedBufferCount();
        this._message(`load`, {fileReference, isPreloadForNextTrack, bufferFillCount, progress});
    }

    _checkAudioContextStaleness() {
        if (this._audioContext.state === `running`) {
            if (this._suspensionTimerStartedTime !== -1 &&
                performance.now() - this._suspensionTimerStartedTime > this._suspensionTimeoutMs) {
                this._suspensionTimerStartedTime = -1;
                this._resetAudioContext();
            }
            return;
        }

        // Reset AudioContext as it's probably ruined despite of suspension efforts.
        if (!this._currentStateModificationAction) {
            this._resetAudioContext();
        } else if (this._currentStateModificationAction.type === `suspend`) {
            this._currentStateModificationAction = null;
            this._resetAudioContext();
        }
    }

    _startSuspensionTimer() {
        this._clearSuspensionTimer();
        this._suspensionTimerStartedTime = performance.now();
        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
    }

    _getAudioContextTimeScheduledAhead() {
        return this._getScheduleAheadTime() + this._getAudioContextCurrentTime();
    }

    _muteRequested() {
        if (this._maybeFadeOut(MUTE_UNMUTE_FADE_TIME)) {
            return this._fadeOutEnded;
        } else {
            return this._getAudioContextCurrentTime();
        }
    }

    _unmuteRequested() {
        const scheduledStartTime = Math.max(this._fadeOutEnded, this._getAudioContextTimeScheduledAhead());
        if (this._maybeFadeIn(MUTE_UNMUTE_FADE_TIME, scheduledStartTime)) {
            return this._fadeInStarted;
        } else {
            return scheduledStartTime;
        }
    }

    _timeUpdate() {
        if (this._loadingNext) return;
        const currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
        const currentTime = this._baseTime + currentBufferPlayedSoFar;
        this._currentTime = Math.min(this._duration, currentTime);
        this._emitPlaybackProgress(this._currentTime, this._duration);
        if (currentTime > 0 && this._duration > 0 && currentTime >= (this._duration - this._getCrossfadeDuration())) {
            this._ended();
        }
    }

    _emitPlaybackProgress(currentTime, duration) {
        if (this._timeUpdateEmittedCurrentTime === currentTime &&
            this._timeUpdateEmittedDuration === duration) {
            return;
        }
        this._timeUpdateEmittedDuration = duration;
        this._timeUpdateEmittedCurrentTime = currentTime;
        this.emit(PLAYBACK_PROGRESS_EVENT, currentTime, duration);
    }

    _ended() {
        if (this._endedEmitted || this._loadingNext) return;
        this._endedEmitted = true;
        this.playlist.removeListener(NEXT_TRACK_CHANGE_EVENT, this._nextTrackChangedWhilePreloading);
        this._currentTime = this._duration;
        this._emitPlaybackProgress(this._currentTime, this._duration);
        this._startSuspensionTimer();
        this.emit(PLAYBACK_END_EVENT);
    }

    _decodingLatency(decodingLatency) {
        this.applicationPreferencesBindingContext.decodingLatencyValue(decodingLatency);
    }

    _requestMoreBuffers() {
        if (this._sourceDescriptorQueue.length < this._getSustainedBufferCount()) {
            const bufferFillCount = this._getSustainedBufferCount() - this._sourceDescriptorQueue.length;
            if (bufferFillCount >= this._getMinBuffersToRequest()) {
                this._message(`fillBuffers`, {bufferFillCount});
            }
        }
    }

    _seekCompleted(scheduledStartTime) {
        this._maybeFadeIn(SEEK_FADE_TIME, scheduledStartTime);
    }

    _firstBufferFromDifferentTrackLoaded(scheduledStartTime) {
        this._maybeFadeIn(TRACK_CHANGE_FADE_TIME, scheduledStartTime);
    }

    _applySeekInfo(baseTime) {
        this._baseTime = baseTime;
        this._lastBufferLoadedHandled = false;
        this._endedEmitted = false;
        this._timeUpdate();
    }

    _applyTrackInfo({demuxData, baseTime}) {
        this._duration = demuxData.duration;
        this._applySeekInfo(baseTime);
    }

    _maybeFadeOut(time, ctxTime = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const param = this._fadeInOutNode.gain;
            let startValue = param.value;
            if (startValue < 1) {
                const t0 = this._fadeInStarted;
                const t1 = t0 + this._fadeInStartedWithLength;
                const t = ctxTime;
                if (t0 < t && t < t1) {
                    const v0 = FADE_MINIMUM_VOLUME;
                    const v1 = 1;
                    startValue = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
                }
            }
            cancelAndHold(param, ctxTime);
            const curve = getFadeOutCurve(startValue);
            try {
                param.setValueCurveAtTime(curve, ctxTime, time);
            } catch (e) {
                return false;
            }
            this._fadeOutEnded = ctxTime + time;
            return true;
        }
        return false;
    }

    _maybeFadeIn(time, ctxTime = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const curve = getFadeInCurve();
            try {
                this._fadeInOutNode.gain.setValueCurveAtTime(curve, ctxTime, time);
            } catch (e) {
                return false;
            }
            this._fadeInStarted = ctxTime;
            this._fadeInStartedWithLength = time;
            return true;
        }
        return false;
    }

    _lastSourceEnds() {
        if (this._sourceStopped) throw new Error(`sources are stopped`);
        if (this._sourceDescriptorQueue.length === 0) return this._getAudioContextCurrentTime();
        const sourceDescriptor = this._sourceDescriptorQueue[this._sourceDescriptorQueue.length - 1];
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _lastBackgroundSourceEnds() {
        if (!this._backgroundSourceDescriptors.length) {
            return this._lastSourceEnds();
        }
        const sourceDescriptor = this._backgroundSourceDescriptors[this._backgroundSourceDescriptors.length - 1];
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _startSource(sourceDescriptor, when) {
        const {audioBuffer} = sourceDescriptor;
        const duration = sourceDescriptor.getRemainingDuration();
        const src = this._audioContext.createBufferSource();
        let endedEmitted = false;
        sourceDescriptor.source = src;
        sourceDescriptor.started = when;
        sourceDescriptor.stopped = when + duration;
        src.buffer = audioBuffer;
        src.connect(this._fadeInOutNode);
        src.start(when, sourceDescriptor.playedSoFar);
        src.stop(when + duration);
        src.onended = () => {
            if (endedEmitted) return;
            endedEmitted = true;
            src.onended = null;
            this._sourceEnded(sourceDescriptor, src);
        };

        return when + duration;
    }

    _startSources(when) {
        if (this._paused) return;
        if (!this._sourceStopped) throw new Error(`sources are not stopped`);
        this._sourceStopped = false;
        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            when = this._startSource(this._sourceDescriptorQueue[i], when);
        }
    }

    _stopBackgroundSources() {
        for (let i = 0; i < this._backgroundSourceDescriptors.length; ++i) {
            this._backgroundSourceDescriptors[i].destroy();
        }
        this._backgroundSourceDescriptors.length = 0;
    }

    _stopSources(when = this._getAudioContextCurrentTime(),
                 destroyDescriptorsThatWillNeverPlay = false) {
        if (this._sourceStopped) return;
        this._startSuspensionTimer();

        this._sourceStopped = true;

        this._stopBackgroundSources();

        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            const sourceDescriptor = this._sourceDescriptorQueue[i];
            if (destroyDescriptorsThatWillNeverPlay && (sourceDescriptor.started === -1 ||
                sourceDescriptor.started > when)) {
                for (let j = i; j < this._sourceDescriptorQueue.length; ++j) {
                    this._sourceDescriptorQueue[j].destroy(when);
                }
                this._sourceDescriptorQueue.length = i;
                return;
            }
            const src = sourceDescriptor.source;
            if (!src) continue;
            if (when >= sourceDescriptor.started &&
                when < sourceDescriptor.started + sourceDescriptor.duration) {
                sourceDescriptor.playedSoFar = (when - sourceDescriptor.started);
            }
            src.onended = null;
            try {
                src.stop(when);
            } catch (e) {
                // NOOP
            }
        }
    }

    _sourceEnded(descriptor, source) {
        if (descriptor.isInBackground()) {
            const index = this._backgroundSourceDescriptors.indexOf(descriptor);
            if (index >= 0) {
                this._backgroundSourceDescriptors.splice(index, 1);
            }
            descriptor.destroy();
            return;
        }
        const duration = descriptor && descriptor.duration || -1;
        const wasLastBuffer = !!(descriptor && descriptor.isLastForTrack);
        try {
            if (!descriptor) {
                self.uiLog(new Date().toISOString(), `!descriptor`,
                                `ended emitted`, this._endedEmitted,
                                `length`, this._sourceDescriptorQueue.length);
                return;
            }

            const {length} = this._sourceDescriptorQueue;
            let sourceDescriptor = null;
            if (length > 0 && this._sourceDescriptorQueue[0] === descriptor) {
                sourceDescriptor = this._sourceDescriptorQueue.shift();
            } else {
                for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
                    if (this._playedSourceDescriptors[i] === descriptor) {
                        for (let j = i; j < this._playedSourceDescriptors.length; ++j) {
                            this._playedSourceDescriptors[j].destroy();
                        }
                        this._playedSourceDescriptors.length = i;
                        return;
                    }
                }
            }

            if (!sourceDescriptor) {
                self.uiLog(new Date().toISOString(), `!sourceDescriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._sourceDescriptorQueue.length,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
                sourceDescriptor = descriptor;
            }

            if (sourceDescriptor !== descriptor) {
                sourceDescriptor = descriptor;
                self.uiLog(new Date().toISOString(), `sourceDescriptor !== descriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._sourceDescriptorQueue.length,
                             `queuedStart`, sourceDescriptor.startTime,
                             `queuedEnd`, sourceDescriptor.endTime,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
            }
            source.descriptor = null;
            source.onended = null;
            sourceDescriptor.source = null;
            this._playedSourceDescriptors.push(sourceDescriptor);
            while (this._playedSourceDescriptors.length > this._playedAudioBuffersNeededForVisualization) {
                this._playedSourceDescriptors.shift().destroy();
            }
        } finally {
            this._sourceEndedUpdate(duration, wasLastBuffer);
        }
    }

    _sourceEndedUpdate(sourceDuration, wasLastBuffer) {
        try {
            if (sourceDuration !== -1 && !this._endedEmitted) {
                this._baseTime += sourceDuration;
            }
            if (this._baseTime >= this._duration ||
                (wasLastBuffer && this._sourceDescriptorQueue.length === 0)) {
                this._ended();
            }
        } finally {
            this._ping();
            if (!this._endedEmitted) {
                this._requestMoreBuffers();
            }
            if (this._timeUpdate) {
                this._timeUpdate();
            }
        }
    }

    _ping() {
        this.timers.tick();
        this._message(`ping`, {});
    }

    _error({message}) {
        this.emit(ERROR_EVENT, {message});
    }

    _bufferFilled({descriptor, bufferFillType, extraData}, transferList) {
        if (!descriptor) {
            return;
        }
        const {loudnessInfo} = descriptor;

        this._decodingLatency(descriptor.decodingLatency);

        if (descriptor.isBackgroundBuffer) {
            if (!this._paused) {
                const sourceDescriptor = new SourceDescriptor(this, transferList, descriptor);
                sourceDescriptor.setBackground();
                this._startSource(sourceDescriptor, this._lastBackgroundSourceEnds());
                this._backgroundSourceDescriptors.push(sourceDescriptor);
            }

            this._lastBufferLoaded(descriptor);
            return;
        }

        const skipBuffer = loudnessInfo.isEntirelySilent;
        let currentSourcesShouldBeStopped = false;
        let scheduledStartTime = 0;
        const afterScheduleKnownCallbacks = [];

        if (bufferFillType === BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER) {
            const {baseTime} = extraData;

            currentSourcesShouldBeStopped = true;
            this._applySeekInfo(baseTime);
            afterScheduleKnownCallbacks.push(this._seekCompleted);
            if (SEEK_FADE_TIME > 0) {
                scheduledStartTime = this._fadeOutEnded;
        }
        } else if (bufferFillType === BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER) {
            const {demuxData, isPreloadForNextTrack, baseTime} = extraData;
            this._loadingNext = false;
            if (isPreloadForNextTrack) {
                this._preloadedNextTrackArgs = {demuxData, baseTime};
            } else {
                currentSourcesShouldBeStopped = true;
                this._applyTrackInfo({demuxData, baseTime});
                afterScheduleKnownCallbacks.push(this._firstBufferFromDifferentTrackLoaded);
                if (TRACK_CHANGE_FADE_TIME > 0) {
                    scheduledStartTime = this._fadeOutEnded;
                }
            }
        }

        this._clearSuspensionTimer();
        this._checkAudioContextStaleness();

        let sourceDescriptor;

        if (!skipBuffer) {
            if (transferList.length !== descriptor.channelCount) {
                throw new Error(`transferList.length (${transferList.length}) !== channelCount (${descriptor.channelCount})`);
            }

            sourceDescriptor = new SourceDescriptor(this, transferList, descriptor);
        }

        if (currentSourcesShouldBeStopped) {
            scheduledStartTime = Math.max(scheduledStartTime, this._getAudioContextTimeScheduledAhead());
            if (!this._sourceStopped) {
                this._stopSources(scheduledStartTime, true);
            }

            this._playedSourceDescriptors.push(...this._sourceDescriptorQueue);
            this._sourceDescriptorQueue.length = 0;

            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                if (this._sourceStopped) {
                    this._startSources(scheduledStartTime);
                } else {
                    this._startSource(sourceDescriptor, scheduledStartTime);
                }
            }
        } else if (this._sourceStopped) {
            scheduledStartTime = Math.max(scheduledStartTime, this._getAudioContextTimeScheduledAhead());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                if (!this._paused) {
                    this._startSources(scheduledStartTime);
                }
            }
        } else {
            scheduledStartTime = Math.max(scheduledStartTime, this._lastSourceEnds());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                this._startSource(sourceDescriptor, scheduledStartTime);

            }
        }

        for (let i = 0; i < afterScheduleKnownCallbacks.length; ++i) {
            afterScheduleKnownCallbacks[i].call(this, scheduledStartTime);
        }

        if (descriptor.isLastBuffer) {
            this._lastBufferLoaded(descriptor);
        }

        if (skipBuffer) {
            this._sourceEndedUpdate(descriptor.length / descriptor.sampleRate, descriptor.isLastBuffer);
        }
    }

    _idle() {
        this._requestMoreBuffers();
    }

}
