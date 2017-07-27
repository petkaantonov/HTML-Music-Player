// Audio player implemented using AudioBuffers. Tracks are resampled and mixed
// Manually to hardware specs to guarantee seamless playback between consecutive
// Audiobuffers.
import {roundSampleTime, ensureArray} from "util";
import {AudioParam, AudioContext, performance} from "platform/platform";
import {PLAYER_READY_EVENT_NAME} from "audio/backend/AudioPlayerBackend";
import WorkerFrontend from "WorkerFrontend";
import AudioPlayerSourceNode from "audio/frontend/AudioPlayerSourceNode";
import {WEB_AUDIO_BLOCK_SIZE,
        SUSTAINED_BUFFERED_AUDIO_RATIO,
        MIN_SUSTAINED_AUDIO_SECONDS} from "audio/frontend/buffering";

const SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS = 20;
const MAX_DIFFERENT_AUDIO_BUFFER_KEYS = 10;

// TODO Make end user configurable
const SEEK_FADE_TIME = 0.2;
const TRACK_CHANGE_FADE_TIME = 0.2;
const PAUSE_RESUME_FADE_TIME = 0.4;
const MUTE_UNMUTE_FADE_TIME = 0.4;

if (!AudioContext.prototype.suspend) {
    AudioContext.prototype.suspend = function() {
        return Promise.resolve();
    };
}
if (!AudioContext.prototype.resume) {
    AudioContext.prototype.resume = function() {
        return Promise.resolve();
    };
}

function NativeGetOutputTimestamp() {
    return this._audioContext.getOutputTimestamp();
}

function PolyfillGetOutputTimestamp() {
    return {
        contextTime: this._audioContext.currentTime,
        performanceTime: performance.now()
    };
}

function cancelAndHoldStandardImpl(audioParam, value) {
    return audioParam.cancelAndHoldAtTime(value);
}

function cancelAndHoldNonStandardImpl(audioParam, value) {
    return audioParam.cancelValuesAndHoldAtTime(value);
}

function cancelAndHoldPolyfillImpl(audioParam, value) {
    const currentValue = audioParam.value;
    audioParam.cancelScheduledValues(value);
    audioParam.setValueAtTime(currentValue, value);
}

export const cancelAndHold = typeof AudioParam.prototype.cancelAndHoldAtTime === `function` ? cancelAndHoldStandardImpl :
                              typeof AudioParam.prototype.cancelValuesAndHoldAtTime === `function` ? cancelAndHoldNonStandardImpl :
                              cancelAndHoldPolyfillImpl;

function audioBufferCacheKey(channelCount, sampleRate) {
    return `${channelCount}-${sampleRate}`;
}

function lruCmp(a, b) {
    return b.lastUsed - a.lastUsed;
}


let autoIncrementNodeId = 0;
export default class AudioPlayer extends WorkerFrontend {
    constructor(deps) {
        super(PLAYER_READY_EVENT_NAME, deps.workerWrapper);
        this.page = deps.page;
        this.env = deps.env;
        this.db = deps.db;
        this.timers = deps.timers;
        this.dbValues = deps.dbValues;
        this.crossfadePreferencesBindingContext = deps.crossfadePreferencesBindingContext;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;

        this._audioContext = null;
        this._unprimedAudioContext = null;

        this._silentBuffer = null;

        this._previousAudioContextTime = -1;

        this._outputSampleRate = -1;
        this._outputChannelCount = -1;

        this._scheduleAheadTime = -1;
        this._sourceNodes = [];
        this._bufferFrameCount = 0;
        this._playedAudioBuffersNeededForVisualization = 0;


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
        this._playbackStoppedTime = performance.now();

        this._suspend = this._suspend.bind(this);

        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);

        this.effectPreferencesBindingContext.on(`change`, async () => {
            await this.ready();
            this._updateBackendConfig({
                effects: ensureArray(this.effectPreferencesBindingContext.getAudioPlayerEffects())
            });
        });
        this.applicationPreferencesBindingContext.on(`change`, async () => {
            await this.ready();
            const preferences = this.applicationPreferencesBindingContext.preferences();
            this._setBufferSize(preferences.getBufferLengthMilliSeconds());
            this._updateBackendConfig({
                loudnessNormalization: preferences.getEnableLoudnessNormalization(),
                silenceTrimming: preferences.getEnableSilenceTrimming()
            });
        });

        this.page.addDocumentListener(`touchend`, this._touchended.bind(this), true);

        this.getOutputTimestamp = typeof AudioContext.prototype.getOutputTimestamp === `function` ? NativeGetOutputTimestamp
                                                                                                  : PolyfillGetOutputTimestamp;
        this._resetAudioContext();
        this._initBackend();
    }

    /* eslint-disable class-methods-use-this */
    getPauseResumeFadeTime() {
        return PAUSE_RESUME_FADE_TIME;
    }

    getSeekFadeTime() {
        return SEEK_FADE_TIME;
    }

    getMuteUnmuteFadeTime() {
        return MUTE_UNMUTE_FADE_TIME;
    }

    getTrackChangeFadeTime() {
        return TRACK_CHANGE_FADE_TIME;
    }

    _bufferFrameCountForSampleRate(sampleRate) {
        return this._targetBufferLengthSeconds * sampleRate;
    }

    getTargetBufferLengthSeconds() {
        return this._targetBufferLengthSeconds;
    }

    getSustainedBufferedAudioSeconds() {
        return this._sustainedBufferedAudioSeconds;
    }

    getSustainedBufferCount() {
        return this._sustainedBufferCount;
    }

    getMinBuffersToRequest() {
        return this._minBuffersToRequest;
    }

    shouldSkipSilence() {
        return this.applicationPreferencesBindingContext.getPreference(`enableSilenceTrimming`);
    }

    async _setBufferSize(bufferLengthMilliSecondsPreference, sourceNodeNeedsReset = false) {
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
        if (sourceNodeNeedsReset) {
            for (const sourceNode of this._sourceNodes.slice()) {
                sourceNode._resetAudioBuffers();
            }
        }
    }

    /* eslint-enable class-methods-use-this */

    receiveMessage(event) {
        const {nodeId} = event.data;
        if (nodeId >= 0) {
            for (let i = 0; i < this._sourceNodes.length; ++i) {
                if (this._sourceNodes[i]._id === nodeId) {
                    this._sourceNodes[i].receiveMessage(event);
                    break;
                }
            }
        } else {
            const {methodName, args, transferList} = event.data;
            if ((nodeId < 0 || nodeId === undefined) && methodName) {
                this[methodName](args, transferList);
            }
        }
    }

    async _updateBackendConfig(config) {
        await this.ready();
        this._message(-1, `audioConfiguration`, config);
    }

    async _initBackend() {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferences();
        this._updateBackendConfig({
            loudnessNormalization: preferences.getEnableLoudnessNormalization(),
            silenceTrimming: preferences.getEnableSilenceTrimming(),
            effects: ensureArray(this.effectPreferencesBindingContext.getAudioPlayerEffects())
        });
    }

    _audioContextChanged() {
        const {_audioContext} = this;
        const {channelCount} = _audioContext.destination;
        const {sampleRate} = _audioContext;

        this._previousAudioContextTime = _audioContext.currentTime;

        if (this._setAudioOutputParameters({channelCount, sampleRate})) {
            this._setBufferSize(this.applicationPreferencesBindingContext.preferences().getBufferLengthMilliSeconds(),
                                true);
        } else {
            for (const sourceNode of this._sourceNodes.slice()) {
                sourceNode.adoptNewAudioContext(_audioContext);
            }
        }
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

    getAudioLatency() {
        return (this._audioContext.baseLatency || 0) +
                (this._audioContext.outputLatency || 0);
    }

    getScheduleAheadTime() {
        return this._scheduleAheadTime;
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

    _resetAudioContext() {
        try {
            if (this._audioContext) {
                this._audioContext.close();
            }
        } catch (e) {
            // NOOP
        } finally {
            this._audioContext = null;
        }
        this._audioContext = new AudioContext({latencyHint: `playback`});
        this._unprimedAudioContext = this._audioContext;
        this._audioContextChanged();
        this.emit(`audioContextReset`, this);
    }

    _clearSuspensionTimer() {
        this._playbackStoppedTime = -1;
        this.page.clearTimeout(this._suspensionTimeoutId);
        this._suspensionTimeoutId = -1;
    }

    _message(nodeId, methodName, args, transferList) {
        if (transferList === undefined) transferList = [];
        args = Object(args);
        transferList = transferList.map((v) => {
            if (v.buffer) return v.buffer;
            return v;
        });
        this.postMessage({
            nodeId,
            methodName,
            args,
            transferList
        }, transferList);
    }

    _sourceNodeDestroyed(node) {
        const i = this._sourceNodes.indexOf(node);
        if (i >= 0) this._sourceNodes.splice(i, 1);
    }

    getCurrentTime() {
        return this._audioContext.currentTime;
    }

    getAudioContext() {
        return this._audioContext;
    }

    resume() {
        if (this._audioContext.state === `running`) {
            if (this._playbackStoppedTime !== -1 &&
                performance.now() - this._playbackStoppedTime > this._suspensionTimeoutMs) {
                this._playbackStoppedTime = -1;
                this.emit(`audioContextSuspend`, this);
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

    playbackStopped() {
        this._clearSuspensionTimer();
        this._playbackStoppedTime = performance.now();
        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
    }

    playbackStarted() {
        this._clearSuspensionTimer();
    }

    getMaximumSeekTime(duration) {
        return Math.max(0, duration - (this._audioBufferTime + (2048 / this._audioContext.sampleRate)));
    }

    getBufferDuration() {
        return this._audioBufferTime;
    }

    createSourceNode() {
        const ret = new AudioPlayerSourceNode(this, autoIncrementNodeId++, this._audioContext);
        this._sourceNodes.push(ret);
        return ret;
    }

    ping() {
        this.timers.tick();
        this.postMessage({
            nodeId: -1,
            args: {},
            methodName: `ping`
        });
    }
}
