

// Audio player implemented using AudioBuffers. Tracks are resampled and mixed
// Manually to hardware specs to guarantee seamless playback between consecutive
// Audiobuffers.

// Over ScriptProcessorNode it has the benefit of not having any
// Latency regardless of buffer size, the buffer size can be arbitrarily large
// So that audio doens't glitch when ui is blocked for a long time and
// In the catastrophic case where ui is blocked, the output will be silence
// Instead of ear destroying noise.

import {inherits, throttle, gcd} from "util";
import {AudioContext, ArrayBuffer, Float32Array,
        Blob, File, console, performance} from "platform/platform";
import EventEmitter from "events";
import {PLAYER_READY_EVENT_NAME} from "audio/AudioPlayerBackend";
import WorkerFrontend from "WorkerFrontend";

const NO_THROTTLE = {};
const EXPENSIVE_CALL_THROTTLE_TIME = 100;
const TARGET_BUFFER_LENGTH_SECONDS = 0.2;
const SUSTAINED_BUFFER_TIME_SECONDS = 1.6;
const FLOAT32_BYTES = 4;
const WEB_AUDIO_BLOCK_SIZE = 128;

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

function SourceDescriptor(buffer, info, channelData, isLastForTrack) {
    this.buffer = buffer;
    this.playedSoFar = 0;
    this.startTime = info.startTime;
    this.endTime = info.endTime;
    this.length = info.length;
    this.duration = info.length / buffer.sampleRate;
    this.started = -1;
    this.source = null;
    this.channelData = channelData;
    this.isLastForTrack = isLastForTrack;
}

SourceDescriptor.prototype.getRemainingDuration = function() {
    return this.duration - this.playedSoFar;
};

function NativeGetOutputTimestamp() {
    return this._audioContext.getOutputTimestamp();
}

function PolyfillGetOutputTimestamp() {
    return {
        contextTime: this._audioContext.currentTime,
        performanceTime: performance.now()
    };
}

let autoIncrementNodeId = 0;
export default class AudioPlayer extends WorkerFrontend {
    constructor(deps) {
        super(PLAYER_READY_EVENT_NAME, deps.workerWrapper);
        this.page = deps.page;
        this.env = deps.env;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.crossfadingPreferences = deps.crossfadingPreferences;
        this.effectPreferences = deps.effectPreferences;
        this.applicationPreferences = deps.applicationPreferences;

        this._audioContext = null;
        this._unprimedAudioContext = null;
        this._silentBuffer = null;
        this._previousAudioContextTime = -1;
        this._outputSampleRate = -1;
        this._outputChannelCount = -1;
        this._arrayBufferPool = [];
        this._audioBufferPool = [];
        this._sourceNodes = [];
        this._sustainedBufferCount = 0;
        this._bufferFrameCount = 0;
        this._playedAudioBuffersNeededForVisualization = 0;
        this._arrayBufferByteLength = 0;
        this._maxAudioBuffers = 0;
        this._maxArrayBuffers = 0;
        this._audioBufferTime = -1;
        this._audioBuffersAllocated = 0;
        this._arrayBuffersAllocated = 0;
        this._suspensionTimeoutMs = 20 * 1000;
        this._currentStateModificationAction = null;
        this._lastAudioContextRefresh = 0;

        this._playbackStoppedTime = performance.now();

        this._suspend = this._suspend.bind(this);

        this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
        this._hardwareLatency = 0;

        this.effectPreferences.on(`change`, async () => {
            await this.ready();
            this.setEffects(this.effectPreferences.getAudioPlayerEffects());
        });

        this._updateBackendConfig({resamplerQuality: this._determineResamplerQuality()});
        this.page.addDocumentListener(`touchend`, this._touchended.bind(this), true);

        this.getOutputTimestamp = typeof AudioContext.prototype.getOutputTimestamp === `function` ? NativeGetOutputTimestamp
                                                                                                  : PolyfillGetOutputTimestamp;
        this._resetAudioContext();
    }
}

AudioPlayer.prototype.receiveMessage = function(event) {
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
};

AudioPlayer.prototype._bufferFrameCountForSampleRate = function(sampleRate) {
    return TARGET_BUFFER_LENGTH_SECONDS * sampleRate;
};

AudioPlayer.prototype._updateBackendConfig = async function(config) {
    await this.ready();
    this._message(-1, `audioConfiguration`, config);
};

AudioPlayer.prototype._audioContextChanged = async function() {
    const {_audioContext} = this;
    const {channelCount} = _audioContext.destination;
    const {sampleRate} = _audioContext;

    this._previousAudioContextTime = _audioContext.currentTime;

    // TODO: Check -1 return vfalue from bufferFrameCountForSampleRate
    if (this._setAudioOutputParameters({channelCount, sampleRate})) {

        this._bufferFrameCount = this._bufferFrameCountForSampleRate(sampleRate);
        this._sustainedBufferCount = Math.ceil(SUSTAINED_BUFFER_TIME_SECONDS / (this._bufferFrameCount / sampleRate));
        this._maxAudioBuffers = this._sustainedBufferCount * channelCount * 2;
        this._maxArrayBuffers = this._maxAudioBuffers * 2;
        this._audioBufferTime = this._bufferFrameCount / sampleRate;
        this._arrayBufferByteLength = FLOAT32_BYTES * this._bufferFrameCount;
        this._playedAudioBuffersNeededForVisualization = Math.ceil(0.5 / this._audioBufferTime);
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
};

AudioPlayer.prototype._setAudioOutputParameters = function({sampleRate, channelCount}) {
    let changed = false;
    if (this._outputSampleRate !== sampleRate) {
        this._outputSampleRate = sampleRate;
        changed = true;
    }
    if (this._outputChannelCount !== channelCount) {
        this._outputChannelCount = channelCount;
        changed = true;
    }
    return changed;
};

AudioPlayer.prototype._touchended = async function() {
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

AudioPlayer.prototype._suspend = function() {
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
};

AudioPlayer.prototype._resetAudioContext = function() {
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
    this.emit(`audioContextReset`, this);
    this._audioContextChanged();
};

AudioPlayer.prototype._clearSuspensionTimer = function() {
    this._playbackStoppedTime = -1;
    this.page.clearTimeout(this._suspensionTimeoutId);
    this._suspensionTimeoutId = -1;
};

AudioPlayer.prototype._message = function(nodeId, methodName, args, transferList) {
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
};

AudioPlayer.prototype._freeTransferList = function(args, transferList) {
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
};

AudioPlayer.prototype._resetPools = function() {
    this._audioBuffersAllocated = 0;
    this._arrayBuffersAllocated = 0;
    this._audioBufferPool = [];
    this._arrayBufferPool = [];
};

AudioPlayer.prototype._freeAudioBuffer = function(audioBuffer) {
    if (audioBuffer.sampleRate === this._outputSampleRate &&
        audioBuffer.numberOfChannels === this._outputChannelCount &&
        audioBuffer.length === this._bufferFrameCount) {
        this._audioBufferPool.push(audioBuffer);
    }
};

AudioPlayer.prototype._allocAudioBuffer = function() {
    if (this._audioBufferPool.length > 0) return this._audioBufferPool.shift();
    const {_outputChannelCount, _outputSampleRate, _bufferFrameCount, _audioContext} = this;
    const ret = _audioContext.createBuffer(_outputChannelCount, _bufferFrameCount, _outputSampleRate);
    this._audioBuffersAllocated++;
    if (this._audioBuffersAllocated > this._maxAudioBuffers) {
        console.warn(`Possible memory leak: over ${this._maxAudioBuffers} audio buffers allocated`);
    }
    return ret;
};

AudioPlayer.prototype._freeArrayBuffer = function(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        arrayBuffer = arrayBuffer.buffer;
    }

    if (arrayBuffer.byteLength === this._arrayBufferByteLength) {
        this._arrayBufferPool.push(arrayBuffer);
    }
};

AudioPlayer.prototype._allocArrayBuffer = function(size) {
    if (this._arrayBufferPool.length) return new Float32Array(this._arrayBufferPool.shift(), 0, size);
    this._arrayBuffersAllocated++;
    if (this._arrayBuffersAllocated > this._maxArrayBuffers) {
        console.warn(`Possible memory leak: over ${this._maxArrayBuffers} array buffers allocated`);
    }
    const buffer = new ArrayBuffer(this._arrayBufferByteLength);
    return new Float32Array(buffer, 0, size);
};

const LOWEST = 2;
const DESKTOP = 4;
AudioPlayer.prototype._determineResamplerQuality = function() {
    return this.env.isMobile() ? LOWEST : DESKTOP;
};

AudioPlayer.prototype._sourceNodeDestroyed = function(node) {
    const i = this._sourceNodes.indexOf(node);
    if (i >= 0) this._sourceNodes.splice(i, 1);
};

AudioPlayer.prototype.getMaxLatency = function() {
    return this._bufferFrameCount / this._outputSampleRate / 2;
};

AudioPlayer.prototype.getHardwareLatency = function() {
    return this._hardwareLatency;
};

AudioPlayer.prototype.setHardwareLatency = function(amount) {
    amount = +amount;
    if (!isFinite(amount)) return;
    amount = Math.min(this.getMaxLatency(), Math.max(amount, 0));
    this._hardwareLatency = amount;
};

AudioPlayer.prototype.getCurrentTime = function() {
    return this._audioContext.currentTime;
};

AudioPlayer.prototype.getAudioContext = function() {
    return this._audioContext;
};

AudioPlayer.prototype.resume = function() {
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

};

AudioPlayer.prototype.playbackStopped = function() {
    this._clearSuspensionTimer();
    this._playbackStoppedTime = performance.now();
    this._suspensionTimeoutId = this.page.setTimeout(this._suspend, this._suspensionTimeoutMs);
};

AudioPlayer.prototype.playbackStarted = function() {
    this._clearSuspensionTimer();
};

AudioPlayer.prototype.getMaximumSeekTime = function(duration) {
    return Math.max(0, duration - (this._audioBufferTime + (2048 / this._audioContext.sampleRate)));
};

AudioPlayer.prototype.getBufferDuration = function() {
    return this._audioBufferTime;
};

AudioPlayer.prototype.createSourceNode = function() {
    const ret = new AudioPlayerSourceNode(this, autoIncrementNodeId++, this._audioContext);
    this._sourceNodes.push(ret);
    return ret;
};

AudioPlayer.prototype.setEffects = function(spec) {
    if (!Array.isArray(spec)) spec = [spec];
    this.postMessage({
        nodeId: -1,
        args: {
            effects: spec
        },
        methodName: `setEffects`
    });
};

function AudioPlayerSourceNode(player, id, audioContext) {
    EventEmitter.call(this);
    this._id = id;
    this._sourceEndedId = 0;
    this._seekRequestId = 0;
    this._audioBufferFillRequestId = 0;
    this._replacementRequestId = 0;

    this._lastExpensiveCall = 0;

    this._player = player;
    this._audioContext = audioContext;
    this._haveBlob = false;
    this._sourceStopped = true;
    this._node = audioContext.createGain();

    this._volume = 1;
    this._muted = false;
    this._loadingNext = false;

    // Due to AudioBuffers not having any timing events and them being long
    // Enough to ensure seamless and glitch-free playback, 2 times are tracked as
    // Otherwise only very sparse .getCurrentTime() resolution would be available.
    //
    // Base time is the precise known time and based on it, the current time can
    // Be calculated by calculating how long the current AudioBuffer has played
    // Which is complicated too and tracked in SourceDescriptor.
    this._currentTime = 0;
    this._baseTime = 0;
    this._duration = 0;

    this._paused = true;
    this._destroyed = false;
    this._loop = false;

    this._initialPlaythroughEmitted = false;
    this._currentSeekEmitted = false;
    this._lastBufferLoadedEmitted = false;
    this._endedEmitted = false;

    this._previousAudioContextTime = -1;
    this._previousHighResTime = -1;
    this._previousCombinedTime = -1;

    this._gaplessPreloadArgs = null;

    this._timeUpdate = this._timeUpdate.bind(this);
    this._sourceEnded = this._sourceEnded.bind(this);
    this._ended = this._ended.bind(this);

    this._timeUpdater = this.page().setInterval(this._timeUpdate, 32);

    this._player._message(-1, `register`, {
        id: this._id
    });

    this._bufferQueue = [];
    this._playedBufferQueue = [];
}
inherits(AudioPlayerSourceNode, EventEmitter);

AudioPlayerSourceNode.prototype.page = function() {
    return this._player.page;
};

AudioPlayerSourceNode.prototype.destroy = function() {
    if (this._destroyed) return;
    this.removeAllListeners();
    this.page().clearInterval(this._timeUpdater);
    this._player._message(this._id, `destroy`);
    this.unload();
    this._player._sourceNodeDestroyed(this);
    try {
        this.node().disconnect();
    } catch (e) {
        // NOOP
    }
    this._node = null;
    this._audioContext = null;
    this._timeUpdate =
    this._sourceEnded =
    this._ended = null;
    this._destroyed = true;
};

AudioPlayerSourceNode.prototype.adoptNewAudioContext = function(audioContext) {
    if (!this._sourceStopped) {
        throw new Error(`sources must be stopped while adopting new audio context`);
    }
    this._audioContext = audioContext;
    this._node = audioContext.createGain();
    this._previousAudioContextTime = -1;
    this._previousHighResTime = -1;
    this._previousCombinedTime = -1;

    if (this._bufferQueue.length > 0) {
        this._bufferQueue[0].started = audioContext.currentTime - this._bufferQueue[0].playedSoFar;
        for (let i = 1; i < this._bufferQueue.length; ++i) {
            const prev = this._bufferQueue[i - 1];
            this._bufferQueue[i].started = prev.started + prev.duration;
        }
    }
};

AudioPlayerSourceNode.prototype._getCurrentAudioBufferBaseTimeDelta = function(now) {
    const sourceDescriptor = this._bufferQueue[0];
    if (!sourceDescriptor) return 0;
    if (now === undefined) now = this._player.getCurrentTime();
    const {started} = sourceDescriptor;
    if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
        return 0;
    }

    if (this._paused || this._sourceStopped) return 0;
    return Math.min((now - started) + sourceDescriptor.playedSoFar, this._player.getBufferDuration());
};

AudioPlayerSourceNode.prototype._nullifyPendingLoadRequests = function() {
    this._seekRequestId++;
    this._sourceEndedId++;
    this._replacementRequestId++;
};

AudioPlayerSourceNode.prototype._nullifyPendingRequests = function() {
    this._audioBufferFillRequestId++;
    this._nullifyPendingLoadRequests();
};

AudioPlayerSourceNode.prototype._timeUpdate = function() {
    if (this._destroyed || this._loadingNext) return;
    const currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
    const currentTime = this._baseTime + currentBufferPlayedSoFar;
    this._currentTime = this._haveBlob ? Math.min(this._duration, currentTime) : currentTime;
    this.emit(`timeUpdate`, this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._ended = function() {
    if (this._endedEmitted || this._destroyed || this._loadingNext) return;

    this._player.playbackStopped();
    this._endedEmitted = true;

    if (this.hasGaplessPreload()) {
        this._currentTime = this._duration;
        this.emit(`timeUpdate`, this._currentTime, this._duration);
        this.emit(`ended`, true);
        return;
    }
    this._nullifyPendingRequests();
    this._currentTime = this._duration;
    this._stopSources();

    let sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
    if (this._loop) {
        this.setCurrentTime(0, NO_THROTTLE);
    } else {
        this.emit(`ended`, false);
    }
    this.emit(`timeUpdate`, this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._destroySourceDescriptor = function(sourceDescriptor) {
    if (sourceDescriptor.buffer === null) return;
    if (sourceDescriptor.source) {
        sourceDescriptor.source.descriptor = null;
        sourceDescriptor.source.onended = null;
        sourceDescriptor.source = null;
    }
    this._player._freeAudioBuffer(sourceDescriptor.buffer);
    for (let i = 0; i < sourceDescriptor.channelData.length; ++i) {
        this._player._freeArrayBuffer(sourceDescriptor.channelData[i]);
    }
    sourceDescriptor.buffer = null;
    sourceDescriptor.channelData = null;
};

AudioPlayerSourceNode.prototype._stopSource = function(sourceDescriptor) {
    if (sourceDescriptor.source) {
        sourceDescriptor.source.onended = null;
        try {
            sourceDescriptor.source.stop();
        } catch (e) {
            // NOOP
        }
        try {
            sourceDescriptor.source.disconnect();
        } catch (e) {
            // NOOP
        }
        sourceDescriptor.source = null;
    }
};

AudioPlayerSourceNode.prototype._sourceEndedPong = function(args) {
    // This is the only way to update the timers when screen is off on mobile.
    this._timeUpdate();
    if (this._sourceEndedId !== args.requestId) return;
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._sourceEnded = function(descriptor, source) {
    if (!descriptor) {
        console.warn(new Date().toISOString(), `!descriptor`,
                        `ended emitted`, this._endedEmitted,
                        `length`, this._bufferQueue.length);
        return;
    }

    const {length} = this._bufferQueue;
    let sourceDescriptor = null;
    if (length > 0) {
        sourceDescriptor = this._bufferQueue.shift();
    }

    if (!sourceDescriptor) {
        this._destroySourceDescriptor(descriptor);
        console.warn(new Date().toISOString(), `!sourceDescriptor`,
                     `ended emitted`, this._endedEmitted,
                     `prelen`, length,
                     `postlen`, this._bufferQueue.length,
                     `referencedStart`, descriptor.startTime,
                     `referencedEnd`, descriptor.endTime);
        this._ended();
        return;
    }

    if (sourceDescriptor !== descriptor) {
        console.warn(new Date().toISOString(), `sourceDescriptor !== descriptor`,
                     `ended emitted`, this._endedEmitted,
                     `prelen`, length,
                     `postlen`, this._bufferQueue.length,
                     `queuedStart`, sourceDescriptor.startTime,
                     `queuedEnd`, sourceDescriptor.endTime,
                     `referencedStart`, descriptor.startTime,
                     `referencedEnd`, descriptor.endTime);
        this._destroySourceDescriptor(descriptor);
        this._destroySourceDescriptor(sourceDescriptor);
        this._ended();
        return;
    }
    this._baseTime += sourceDescriptor.duration;

    source.descriptor = null;
    source.onended = null;
    sourceDescriptor.source = null;
    this._playedBufferQueue.push(sourceDescriptor);
    if (this._playedBufferQueue.length > this._player._playedAudioBuffersNeededForVisualization) {
        this._destroySourceDescriptor(this._playedBufferQueue.shift());
    }

    if (this._baseTime >= this._duration ||
        (sourceDescriptor.isLastForTrack && this._bufferQueue.length === 0)) {
        this._ended();
        return;
    }

    for (let i = 0; i < this._bufferQueue.length; ++i) {
        if (this._bufferQueue[i].isLastForTrack) return;
    }
    const id = ++this._sourceEndedId;
    // Delay the fillBuffers call in case more sourceEnded calls will come
    // Right after this one.
    this._player._message(this._id, `sourceEndedPing`, {requestId: id});
};

AudioPlayerSourceNode.prototype._lastSourceEnds = function() {
    if (this._sourceStopped) throw new Error(`sources are stopped`);
    if (this._bufferQueue.length === 0) return this._player.getCurrentTime();
    const sourceDescriptor = this._bufferQueue[this._bufferQueue.length - 1];
    return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
};

AudioPlayerSourceNode.prototype._startSource = function(sourceDescriptor, when) {
    if (this._destroyed) return -1;
    const {buffer} = sourceDescriptor;
    const duration = sourceDescriptor.getRemainingDuration();
    const src = this._audioContext.createBufferSource();
    let endedEmitted = false;
    sourceDescriptor.source = src;
    sourceDescriptor.started = when;
    src.buffer = buffer;
    src.connect(this.node());
    src.start(when, sourceDescriptor.playedSoFar);
    src.stop(when + duration);
    src.onended = () => {
        if (endedEmitted) return;
        endedEmitted = true;
        src.onended = null;
        this._sourceEnded(sourceDescriptor, src);
    };
    return when + duration;
};

AudioPlayerSourceNode.prototype._startSources = function() {
    if (this._destroyed || this._paused) return;
    if (!this._sourceStopped) throw new Error(`sources are not stopped`);
    this._player.playbackStarted();
    this._player.resume();
    this._sourceStopped = false;
    let now = this._player.getCurrentTime();

    for (let i = 0; i < this._bufferQueue.length; ++i) {
        now = this._startSource(this._bufferQueue[i], now);
    }

    if (!this._initialPlaythroughEmitted) {
        this._initialPlaythroughEmitted = true;
        this.emit(`initialPlaythrough`);
    }
};

AudioPlayerSourceNode.prototype._stopSources = function() {
    if (this._destroyed) return;
    this._player.playbackStopped();

    this._sourceStopped = true;
    const now = this._audioContext._currentTime;
    for (let i = 0; i < this._bufferQueue.length; ++i) {
        const sourceDescriptor = this._bufferQueue[i];
        const src = sourceDescriptor.source;
        sourceDescriptor.source = null;
        if (!src) continue;
        if (now >= sourceDescriptor.started &&
            now < sourceDescriptor.started + sourceDescriptor.duration) {
            sourceDescriptor.playedSoFar += (now - sourceDescriptor.started);
        }
        src.onended = null;

        try {
            src.stop();
        } catch (e) {
            // NOOP
        }
        try {
            src.disconnect();
        } catch (e) {
            // NOOP
        }
    }
};

const MAX_ANALYSER_SIZE = 65536;
// When visualizing audio it is better to visualize samples that will play right away
// Rather than what has already been played.
AudioPlayerSourceNode.prototype.getUpcomingSamples = function(input) {
    if (this._destroyed) return false;
    if (!(input instanceof Float32Array)) throw new Error(`need Float32Array`);
    let samplesNeeded = Math.min(MAX_ANALYSER_SIZE, input.length);
    const inputView = new Array(1);
    const inputBuffer = input.buffer;

    if (!this._sourceStopped) {
        const timestamp = this._player.getOutputTimestamp();
        let now = timestamp.contextTime;
        const hr = timestamp.performanceTime;
        const prevHr = this._previousHighResTime;

        // Workaround for bad values from polyfill
        if (now === this._previousAudioContextTime) {
            const reallyElapsed = Math.round(((hr - prevHr) * 1000)) / 1e6;
            now += reallyElapsed;
            this._previousCombinedTime = now;
        } else {
            this._previousAudioContextTime = now;
            this._previousHighResTime = hr;
        }

        if (now < this._previousCombinedTime) {
            now = this._previousCombinedTime + Math.round(((hr - prevHr) * 1000)) / 1e6;
        }

        let samplesIndex = 0;
        const bufferQueue = this._bufferQueue;
        const playedBufferQueue = this._playedBufferQueue;
        const latency = this._player.getHardwareLatency();

        if (bufferQueue.length === 0) {
            return false;
        }

        const buffers = [bufferQueue[0]];
        const {sampleRate} = this._audioContext;
        const offsetInCurrentBuffer = this._getCurrentAudioBufferBaseTimeDelta(now);

        if (Math.ceil((offsetInCurrentBuffer + (samplesNeeded / sampleRate) - latency) * sampleRate) > buffers[0].length &&
            bufferQueue.length < 2) {
            return false;
        } else {
            buffers.push(bufferQueue[1]);
        }

        if (offsetInCurrentBuffer < latency && playedBufferQueue.length === 0) {
            return false;
        } else {
            buffers.unshift(playedBufferQueue.length > 0 ? playedBufferQueue[0] : null);
        }

        const bufferIndex = offsetInCurrentBuffer >= latency ? 1 : 0;
        let bufferDataIndex = bufferIndex === 0 ? (buffers[0].length - ((latency * sampleRate) | 0)) + ((offsetInCurrentBuffer * sampleRate) | 0)
                                                : ((offsetInCurrentBuffer - latency) * sampleRate) | 0;

        for (let i = bufferIndex; i < buffers.length; ++i) {
            const j = bufferDataIndex;
            const buffer = buffers[i];
            const samplesRemainingInBuffer = Math.max(0, buffer.length - j);
            if (samplesRemainingInBuffer <= 0) {
                bufferDataIndex = 0;
                continue;
            }
            const byteLength = buffer.channelData[0].buffer.byteLength - j * 4;
            const fillCount = Math.min(samplesNeeded, samplesRemainingInBuffer, (byteLength / 4) | 0);
            const {channelData} = buffer;
            const sampleViews = new Array(channelData.length);
            for (let ch = 0; ch < sampleViews.length; ++ch) {
                sampleViews[ch] = new Float32Array(channelData[ch].buffer, j * 4, fillCount);
            }
            inputView[0] = new Float32Array(inputBuffer, samplesIndex * 4, samplesNeeded);
            const dst = inputView[0];
            if (channelData.length >= 2) {
                for (let k = 0; k < fillCount; ++k) {
                    dst[k] = Math.fround(Math.fround(sampleViews[0][k] + sampleViews[1][k]) / 2);
                }
            } else {
                dst.set(new Float32Array(sampleViews[0].buffer, sampleViews[0].byteOffset, fillCount));
            }
            samplesIndex += fillCount;
            samplesNeeded -= fillCount;

            if (samplesNeeded <= 0) {
                return true;
            }
            bufferDataIndex = 0;
        }
        return false;
    } else {
        for (let i = 0; i < input.length; ++i) {
            input[i] = 0;
        }
        return true;
    }
};

AudioPlayerSourceNode.prototype._getBuffersForTransferList = function(count) {
    const buffers = new Array(this._audioContext.destination.channelCount * count);
    const size = this._audioContext.sampleRate * this._player._audioBufferTime;
    for (let i = 0; i < buffers.length; ++i) {
        buffers[i] = this._player._allocArrayBuffer(size);
    }
    return buffers;
}
;
AudioPlayerSourceNode.prototype._fillBuffers = function() {
    if (!this._haveBlob || this._destroyed) return;
    if (this._bufferQueue.length < this._player._sustainedBufferCount) {
        const count = this._player._sustainedBufferCount - this._bufferQueue.length;

        this._player._message(this._id, `fillBuffers`, {
            count
        }, this._getBuffersForTransferList(count));
    }
};

AudioPlayerSourceNode.prototype._applyBuffers = function(args, transferList) {
    if (this._destroyed) {
        this._freeTransferList(transferList);
        return -1;
    }
    this._player.playbackStarted();

    const {channelCount, count} = args;
    const sources = new Array(count);

    for (let i = 0; i < count; ++i) {
        const audioBuffer = this._player._allocAudioBuffer();
        const channelData = new Array(channelCount);
        for (let ch = 0; ch < channelCount; ++ch) {
            const data = new Float32Array(transferList.shift(), 0, args.info[i].length);
            audioBuffer.copyToChannel(data, ch);
            channelData[ch] = data;
        }
        const sourceDescriptor = new SourceDescriptor(audioBuffer,
                                                    args.info[i],
                                                    channelData,
                                                    i === args.trackEndingBufferIndex);
        sources[i] = sourceDescriptor;

        if (sourceDescriptor.isLastForTrack &&
            sourceDescriptor.endTime < this._duration - this._player.getBufferDuration()) {
            this._duration = sourceDescriptor.endTime;
            this.emit(`timeUpdate`, this._currentTime, this._duration);
            this.emit(`durationChange`, this._duration);
        }
    }

    this._freeTransferList(transferList);
    let bufferPlayStartTime = this._player.getCurrentTime();
    if (count > 0) {
        if (this._sourceStopped) {
            this._bufferQueue.push(...sources);
            if (!this._paused) {
                this._startSources();
            }
        } else {
            let startTime = this._lastSourceEnds();
            bufferPlayStartTime = startTime;
            for (let i = 0; i < sources.length; ++i) {
                startTime = this._startSource(sources[i], startTime);
            }
            this._bufferQueue.push(...sources);
        }
    } else if (this._sourceStopped) {
        bufferPlayStartTime = -1;
        this._ended();
    }

    if (args.count > 0 && args.trackEndingBufferIndex !== -1) {
        this._fillBuffers();
    }
    return bufferPlayStartTime;
};

AudioPlayerSourceNode.prototype._checkIfLastBufferIsQueued = function() {
    if (this._bufferQueue.length === 0 ||
        this._bufferQueue[this._bufferQueue.length - 1].isLastForTrack &&
        !this._lastBufferLoadedEmitted) {
        this._lastBufferLoadedEmitted = true;
        this.emit(`lastBufferQueued`);
    }
};

AudioPlayerSourceNode.prototype._buffersFilled = function(args, transferList) {
    if (this._destroyed) {
        this._freeTransferList(transferList);
        return;
    }

    this._applyBuffers(args, transferList);
    this._checkIfLastBufferIsQueued();
};

AudioPlayerSourceNode.prototype.receiveMessage = function(event) {
    const {nodeId, methodName, args, transferList} = event.data;
    if (this._destroyed) return;
    if (nodeId === this._id) {
        this[methodName](args, transferList);
    }
};

AudioPlayerSourceNode.prototype.pause = function() {
    if (this._destroyed || this._paused) return;
    this._stopSources();
    this._paused = true;
};

AudioPlayerSourceNode.prototype.resume =
AudioPlayerSourceNode.prototype.play = function() {
    if (this._destroyed || !this._paused) return;
    if (this._duration > 0 &&
        this._currentTime > 0 &&
        this._currentTime >= this._duration) {
        return;
    }
    this._paused = false;
    if (this._bufferQueue.length > 0 && this._sourceStopped && this._haveBlob) {
        this._startSources();
    }
    this.emit(`timeUpdate`, this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype.isMuted = function() {
    return this._muted;
};

AudioPlayerSourceNode.prototype.isPaused = function() {
    return this._paused;
};

AudioPlayerSourceNode.prototype.setLooping = function() {
    this._loop = true;
};

AudioPlayerSourceNode.prototype.unsetLooping = function() {
    this._loop = false;
};

AudioPlayerSourceNode.prototype.mute = function() {
    if (this._destroyed) return;
    this._muted = true;
    this.node().gain.value = 0;
};

AudioPlayerSourceNode.prototype.unmute = function() {
    if (this._destroyed) return;
    this._muted = false;
    this.node().gain.value = this._volume;
};

AudioPlayerSourceNode.prototype.setVolume = function(vol) {
    if (this._destroyed) return;
    vol = +vol;
    if (!isFinite(vol)) return;
    vol = Math.min(1, Math.max(0, vol));
    this._volume = vol;
    this.node().gain.value = vol;
};

AudioPlayerSourceNode.prototype.getVolume = function() {
    return this._volume;
};

AudioPlayerSourceNode.prototype.node = function() {
    return this._node;
};

AudioPlayerSourceNode.prototype.getCurrentTime = function() {
    return this._currentTime;
};

AudioPlayerSourceNode.prototype.getDuration = function() {
    return this._duration;
};

AudioPlayerSourceNode.prototype._freeTransferList = function(transferList) {
    this._player._freeTransferList(null, transferList);
};

AudioPlayerSourceNode.prototype._seeked = function(args, transferList) {
    if (args.requestId !== this._seekRequestId || this._destroyed) {
        this._freeTransferList(transferList);
        return;
    }
    this._nullifyPendingRequests();
    this._currentSeekEmitted = false;
    this._endedEmitted = false;
    this._baseTime = args.baseTime;
    this._stopSources();

    let sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }

    this._timeUpdate();
    this._applyBuffers(args, transferList);
    this._checkIfLastBufferIsQueued();
    if (args.isUserSeek) {
        this.emit(`seekComplete`, this._currentTime);
    }
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._seek = function(time, isUserSeek) {
    if (!this.isSeekable()) return;
    const requestId = ++this._seekRequestId;
    this._player._message(this._id, `seek`, {
        requestId,
        count: 1,
        time,
        isUserSeek
    }, this._getBuffersForTransferList(1));
    if (!this._currentSeekEmitted && isUserSeek) {
        this._currentSeekEmitted = true;
        this.emit(`seeking`, this._currentTime);
    }
};

AudioPlayerSourceNode.prototype._resetAudioBuffers = function() {
    if (this.isSeekable() && this._haveBlob) {
        this.setCurrentTime(this._currentTime, true);
    } else {
        this.destroy();
    }
};

AudioPlayerSourceNode.prototype.setCurrentTime = function(time, noThrottle) {
    if (!this.isSeekable()) {
        return;
    }

    time = +time;
    if (!isFinite(time)) {
        throw new Error(`time is not finite`);
    }
    time = Math.max(0, time);
    if (this._haveBlob) {
        time = Math.min(this._player.getMaximumSeekTime(this._duration), time);
    }

    this._currentTime = time;
    this._baseTime = this._currentTime - this._getCurrentAudioBufferBaseTimeDelta();
    this._timeUpdate();

    if (!this._haveBlob || !this.isSeekable()) {
        return;
    }

    this._nullifyPendingRequests();
    if (noThrottle === NO_THROTTLE) {
        this._seek(this._currentTime, false);
    } else {
        const now = performance.now();
        if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
            this._seek(this._currentTime, true);
        } else {
            this._throttledSeek(this._currentTime);
        }
        this._lastExpensiveCall = now;
    }
};

AudioPlayerSourceNode.prototype.unload = function() {
    if (this._destroyed) return;
    this._gaplessPreloadArgs = null;
    this._nullifyPendingRequests();
    this._currentTime = this._duration = this._baseTime = 0;
    this._haveBlob = false;
    this._seeking = false;
    this._initialPlaythroughEmitted = false;
    this._currentSeekEmitted = false;
    this._lastBufferLoadedEmitted = false;
    this._endedEmitted = false;
    this._stopSources();

    let sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }

    while (sourceDescriptor = this._playedBufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
};

AudioPlayerSourceNode.prototype.isSeekable = function() {
    return !(this._destroyed || this._lastBufferLoadedEmitted) && !this._loadingNext;
};

AudioPlayerSourceNode.prototype._error = function(args, transferList) {
    if (this._destroyed) {
        this._freeTransferList(transferList);
        return;
    }
    this._freeTransferList(transferList);
    const e = new Error(args.message);
    e.name = args.name;
    e.stack = args.stack;
    if (this._player.env.isDevelopment()) {
        console.error(e.stack);
    }
    this.unload();
    this.emit(`error`, e);
};

AudioPlayerSourceNode.prototype._blobLoaded = function(args) {
    if (this._destroyed) return;
    if (this._replacementRequestId !== args.requestId) return;
    this._loadingNext = false;
    this._haveBlob = true;
    this._duration = args.metadata.duration;
    this._currentTime = Math.min(this._player.getMaximumSeekTime(this._duration), Math.max(0, this._currentTime));
    this._seek(this._currentTime, false);
    this.emit(`timeUpdate`, this._currentTime, this._duration);
    this.emit(`canPlay`);
};

AudioPlayerSourceNode.prototype.hasGaplessPreload = function() {
    return this._gaplessPreloadArgs !== null;
};

AudioPlayerSourceNode.prototype.replaceUsingGaplessPreload = function() {
    if (this._destroyed) return -1;
    if (!this.hasGaplessPreload()) throw new Error(`no gapless preload`);
    const args = this._gaplessPreloadArgs;
    this._gaplessPreloadArgs = null;
    this._lastBufferLoadedEmitted = false;
    this._applyReplacementLoadedArgs(args);
    this._fillBuffers();
    return args.replacementFirstBufferStartTime;
};

AudioPlayerSourceNode.prototype._applyReplacementLoadedArgs = function(args) {
    if (this._destroyed) return;
    this._duration = args.metadata.duration;
    this._baseTime = args.baseTime;
    this._currentSeekEmitted = false;
    this._lastBufferLoadedEmitted = false;
    this._nullifyPendingLoadRequests();
    this._timeUpdate();
};

AudioPlayerSourceNode.prototype._replacementLoaded = function(args, transferList) {
    if (args.requestId !== this._replacementRequestId || this._destroyed) {
        this._freeTransferList(transferList);
        return;
    }
    this._loadingNext = false;

    if (args.gaplessPreload) {
        const replacementFirstBufferStartTime = this._applyBuffers(args, transferList);
        this._gaplessPreloadArgs = Object.assign({
            replacementFirstBufferStartTime
        }, args);
        return;
    }
    this._applyReplacementLoadedArgs(args);
    this._stopSources();
    let sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
    const replacementFirstBufferStartTime = this._applyBuffers(args, transferList);
    this._fillBuffers();
    // Sync so that proper gains nodes are set up already when applying the buffers
    // For this track.
    this.emit(`replacementLoaded`, replacementFirstBufferStartTime);
};

AudioPlayerSourceNode.prototype._actualReplace = function(blob, seekTime, gaplessPreload, metadata) {
    if (this._destroyed) return;
    if (!this._haveBlob) {
        this.load(blob, seekTime, metadata);
        return;
    }

    if (this.hasGaplessPreload() && gaplessPreload) {
        let lastFound = false;
        for (let i = 0; i < this._bufferQueue.length; ++i) {
            if (this._bufferQueue[i].isLastForTrack) {
                lastFound = true;
                continue;
            }

            if (lastFound) {
                this._stopSource(this._bufferQueue[i]);
                this._destroySourceDescriptor(this._bufferQueue[i]);
                this._bufferQueue.splice(i, 1);
                i--;
            }
        }
    }

    this._gaplessPreloadArgs = null;
    this._endedEmitted = false;

    if (seekTime === undefined) {
        seekTime = 0;
    }

    const requestId = ++this._replacementRequestId;
    this._player._message(this._id, `loadReplacement`, {
        blob,
        requestId,
        seekTime,
        count: 1,
        gaplessPreload: !!gaplessPreload,
        metadata
    }, this._getBuffersForTransferList(1));
};


// Seamless replacement of current track with the next.
AudioPlayerSourceNode.prototype.replace = function(blob, seekTime, gaplessPreload, metadata) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;
    this._loadingNext = true;
    this._nullifyPendingRequests();
    const now = performance.now();
    if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
        this._actualReplace(blob, seekTime, gaplessPreload, metadata);
    } else {
        this._replaceThrottled(blob, seekTime, gaplessPreload, metadata);
    }
    this._lastExpensiveCall = now;
};

AudioPlayerSourceNode.prototype._actualLoad = function(blob, seekTime, metadata) {
    if (this._destroyed) return;
    if (seekTime === undefined) {
        seekTime = 0;
    }

    this.unload();
    this._currentTime = this._baseTime = seekTime;
    const fillRequestId = ++this._replacementRequestId;
    this._player._message(this._id, `loadBlob`, {
        blob,
        requestId: fillRequestId,
        metadata
    });
};

AudioPlayerSourceNode.prototype.load = function(blob, seekTime, metadata) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;
    if (!(blob instanceof Blob) && !(blob instanceof File)) {
        throw new Error(`blob must be a blob`);
    }
    this._nullifyPendingRequests();
    const now = performance.now();
    this._loadingNext = true;
    if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
        this._actualLoad(blob, seekTime, metadata);
    } else {
        this._loadThrottled(blob, seekTime, metadata);
    }
    this._lastExpensiveCall = now;
};

AudioPlayerSourceNode.prototype._throttledSeek = function(time) {
    this._seek(time, true);
};

AudioPlayerSourceNode.prototype._replaceThrottled = function(blob, seekTime, gaplessPreload, metadata) {
    this._actualReplace(blob, seekTime, gaplessPreload, metadata);
};

AudioPlayerSourceNode.prototype._loadThrottled = function(blob, seekTime, metadata) {
    this._actualLoad(blob, seekTime, metadata);
};

AudioPlayerSourceNode.prototype._throttledSeek = throttle(AudioPlayerSourceNode.prototype._throttledSeek,
        EXPENSIVE_CALL_THROTTLE_TIME);
AudioPlayerSourceNode.prototype._loadThrottled = throttle(AudioPlayerSourceNode.prototype._loadThrottled,
        EXPENSIVE_CALL_THROTTLE_TIME);
AudioPlayerSourceNode.prototype._replaceThrottled = throttle(AudioPlayerSourceNode.prototype._replaceThrottled,
        EXPENSIVE_CALL_THROTTLE_TIME);
