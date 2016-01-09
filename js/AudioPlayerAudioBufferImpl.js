"use strict";

// Audio player implemented using AudioBuffers. Tracks are resampled and mixed
// manually to hardware specs to guarantee seamless playback between consecutive
// audiobuffers.

// Over ScriptProcessorNode it has the benefit of not having any
// latency regardless of buffer size, the buffer size can be arbitrarily large
// so that audio doens't glitch when ui is blocked for a long time and
// in the catastrophic case where ui is blocked, the output will be silence
// instead of ear destroying noise.

const Promise = require("../lib/bluebird.js");
const util = require("./util");
const EventEmitter = require("events");
const ChannelMixer = require("../worker/ChannelMixer");
const patchAudioContext = require("../lib/audiocontextpatch");

const NO_THROTTLE = {};
const EXPENSIVE_CALL_THROTTLE_TIME = 200;

const asap = function(fn) {
    fn();
};

const makeAudioContext = function() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    var ret = new AudioContext();
    if (!window.AudioContext) {
        patchAudioContext(AudioContext, ret);
    }

    return ret;
};

function SourceDescriptor(buffer, length, channelData, isLastForTrack) {
    this.buffer = buffer;
    this.playedSoFar = 0;
    this.length = length;
    this.duration = length / buffer.sampleRate;
    this.started = -1;
    this.source = null;
    this.channelData = channelData;
    this.isLastForTrack = isLastForTrack;
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
function AudioPlayer(audioContext, suspensionTimeout) {
    EventEmitter.call(this);
    if (instances) throw new Error("only 1 AudioPlayer instance can be made");
    if (!suspensionTimeout) suspensionTimeout = 20;
    instances = true;
    this._audioContext = audioContext || makeAudioContext();
    this._audioContextIsNotReallyRunning = false;
    this._previousAudioContextTime = this._audioContext.currentTime;
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
    this._audioBuffersAllocated = 0;
    this._arrayBuffersAllocated = 0;
    this._suspensionTimeoutMs = suspensionTimeout * 1000;
    this._currentStateModificationAction = null;

    this._messaged = this._messaged.bind(this);
    this._suspend = this._suspend.bind(this);
    this._timeProgressChecker = this._timeProgressChecker.bind(this);

    this._worker.addEventListener("message", this._messaged, false);
    this._suspensionTimeoutId = setTimeout(this._suspend, this._suspensionTimeoutMs);

    this.ready = new Promise(function(resolve) {
        var ready = function(event) {
            this._worker.removeEventListener("message", ready, false);
            resolve();
        }.bind(this);
        this._worker.addEventListener("message", ready, false);
    }.bind(this));

    setInterval(this._timeProgressChecker, 1000);
}
util.inherits(AudioPlayer, EventEmitter);
AudioPlayer.webAudioBlockSize = webAudioBlockSize;

// Android makes an audiocontext completely unusable after 1 min
// of inactivity. This scenario can be detected by .currentTime
// not progressing despite state being "running". In suspended
// and closed state the time doesn't progress even normally.
AudioPlayer.prototype._timeProgressChecker = function() {
    var time = this.getCurrentTime();

    if (time === this._previousAudioContextTime &&
        this._audioContext.state === "running") {
        this._audioContextIsNotReallyRunning = true;
    }
    this._previousAudioContextTime = time;
    return time;
};

AudioPlayer.prototype.getCurrentTime = function(timeShouldHaveProgressed) {
    return this._audioContext.currentTime;
};

AudioPlayer.prototype.getAudioContext = function() {
    return this._audioContext;
};

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
    this._audioBuffersAllocated = 0;
    while (this._sourceNodes.length > 0) {
        this._sourceNodes.shift().destroy();
    }
    this._audioBufferPool = [];
    try {
        this._audioContext.close();
    } catch (e) {}
    this._audioContext = makeAudioContext();
    this.emit("audioContextReset", this);
};

AudioPlayer.prototype.resume = function() {
    if (this._audioContextIsNotReallyRunning) {
        var self = this;
        this._audioContextIsNotReallyRunning = false;
        if (this._audioContext.state === "suspended") {
            return this.resume().then(function() {
                var now = self.getCurrentTime();
                self._currentStateModificationAction = {
                    type: "resume",
                    promise: Promise.delay(50).then(function() {
                        if (self._audioContext.state !== "running" || self.getCurrentTime() === now) {
                            this._audioContextIsNotReallyRunning = false;
                            this._resetAudioContext();
                            return Promise.delay(100);
                        }
                    })
                };
                return self._currentStateModificationAction.promise.finally(function() {
                    self._currentStateModificationAction = null;
                });
            });
        }
        this._resetAudioContext();
        return Promise.resolve();
    }

    if (this._audioContext.state === "running") {
        return Promise.resolve();
    }
    var self = this;

    if (!this._currentStateModificationAction) {
        this._currentStateModificationAction = {
            type: "resume",
            promise: Promise.resolve(this._audioContext.resume()).finally(function() {
                self._currentStateModificationAction = null;
            })
        };
        return this._currentStateModificationAction.promise;
    } else if (this._currentStateModificationAction.type === "suspend") {
        var self = this;
        this._currentStateModificationAction.promise = this._currentStateModificationAction.promise.finally(function() {
            return self.resume();
        }).finally(function() {
            self._currentStateModificationAction = null;
        });
        return this._currentStateModificationAction.promise;
    }
    return this._currentStateModificationAction.promise;
};

AudioPlayer.prototype.playbackStopped = function() {
    this._clearSuspensionTimer();
    this._suspensionTimeoutId = setTimeout(this._suspend, this._suspensionTimeoutMs);
};

AudioPlayer.prototype.playbackStarted = function() {
    this._clearSuspensionTimer();
};

AudioPlayer.prototype._clearSuspensionTimer = function() {
    if (this._suspensionTimeoutId !== -1) {
        clearTimeout(this._suspensionTimeoutId);
        this._suspensionTimeoutId = -1;
    }
};

AudioPlayer.prototype.getMaximumSeekTime = function(duration) {
    return Math.max(0, duration - (this._audioBufferTime + (2048 / this._audioContext.sampleRate)));
};

AudioPlayer.prototype.blockSizedTime = function(time) {
    return webAudioBlockSize(this._audioContext.sampleRate * time) /
            this._audioContext.sampleRate;
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
    while (transferList.length > 0) {
        this._freeArrayBuffer(transferList.pop());
    }
};

AudioPlayer.prototype.getBufferDuration = function() {
    return this._audioBufferTime;
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
    if (this._audioBuffersAllocated > 10) {
        if (window.console && console.warn) {
            console.warn("Possible memory leak: over 10 audio buffers allocated");
        }
    }
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
    this._arrayBuffersAllocated++;
    if (this._arrayBuffersAllocated > 20) {
        if (window.console && console.warn) {
            console.warn("Possible memory leak: over 20 array buffers allocated");
        }
    }
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

function AudioPlayerSourceNode(player, id, audioContext, worker) {
    EventEmitter.call(this);
    this._id = id;
    this._sourceEndedId = 0;
    this._seekRequestId = 0;
    this._audioBufferFillRequestId = 0;
    this._replacementRequestId = 0;
    this._sourceStartRequestId = 0;

    this._lastExpensiveCall = 0;

    this._player = player;
    this._audioContext = audioContext;
    this._worker = worker;
    this._haveBlob = false;
    this._loadingBuffers = false;
    this._sourceStopped = true;
    this._node = audioContext.createGain();

    this._volume = 1;
    this._muted = false;

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
}
util.inherits(AudioPlayerSourceNode, EventEmitter);

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

AudioPlayerSourceNode.prototype._getCurrentAudioBufferBaseTimeDelta = function() {
    var sourceDescriptor = this._bufferQueue[0];
    if (!sourceDescriptor) return 0;
    var now = this._player.getCurrentTime();
    var started = sourceDescriptor.started;
    if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
        return 0;
    }

    if (this._paused || this._sourceStopped) return 0;
    return Math.min((now - started) + sourceDescriptor.playedSoFar, this._player.getBufferDuration());
};

AudioPlayerSourceNode.prototype._nullifyPendingRequests = function() {
    this._audioBufferFillRequestId++;
    this._seekRequestId++;
    this._sourceEndedId++;
    this._replacementRequestId++;
};

AudioPlayerSourceNode.prototype._timeUpdate = function() {
    if (this._destroyed) return;
    var currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
    var currentTime = this._baseTime + currentBufferPlayedSoFar;
    this._currentTime = this._haveBlob ? Math.min(this._duration, currentTime) : currentTime;
    this.emit("timeUpdate", this._currentTime, this._duration);
};

AudioPlayerSourceNode.prototype._ended = function() {
    if (this._endedEmitted || this._destroyed) return;
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
    if (this._sourceEndedId !== args.requestId) return;
    this._fillBuffers();
};

AudioPlayerSourceNode.prototype._sourceEnded = function(event) {
    var source = event.target;
    var sourceDescriptor = this._bufferQueue.shift();

    if (sourceDescriptor.source !== source) {
        throw new Error("should not happen");
    }
    this._baseTime += sourceDescriptor.duration;
    this._destroySourceDescriptor(sourceDescriptor);

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

AudioPlayerSourceNode.prototype._resumedToStartSources = function(id) {
    if (!this._sourceStopped && id === this._sourceStartRequestId) {
        var now = this._player.getCurrentTime();
        for (var i = 0; i < this._bufferQueue.length; ++i) {
            now = this._startSource(this._bufferQueue[i], now);
        }

        if (!this._initialPlaythroughEmitted) {
            this._initialPlaythroughEmitted = true;
            this.emit("initialPlaythrough");
        }
    }
};

AudioPlayerSourceNode.prototype._startSources = function() {
    if (this._destroyed || this._paused) return;
    if (!this._sourceStopped) throw new Error("sources are not stopped");
    this._player.playbackStarted();
    this._sourceStopped = false;
    var id = ++this._sourceStartRequestId;
    this._player.resume().return(id).then(this._resumedToStartSources.bind(this));
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
        var samplesIndex = 0;
        var additionalTime = 0;
        for (var i = 0; i < this._bufferQueue.length; ++i) {
            var sourceDescriptor = this._bufferQueue[i];
            if (!sourceDescriptor.source) continue;

            var timeOffset = sourceDescriptor.started + additionalTime;
            if (now > timeOffset) {
                timeOffset = now - (timeOffset - sourceDescriptor.playedSoFar);
            } else {
                timeOffset = 0;
            }
            var buffer = sourceDescriptor.buffer;
            var totalSamples = (sourceDescriptor.duration * buffer.sampleRate)|0;

            if (Math.ceil(timeOffset * buffer.sampleRate) > BUFFER_SAMPLES) {
                additionalTime = (timeOffset - (BUFFER_SAMPLES / buffer.sampleRate));
                continue;
            } else {
                additionalTime = 0;
            }

            var sampleOffset = (buffer.sampleRate * timeOffset)|0;
            var fillCount = Math.min(totalSamples - sampleOffset, samplesNeeded);
            var channelData = sourceDescriptor.channelData;

            var sampleViews = new Array(channelData.length);
            for (var ch = 0; ch < sampleViews.length; ++ch) {
                sampleViews[ch] = new Float32Array(channelData[ch].buffer, sampleOffset * 4, fillCount);
            }
            
            inputView[0] = new Float32Array(inputBuffer, samplesIndex * 4, samplesNeeded);
            analyserChannelMixer.mix(sampleViews, fillCount, inputView);
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

AudioPlayerSourceNode.prototype._getBuffersForTransferList = function(count) {
    var buffers = new Array(this._audioContext.destination.channelCount * count);
    for (var i = 0; i < buffers.length; ++i) {
        buffers[i] = this._player._allocArrayBuffer();
    }
    return buffers;
};

AudioPlayerSourceNode.prototype._fillBuffers = function() {
    // Can be suddenly called multiple times if UI was blocked for a long time and multiple
    // audio buffers ended while the UI was blocked. Only the first request is
    // necessary, so early return for the others.
    if (this._loadingBuffers || !this._haveBlob || this._destroyed) {
        return;
    }

    if (this._bufferQueue.length < PRELOAD_BUFFER_COUNT * 2) {
        var count = (PRELOAD_BUFFER_COUNT * 2) - this._bufferQueue.length;
        this._loadingBuffers = true;
        var fillRequestId = ++this._audioBufferFillRequestId;

        this._player._message(this._id, "fillBuffers", {
            requestId : fillRequestId,
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
            var data = new Float32Array(transferList.shift());
            audioBuffer.copyToChannel(data, ch);
            channelData[ch] = data;
        }
        var sourceDescriptor = new SourceDescriptor(audioBuffer,
                                                    args.lengths[i],
                                                    channelData,
                                                    i === args.trackEndingBufferIndex);
        sources[i] = sourceDescriptor;
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
};

AudioPlayerSourceNode.prototype._checkIfLastBufferIsQueued = function() {
    if (this._bufferQueue[this._bufferQueue.length - 1].isLastForTrack &&
        !this._lastBufferLoadedEmitted) {
        this._lastBufferLoadedEmitted = true;
        this.emit("lastBufferQueued");
    }
};

AudioPlayerSourceNode.prototype._buffersFilled = function(args, transferList) {
    this._loadingBuffers = false;
    if (args.requestId !== this._audioBufferFillRequestId || this._destroyed) {
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
    while (transferList.length > 0) {
        this._player._freeArrayBuffer(transferList.pop());
    }
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
};

AudioPlayerSourceNode.prototype._seek = function(time, isUserSeek) {
    if (!this.isSeekable()) return;
    var requestId = ++this._seekRequestId;
    this._player._message(this._id, "seek", {
        requestId : requestId,
        count: PRELOAD_BUFFER_COUNT,
        time: time,
        isUserSeek: isUserSeek
    }, this._getBuffersForTransferList(PRELOAD_BUFFER_COUNT));
    if (!this._currentSeekEmitted && isUserSeek) {
        this._currentSeekEmitted = true;
        this.emit("seeking", this._currentTime);
    }
};

AudioPlayerSourceNode.prototype._throttledSeek = util.throttle(function(time) {
    this._seek(time, true);
}, EXPENSIVE_CALL_THROTTLE_TIME);

AudioPlayerSourceNode.prototype.setCurrentTime = function(time, noThrottle) {
    if (!this.isSeekable()) return;
    time = +time;
    if (!isFinite(time)) throw new Error("time is not finite");
    time = Math.max(0, time);
    if (this._haveBlob) {
        time = Math.min(this._player.getMaximumSeekTime(this._duration), time);
    }

    this._currentTime = time;
    this._baseTime = this._currentTime - this._getCurrentAudioBufferBaseTimeDelta();
    this._timeUpdate();

    if (!this._haveBlob) {
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
    this._loadingBuffers = false;
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
};

AudioPlayerSourceNode.prototype.isSeekable = function() {
    return !(this._destroyed || this._lastBufferLoadedEmitted);
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
    this._haveBlob = true;
    this._duration = args.metadata.duration;
    this._currentTime = Math.min(this._player.getMaximumSeekTime(this._duration), Math.max(0, this._currentTime));
    this._seek(this._currentTime, false);
    this.emit("timeUpdate", this._currentTime, this._duration);
    this.emit("durationChange", this._duration);
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
};

AudioPlayerSourceNode.prototype._applyReplacementLoadedArgs = function(args) {
    if (this._destroyed) return;
    this._duration = args.metadata.duration;
    this._baseTime = args.baseTime;
    this._currentSeekEmitted = false;
    this._lastBufferLoadedEmitted = false;
    this._nullifyPendingRequests();
    this.emit("durationChange", this._duration);
    this._timeUpdate();
};

AudioPlayerSourceNode.prototype._replacementLoaded = function(args, transferList) {
    if (args.requestId !== this._replacementRequestId || this._destroyed) {
        return this._freeTransferList(transferList);
    }

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
};

AudioPlayerSourceNode.prototype._actualReplace = function(blob, seekTime, gaplessPreload) {
    if (this._destroyed) return;
    if (!this._haveBlob) {
        return this.load(blob, seekTime);
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
        count: PRELOAD_BUFFER_COUNT,
        gaplessPreload: !!gaplessPreload
    }, this._getBuffersForTransferList(PRELOAD_BUFFER_COUNT));
};

AudioPlayerSourceNode.prototype._replaceThrottled = util.throttle(function(blob, seekTime, gaplessPreload) {
    this._actualReplace(blob, seekTime, gaplessPreload);
}, EXPENSIVE_CALL_THROTTLE_TIME);

// Seamless replacement of current track with the next.
AudioPlayerSourceNode.prototype.replace = function(blob, seekTime, gaplessPreload) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;

    this._nullifyPendingRequests();
    var now = Date.now();
    if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
        this._actualReplace(blob, seekTime, gaplessPreload);
    } else {
        this._replaceThrottled(blob, seekTime, gaplessPreload);
    }
    this._lastExpensiveCall = now;
};

AudioPlayerSourceNode.prototype._actualLoad = function(blob, seekTime) {
    if (this._destroyed) return;
    if (seekTime === undefined) {
        seekTime = 0;
    }

    this.unload();
    this.setCurrentTime(seekTime, NO_THROTTLE);
    var fillRequestId = ++this._replacementRequestId;
    this._player._message(this._id, "loadBlob", {
        blob: blob,
        requestId: fillRequestId
    });
};

AudioPlayerSourceNode.prototype._loadThrottled = util.throttle(function(blob, seekTime) {
    this._actualLoad(blob, seekTime);
}, EXPENSIVE_CALL_THROTTLE_TIME);

AudioPlayerSourceNode.prototype.load = function(blob, seekTime) {
    if (this._destroyed) return;
    if (seekTime === undefined) seekTime = 0;
    if (!(blob instanceof Blob) && !(blob instanceof File)) {
        throw new Error("blob must be a blob");
    }

    this._nullifyPendingRequests();
    var now = Date.now();
    if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
        this._actualLoad(blob, seekTime);
    } else {
        this._loadThrottled(blob, seekTime);
    }
    this._lastExpensiveCall = now;
};

module.exports = AudioPlayer;
