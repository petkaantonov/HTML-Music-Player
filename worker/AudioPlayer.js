"use strict";
self.EventEmitter = require("events");

const Promise = require("../lib/bluebird");
Promise.setScheduler(function(fn) {
    fn();
});
Promise.config({
    cancellation: false,
    warnings: false,
    longStackTraces: false
});
const ChannelMixer = require("./ChannelMixer");
const sniffer = require("./sniffer");
const codec = require("./codec");
const demuxer = require("./demuxer");
const FileView = require("./FileView");
const seeker = require("./seeker");
const pool = require("./pool");
const Effect = require("./Effect");


const allocResampler = pool.allocResampler;
const allocDecoderContext = pool.allocDecoderContext;
const freeResampler = pool.freeResampler;
const freeDecoderContext = pool.freeDecoderContext;


const channelMixer = new ChannelMixer(2);
var hardwareSampleRate = 0;
var bufferTime = 0;
var resamplerQuality = 0;

const audioPlayerMap = Object.create(null);

const effects = [];
const setEffects = function(spec) {
    effectLoop: for (var i = 0; i < spec.length; ++i) {
        try {
            var effect = Effect.create(spec[i]);
        } catch (e) {
            continue effectLoop;
        }

        for (var j = 0; j < effects.length; ++j) {
            if (effects[j] instanceof effect.constructor) {
                if (effect.isEffective()) {
                    effects[j] = effect;
                } else {
                    effects.splice(j, 1);
                }
                continue effectLoop;
            }
        }

        if (effect.isEffective()) {
            effects.push(effect);
        }
    }
};

const message = function(nodeId, methodName, args, transferList) {
    if (transferList === undefined) transferList = [];
    args = Object(args);
    transferList = transferList.map(function(v) {
        if (v.buffer) return v.buffer;
        return v;
    });

    // Check for already neutered array buffers.
    if (transferList && transferList.length > 0) {
        for (var i = 0; i < transferList.length; ++i) {
            var item = transferList[i];

            if (!(item instanceof ArrayBuffer)) {
                item = item.buffer;
            }

            if (item.byteLength === 0) {
                return;
            }
        }
    }

    postMessage({
        nodeId: nodeId,
        methodName: methodName,
        args: args,
        transferList: transferList
    }, transferList);
};

self.onmessage = function(event) {
    var data = event.data;
    var receiver = data.nodeId;
    var args = data.args;
    if (receiver === -1) {
        if (data.methodName === "audioConfiguration") {
            resamplerQuality = args.resamplerQuality || 0;
            channelMixer.setChannels(args.channels);
            hardwareSampleRate = args.sampleRate;
            if (args.bufferTime) {
                if (bufferTime) {
                    throw new Error("cannot change buffertime");
                } else {
                    bufferTime = args.bufferTime;
                }
            }
        } else if (data.methodName === "register") {
            audioPlayerMap[args.id] = new AudioPlayer(args.id);
        } else if (data.methodName === "setEffects") {
            setEffects(args.effects);
        }
    } else {
        var obj = audioPlayerMap[receiver];
        obj.newMessage({
            methodName: data.methodName,
            args: data.args,
            transferList: data.transferList
        });
    }
};

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});


function AudioPlayer(id, parent) {
    EventEmitter.call(this);
    this.id = id;
    this.ended = false;
    this.decoderContext = null;
    this.blob = null;
    this.offset = 0;
    this.codecName = "";
    this.destroyed = false;
    this.metadata = null;
    this.fileView = null;
    this.resampler = null;
    this.replacementPlayer = null;
    this.replacementSpec = null;
    this.parent = parent || null;
    this.messageQueue = [];
    this.bufferFillId = 0;

    this._errored = this._errored.bind(this);
    this._next = this._next.bind(this);
}
AudioPlayer.prototype = Object.create(EventEmitter.prototype);
AudioPlayer.prototype.constructor = AudioPlayer;

AudioPlayer.prototype.transfer = function(other) {
    if (this.decoderContext) {
        freeDecoderContext(this.codecName, this.decoderContext);
        this.decoderContext = null;
    }
    if (this.resampler) {
        freeResampler(this.resampler);
        this.resampler = null;
    }

    this.ended = other.ended;
    this.blob = other.blob;
    this.fileView = other.fileView;
    this.metadata = other.metadata;
    this.codecName = other.codecName;
    this.decoderContext = other.decoderContext;
    this.decoderContext.removeAllListeners();
    this.decoderContext.on("error", this._errored);
    this.offset = other.offset;
    this.resampler = other.resampler;

    other.decoderContext = null;
    other.resampler = null;
    other.fileView = null;
    other.blob = null;
    other.metadata = null;
    other.destroy();
};

AudioPlayer.prototype._abortPendingBufferFills = function() {
    this.bufferFillId++;
};

AudioPlayer.prototype._clearAllRequestsExceptFirst = function() {
    for (var i = 1; i < this.messageQueue.length; ++i) {
        var spec = this.messageQueue[i];
        message(-1, "_freeTransferList", null, spec.transferList);
    }
    this.messageQueue.length = Math.min(this.messageQueue.length, 1);
};

AudioPlayer.prototype._clearFillRequests = function() {
    if (typeof this.fillBuffers !== "function") {
        throw new Error("fillBuffers not found");
    }
    for (var i = 0; i < this.messageQueue.length; ++i) {
        if (this.messageQueue[i].methodName === "fillBuffers") {
            var spec = this.messageQueue[i];
            message(-1, "_freeTransferList", null, spec.transferList);
            this.messageQueue.splice(i, 1);
            i--;
        }
    }
};

AudioPlayer.prototype._clearLoadReplacementRequests = function() {
    if (typeof this.loadReplacement !== "function") {
        throw new Error("loadReplacement not found");
    }
    for (var i = 0; i < this.messageQueue.length; ++i) {
        if (this.messageQueue[i].methodName === "loadReplacement") {
            var spec = this.messageQueue[i];
            message(-1, "_freeTransferList", null, spec.transferList);
            this.messageQueue.splice(i, 1);
            i--;
        }
    }
};

AudioPlayer.prototype._processMessage = function(spec) {
    var that = this;
    Promise.try(function() {
        return that[spec.methodName](spec.args, spec.transferList);
    }).finally(function() {
        if (that.messageQueue.length > 0 &&
            that.messageQueue[0] === spec) {
            that.messageQueue.shift();
        }
        that._next();
    });
};

AudioPlayer.prototype._next = function() {
    if (this.messageQueue.length > 0) {
        this._processMessage(this.messageQueue[0]);
    }
};

const noDelayMessageMap = {
    "sourceEndedPing": true
};
const obsoletesOtherMessagesMap = {
    "seek": true,
    "loadBlob": true
};
const priorityMessageMap = {
    "loadReplacement": true
};
AudioPlayer.prototype.newMessage = function(spec) {
    if (noDelayMessageMap[spec.methodName] === true) {
        this[spec.methodName](spec.args, spec.transferList);
        return;
    }

    if (obsoletesOtherMessagesMap[spec.methodName] === true) {
        this._abortPendingBufferFills();
        this._clearAllRequestsExceptFirst();
        this.messageQueue.push(spec);
    } else if (priorityMessageMap[spec.methodName] === true) {
        this._clearLoadReplacementRequests();
        this.messageQueue.splice(1, 0, spec);
    } else {
        this.messageQueue.push(spec);    
    }

    if (this.messageQueue.length === 1) {
        this._next();
    }
};

AudioPlayer.prototype.getBlobSize = function() {
    return this.blob.size;
};

AudioPlayer.prototype.sendMessage = function(name, args, transferList) {
    if (this.destroyed) return;
    if (this.parent == null)  {
        message(this.id, name, args, transferList);
    } else {
        this.parent.messageFromReplacement(name, args, transferList, this);
    }
};

AudioPlayer.prototype.messageFromReplacement = function(name, args, transferList, sender) {
    if (args.requestId === undefined) {
        this.destroyReplacement();
        this.passError(args.message, args.stack);
        return;
    } else if (this.replacementSpec.requestId !== args.requestId ||
        this.replacementPlayer !== sender) {
        sender.destroy();
        return message(-1, "_freeTransferList", args, transferList);
    }

    switch (name) {
    case "_error":
        this.destroyReplacement();
        this.passError(args.message, args.stack);
    break;

    case "_blobLoaded":
        this.replacementSpec.metadata = args.metadata;
        this.replacementPlayer.seek({
            requestId: args.requestId,
            count: this.replacementSpec.preloadBufferCount,
            time: this.replacementSpec.seekTime,
            isUserSeek: false
        }, this.replacementSpec.transferList);
    break;

    case "_seeked":
        var spec = this.replacementSpec;
        this.replacementSpec = null;
        this._abortPendingBufferFills();
        this._clearAllRequestsExceptFirst();
        this.transfer(this.replacementPlayer);
        this.replacementPlayer.parent = null;
        this.replacementPlayer = null;
        this.sendMessage("_replacementLoaded", {
            metadata: spec.metadata,
            requestId: spec.requestId,
            isUserSeek: args.isUserSeek,
            gaplessPreload: spec.gaplessPreload,
            baseTime: args.baseTime,
            count: args.count,
            channelCount: args.channelCount,
            info: args.info
        }, transferList);
    break;

    default:
        this.passError("unknown message from replacement: " + name, new Error().stack);
    break;
    }
};

AudioPlayer.prototype.destroyReplacement = function() {
    if (this.replacementPlayer) {
        var spec = this.replacementSpec;
        if (spec) {
            message(-1, "_freeTransferList", {}, spec.transferList);
            this.replacementSpec = null;
        }
        this.replacementPlayer.destroy();
        this.replacementPlayer = null;
    }
};

AudioPlayer.prototype.loadReplacement = function(args, transferList) {
    if (this.destroyed) return;
    this.destroyReplacement();
    try {
        this.replacementSpec = {
            requestId: args.requestId,
            blob: args.blob,
            seekTime: args.seekTime,
            transferList: transferList,
            metadata: null,
            preloadBufferCount: args.count,
            gaplessPreload: args.gaplessPreload
        };
        this.replacementPlayer = new AudioPlayer(-1, this);
        this.replacementPlayer.loadBlob(args);
    } catch (e) {
        this.destroyReplacement();
        this.passError(e.message, e.stack);
    }
};

AudioPlayer.prototype.destroy = function() {
    if (this.destroyed) return;
    this._abortPendingBufferFills();
    this._clearAllRequestsExceptFirst();
    this.parent = null;
    this.destroyReplacement();
    this.destroyed = true;
    delete audioPlayerMap[this.id];
    if (this.decoderContext) {
        freeDecoderContext(this.codecName, this.decoderContext);
        this.decoderContext = null;
    }
    if (this.resampler) {
        freeResampler(this.resampler);
        this.resampler = null;
    }
    this.fileView = null;
    this.codecName = "";
    this.decoderContext = this.blob = null;
    this.offset = 0;
    this.metadata = null;
    this.ended = false;
    this.removeAllListeners();
};

AudioPlayer.prototype.passError = function(errorMessage, stack, name) {
    this.sendMessage("_error", {
        message: errorMessage,
        stack: stack,
        name: name
    });
}

AudioPlayer.prototype._errored = function(e) {
    this.passError(e.message, e.stack, e.name);
};

AudioPlayer.prototype.gotCodec = function(codec, requestId) {
    var that = this;
    return Promise.try(function() {
        if (that.destroyed) return;
        return demuxer(codec.name, that.fileView).then(function(metadata) {
            if (!metadata) {
                that.fileView = that.blob = null;
                that.sendMessage("_error", {message: "Invalid " + codec.name + " file"});
                return;
            }
            that.metadata = metadata;
            that.decoderContext = allocDecoderContext(codec.name, codec.Context, {
                seekable: true,
                dataType: codec.Context.FLOAT,
                targetBufferLengthSeconds: bufferTime
            });

            that.decoderContext.start(metadata);
            that.decoderContext.on("error", that._errored);
            if (that.metadata.sampleRate !== hardwareSampleRate) {
                that.resampler = allocResampler(that.metadata.channels,
                                                that.metadata.sampleRate,
                                                hardwareSampleRate,
                                                resamplerQuality);
            } else {
                if (that.resampler) freeResampler(that.resampler);
                that.resampler = null;
            }

            that.offset = that.metadata.dataStart;
            that.sendMessage("_blobLoaded", {
                requestId: requestId,
                metadata: that.metadata
            });
        });
    }).catch(function(e) {
        that.passError(e.message, e.stack, e.name);
    });
};

AudioPlayer.prototype.loadBlob = function(args) {
    var that = this;
    return Promise.try(function() {
        if (that.destroyed) return;
        if (that.decoderContext) {
            freeDecoderContext(that.codecName, that.decoderContext);
            that.decoderContext = null;
        }
        if (that.resampler) {
            freeResampler(that.resampler);
            that.resampler = null;
        }
        that.ended = false;
        that.resampler = that.fileView = that.decoderContext = that.blob = that.metadata = null;
        that.offset = 0;
        that.codecName = "";

        var blob = args.blob;
        if (!(blob instanceof Blob) && !(blob instanceof File)) {
            return that.sendMessage("_error", {message: "Blob must be a file or blob"});
        }
        that.fileView = new FileView(blob);
        that.blob = blob;
        return sniffer.getCodecName(that.fileView).then(function(codecName) {
            if (!codecName) {
                that.fileView = that.blob = null;
                that.sendMessage("_error", {message: "Codec not supported"});
                return;
            }
            that.codecName = codecName;
            return codec.getCodec(codecName).then(function(codec) {
                that.blob = blob;
                return that.gotCodec(codec, args.requestId);
            }).catch(function(e) {
                that.fileView = that.blob = null;
                that.sendMessage("_error", {message: "Unable to load codec: " + e.message});
            });
        });
    }).catch(function(e) {
        that.passError(e.message, e.stack, e.name);
    });
};

const EMPTY_F32 = new Float32Array(0);
AudioPlayer.prototype._decodeNextBuffer = Promise.method(function(transferList, transferListIndex) {
    var that = this;
    var gotData = false;
    var id = this.bufferFillId;

    function dataListener(channels) {
        gotData = true;

        for (var e = 0; e < effects.length; ++e) {
            var effect = effects[e];
            for (var ch = 0; ch < channels.length; ++ch) {
                effect.applyToChannel(ch, channels[ch]);
            }
        }

        ret.length = channels[0].length;
        channels = channelMixer.mix(channels);

        for (var ch = 0; ch < channels.length; ++ch) {
            ret.channels[ch] = new Float32Array(transferList[transferListIndex++]);
        }

        if (that.metadata.sampleRate !== hardwareSampleRate) {
            ret.length = that.resampler.getLength(ret.length);
            that.resampler.resample(channels, undefined, ret.channels);
        } else {
            for (var ch = 0; ch < channels.length; ++ch) {
                var dst = ret.channels[ch];
                var src = channels[ch];
                for (var i = 0; i < src.length; ++i) {
                    dst[i] = src[i];
                }
            }
        }
    }
    this.decoderContext.once("data", dataListener);
    
    var samplesNeeded = bufferTime * this.metadata.sampleRate;
    var bytesNeeded = Math.ceil(this.metadata.maxByteSizePerSample * samplesNeeded);

    var ret = {
        channels: new Array(channelMixer.getChannels()),
        length: 0,
        startTime: this.decoderContext.getCurrentSample() / this.metadata.sampleRate,
        endTime: 0
    };

    return this.fileView.readBlockOfSizeAt(bytesNeeded, this.offset, 3).then(function loop() {
        if (id !== that.bufferFillId) {
            ret = null;
            return;
        }
        var src = that.fileView.block();
        var srcStart = that.offset - that.fileView.start;
        var srcEnd = that.decoderContext.decodeUntilFlush(src, srcStart);
        that.offset += (srcEnd - srcStart);

        if (!gotData) {
            if (that.metadata.dataEnd - that.offset >
                that.metadata.maxByteSizePerSample * that.metadata.samplesPerFrame * 10) {
                return that.fileView.readBlockOfSizeAt(bytesNeeded, that.offset, 3).then(loop);
            } else {
                that.decoderContext.end();
                that.ended = true;

                if (!gotData) {
                    gotData = true;
                    for (var ch = 0; ch < ret.channels.length; ++ch) {
                        ret.channels[ch] = EMPTY_F32;
                    }
                    ret.length = EMPTY_F32.length;
                }
            }
        }

    }).finally(function() {
        that.decoderContext.removeListener("data", dataListener);
    }).then(function() {
        if (ret) {
            ret.endTime = ret.startTime + (ret.length / hardwareSampleRate);
            return ret;
        }
    });
});

AudioPlayer.prototype._fillBuffers = Promise.method(function(count, requestId, transferList) {
    var that = this;
    var id = this.bufferFillId;
    if (!this.ended) {
        var result = {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };

        var transferListIndex = 0;
        return (function loop(i) {
            if (i < count) {
                return that._decodeNextBuffer(transferList, transferListIndex).then(function(decodeResult) {
                    if (!decodeResult) {
                        return;
                    }
                    transferListIndex += decodeResult.channels.length;
                    result.info.push({
                        length: decodeResult.length,
                        startTime: decodeResult.startTime,
                        endTime: decodeResult.endTime
                    })
                    result.count++;

                    if (that.ended) {
                        result.trackEndingBufferIndex = i;
                        return result;
                    }

                    if (that.bufferFillId === id) {
                        return loop(i + 1);
                    }
                });
            } else if (that.bufferFillId === id) {
                return result;
            }
        })(0).tap(function(result) {
            if (!result) {
                message(-1, "_freeTransferList", null, transferList);
            }
        });
    } else {
        return {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };
    }
});

AudioPlayer.prototype.fillBuffers = function(args, transferList) {
    var that = this;
    return Promise.try(function() {
        var count = args.count;
        if (that.destroyed) {
            that.sendMessage("_error", {message: "Destroyed"}, transferList);
            return;
        }
        if (!that.blob) {
            that.sendMessage("_error", {message: "No blob loaded"}, transferList);
            return;
        }
        
        return that._fillBuffers(count, -1, transferList).then(function(result) {
            if (result) {
                that.sendMessage("_buffersFilled", result, transferList);
            }
        });
    }).catch(function(e) {
        that.passError(e.message, e.stack, e.name);
    });
};

AudioPlayer.prototype.seek = function(args, transferList) {
    var that = this;
    return Promise.try(function() {
        var requestId = args.requestId;
        var count = args.count;
        var time = args.time;

        if (that.destroyed) {
            that.sendMessage("_error", {message: "Destroyed"}, transferList);
            return;
        }

        if (!that.blob) {
            that.sendMessage("_error", {message: "No blob loaded"}, transferList);
            return;
        }

        that.ended = false;

        if (that.resampler) {
            that.resampler.end();
            that.resampler.start();
        }



        return seeker(that.codecName, time, that.metadata, that.decoderContext, that.fileView).then(function(seekerResult) {
            that.offset = seekerResult.offset;
            
            that.decoderContext.applySeek(seekerResult);
            return that._fillBuffers(count, requestId, transferList).then(function(result) {
                if (result) {
                    result.baseTime = seekerResult.time;
                    result.isUserSeek = args.isUserSeek;
                    that._clearFillRequests();
                    that.sendMessage("_seeked", result, transferList);

                }
            });
        });
    }).catch(function (e) {
        that.passError(e.message, e.stack, e.name);
    });
};

AudioPlayer.prototype.sourceEndedPing = function(args) {
    var that = this;
    return Promise.try(function() {
        if (that.destroyed) return;
        that.sendMessage("_sourceEndedPong", {requestId: args.requestId});
    }).catch(function (e) {
        that.passError(e.message, e.stack, e.name);
    });
}

