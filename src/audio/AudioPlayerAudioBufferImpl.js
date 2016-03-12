"use strict";

// Audio player implemented using AudioBuffers. Tracks are resampled and mixed
// manually to hardware specs to guarantee seamless playback between consecutive
// audiobuffers.

// Over ScriptProcessorNode it has the benefit of not having any
// latency regardless of buffer size, the buffer size can be arbitrarily large
// so that audio doens't glitch when ui is blocked for a long time and
// in the catastrophic case where ui is blocked, the output will be silence
// instead of ear destroying noise.

import Promise from "lib/bluebird";
import { inherits, throttle } from "lib/util";
import EventEmitter from "lib/events";
import ChannelMixer from "audio/ChannelMixer";
import patchAudioContext from "lib/audiocontextpatch";
import simulateTick from "lib/patchtimers";

const NO_THROTTLE = {};
const EXPENSIVE_CALL_THROTTLE_TIME = 200;

const AUDIO_PLAYER_WORKER_SRC = window.DEBUGGING
    ? "dist/worker/AudioPlayerWorker.js" : "dist/worker/AudioPlayerWorker.min.js";

const asap = function(fn) {
    fn();
};

const makeAudioContext = function() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    var ret = new AudioContext();
    patchAudioContext(AudioContext, ret);
    return ret;
};

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

SourceDescriptor.prototype.hash = function() {
    var channels = this.channelData.length;
    var ret = [];
    for (var ch = 0; ch < channels; ++ch) {
        var sum = 0;
        var data = this.channelData[ch];
        for (var i = 0; i < this.length; ++i) {
            sum += data[i];
        }
        ret.push(sum);
    }
    return ret;
};

SourceDescriptor.prototype.getRemainingDuration = function() {
    return this.duration - this.playedSoFar;
};

function webAudioBlockSize(value) {
    const BLOCK_SIZE = 128;
    if (value % BLOCK_SIZE === 0) return value;
    return value + (BLOCK_SIZE - (value % BLOCK_SIZE));
}

const BUFFER_SAMPLES = webAudioBlockSize(48000 * 1);
const BUFFER_ALLOCATION_SIZE = 1048576;
const PRELOAD_BUFFER_COUNT = 2;
const SUSTAINED_BUFFER_COUNT = 4;
const MAX_AUDIO_BUFFERS = SUSTAINED_BUFFER_COUNT * 3 * 2;
const MAX_ARRAY_BUFFERS = SUSTAINED_BUFFER_COUNT * 3 * 2 * 6;

var codeIsCold = true;
const getPreloadBufferCount = function() {
    if (codeIsCold) {
        return (PRELOAD_BUFFER_COUNT * 1.5)|0;
    }
    return PRELOAD_BUFFER_COUNT;
}

var nodeId = 0;
var instances = false;
export default function AudioPlayer(audioContext, suspensionTimeout) {
    EventEmitter.call(this);
    if (instances) throw new Error("only 1 AudioPlayer instance can be made");
    if (!suspensionTimeout) suspensionTimeout = 20;
    instances = true;
    this._audioContext = audioContext || makeAudioContext();
    this._previousAudioContextTime = this._audioContext.currentTime;
    this._worker = new Worker(AUDIO_PLAYER_WORKER_SRC);
    this._arrayBufferPool = [];
    this._audioBufferPool = [];
    this._sourceNodes = [];
    this._audioBufferTime = BUFFER_SAMPLES / this._audioContext.sampleRate;
    this._message(-1, "audioConfiguration", {
        channels: this._audioContext.destination.channelCount,
        sampleRate: this._audioContext.sampleRate,
        bufferTime: this._audioBufferTime,
        resamplerQuality: this._determineResamplerQuality()
    });
    this._audioBuffersAllocated = 0;
    this._arrayBuffersAllocated = 0;
    this._suspensionTimeoutMs = suspensionTimeout * 1000;
    this._currentStateModificationAction = null;
    this._lastAudioContextRefresh = 0;
    this._playbackStoppedTime = Date.now();

    this._messaged = this._messaged.bind(this);
    this._suspend = this._suspend.bind(this);

    this._worker.addEventListener("message", this._messaged, false);
    this._suspensionTimeoutId = setTimeout(this._suspend, this._suspensionTimeoutMs);
    this._hardwareLatency = 0;

    this.ready = new Promise(function(resolve) {
        var ready = function(event) {
            this._worker.removeEventListener("message", ready, false);
            resolve();
        }.bind(this);
        this._worker.addEventListener("message", ready, false);
    }.bind(this));
}
inherits(AudioPlayer, EventEmitter);
AudioPlayer.webAudioBlockSize = webAudioBlockSize;

AudioPlayer.prototype._suspend = function() {
    if (this._audioContext.state === "suspended") return Promise.resolve();
    var self = this;

    if (!this._currentStateModificationAction) {
        this._currentStateModificationAction = {
            type: "suspend",
            promise: Promise.resolve(this._audioContext.suspend()).finally(function() {
                self._currentStateModificationAction = null;
            })
        };
        return this._currentStateModificationAction.promise;
    } else if (this._currentStateModificationAction.type === "resume") {
        this._currentStateModificationAction.promise = this._currentStateModificationAction.promise.finally(function() {
            return self._suspend();
        }).finally(function() {
            self._currentStateModificationAction = null;
        });
        return this._currentStateModificationAction.promise;
    }
    return this._currentStateModificationAction.promise;
};

AudioPlayer.prototype._resetAudioContext = function() {
    try {
        this._audioContext.close();
    } catch (e) {}
    this._audioContext = makeAudioContext();
    for (var i = 0; i < this._sourceNodes.length; ++i) {
        this._sourceNodes[i].adoptNewAudioContext(this._audioContext);
    }
    this.emit("audioContextReset", this);
};

AudioPlayer.prototype._clearSuspensionTimer = function() {
    this._playbackStoppedTime = -1;
    if (this._suspensionTimeoutId !== -1) {
        clearTimeout(this._suspensionTimeoutId);
        this._suspensionTimeoutId = -1;
    }
};

AudioPlayer.prototype._messaged = function(event) {
    if ((event.data.nodeId < 0 || event.data.nodeId === undefined) &&
        event.data.methodName) {
        var data = event.data;
        this[data.methodName].call(this, data.args, data.transferList);
    }
};

AudioPlayer.prototype._message = function(nodeId, methodName, args, transferList) {
    if (transferList === undefined) transferList = [];
    args = Object(args);
    transferList = transferList.map(function(v) {
        if (v.buffer) return v.buffer;
        return v;
    });
    this._worker.postMessage({
        nodeId: nodeId,
        methodName: methodName,
        args: args,
        transferList: transferList
    }, transferList);
};

AudioPlayer.prototype._freeTransferList = function(args, transferList) {
    if (!transferList) return;

    while (transferList.length > 0) {
        var item = transferList.pop();
        if (!(item instanceof ArrayBuffer)) {
            item = item.buffer;
        }
        if (item.byteLength > 0) {
            this._freeArrayBuffer(item);
        }
    }
};

AudioPlayer.prototype._freeAudioBuffer = function(audioBuffer) {
    this._audioBufferPool.push(audioBuffer);
};

AudioPlayer.prototype._allocAudioBuffer = function() {
    if (this._audioBufferPool.length > 0) return this._audioBufferPool.shift();
    var ret = this._audioContext.createBuffer(this._audioContext.destination.channelCount,
                                              BUFFER_SAMPLES,
                                              this._audioContext.sampleRate);
    this._audioBuffersAllocated++;
    if (this._audioBuffersAllocated > MAX_AUDIO_BUFFERS) {
        if (window.console && console.warn) {
            console.warn("Possible memory leak: over " + MAX_AUDIO_BUFFERS + " audio buffers allocated");
        }
    }
    return ret;
};

AudioPlayer.prototype._freeArrayBuffer = function(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        arrayBuffer = arrayBuffer.buffer;
    }
    this._arrayBufferPool.push(arrayBuffer);
};

AudioPlayer.prototype._allocArrayBuffer = function(size) {
    if (this._arrayBufferPool.length) return new Float32Array(this._arrayBufferPool.shift(), 0, size);
    this._arrayBuffersAllocated++;
    if (this._arrayBuffersAllocated > MAX_ARRAY_BUFFERS) {
        if (window.console && console.warn) {
            console.warn("Possible memory leak: over " + MAX_ARRAY_BUFFERS + " array buffers allocated");
        }
    }
    var buffer = new ArrayBuffer(BUFFER_ALLOCATION_SIZE);
    return new Float32Array(buffer, 0, size);
};

const LOWEST = 2;
const DESKTOP = 4;
AudioPlayer.prototype._determineResamplerQuality = function() {
    return isMobile() ? LOWEST : DESKTOP;
};

AudioPlayer.prototype._sourceNodeDestroyed = function(node) {
    var i = this._sourceNodes.indexOf(node);
    if (i >= 0) this._sourceNodes.splice(i, 1);
};

AudioPlayer.prototype.getMaxLatency = function() {
    return BUFFER_SAMPLES / this._audioContext.sampleRate / 2;
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
    if (this._audioContext.state === "running") {
        if (this._playbackStoppedTime !== -1 &&
            Date.now() - this._playbackStoppedTime > this._suspensionTimeoutMs) {
            this._playbackStoppedTime = -1;
            this.emit("audioContextSuspend", this);
            this._resetAudioContext();
        }
        return;
    }

    // Reset AudioContext as it's probably ruined despite of suspension efforts.
    if (!this._currentStateModificationAction) {
        this._resetAudioContext();
    } else if (this._currentStateModificationAction.type === "suspend") {
        this._currentStateModificationAction = null;
        this._resetAudioContext();
    }
    return;
};

AudioPlayer.prototype.playbackStopped = function() {
    this._clearSuspensionTimer();
    this._playbackStoppedTime = Date.now();
    this._suspensionTimeoutId = setTimeout(this._suspend, this._suspensionTimeoutMs);
};

AudioPlayer.prototype.playbackStarted = function() {
    this._clearSuspensionTimer();
};

AudioPlayer.prototype.getMaximumSeekTime = function(duration) {
    return Math.max(0, duration - (this._audioBufferTime + (2048 / this._audioContext.sampleRate)));
};

AudioPlayer.prototype.blockSizedTime = function(time) {
    return webAudioBlockSize(this._audioContext.sampleRate * time) /
            this._audioContext.sampleRate;
};

AudioPlayer.prototype.getBufferDuration = function() {
    return this._audioBufferTime;
};

AudioPlayer.prototype.createSourceNode = function() {
    var ret = new AudioPlayerSourceNode(this, nodeId++, this._audioContext, this._worker);
    this._sourceNodes.push(ret);
    return ret;
};

AudioPlayer.prototype.setEffects = function(spec) {
    if (!Array.isArray(spec)) spec = [spec];
    this._worker.postMessage({
        nodeId: -1,
        args: {
            effects: spec
        },
        methodName: "setEffects"
    });
};

function AudioPlayerSourceNode(player, id, audioContext, worker) {
    EventEmitter.call(this);
    this._id = id;
    this._sourceEndedId = 0;
    this._seekRequestId = 0;
    this._audioBufferFillRequestId = 0;
    this._replacementRequestId = 0;

    this._lastExpensiveCall = 0;

    this._player = player;
    this._audioContext = audioContext;
    this._worker = worker;
    this._haveBlob = false;
    this._sourceStopped = true;
    this._node = audioContext.createGain();

    this._volume = 1;
    this._muted = false;
    this._loadingNext = false;

    // Due to AudioBuffers not having any timing events and them being long
    // enough to ensure seamless and glitch-free playback, 2 times are tracked as
    // otherwise only very sparse .getCurrentTime() resolution would be available.
    //
    // Base time is the precise known time and based on it, the current time can
    // be calculated by calculating how long the current AudioBuffer has played
    // which is complicated too and tracked in SourceDescriptor.
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

    this._messaged = this._messaged.bind(this);
    this._timeUpdate = this._timeUpdate.bind(this);
    this._sourceEnded = this._sourceEnded.bind(this);
    this._ended = this._ended.bind(this);

    this._timeUpdater = setInterval(this._timeUpdate, 32);

    this._worker.addEventListener("message", this._messaged, false);
    this._player._message(-1, "register", {
        id: this._id
    });

    this._bufferQueue = [];
    this._playedBufferQueue = [];
}
inherits(AudioPlayerSourceNode, EventEmitter);

AudioPlayerSourceNode.prototype.destroy = function() {
    if (this._destroyed) return;
    this.removeAllListeners();
    clearInterval(this._timeUpdater);
    this._player._message(this._id, "destroy");
    this.unload();
    this._worker.removeEventListener("message", this._messaged, false);
    this._player._sourceNodeDestroyed(this);
    try {
        this.node().disconnect();
    } catch (e) {}
    this._node = null;
    this._audioContext = this._worker = null;
    this._messaged =
    this._timeUpdate =
    this._sourceEnded =
    this._ended = null;
    this._destroyed = true;
};

AudioPlayerSourceNode.prototype.adoptNewAudioContext = function(audioContext) {
    if (!this._sourceStopped) {
        throw new Error("sources must be stopped while adopting new audio context");
    }
    this._audioContext = audioContext;
    this._node = audioContext.createGain();
    this._previousAudioContextTime = -1;
    this._previousHighResTime = -1;
    this._previousCombinedTime = -1;

    if (this._bufferQueue.length > 0) {
        this._bufferQueue[0].started = audioContext.currentTime - this._bufferQueue[0].playedSoFar;
        for (var i = 1; i < this._bufferQueue.length; ++i) {
            var prev = this._bufferQueue[i - 1];
            this._bufferQueue[i].started = prev.started + prev.duration;
        }
    }
};

AudioPlayerSourceNode.prototype._getCurrentAudioBufferBaseTimeDelta = function(now) {
    var sourceDescriptor = this._bufferQueue[0];
    if (!sourceDescriptor) return 0;
    if (now === undefined) now = this._player.getCurrentTime();
    var started = sourceDescriptor.started;
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
    var currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
    var currentTime = this._baseTime + currentBufferPlayedSoFar;
    this._currentTime = this._haveBlob ? Math.min(this._duration, currentTime) : currentTime;
    this.emit("timeUpdate", this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._ended = function() {
    if (this._endedEmitted || this._destroyed || this._loadingNext) return;

    this._player.playbackStopped();
    this._endedEmitted = true;

    if (this.hasGaplessPreload()) {
        this._currentTime = this._duration;
        this.emit("timeUpdate", this._currentTime, this._duration);
        this.emit("ended", true);
        return;
    }
    this._nullifyPendingRequests();
    this._currentTime = this._duration;
    this._stopSources();

    var sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
    if (this._loop) {
        this.setCurrentTime(0, NO_THROTTLE);
    } else {
        this.emit("ended", false);
    }
    this.emit("timeUpdate", this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._destroySourceDescriptor = function(sourceDescriptor) {
    if (sourceDescriptor.source) {
        sourceDescriptor.source.onended = null;
        sourceDescriptor.source = null;
    }
    this._player._freeAudioBuffer(sourceDescriptor.buffer);
    for (var i = 0; i < sourceDescriptor.channelData.length; ++i) {
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
        } catch (e) {}
        try {
            sourceDescriptor.source.disconnect();
        } catch (e) {}
        sourceDescriptor.source = null;
    }
};

AudioPlayerSourceNode.prototype._sourceEndedPong = function(args) {
    // This is the only way to update the timers when screen is off on mobile.
    this._timeUpdate();
    if (this._sourceEndedId !== args.requestId) return;
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._sourceEnded = function(event) {
    simulateTick();
    var source = event.target;
    if (!source.onended) return;
    var sourceDescriptor = this._bufferQueue.shift();

    if (sourceDescriptor.source !== source) {
        throw new Error("should not happen");
    }
    this._baseTime += sourceDescriptor.duration;

    source.onended = null;
    sourceDescriptor.source = null;
    this._playedBufferQueue.push(sourceDescriptor);
    if (this._playedBufferQueue.length > PRELOAD_BUFFER_COUNT) {
        this._destroySourceDescriptor(this._playedBufferQueue.shift());
    }

    if (this._baseTime >= this._duration ||
        (sourceDescriptor.isLastForTrack && this._bufferQueue.length === 0)) {
        return this._ended();
    }

    for (var i = 0; i < this._bufferQueue.length; ++i) {
        if (this._bufferQueue[i].isLastForTrack) return;
    }
    var id = ++this._sourceEndedId;
    // Delay the fillBuffers call in case more sourceEnded calls will come
    // right after this one.
    this._player._message(this._id, "sourceEndedPing", {requestId: id});
};

AudioPlayerSourceNode.prototype._lastSourceEnds = function() {
    if (this._sourceStopped) throw new Error("sources are stopped");
    if (this._bufferQueue.length === 0) return this._player.getCurrentTime();
    var sourceDescriptor = this._bufferQueue[this._bufferQueue.length - 1];
    return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
};

AudioPlayerSourceNode.prototype._startSource = function(sourceDescriptor, when) {
    if (this._destroyed) return;
    var buffer = sourceDescriptor.buffer;
    var duration = sourceDescriptor.getRemainingDuration();
    var src = this._audioContext.createBufferSource();
    sourceDescriptor.started = when;
    src.buffer = buffer;
    src.connect(this.node());
    src.start(when, sourceDescriptor.playedSoFar);
    src.stop(when + duration);
    src.onended = this._sourceEnded;
    sourceDescriptor.source = src;
    return when + duration;
};

AudioPlayerSourceNode.prototype._startSources = function() {
    if (this._destroyed || this._paused) return;
    if (!this._sourceStopped) throw new Error("sources are not stopped");
    this._player.playbackStarted();
    this._player.resume();
    this._sourceStopped = false;
    var now = this._player.getCurrentTime();

    for (var i = 0; i < this._bufferQueue.length; ++i) {
        now = this._startSource(this._bufferQueue[i], now);
    }

    if (!this._initialPlaythroughEmitted) {
        this._initialPlaythroughEmitted = true;
        this.emit("initialPlaythrough");
    }
};

AudioPlayerSourceNode.prototype._stopSources = function() {
    if (this._destroyed) return;
    this._player.playbackStopped();

    this._sourceStopped = true;
    var now = this._audioContext._currentTime;
    for (var i = 0; i < this._bufferQueue.length; ++i) {
        var sourceDescriptor = this._bufferQueue[i];
        var src = sourceDescriptor.source;
        sourceDescriptor.source = null;
        if (!src) continue;
        if (now >= sourceDescriptor.started &&
            now < sourceDescriptor.started + sourceDescriptor.duration) {
            sourceDescriptor.playedSoFar += (now - sourceDescriptor.started);
        }
        src.onended = null;

        try {
            src.stop();
        } catch (e) {}
        try {
            src.disconnect();
        } catch (e) {}
    }
};

var prevWithElapsed = -1;
const MAX_ANALYSER_SIZE = 65536;
const analyserChannelMixer = new ChannelMixer(1);
// When visualizing audio it is better to visualize samples that will play right away
// rather than what has already been played.
AudioPlayerSourceNode.prototype.getUpcomingSamples = function(input) {
    if (this._destroyed) return false;
    if (!(input instanceof Float32Array)) throw new Error("need Float32Array");
    var samplesNeeded = Math.min(MAX_ANALYSER_SIZE, input.length);
    var inputView = new Array(1);
    var inputBuffer = input.buffer;

    if (!this._sourceStopped) {
        var now = this._player.getCurrentTime();
        var hr = performance.now();
        var prevHr = this._previousHighResTime;

        // This happens even on desktops....
        if (now === this._previousAudioContextTime) {
            var reallyElapsed = Math.round(((hr - prevHr) * 1000)) / 1e6;
            now += reallyElapsed;
            this._previousCombinedTime = now;
        } else {
            this._previousAudioContextTime = now;
            this._previousHighResTime = hr;
        }

        if (now < this._previousCombinedTime) {
            now = this._previousCombinedTime + Math.round(((hr - prevHr) * 1000)) / 1e6;
        }

        var samplesIndex = 0;
        var additionalTime = 0;
        var bufferQueue = this._bufferQueue;
        var playedBufferQueue = this._playedBufferQueue;
        var latency = this._player.getHardwareLatency();

        if (bufferQueue.length === 0) {
            return false;
        }

        var buffers = [bufferQueue[0]];
        var sampleRate = this._audioContext.sampleRate;
        var offsetInCurrentBuffer = this._getCurrentAudioBufferBaseTimeDelta(now);

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

        var bufferIndex = offsetInCurrentBuffer >= latency ? 1 : 0;
        var bufferDataIndex = bufferIndex === 0 ? (buffers[0].length - ((latency * sampleRate)|0)) + ((offsetInCurrentBuffer * sampleRate)|0)
                                                : ((offsetInCurrentBuffer - latency) * sampleRate)|0;

        for (var i = bufferIndex; i < buffers.length; ++i) {
            var j = bufferDataIndex;
            var buffer = buffers[i];
            var samplesRemainingInBuffer = buffer.length - j;
            var byteLength = buffer.channelData[0].buffer.byteLength - j * 4;
            var fillCount = Math.min(samplesNeeded, samplesRemainingInBuffer, byteLength / 4);
            var channelData = buffer.channelData;
            var sampleViews = new Array(channelData.length);
            for (var ch = 0; ch < sampleViews.length; ++ch) {
                sampleViews[ch] = new Float32Array(channelData[ch].buffer, j * 4, fillCount);
            }
            inputView[0] = new Float32Array(inputBuffer, samplesIndex * 4, samplesNeeded);
            analyserChannelMixer.mix(sampleViews, fillCount, inputView);
            samplesIndex += fillCount;
            samplesNeeded -= fillCount;

            if (samplesNeeded <= 0) {
                return true;
            }
            bufferDataIndex = 0;
        }
        return false;
    } else {
        for (var i = 0; i < input.length; ++i) {
            input[i] = 0;
        }
        return true;
    }
};

AudioPlayerSourceNode.prototype._getBuffersForTransferList = function(count) {
    var buffers = new Array(this._audioContext.destination.channelCount * count);
    var size = this._audioContext.sampleRate * this._player._audioBufferTime;
    for (var i = 0; i < buffers.length; ++i) {
        buffers[i] = this._player._allocArrayBuffer(size);
    }
    return buffers;
};

AudioPlayerSourceNode.prototype._fillBuffers = function() {
    if (!this._haveBlob || this._destroyed) return;

    if (this._bufferQueue.length < SUSTAINED_BUFFER_COUNT) {
        var count = SUSTAINED_BUFFER_COUNT - this._bufferQueue.length;

        this._player._message(this._id, "fillBuffers", {
            count: count
        }, this._getBuffersForTransferList(count));
    }
};

AudioPlayerSourceNode.prototype._applyBuffers = function(args, transferList) {
    if (this._destroyed) return this._freeTransferList(transferList);
    this._player.playbackStarted();

    var channelCount = args.channelCount;
    var count = args.count;
    var sources = new Array(count);

    for (var i = 0; i < count; ++i) {
        var audioBuffer = this._player._allocAudioBuffer();
        var channelData = new Array(channelCount);
        for (var ch = 0; ch < channelCount; ++ch) {
            var data = new Float32Array(transferList.shift(), 0, args.info[i].length);
            audioBuffer.copyToChannel(data, ch);
            channelData[ch] = data;
        }
        var sourceDescriptor = new SourceDescriptor(audioBuffer,
                                                    args.info[i],
                                                    channelData,
                                                    i === args.trackEndingBufferIndex);
        sources[i] = sourceDescriptor;

        if (sourceDescriptor.isLastForTrack &&
            sourceDescriptor.endTime < this._duration - this._player.getBufferDuration()) {
            this._duration = sourceDescriptor.endTime;
            this.emit("timeUpdate", this._currentTime, this._duration);
            this.emit("durationChange", this._duration);
        }
    }

    this._freeTransferList(transferList);

    if (count > 0) {
        if (this._sourceStopped) {
            this._bufferQueue.push.apply(this._bufferQueue, sources);
            if (!this._paused) {
                this._startSources();
            }
        } else {
            var startTime = this._lastSourceEnds();
            for (var i = 0; i < sources.length; ++i) {
                startTime = this._startSource(sources[i], startTime);
            }
            this._bufferQueue.push.apply(this._bufferQueue, sources);
        }
    } else if (this._sourceStopped) {
        this._ended();
    }

    if (args.count > 0 && args.trackEndingBufferIndex !== -1) {
        this._fillBuffers();
    }
};

AudioPlayerSourceNode.prototype._checkIfLastBufferIsQueued = function() {
    if (this._bufferQueue.length === 0 ||
        this._bufferQueue[this._bufferQueue.length - 1].isLastForTrack &&
        !this._lastBufferLoadedEmitted) {
        this._lastBufferLoadedEmitted = true;
        this.emit("lastBufferQueued");
    }
};

AudioPlayerSourceNode.prototype._buffersFilled = function(args, transferList) {
    if (this._destroyed) {
        return this._freeTransferList(transferList);
    }

    this._applyBuffers(args, transferList);
    this._checkIfLastBufferIsQueued();
};

AudioPlayerSourceNode.prototype._messaged = function(event) {
    if (this._destroyed) return;
    if (event.data.nodeId === this._id) {
        var data = event.data;
        this[data.methodName].call(this, data.args, data.transferList);
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
    this.emit("timeUpdate", this._currentTime, this._duration);
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
    if (args.requestId !== this._seekRequestId || this._destroyed) {
        return this._freeTransferList(transferList);
    }
    this._nullifyPendingRequests();
    this._currentSeekEmitted = false;
    this._endedEmitted = false;
    this._baseTime = args.baseTime;
    this._stopSources();

    var sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }

    this._timeUpdate();
    this._applyBuffers(args, transferList);
    this._checkIfLastBufferIsQueued();
    if (args.isUserSeek) {
        this.emit("seekComplete", this._currentTime);
    }
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._seek = function(time, isUserSeek) {
    if (!this.isSeekable()) return;
    var requestId = ++this._seekRequestId;
    this._player._message(this._id, "seek", {
        requestId : requestId,
        count: getPreloadBufferCount(),
        time: time,
        isUserSeek: isUserSeek
    }, this._getBuffersForTransferList(getPreloadBufferCount()));
    if (!this._currentSeekEmitted && isUserSeek) {
        this._currentSeekEmitted = true;
        this.emit("seeking", this._currentTime);
    }
};

AudioPlayerSourceNode.prototype._throttledSeek = throttle(function(time) {
    this._seek(time, true);
}, EXPENSIVE_CALL_THROTTLE_TIME);

AudioPlayerSourceNode.prototype.setCurrentTime = function(time, noThrottle) {
    if (!this.isSeekable()) {
        return;
    }

    time = +time;
    if (!isFinite(time)) {
        throw new Error("time is not finite");
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
        var now = Date.now();
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

    var sourceDescriptor;
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
    if (this._destroyed) return this._freeTransferList(transferList);
    this._freeTransferList(transferList);
    var e = new Error(args.message);
    e.name = args.name;
    e.stack = args.stack;
    this.unload();
    this.emit("error", e);
};

AudioPlayerSourceNode.prototype._blobLoaded = function(args) {
    if (this._destroyed) return;
    if (this._replacementRequestId !== args.requestId) return;
    this._loadingNext = false;
    this._haveBlob = true;
    this._duration = args.metadata.duration;
    this._currentTime = Math.min(this._player.getMaximumSeekTime(this._duration), Math.max(0, this._currentTime));
    this._seek(this._currentTime, false);
    codeIsCold = false;
    this.emit("timeUpdate", this._currentTime, this._duration);
    this.emit("canPlay");
};

AudioPlayerSourceNode.prototype.hasGaplessPreload = function() {
    return this._gaplessPreloadArgs !== null;
};

AudioPlayerSourceNode.prototype.replaceUsingGaplessPreload = function() {
    if (this._destroyed) return;
    if (!this.hasGaplessPreload()) throw new Error("no gapless preload");
    var args = this._gaplessPreloadArgs;
    this._gaplessPreloadArgs = null;
    this._lastBufferLoadedEmitted = false;
    this._applyReplacementLoadedArgs(args);
    this._fillBuffers();
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
        return this._freeTransferList(transferList);
    }
    this._loadingNext = false;

    if (args.gaplessPreload) {
        this._gaplessPreloadArgs = args;
        this._applyBuffers(args, transferList);
        return;
    }
    this._applyReplacementLoadedArgs(args);
    // Sync so that proper gains nodes are set up already when applying the buffers
    // for this track.
    this.emit("replacementLoaded");
    this._stopSources();
    var sourceDescriptor;
    while (sourceDescriptor = this._bufferQueue.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
    this._applyBuffers(args, transferList);
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._actualReplace = function(blob, seekTime, gaplessPreload, metadata) {
    if (this._destroyed) return;
    if (!this._haveBlob) {
        return this.load(blob, seekTime, metadata);
    }

    if (this.hasGaplessPreload() && gaplessPreload) {
        var lastFound = false;
        for (var i = 0; i < this._bufferQueue.length; ++i) {
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

    var requestId = ++this._replacementRequestId;
    this._player._message(this._id, "loadReplacement", {
        blob: blob,
        requestId: requestId,
        seekTime: seekTime,
        count: getPreloadBufferCount(),
        gaplessPreload: !!gaplessPreload,
        metadata: metadata
    }, this._getBuffersForTransferList(getPreloadBufferCount()));
};

AudioPlayerSourceNode.prototype._replaceThrottled = throttle(function(blob, seekTime, gaplessPreload, metadata) {
    this._actualReplace(blob, seekTime, gaplessPreload, metadata);
}, EXPENSIVE_CALL_THROTTLE_TIME);

// Seamless replacement of current track with the next.
AudioPlayerSourceNode.prototype.replace = function(blob, seekTime, gaplessPreload, metadata) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;
    this._loadingNext = true;
    this._nullifyPendingRequests();
    var now = Date.now();
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
    var fillRequestId = ++this._replacementRequestId;
    this._player._message(this._id, "loadBlob", {
        blob: blob,
        requestId: fillRequestId,
        metadata: metadata
    });
};

AudioPlayerSourceNode.prototype._loadThrottled = throttle(function(blob, seekTime, metadata) {
    this._actualLoad(blob, seekTime, metadata);
}, EXPENSIVE_CALL_THROTTLE_TIME);

AudioPlayerSourceNode.prototype.load = function(blob, seekTime, metadata) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;
    if (!(blob instanceof Blob) && !(blob instanceof File)) {
        throw new Error("blob must be a blob");
    }
    this._nullifyPendingRequests();
    var now = Date.now();
    this._loadingNext = true;
    if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
        this._actualLoad(blob, seekTime, metadata);
    } else {
        this._loadThrottled(blob, seekTime, metadata);
    }
    this._lastExpensiveCall = now;
};
