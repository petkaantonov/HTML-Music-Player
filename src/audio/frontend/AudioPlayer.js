// Audio player implemented using AudioBuffers. Tracks are resampled and mixed
// Manually to hardware specs to guarantee seamless playback between consecutive
// Audiobuffers.
import {roundSampleTime} from "util";
import {AudioParam, AudioContext, ArrayBuffer, Float32Array, performance} from "platform/platform";
import {PLAYER_READY_EVENT_NAME} from "audio/backend/AudioPlayerBackend";
import WorkerFrontend from "WorkerFrontend";
import AudioPlayerSourceNode from "audio/frontend/AudioPlayerSourceNode";
import {FLOAT32_BYTES, WEB_AUDIO_BLOCK_SIZE,
        SUSTAINED_BUFFER_COUNT, SCHEDULE_AHEAD_RATIO,
        TARGET_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";

const LOWEST_RESAMPLER_QUALITY = 2;
const DESKTOP_RESAMPLER_QUALITY = 4;
const SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS = 20;

// TODO Make end user configurable
const SEEK_FADE_TIME = 0.2;
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
        this._arrayBufferPool = [];
        this._audioBufferPool = [];
        this._sourceNodes = [];
        this._bufferFrameCount = 0;
        this._playedAudioBuffersNeededForVisualization = 0;
        this._arrayBufferByteLength = 0;
        this._maxAudioBuffers = 0;
        this._maxArrayBuffers = 0;
        this._audioBufferTime = -1;
        this._audioBuffersAllocated = 0;
        this._arrayBuffersAllocated = 0;
        this._suspensionTimeoutMs = SUSPEND_AUDIO_CONTEXT_AFTER_SECONDS * 1000;
        this._currentStateModificationAction = null;
        this._lastAudioContextRefresh = 0;

        this._playbackStoppedTime = performance.now();

        this._suspend = this._suspend.bind(this);

        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);

        this.effectPreferencesBindingContext.on(`change`, async () => {
            await this.ready();
            this.setEffects(this.effectPreferencesBindingContext.getAudioPlayerEffects());
        });

        this._updateBackendConfig({resamplerQuality: this._determineResamplerQuality()});
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

    _bufferFrameCountForSampleRate(sampleRate) {
        return TARGET_BUFFER_LENGTH_SECONDS * sampleRate;
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
        this.setEffects(this.effectPreferencesBindingContext.getAudioPlayerEffects());
    }

    async _audioContextChanged() {
        const {_audioContext} = this;
        const {channelCount} = _audioContext.destination;
        const {sampleRate} = _audioContext;

        this._previousAudioContextTime = _audioContext.currentTime;

        if (this._setAudioOutputParameters({channelCount, sampleRate})) {
            this._bufferFrameCount = this._bufferFrameCountForSampleRate(sampleRate);
            this._audioBufferTime = this._bufferFrameCount / sampleRate;
            this._playedAudioBuffersNeededForVisualization = Math.ceil(0.5 / this._audioBufferTime);
            this._maxAudioBuffers = SUSTAINED_BUFFER_COUNT * 2 + this._playedAudioBuffersNeededForVisualization;
            this._maxArrayBuffers = (this._maxAudioBuffers * channelCount * (channelCount + 1)) +
                (SUSTAINED_BUFFER_COUNT + this._playedAudioBuffersNeededForVisualization) * channelCount;
            this._arrayBufferByteLength = FLOAT32_BYTES * this._bufferFrameCount;

            this._silentBuffer = _audioContext.createBuffer(channelCount, this._bufferFrameCount, sampleRate);
            await this._updateBackendConfig({channelCount, sampleRate, bufferTime: this._audioBufferTime});
            this._resetPools();
            for (const sourceNode of this._sourceNodes.slice()) {
                sourceNode._resetAudioBuffers();
            }
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

    getScheduleAheadTime() {
        return this._scheduleAheadTime;
    }

    recordSchedulingTime(elapsedMs) {
        const seconds = elapsedMs / 1000;
        const scheduleAheadTime = this._scheduleAheadTime;
        if (seconds * SCHEDULE_AHEAD_RATIO > scheduleAheadTime) {
            const sampleRate = this._outputSampleRate;
            let minScheduleAheadSamples = seconds * (1 / SCHEDULE_AHEAD_RATIO) * sampleRate;
            minScheduleAheadSamples = Math.ceil(minScheduleAheadSamples / WEB_AUDIO_BLOCK_SIZE) * WEB_AUDIO_BLOCK_SIZE;
            this._scheduleAheadTime = roundSampleTime(minScheduleAheadSamples, sampleRate) / sampleRate;
            self.uiLog(`increased _scheduleAheadTime from ${scheduleAheadTime} to ${this._scheduleAheadTime} because operation took ${elapsedMs.toFixed(0)} ms`);
        }
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

    _freeTransferList(args, transferList) {
        if (!transferList) return;

        while (transferList.length > 0) {
            let item = transferList.pop();
            if (!(item instanceof ArrayBuffer)) {
                item = item.buffer;
            }
            if (item.byteLength > 0) {
                this._freeArrayBuffer(item);
            }
        }
    }

    _resetPools() {
        this._audioBuffersAllocated = 0;
        this._arrayBuffersAllocated = 0;
        this._audioBufferPool = [];
        this._arrayBufferPool = [];
    }

    _freeAudioBuffer(audioBuffer) {
        if (audioBuffer.sampleRate === this._outputSampleRate &&
            audioBuffer.numberOfChannels === this._outputChannelCount &&
            audioBuffer.length === this._bufferFrameCount) {
            this._audioBufferPool.push(audioBuffer);
        }
    }

    _allocAudioBuffer() {
        if (this._audioBufferPool.length > 0) return this._audioBufferPool.shift();
        const {_outputChannelCount, _outputSampleRate, _bufferFrameCount, _audioContext} = this;
        const ret = _audioContext.createBuffer(_outputChannelCount, _bufferFrameCount, _outputSampleRate);
        this._audioBuffersAllocated++;
        if (this._audioBuffersAllocated > this._maxAudioBuffers) {
            self.uiLog(`Possible memory leak: over ${this._maxAudioBuffers} audio buffers allocated`);
        }
        return ret;
    }

    _freeArrayBuffer(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            arrayBuffer = arrayBuffer.buffer;
        }

        if (arrayBuffer.byteLength === this._arrayBufferByteLength) {
            this._arrayBufferPool.push(arrayBuffer);
        }
    }

    _allocArrayBuffer(size) {
        if (this._arrayBufferPool.length) return new Float32Array(this._arrayBufferPool.shift(), 0, size);
        this._arrayBuffersAllocated++;
        if (this._arrayBuffersAllocated > this._maxArrayBuffers) {
            self.uiLog(`Possible memory leak: over ${this._maxArrayBuffers} array buffers allocated`);
        }
        const buffer = new ArrayBuffer(this._arrayBufferByteLength);
        return new Float32Array(buffer, 0, size);
    }

    _determineResamplerQuality() {
        return this.env.isMobile() ? LOWEST_RESAMPLER_QUALITY : DESKTOP_RESAMPLER_QUALITY;
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

    setEffects(spec) {
        if (!Array.isArray(spec)) spec = [spec];
        this.postMessage({
            nodeId: -1,
            args: {
                effects: spec
            },
            methodName: `setEffects`
        });
    }
}
