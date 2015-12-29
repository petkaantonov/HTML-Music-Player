"use strict";
const Promise = require("../lib/bluebird.js");
const util = require("./util");
const EventEmitter = require("events");
const ChannelMixer = require("../worker/ChannelMixer");

// TODO destination changes
const asap = function(fn) {
    Promise.resolve().then(fn);
};

function SourceDescriptor(buffer, duration, channelData) {
    this.buffer = buffer;
    this.playedSoFar = 0;
    this.duration = duration;
    this.started = -1;
    this.source = null;
    this.channelData = channelData;
}

SourceDescriptor.prototype.getRemainingDuration = function() {
    return this.duration - this.playedSoFar;
};

function webAudioBlockSize(value) {
    const BLOCK_SIZE = 128;
    if (value % BLOCK_SIZE === 0) return value;
    return value + (BLOCK_SIZE - (value % BLOCK_SIZE));
}

const BUFFER_SAMPLES = webAudioBlockSize(48000 * 1);
const PRELOAD_BUFFER_COUNT = 2;

var nodeId = 0;
var instances = false;
function AudioPlayer(audioContext) {
    if (instances) throw new Error("only 1 AudioPlayer instance can be made");
    instances = true;
    this._audioContext = audioContext || new AudioContext();
    this._worker = new Worker("worker/AudioPlayerWorker.js");
    this._arrayBufferPool = [];
    this._audioBufferPool = [];
    this._sourceNodes = [];
    this._audioBufferTime = BUFFER_SAMPLES / this._audioContext.sampleRate;
    this._message(-1, "audioConfiguration", {
        channels: this._audioContext.destination.channelCount,
        sampleRate: this._audioContext.sampleRate,
        bufferTime: this._audioBufferTime
    });
}

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

AudioPlayer.prototype._freeAudioBuffer = function(audioBuffer) {
    this._audioBufferPool.push(audioBuffer);
};

AudioPlayer.prototype._allocAudioBuffer = function() {
    if (this._audioBufferPool.length > 0) return this._audioBufferPool.shift();
    var ret = this._audioContext.createBuffer(this._audioContext.destination.channelCount,
                                              BUFFER_SAMPLES,
                                              this._audioContext.sampleRate);
    return ret;
};

AudioPlayer.prototype._freeArrayBuffer = function(arrayBuffer) {
    if (arrayBuffer instanceof ArrayBuffer) {
        arrayBuffer = new Float32Array(arrayBuffer);
    }
    this._arrayBufferPool.push(arrayBuffer);
};

AudioPlayer.prototype._allocArrayBuffer = function() {
    if (this._arrayBufferPool.length) return this._arrayBufferPool.shift();
    var length = this._audioContext.sampleRate * this._audioBufferTime;
    return new Float32Array(length);
};

AudioPlayer.prototype._sourceNodeDestroyed = function(node) {
    var i = this._sourceNodes.indexOf(node);    
    if (i >= 0) this._sourceNodes.splice(i, 1);
};

AudioPlayer.prototype.createSourceNode = function() {
    var ret = new AudioPlayerSourceNode(this, nodeId++, this._audioContext, this._worker);
    this._sourceNodes.push(ret);
    return ret;
};

["createAnalyser", "createBiquadFilter", "createBuffer", "createBufferSource",
"createChannelMerger", "createChannelSplitter", "createConvolver", "createDelay",
"createDynamicsCompressor", "createGain", "createMediaElementSource", "createMediaStreamDestination",
"createMediaStreamSource", "createOscillator", "createPanner", "createPeriodicWave", "createScriptProcessor",
"createStereoPanner", "createWaveShaper", "resume", "suspend"].forEach(function(name) {
    var method = AudioContext.prototype[name];
    AudioPlayer.prototype[name] = function() {
        return method.apply(this._audioContext, arguments);
    };
});

["currentTime", "destination", "listener", "state", "sampleRate"].forEach(function(name) {
    Object.defineProperty(AudioPlayer.prototype, name, {
        configurable: false,
        enumerable: true,
        get: function() {
            return this._audioContext[name];
        }
    });
});

["onstatechange"].forEach(function(name) {
    Object.defineProperty(AudioPlayer.prototype, name, {
        configurable: false,
        enumerable: true,
        get: function() {
            return this._audioContext[name];
        },
        set: function(value) {
            this._audioContext[name] = value;
        }
    });
});

function AudioPlayerSourceNode(player, id, audioContext, worker) {
    EventEmitter.call(this);
    this._id = id;
    this._seekRequestId = 0;
    this._audioBufferFillRequestId = 0;
    this._player = player;
    this._audioContext = audioContext;
    this._worker = worker;
    this._haveBlob = false;
    this._loadingBuffers = false;
    this._sourceStopped = true;
    this._node = audioContext.createGain();

    this._volume = 1;
    this._muted = false;

    this._lastBufferFillCount = 0;
    this._currentTime = 0;
    this._baseTime = 0;
    this._duration = 0;
    this._pendingSeek = -1;

    this._initialPlaythroughTriggered = false;
    this._paused = true;
    this._destroyed = false;
    this._seeking = false;
    this._loop = false;

    this._messaged = this._messaged.bind(this);
    this._timeUpdate = this._timeUpdate.bind(this);
    this._sourceEnded = this._sourceEnded.bind(this);
    this._ended = this._ended.bind(this);

    this._timeUpdater = setInterval(this._timeUpdate, 200);

    this._worker.addEventListener("message", this._messaged, false);
    this._player._message(-1, "register", {
        id: this._id
    });

    this._sources = [];
}
util.inherits(AudioPlayerSourceNode, EventEmitter);

AudioPlayerSourceNode.prototype.destroy = function() {
    if (this._destroyed) return;
    this.removeAllListeners();
    clearInterval(this._timeUpdater);
    this._player._message(this._id, "destroy");
    this._destroyed = true;
    this.unload();
    this._worker.removeEventListener("message", this._messaged, false);
    this._player._sourceNodeDestroyed(this);
    try {
        this.node().disconnect();
    } catch (e) {}
    this._node = null;
    this._player = this._audioContext = this._worker = null;
    this._messaged =
    this._timeUpdate =
    this._sourceEnded =
    this._ended = null;
};

AudioPlayerSourceNode.prototype._timeUpdate = function() {
    if (this._paused ||
        this._destroyed ||
        this._sourceStopped ||
        this._sources.length === 0 ||
        this._duration === 0 ||
        this._seeking) {
        return;
    }
    
    var now = this._audioContext.currentTime;
    var sourceDescriptor = this._sources[0];
    var started = sourceDescriptor.started;

    if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
        return;
    }

    var playedSoFar = (now - started) + sourceDescriptor.playedSoFar;
    var currentTime = Math.min(this._duration, this._baseTime + playedSoFar);
    this._currentTime = currentTime;
    this.emit("timeUpdate", this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._ended = function() {
    this._lastBufferFillCount = 0;
    this._currentTime = this._duration;
    this._stopSources();

    var sourceDescriptor;
    while (sourceDescriptor = this._sources.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }

    this.emit("ended");
    this.emit("timeUpdate", this._currentTime, this._duration);
    if (this._loop) {
        this.setCurrentTime(0);
    }
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

AudioPlayerSourceNode.prototype._sourceEnded = function(event) {
    var source = event.target;
    var sourceDescriptor;

    while (sourceDescriptor = this._sources.shift()) {
        this._baseTime += sourceDescriptor.duration;
        var currentSource = sourceDescriptor.source;
        this._destroySourceDescriptor(sourceDescriptor);
        if (currentSource === source) break;
    }

    if ((this._sources.length === 0 && this._lastBufferFillCount === 0) ||
        this._baseTime >= this._duration) {
        this._ended();
    } else {
        this._fillBuffers();
    }
};

AudioPlayerSourceNode.prototype._lastSourceEnds = function() {
    if (this._sourceStopped) throw new Error("sources are stopped");
    if (this._sources.length === 0) return this._audioContext.currentTime;
    var sourceDescriptor = this._sources[this._sources.length - 1];
    return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
};

AudioPlayerSourceNode.prototype._startSource = function(sourceDescriptor, when) {
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
    if (this._destroyed || this._paused) return;
    if (!this._sourceStopped) throw new Error("sources are not stopped");
    this._sourceStopped = false;
    var now = this._audioContext.currentTime;
    for (var i = 0; i < this._sources.length; ++i) {
        now = this._startSource(this._sources[i], now);
    }

    if (!this._initialPlaythroughTriggered) {
        this._initialPlaythroughTriggered = true;
        var self = this;
        asap(function() {
            self.emit("initialPlaythrough");
        });
    }
};

AudioPlayerSourceNode.prototype._stopSources = function() {
    this._sourceStopped = true;
    var now = this._audioContext._currentTime;
    for (var i = 0; i < this._sources.length; ++i) {
        var sourceDescriptor = this._sources[i];
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

const MAX_ANALYSER_SIZE = 65536;
const analyserChannelMixer = new ChannelMixer(1);
const tmpChannels = [
    new Float32Array(MAX_ANALYSER_SIZE),
    new Float32Array(MAX_ANALYSER_SIZE),
    new Float32Array(MAX_ANALYSER_SIZE),
    new Float32Array(MAX_ANALYSER_SIZE),
    new Float32Array(MAX_ANALYSER_SIZE),
    new Float32Array(MAX_ANALYSER_SIZE)
];
AudioPlayerSourceNode.prototype.getUpcomingSamples = function(input, multiplier) {
    if (!(input instanceof Float32Array)) throw new Error("need Float32Array");
    if (multiplier === undefined) multiplier = 1;
    var samplesNeeded = Math.min(MAX_ANALYSER_SIZE, input.length);

    if (!this._sourceStopped) {
        var now = this._audioContext.currentTime;
        var samplesIndex = 0;
        for (var i = 0; i < this._sources.length; ++i) {
            var sourceDescriptor = this._sources[i];
            if (!sourceDescriptor.source) continue;
            var timeOffset = sourceDescriptor.started;
            if (now > timeOffset) {
                timeOffset = now - (timeOffset - sourceDescriptor.playedSoFar);
            } else {
                timeOffset = 0;
            }
            var buffer = sourceDescriptor.buffer;
            var totalSamples = (sourceDescriptor.duration * buffer.sampleRate)|0;
            var sampleOffset = (buffer.sampleRate * timeOffset)|0;
            var fillCount = Math.min(totalSamples - sampleOffset, samplesNeeded);
            
            var channelData = sourceDescriptor.channelData;
            for (var ch = 0; ch < channelData.length; ++ch) {
                var src = channelData[ch];
                var dst = tmpChannels[ch];

                for (var j = 0; j < fillCount; ++j) {
                    dst[j] = src[sampleOffset + j] * multiplier;
                }
            }

            var toMix = tmpChannels.slice(0, channelData.length);
            toMix = analyserChannelMixer.mix(toMix, fillCount)[0];

            for (var j = 0; j < fillCount; ++j) {
                input[j + samplesIndex] = toMix[j];
            }

            samplesIndex += fillCount;
            samplesNeeded -= fillCount;
            if (samplesNeeded <= 0) {
                return true;
            }
        }
        return false;
    } else {
        for (var i = 0; i < input.length; ++i) {
            input[i] = 0;
        }
        return true;
    }
};

AudioPlayerSourceNode.prototype._fillBuffers = function(forced) {
    if ((this._loadingBuffers && !forced) || !this._haveBlob) {
        return;
    }

    if (this._sources.length < PRELOAD_BUFFER_COUNT) {
        var count = PRELOAD_BUFFER_COUNT - this._sources.length;
        this._loadingBuffers = true;
        var fillRequestId = ++this._audioBufferFillRequestId;

        var buffers = new Array(this._audioContext.destination.channelCount * count);
        for (var i = 0; i < buffers.length; ++i) {
            buffers[i] = this._player._allocArrayBuffer();
        }

        this._player._message(this._id, "fillBuffers", {
            requestId : fillRequestId,
            count: count
        }, buffers);
    }
};

AudioPlayerSourceNode.prototype._applyBuffers = function(args, transferList) {
    var channelCount = args.channelCount;
    var count = args.count;
    var sources = new Array(count);
    this._lastBufferFillCount = count;

    for (var i = 0; i < count; ++i) {
        var audioBuffer = this._player._allocAudioBuffer();
        var channelData = new Array(channelCount);
        for (var ch = 0; ch < channelCount; ++ch) {
            var data = new Float32Array(transferList.shift());
            audioBuffer.copyToChannel(data, ch);
            channelData[ch] = data;
        }
        var sourceDescriptor = new SourceDescriptor(audioBuffer, args.lengths[i] / audioBuffer.sampleRate, channelData);
        sources[i] = sourceDescriptor;
    }

    while (transferList.length > 0) {
        this._player._freeArrayBuffer(transferList.shift());
    }

    if (count > 0) {
        if (this._sourceStopped) {
            this._sources.push.apply(this._sources, sources);
            if (!this._paused) {
                this._startSources();
            }
        } else {
            var startTime = this._lastSourceEnds();
            for (var i = 0; i < sources.length; ++i) {
                startTime = this._startSource(sources[i], startTime);
            }
            this._sources.push.apply(this._sources, sources);
        }
    } else if (this._sourceStopped) {
        this._ended();
    }
};

AudioPlayerSourceNode.prototype._buffersFilled = function(args, transferList) {
    this._loadingBuffers = false;
    if (args.requestId !== this._audioBufferFillRequestId) {
        transferList.forEach(function(v) {
            this._player._freeArrayBuffer(v);
        }, this);
        return;
    }

    this._applyBuffers(args, transferList);
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
    if (this._destroyed || !this._paused) return;
    if (this._duration > 0 &&
        this._currentTime > 0 &&
        this._currentTime >= this._duration) {
        return;
    }
    this._paused = false;
    if (this._sources.length > 0 && this._sourceStopped && this._haveBlob) {
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

AudioPlayerSourceNode.prototype._seeked = function(args, transferList) {
    if (args.requestId !== this._seekRequestId || this._pendingSeek !== -1) {
        transferList.forEach(function(v) {
            this._player._freeArrayBuffer(v);
        }, this);
        var seek = this._pendingSeek;
        this._pendingSeek = -1;
        if (seek !== -1) {
            this._seeking = false;
            if (this._haveBlob) {
                this.setCurrentTime(seek);
            }
        }
        return;
    }

    this._audioBufferFillRequestId++;
    this._seekRequestId++;
    this._baseTime = args.baseTime;
    this._currentTime = this._baseTime;
    this.emit("timeUpdate", this._currentTime, this._duration);
    this.emit("seekComplete", this._baseTime);
    this._stopSources();
    var sourceDescriptor;
    while (sourceDescriptor = this._sources.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }

    this._applyBuffers(args, transferList);
    this._seeking = false;
};

AudioPlayerSourceNode.prototype.setCurrentTime = function(time) {
    if (this._destroyed) return;
    time = +time;
    if (!isFinite(time)) return;
    time = Math.max(0, time);
    if (!this._haveBlob || this._seeking) {
        this._pendingSeek = time;
        return;
    }
    if (this._currentTime === time) return;
    
    this._seeking = true;
    time = Math.min(this._duration, time);
    var requestId = ++this._seekRequestId;

    var buffers = new Array(this._audioContext.destination.channelCount * PRELOAD_BUFFER_COUNT);
    for (var i = 0; i < buffers.length; ++i) {
        buffers[i] = this._player._allocArrayBuffer();
    }

    this.emit("seeking", time);
    this._player._message(this._id, "seek", {
        requestId : requestId,
        count: PRELOAD_BUFFER_COUNT,
        time: time
    }, buffers);
};

AudioPlayerSourceNode.prototype.unload = function() {
    this._baseTime = 0;
    this._lastBufferFillCount = 0;
    this._audioBufferFillRequestId++;
    this._seekRequestId++;
    this._currentTime = this._duration = 0;
    this._loadingBuffers = false;
    this._haveBlob = false;
    this._seeking = false;
    this._initialPlaythroughTriggered = false;
    this._stopSources();

    var sourceDescriptor;
    while (sourceDescriptor = this._sources.shift()) {
        this._destroySourceDescriptor(sourceDescriptor);
    }
};

AudioPlayerSourceNode.prototype._error = function(args, transferList) {
    transferList.forEach(function(v) {
        this._player._freeArrayBuffer(v);
    }, this);
    this.unload();
    var e = new Error(args.message);
    e.stack = args.stack;
    this.emit("error", e);
};

AudioPlayerSourceNode.prototype._blobLoaded = function(args) {
    if (this._audioBufferFillRequestId !== args.requestId) return;
    this._haveBlob = true;
    this._duration = args.metadata.duration;
    this._currentTime = 0;
    this.emit("durationChange", this._duration);
    this.emit("canPlay");

    var seek = this._pendingSeek;
    this._pendingSeek = -1;
    if (seek > 0) {
        this.setCurrentTime(seek);
    } else {
        this.emit("timeUpdate", 0, this._duration);
        this._fillBuffers();
    }
};

AudioPlayerSourceNode.prototype.load = function(blob) {
    if (this._destroyed) return;
    if (!(blob instanceof Blob) && !(blob instanceof File)) {
        throw new Error("blob must be a blob");
    }
    if (this.blob === blob) {
        this.setCurrentTime(0);
        return;
    }
    this.unload();
    var fillRequestId = ++this._audioBufferFillRequestId;
    this._player._message(this._id, "loadBlob", {
        blob: blob,
        requestId: fillRequestId
    });
};

module.exports = AudioPlayer;
