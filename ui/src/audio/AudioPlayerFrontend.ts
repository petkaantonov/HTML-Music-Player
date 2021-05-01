import {
    AudioConfig,
    AudioPlayerBackendActions,
    BufferDescriptor,
    BufferFilledResult,
    ChannelData,
    MIN_SUSTAINED_AUDIO_SECONDS,
    SUSTAINED_BUFFERED_AUDIO_RATIO,
    TrackArgs,
    WEB_AUDIO_BLOCK_SIZE,
} from "shared/audio";
import { ChannelCount, FileReference, ITrack } from "shared/metadata";
import Timers from "shared/platform/Timers";
import { AudioPlayerResult, FADE_MINIMUM_VOLUME, StateModificationAction } from "shared/src/audio";
import { decode, EventEmitterInterface } from "shared/types/helpers";
import { roundSampleTime } from "shared/util";
import { SelectDeps } from "ui/Application";
import SourceDescriptor, { AudioBufferSourceNodeExt } from "ui/audio/SourceDescriptor";
import { cancelAndHold } from "ui/platform/audio";
import Page from "ui/platform/dom/Page";
import PlaylistController from "ui/player/PlaylistController";
import ApplicationPreferencesBindingContext from "ui/ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/ui/EffectPreferencesBindingContext";
import WorkerFrontend from "ui/WorkerFrontend";

const CURVE_LENGTH = 8;
const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);
const SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS = 20;
const MAX_DIFFERENT_AUDIO_BUFFER_KEYS = 10;
const SEEK_FADE_TIME = 0.2;
const TRACK_CHANGE_FADE_TIME = 0.2;
const PAUSE_RESUME_FADE_TIME = 0.4;
const MUTE_UNMUTE_FADE_TIME = 0.4;
const VOLUME_RATIO = 2;

function getCurve(v0: number, v1: number) {
    const t0 = 0;
    const t1 = CURVE_LENGTH;
    const ret = CURVE_HOLDER;
    for (let t = t0; t <= t1; ++t) {
        const value = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
        ret[t] = value;
    }
    return ret;
}

function getFadeOutCurve(startValue: number) {
    return getCurve(startValue, FADE_MINIMUM_VOLUME);
}

function getFadeInCurve() {
    return getCurve(FADE_MINIMUM_VOLUME, 1);
}

function audioBufferCacheKey(channelCount: number, sampleRate: number) {
    return `${channelCount}-${sampleRate}`;
}

function lruCmp(a: LruCacheValue, b: LruCacheValue) {
    return b.lastUsed - a.lastUsed;
}

interface LruCacheValue {
    lastUsed: number;
    key: string;
}

type Deps = SelectDeps<
    | "audioWorker"
    | "playlist"
    | "page"
    | "effectPreferencesBindingContext"
    | "applicationPreferencesBindingContext"
    | "timers"
>;

export default class AudioPlayerFrontend extends WorkerFrontend<AudioPlayerResult> {
    playlist: PlaylistController;
    page: Page;
    effectPreferencesBindingContext: EffectPreferencesBindingContext;
    applicationPreferencesBindingContext: ApplicationPreferencesBindingContext;
    timers: Timers;
    private _audioContext: AudioContext | null = null;
    private _unprimedAudioContext: AudioContext | null = null;
    private _silentBuffer: AudioBuffer | null = null;
    private _outputSampleRate: number = -1;
    private _outputChannelCount: number = -1;
    private _scheduleAheadTime: number = -1;
    private _volumeValue: number = 0.15;
    private _mutedValue: boolean = false;
    private _paused: boolean = true;
    private _preloadingTrack: ITrack | null = null;
    private _bufferFrameCount: number = 0;
    private _playedAudioBuffersNeededForVisualization: number = 0;
    private _loadingNext: boolean = false;
    private _sourceStopped: boolean = true;
    private _fadeInOutNode: GainNode | null = null;
    private _volumeNode: GainNode | null = null;
    private _currentTime: number = 0;
    private _baseTime: number = 0;
    private _duration: number = 0;
    private _fadeOutEnded: number = 0;
    private _fadeInStarted: number = 0;
    private _fadeInStartedWithLength: number = 0;
    private _lastBufferLoadedHandled: boolean = false;
    private _endedEmitted: boolean = false;
    private _previousAudioContextTime: number = -1;
    private _previousHighResTime: number = -1;
    private _previousCombinedTime: number = -1;
    private _timeUpdateEmittedCurrentTime: number = -1;
    private _timeUpdateEmittedDuration: number = -1;
    private _preloadedNextTrackArgs: TrackArgs | null = null;
    private _sourceDescriptorQueue: SourceDescriptor[] = [];
    private _playedSourceDescriptors: SourceDescriptor[] = [];
    private _backgroundSourceDescriptors: SourceDescriptor[] = [];
    private _audioBufferTime: number = -1;
    private _audioBufferCache: Map<string, AudioBuffer[]> = new Map();
    private _audioBufferCacheKeys: LruCacheValue[] = [];
    private _suspensionTimeoutMs: number = SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS * 1000;
    private _currentStateModificationAction: StateModificationAction | null = null;
    private _targetBufferLengthSeconds: number = -1;
    private _sustainedBufferedAudioSeconds: number = -1;
    private _sustainedBufferCount: number = -1;
    private _minBuffersToRequest: number = -1;
    private _suspensionTimerStartedTime: number = performance.now();
    private _suspensionTimeoutId: number;
    constructor(deps: Deps) {
        super("audio", deps.audioWorker);
        this.playlist = deps.playlist;
        this.page = deps.page;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.timers = deps.timers;

        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
        this.page.setInterval(this._timeUpdate, 100);
        this.effectPreferencesBindingContext.on(`change`, this._effectPreferencesChanged);
        this.applicationPreferencesBindingContext.on(`change`, this._applicationPreferencesChanged);
        this.page.addDocumentListener(`touchend`, this._touchended, { capture: true });

        void this._resetAudioContext();
        void this._initBackend();
    }

    isSeekable() {
        return !this._lastBufferLoadedHandled && !this._loadingNext;
    }

    isPaused() {
        return this._paused;
    }

    resume() {
        this._resume(true);
    }

    pause() {
        if (this.isPaused()) {
            return;
        }
        this._paused = true;
        this.emit("playbackStateChanged");
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

    setVolume(volume: number) {
        this._volumeValue = volume;
        this._volumeChanged(this._mutedValue, this._mutedValue);
    }

    setMuted(muted: boolean) {
        const prev = this._mutedValue;
        this._mutedValue = muted;
        this._volumeChanged(prev, muted);
    }

    getAudioLatency() {
        return (this._audioContext!.baseLatency || 0) + (this._audioContext!.outputLatency || 0);
    }

    loadTrack(track: ITrack, _isUserInitiatedSkip: boolean, initialProgress: number = 0, resumeAfterLoad: boolean) {
        this.playlist.removeListener("playlistNextTrackChanged", this._nextTrackChangedWhilePreloading);
        const { _preloadingTrack } = this;
        this._preloadingTrack = null;

        if (track === _preloadingTrack && this._hasPreloadedNextTrack()) {
            const args = this._preloadedNextTrackArgs;
            this._preloadedNextTrackArgs = null;
            this._applyTrackInfo(args!);
        } else {
            this._load(track.getFileReference(), false, initialProgress, resumeAfterLoad);
        }
    }

    setCurrentTime(time: number) {
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
        this.postMessageToAudioBackend(`seek`, undefined, { bufferFillCount, time });
    }

    getCurrentTime() {
        return this._currentTime;
    }

    getDuration() {
        return this._duration;
    }

    receiveMessageFromBackend(result: AudioPlayerResult, transferList: ArrayBuffer[]) {
        switch (result.type) {
            case "bufferFilled":
                this._bufferFilled(result, transferList);
                break;
            case "error":
                this._error(result);
                break;
            case "idle":
                this._idle();
                break;
        }
    }

    getSamplesScheduledAtOffsetRelativeToNow(channelData: ChannelData, offsetSeconds: number = 0) {
        const ret = {
            sampleRate: 44100,
            channelCount: decode(ChannelCount, channelData.length),
            channelDataFilled: false,
        };

        if (this._sourceStopped) {
            return ret;
        }
        const timestamp = this._audioContext!.getOutputTimestamp();
        let currentTime = timestamp.contextTime!;
        const hr = timestamp.performanceTime!;
        const prevHr = this._previousHighResTime;

        // Workaround for bad values from polyfill
        if (currentTime === this._previousAudioContextTime) {
            const reallyElapsed = Math.round((hr - prevHr) * 1000) / 1e6;
            currentTime += reallyElapsed;
            this._previousCombinedTime = currentTime;
        } else {
            this._previousAudioContextTime = currentTime;
            this._previousHighResTime = hr;
        }

        if (currentTime < this._previousCombinedTime) {
            currentTime = this._previousCombinedTime + Math.round((hr - prevHr) * 1000) / 1e6;
        }

        if (!this._sourceDescriptorQueue.length) {
            return ret;
        }

        const targetStartTime = currentTime + offsetSeconds;
        if (targetStartTime < 0) {
            return ret;
        }

        const [nextSourceDescriptor] = this._sourceDescriptorQueue;
        const { sampleRate, channelCount } = nextSourceDescriptor!;
        const duration = channelData[0]!.length / sampleRate;
        let lowerBoundSourceDescriptor, upperBoundSourceDescriptor;

        // Assume `duration` is always less than bufferDuration. Which it is.
        if (duration > this._getBufferDuration()) {
            uiLog(`duration > this._getBufferDuration() ${duration} ${this._getBufferDuration()}`);
            return ret;
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            const sourceDescriptor = this._playedSourceDescriptors[i]!;
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
                const sourceDescriptor = this._sourceDescriptorQueue[i]!;
                if (
                    !lowerBoundSourceDescriptor &&
                    sourceDescriptor.started <= targetStartTime &&
                    targetStartTime <= sourceDescriptor.stopped
                ) {
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

        const length = (duration * sampleRate) | 0;
        const bufferLength = (lowerBoundSourceDescriptor.duration * sampleRate) | 0;
        let offset;
        if (lowerBoundSourceDescriptor === upperBoundSourceDescriptor) {
            offset = ((targetStartTime - lowerBoundSourceDescriptor.started) * sampleRate) | 0;
            const { audioBuffer } = lowerBoundSourceDescriptor;

            for (let ch = 0; ch < channelData.length; ++ch) {
                audioBuffer.copyFromChannel(channelData[ch], ch, offset);
            }
        } else {
            offset =
                ((lowerBoundSourceDescriptor.duration - (lowerBoundSourceDescriptor.stopped - targetStartTime)) *
                    sampleRate) |
                0;
            let { audioBuffer } = lowerBoundSourceDescriptor;

            for (let ch = 0; ch < channelData.length; ++ch) {
                audioBuffer.copyFromChannel(channelData[ch], ch, offset);
            }
            ({ audioBuffer } = upperBoundSourceDescriptor);
            const samplesCopied = bufferLength - offset;
            const remainingLength = length - samplesCopied;
            for (let ch = 0; ch < channelData.length; ++ch) {
                const dst = new Float32Array(channelData[ch]!.buffer, samplesCopied * 4, remainingLength);
                audioBuffer.copyFromChannel(dst, ch, 0);
            }
        }

        ret.channelDataFilled = true;
        return ret;
    }

    createAudioBuffer(channelCount: ChannelCount, length: number, sampleRate: number): AudioBuffer {
        const key = audioBufferCacheKey(channelCount, sampleRate);
        const { _audioBufferCacheKeys, _audioBufferCache } = this;
        const lastUsed = performance.now();
        let keyExists = false;

        for (let i = 0; i < _audioBufferCacheKeys.length; ++i) {
            if (_audioBufferCacheKeys[i]!.key === key) {
                _audioBufferCacheKeys[i]!.lastUsed = lastUsed;
                keyExists = true;
                break;
            }
        }

        if (!keyExists) {
            const entry = { key, lastUsed };
            if (_audioBufferCacheKeys.length >= MAX_DIFFERENT_AUDIO_BUFFER_KEYS) {
                _audioBufferCacheKeys.sort(lruCmp);
                const removedKey = _audioBufferCacheKeys.pop()!.key;
                _audioBufferCache.delete(removedKey);
            }
            _audioBufferCacheKeys.push(entry);
            _audioBufferCache.set(key, []);
        }

        const audioBuffers = _audioBufferCache.get(key)!;
        if (!audioBuffers.length) {
            return this._audioContext!.createBuffer(channelCount, length, sampleRate);
        } else {
            while (audioBuffers.length > 0) {
                const audioBuffer = audioBuffers.pop()!;
                if (audioBuffer.length === length) {
                    return audioBuffer;
                }
            }
            return this._audioContext!.createBuffer(channelCount, length, sampleRate);
        }
    }

    freeAudioBuffer(audioBuffer: AudioBuffer) {
        const { numberOfChannels, sampleRate } = audioBuffer;
        const key = audioBufferCacheKey(numberOfChannels, sampleRate);
        this._audioBufferCache.get(key)!.push(audioBuffer);
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

    _getMaximumSeekTime(duration: number) {
        return Math.max(0, duration - (this._audioBufferTime + 2048 / this._audioContext!.sampleRate));
    }

    _getBufferDuration() {
        return this._audioBufferTime;
    }

    _lastBufferLoaded(descriptor: BufferDescriptor) {
        if (!this._lastBufferLoadedHandled) {
            this._lastBufferLoadedHandled = true;
            if (descriptor.endTime < this._duration - this._getBufferDuration() - this._getCrossfadeDuration()) {
                this._duration = descriptor.endTime;
                this._emitPlaybackProgress(this._currentTime, this._duration);
            }

            if (this.playlist.getNextTrack() && !this._isPreloadingNextTrack()) {
                this.playlist.on("playlistNextTrackChanged", this._nextTrackChangedWhilePreloading);
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

    _volumeChanged(previousMuted: boolean, currentMuted: boolean) {
        if (previousMuted !== currentMuted) {
            let scheduledTime;
            if (previousMuted) {
                scheduledTime = this._unmuteRequested();
            } else {
                scheduledTime = this._muteRequested();
            }
            this._volumeNode!.gain.cancelScheduledValues(scheduledTime);
            this._volumeNode!.gain.setValueAtTime(this._volume(), scheduledTime);
        } else if (!this._mutedValue) {
            this._volumeNode!.gain.cancelScheduledValues(this._getAudioContextCurrentTime());
            this._volumeNode!.gain.value = this._volume();
        }
    }

    _updatePreloadTrack() {
        this._preloadingTrack = this.playlist.getNextTrack();
        if (this._preloadingTrack) {
            this._load(this._preloadingTrack.getFileReference(), true);
        }
    }

    _nextTrackChangedWhilePreloading = () => {
        this._updatePreloadTrack();
    };

    _bufferFrameCountForSampleRate(sampleRate: number) {
        return this._targetBufferLengthSeconds * sampleRate;
    }

    _isPreloadingNextTrack() {
        return !!this._preloadingTrack;
    }

    _effectPreferencesChanged = async () => {
        await this.ready();
        void this._updateBackendConfig({
            effects: this.effectPreferencesBindingContext.getAudioPlayerEffects(),
            crossfadeDuration: this._getCrossfadeDuration(),
        });
    };

    _applicationPreferencesChanged = async () => {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferencesManager();
        void this._setBufferSize(preferences.get("bufferLengthMilliSeconds"));
        void this._updateBackendConfig({
            loudnessNormalization: preferences.get("enableLoudnessNormalization"),
            silenceTrimming: preferences.get("enableSilenceTrimming"),
        });
    };

    _touchended = async () => {
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
    };

    async _updateBackendConfig(config: AudioConfig) {
        await this.ready();
        this.postMessageToAudioBackend("audioConfiguration", undefined, config);
    }

    async _initBackend() {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferencesManager();
        void this._updateBackendConfig({
            loudnessNormalization: preferences.get("enableLoudnessNormalization"),
            silenceTrimming: preferences.get("enableSilenceTrimming"),
            effects: this.effectPreferencesBindingContext.getAudioPlayerEffects(),
            crossfadeDuration: this._getCrossfadeDuration(),
        });
    }

    async _resetAudioContext() {
        const oldAudioContextTime = this._audioContext ? this._audioContext.currentTime : 0;
        try {
            if (this._audioContext) {
                await this._audioContext.close();
            }
        } catch (e) {
            // NOOP
        } finally {
            this._audioContext = null;
        }
        const audioContext = (this._audioContext = new AudioContext({ latencyHint: `playback` }));
        this._unprimedAudioContext = this._audioContext;

        const channelCount = decode(ChannelCount, audioContext.destination.channelCount);
        const { sampleRate } = audioContext;

        if (this._setAudioOutputParameters({ channelCount, sampleRate })) {
            void this._setBufferSize(
                this.applicationPreferencesBindingContext.preferencesManager().get("bufferLengthMilliSeconds")
            );
        }

        this._volumeNode = audioContext.createGain();
        this._fadeInOutNode = audioContext.createGain();
        this._fadeInOutNode.connect(this._volumeNode);
        this._volumeNode.connect(audioContext.destination);

        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        const timeDiff = audioContext.currentTime - oldAudioContextTime;

        const sourceDescriptors = this._sourceDescriptorQueue;

        let lowestOriginalTime = Infinity;
        for (let i = 0; i < sourceDescriptors.length; ++i) {
            const sourceDescriptor = sourceDescriptors[i]!;
            if (sourceDescriptor.started !== -1) {
                lowestOriginalTime = Math.min(sourceDescriptor.started, lowestOriginalTime, sourceDescriptor.stopped);
            }
        }

        for (let i = 0; i < sourceDescriptors.length; ++i) {
            sourceDescriptors[i]!.readjustTime(timeDiff, lowestOriginalTime);
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            this._playedSourceDescriptors[i]!.started = this._playedSourceDescriptors[i]!.stopped = -1;
        }

        this.emit("audioContextDidReset");
        this._volumeChanged(this._mutedValue, this._mutedValue);
    }

    _setAudioOutputParameters({ sampleRate, channelCount }: { sampleRate: number; channelCount: ChannelCount }) {
        let changed = false;
        if (this._outputSampleRate !== sampleRate) {
            this._outputSampleRate = sampleRate;
            changed = true;
        }
        if (this._outputChannelCount !== channelCount) {
            this._outputChannelCount = channelCount;
            changed = true;
        }
        this._scheduleAheadTime = Math.max(
            this._scheduleAheadTime,
            roundSampleTime(WEB_AUDIO_BLOCK_SIZE * 8, sampleRate) / sampleRate
        );
        return changed;
    }

    async _setBufferSize(bufferLengthMilliSecondsPreference: number) {
        if (this._targetBufferLengthSeconds / 1000 === bufferLengthMilliSecondsPreference) {
            return;
        }
        const sampleRate = this._outputSampleRate;
        const channelCount = this._outputChannelCount;
        this._targetBufferLengthSeconds = bufferLengthMilliSecondsPreference / 1000;
        this._sustainedBufferedAudioSeconds = Math.max(
            MIN_SUSTAINED_AUDIO_SECONDS,
            this._targetBufferLengthSeconds * SUSTAINED_BUFFERED_AUDIO_RATIO
        );
        this._sustainedBufferCount = Math.ceil(this._sustainedBufferedAudioSeconds / this._targetBufferLengthSeconds);
        this._minBuffersToRequest = Math.ceil(this._sustainedBufferCount / 4);
        this._bufferFrameCount = this._bufferFrameCountForSampleRate(this._outputSampleRate);
        this._audioBufferTime = this._bufferFrameCount / this._outputSampleRate;
        this._playedAudioBuffersNeededForVisualization = Math.ceil(this.getAudioLatency() / this._audioBufferTime) + 1;

        if (!this._silentBuffer) {
            this._silentBuffer = this._audioContext!.createBuffer(channelCount, this._bufferFrameCount, sampleRate);
        }
        void this._updateBackendConfig({ bufferTime: this._audioBufferTime });
    }

    _suspend = () => {
        if (this._audioContext!.state === `suspended`) return Promise.resolve();

        if (!this._currentStateModificationAction) {
            this._currentStateModificationAction = {
                type: `suspend`,
                promise: (async () => {
                    try {
                        await Promise.resolve(this._audioContext!.suspend());
                    } finally {
                        this._currentStateModificationAction = null;
                    }
                })(),
            };
            return this._currentStateModificationAction.promise;
        } else if (this._currentStateModificationAction.type === `resume`) {
            this._currentStateModificationAction.promise = (async () => {
                try {
                    try {
                        await this._currentStateModificationAction!.promise;
                    } finally {
                        await this._suspend();
                    }
                } finally {
                    this._currentStateModificationAction = null;
                }
            })();
        }
        return this._currentStateModificationAction.promise;
    };

    _clearSuspensionTimer() {
        this._suspensionTimerStartedTime = -1;
        this.page.clearTimeout(this._suspensionTimeoutId);
        this._suspensionTimeoutId = -1;
    }

    _getAudioContextCurrentTime() {
        return this._audioContext!.currentTime;
    }

    _getCurrentAudioBufferBaseTimeDelta(now?: number) {
        const sourceDescriptor = this._sourceDescriptorQueue[0];
        if (!sourceDescriptor) return 0;
        if (now === undefined) now = this._getAudioContextCurrentTime();
        const { started } = sourceDescriptor;
        if (now < started || started > sourceDescriptor.started + sourceDescriptor.duration) {
            return 0;
        }

        if (this._paused || this._sourceStopped) return 0;
        return Math.min(now - started + sourceDescriptor.playedSoFar, this._getBufferDuration());
    }

    _load(
        fileReference: FileReference,
        isPreloadForNextTrack: boolean,
        progress: number = 0,
        resumeAfterLoad: boolean = false
    ) {
        this._loadingNext = true;
        this._preloadedNextTrackArgs = null;
        if (!isPreloadForNextTrack) {
            this._endedEmitted = false;
        }
        const bufferFillCount = this._getSustainedBufferCount();
        this.postMessageToAudioBackend("load", undefined, {
            fileReference,
            isPreloadForNextTrack,
            bufferFillCount,
            progress,
            resumeAfterLoad,
        });
    }

    _checkAudioContextStaleness() {
        if (this._audioContext!.state === `running`) {
            if (
                this._suspensionTimerStartedTime !== -1 &&
                performance.now() - this._suspensionTimerStartedTime > this._suspensionTimeoutMs
            ) {
                this._suspensionTimerStartedTime = -1;
                void this._resetAudioContext();
            }
            return;
        }

        // Reset AudioContext as it's probably ruined despite of suspension efforts.
        if (!this._currentStateModificationAction) {
            void this._resetAudioContext();
        } else if (this._currentStateModificationAction.type === `suspend`) {
            this._currentStateModificationAction = null;
            void this._resetAudioContext();
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

    _timeUpdate = () => {
        if (this._loadingNext) return;
        const currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
        const currentTime = this._baseTime + currentBufferPlayedSoFar;
        this._currentTime = Math.min(this._duration, currentTime);
        this._emitPlaybackProgress(this._currentTime, this._duration);
        if (currentTime > 0 && this._duration > 0 && currentTime >= this._duration - this._getCrossfadeDuration()) {
            this._ended();
        }
    };

    _emitPlaybackProgress(currentTime: number, duration: number) {
        if (this._timeUpdateEmittedCurrentTime === currentTime && this._timeUpdateEmittedDuration === duration) {
            return;
        }
        this._timeUpdateEmittedDuration = duration;
        this._timeUpdateEmittedCurrentTime = currentTime;
        this.emit("playbackProgressed", currentTime, duration);
    }

    _ended = () => {
        if (this._endedEmitted || this._loadingNext) return;
        this._endedEmitted = true;
        this.playlist.removeListener("playlistNextTrackChanged", this._nextTrackChangedWhilePreloading);
        this._currentTime = this._duration;
        this._emitPlaybackProgress(this._currentTime, this._duration);
        this._startSuspensionTimer();
        this.emit("playbackEnded");
    };

    _decodingLatency(decodingLatency: number) {
        this.applicationPreferencesBindingContext.decodingLatencyValue(decodingLatency);
    }

    _requestMoreBuffers() {
        if (this._sourceDescriptorQueue.length < this._getSustainedBufferCount()) {
            const bufferFillCount = this._getSustainedBufferCount() - this._sourceDescriptorQueue.length;
            if (bufferFillCount >= this._getMinBuffersToRequest()) {
                this.postMessageToAudioBackend("fillBuffers", undefined, { bufferFillCount });
            }
        }
    }

    _seekCompleted(scheduledStartTime: number) {
        this._maybeFadeIn(SEEK_FADE_TIME, scheduledStartTime);
    }

    _firstBufferFromDifferentTrackLoaded(scheduledStartTime: number) {
        this._maybeFadeIn(TRACK_CHANGE_FADE_TIME, scheduledStartTime);
    }

    _applySeekInfo(baseTime: number) {
        this._baseTime = baseTime;
        this._lastBufferLoadedHandled = false;
        this._endedEmitted = false;
        this._timeUpdate();
    }

    _applyTrackInfo({ demuxData, baseTime }: TrackArgs) {
        this._duration = demuxData.duration;
        this._applySeekInfo(baseTime);
    }

    _maybeFadeOut(time: number, ctxTime: number = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const param = this._fadeInOutNode!.gain;
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

    _maybeFadeIn(time: number, ctxTime: number = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const curve = getFadeInCurve();
            try {
                this._fadeInOutNode!.gain.setValueCurveAtTime(curve, ctxTime, time);
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
        const sourceDescriptor = this._sourceDescriptorQueue[this._sourceDescriptorQueue.length - 1]!;
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _lastBackgroundSourceEnds() {
        if (!this._backgroundSourceDescriptors.length) {
            return this._lastSourceEnds();
        }
        const sourceDescriptor = this._backgroundSourceDescriptors[this._backgroundSourceDescriptors.length - 1]!;
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _resume(startStoppedSources = true) {
        if (!this.isPaused()) {
            return;
        }
        this._paused = false;
        this.emit("playbackStateChanged");
        this._checkAudioContextStaleness();

        if (startStoppedSources && this._sourceDescriptorQueue.length > 0 && this._sourceStopped) {
            this._clearSuspensionTimer();
            const scheduledStartTime = Math.max(this._getAudioContextTimeScheduledAhead(), this._fadeOutEnded);
            this._startSources(scheduledStartTime);
            this._maybeFadeIn(SEEK_FADE_TIME, scheduledStartTime);
        }
        this._emitPlaybackProgress(this._currentTime, this._duration);
    }

    _startSource(sourceDescriptor: SourceDescriptor, when: number) {
        const { audioBuffer } = sourceDescriptor;
        const duration = sourceDescriptor.getRemainingDuration();
        const src = this._audioContext!.createBufferSource();
        let endedEmitted = false;
        sourceDescriptor.source = src;
        sourceDescriptor.started = when;
        sourceDescriptor.stopped = when + duration;
        src.buffer = audioBuffer;
        src.connect(this._fadeInOutNode!);
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

    _startSources(when: number) {
        if (this._paused) return;
        if (!this._sourceStopped) throw new Error(`sources are not stopped`);
        this._sourceStopped = false;
        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            when = this._startSource(this._sourceDescriptorQueue[i]!, when);
        }
    }

    _stopBackgroundSources() {
        for (let i = 0; i < this._backgroundSourceDescriptors.length; ++i) {
            this._backgroundSourceDescriptors[i]!.destroy();
        }
        this._backgroundSourceDescriptors.length = 0;
    }

    _stopSources(
        when: number = this._getAudioContextCurrentTime(),
        destroyDescriptorsThatWillNeverPlay: boolean = false
    ) {
        if (this._sourceStopped) return;
        this._startSuspensionTimer();

        this._sourceStopped = true;

        this._stopBackgroundSources();

        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            const sourceDescriptor = this._sourceDescriptorQueue[i]!;
            if (
                destroyDescriptorsThatWillNeverPlay &&
                (sourceDescriptor.started === -1 || sourceDescriptor.started > when)
            ) {
                for (let j = i; j < this._sourceDescriptorQueue.length; ++j) {
                    this._sourceDescriptorQueue[j]!.destroy(when);
                }
                this._sourceDescriptorQueue.length = i;
                return;
            }
            const src = sourceDescriptor.source;
            if (!src) continue;
            if (when >= sourceDescriptor.started && when < sourceDescriptor.started + sourceDescriptor.duration) {
                sourceDescriptor.playedSoFar = when - sourceDescriptor.started;
            }
            src.onended = null;
            try {
                src.stop(when);
            } catch (e) {
                // NOOP
            }
        }
    }

    _sourceEnded = (descriptor: SourceDescriptor, source: AudioBufferSourceNodeExt) => {
        if (descriptor.isInBackground()) {
            const index = this._backgroundSourceDescriptors.indexOf(descriptor);
            if (index >= 0) {
                this._backgroundSourceDescriptors.splice(index, 1);
            }
            descriptor.destroy();
            return;
        }
        const duration = (descriptor && descriptor.duration) || -1;
        const wasLastBuffer = !!(descriptor && descriptor.isLastForTrack);
        try {
            if (!descriptor) {
                uiLog(
                    new Date().toISOString(),
                    `!descriptor`,
                    `ended emitted`,
                    this._endedEmitted + "",
                    `length`,
                    this._sourceDescriptorQueue.length + ""
                );
                return;
            }

            const { length } = this._sourceDescriptorQueue;
            let sourceDescriptor = null;
            if (length > 0 && this._sourceDescriptorQueue[0] === descriptor) {
                sourceDescriptor = this._sourceDescriptorQueue.shift();
            } else {
                for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
                    if (this._playedSourceDescriptors[i] === descriptor) {
                        for (let j = i; j < this._playedSourceDescriptors.length; ++j) {
                            this._playedSourceDescriptors[j]!.destroy();
                        }
                        this._playedSourceDescriptors.length = i;
                        return;
                    }
                }
            }

            if (!sourceDescriptor) {
                uiLog(
                    new Date().toISOString(),
                    `!sourceDescriptor`,
                    `ended emitted`,
                    this._endedEmitted + "",
                    `prelen`,
                    length + "",
                    `postlen`,
                    this._sourceDescriptorQueue.length + "",
                    `referencedStart`,
                    descriptor.startTime + "",
                    `referencedEnd`,
                    descriptor.endTime + ""
                );
                sourceDescriptor = descriptor;
            }

            if (sourceDescriptor !== descriptor) {
                sourceDescriptor = descriptor;
                uiLog(
                    new Date().toISOString(),
                    `sourceDescriptor !== descriptor`,
                    `ended emitted`,
                    this._endedEmitted + "",
                    `prelen`,
                    length + "",
                    `postlen`,
                    this._sourceDescriptorQueue.length + "",
                    `queuedStart`,
                    sourceDescriptor.startTime + "",
                    `queuedEnd`,
                    sourceDescriptor.endTime + "",
                    `referencedStart`,
                    descriptor.startTime + "",
                    `referencedEnd`,
                    descriptor.endTime + ""
                );
            }
            source.descriptor = null;
            source.onended = null;
            sourceDescriptor.source = null;
            this._playedSourceDescriptors.push(sourceDescriptor);
            while (this._playedSourceDescriptors.length > this._playedAudioBuffersNeededForVisualization) {
                this._playedSourceDescriptors.shift()!.destroy();
            }
        } finally {
            this._sourceEndedUpdate(duration, wasLastBuffer);
        }
    };

    _sourceEndedUpdate(sourceDuration: number, wasLastBuffer: boolean) {
        try {
            if (sourceDuration !== -1 && !this._endedEmitted) {
                this._baseTime += sourceDuration;
            }
            if (this._baseTime >= this._duration || (wasLastBuffer && this._sourceDescriptorQueue.length === 0)) {
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
        this.postMessageToAudioBackend("ping");
    }

    _error({ message }: { message: string }) {
        this.emit("errored", { message });
    }

    _bufferFilled({ descriptor, bufferFillType, extraData }: BufferFilledResult, transferList: ArrayBuffer[]) {
        if (!descriptor) {
            return;
        }
        const { loudnessInfo } = descriptor;

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
        const afterScheduleKnownCallbacks: (
            | AudioPlayerFrontend["_seekCompleted"]
            | AudioPlayerFrontend["_firstBufferFromDifferentTrackLoaded"]
        )[] = [];

        if (bufferFillType === "BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER") {
            const { baseTime } = extraData!;

            currentSourcesShouldBeStopped = true;
            this._applySeekInfo(baseTime!);
            afterScheduleKnownCallbacks.push(this._seekCompleted);
            if (SEEK_FADE_TIME > 0) {
                scheduledStartTime = this._fadeOutEnded;
            }
        } else if (bufferFillType === "BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER") {
            const { demuxData, isPreloadForNextTrack, baseTime, resumeAfterLoad } = extraData!;
            this._loadingNext = false;
            if (isPreloadForNextTrack) {
                this._preloadedNextTrackArgs = { demuxData, baseTime: baseTime! };
            } else {
                currentSourcesShouldBeStopped = true;
                this._applyTrackInfo({ demuxData, baseTime: baseTime! });
                afterScheduleKnownCallbacks.push(this._firstBufferFromDifferentTrackLoaded);

                if (resumeAfterLoad) {
                    this._resume(false);
                }

                if (TRACK_CHANGE_FADE_TIME > 0) {
                    scheduledStartTime = this._fadeOutEnded;
                }
            }
        }

        this._clearSuspensionTimer();
        this._checkAudioContextStaleness();

        let sourceDescriptor: SourceDescriptor | undefined;

        if (!skipBuffer) {
            if (transferList.length !== descriptor.channelCount) {
                throw new Error(
                    `transferList.length (${transferList.length}) !== channelCount (${descriptor.channelCount})`
                );
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
                this._sourceDescriptorQueue.push(sourceDescriptor!);
                if (this._sourceStopped) {
                    this._startSources(scheduledStartTime);
                } else {
                    this._startSource(sourceDescriptor!, scheduledStartTime);
                }
            }
        } else if (this._sourceStopped) {
            scheduledStartTime = Math.max(scheduledStartTime, this._getAudioContextTimeScheduledAhead());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor!);
                if (!this._paused) {
                    this._startSources(scheduledStartTime);
                }
            }
        } else {
            scheduledStartTime = Math.max(scheduledStartTime, this._lastSourceEnds());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor!);
                this._startSource(sourceDescriptor!, scheduledStartTime);
            }
        }

        for (let i = 0; i < afterScheduleKnownCallbacks.length; ++i) {
            afterScheduleKnownCallbacks[i]!.call(this, scheduledStartTime);
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

    postMessageToAudioBackend = <T extends string & keyof AudioPlayerBackendActions<unknown>>(
        action: T,
        transferList?: ArrayBuffer[],
        ...args: Parameters<AudioPlayerBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args, transferList);
    };
}

interface AudioPlayerEventsMap {
    playbackStateChanged: () => void;
    playbackProgressed: (currentTime: number, duration: number) => void;
    playbackEnded: () => void;
    errored: (error: { message: string }) => void;
    audioContextDidReset: () => void;
}

export default interface AudioPlayerFrontend extends EventEmitterInterface<AudioPlayerEventsMap> {}
