"use strict";
self.EventEmitter = require("events");

var ChannelMixer = require("./ChannelMixer");
var sniffer = require("./sniffer");
var codec = require("./codec");
var demuxer = require("./demuxer");
var FileView = require("./FileView");
var seeker = require("./seeker");
var pool = require("./pool");

var allocResampler = pool.allocResampler;
var allocDecoderContext = pool.allocDecoderContext;
var freeResampler = pool.freeResampler;
var freeDecoderContext = pool.freeDecoderContext;


const channelMixer = new ChannelMixer(2);
var hardwareSampleRate = 0;
var bufferTime = 0;
var resamplerQuality = 0;

const audioPlayerMap = Object.create(null);


const message = function(nodeId, methodName, args, transferList) {
    if (transferList === undefined) transferList = [];
    args = Object(args);
    transferList = transferList.map(function(v) {
        if (v.buffer) return v.buffer;
        return v;
    });
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
        }
    } else {
        var obj = audioPlayerMap[receiver];
        obj[data.methodName].call(obj, data.args, data.transferList);
    }
};

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
    this.errored = this.errored.bind(this);
    this.replacementPlayer = null;
    this.replacementSpec = null;
    this.parent = parent || null;
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
    this.offset = other.offset;
    this.resampler = other.resampler;

    other.decoderContext = null;
    other.resampler = null;
    other.fileView = null;
    other.blob = null;
    other.metadata = null;
    other.destroy();
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

AudioPlayer.prototype.errored = function(e) {
    this.passError(e.message, e.stack, e.name);
};

AudioPlayer.prototype.gotCodec = function(codec, requestId) {
    try {
        if (this.destroyed) return;
        this.fileView = new FileView(this.blob);
        var metadata = demuxer(codec.name, this.fileView);
        if (!metadata) {
            return this.sendMessage("_error", {message: "Invalid " + codec.name + " file"});
        }
        this.decoderContext = allocDecoderContext(codec.name, codec.Context, {
            seekable: true,
            dataType: codec.Context.FLOAT,
            targetBufferLengthSeconds: bufferTime
        });

        this.metadata = metadata;
        this.decoderContext.start(metadata);
        this.decoderContext.on("error", this.errored);
        if (this.metadata.sampleRate !== hardwareSampleRate) {
            this.resampler = allocResampler(this.metadata.channels,
                                            this.metadata.sampleRate,
                                            hardwareSampleRate,
                                            resamplerQuality);
        } else {
            if (this.resampler) freeResampler(this.resampler);
            this.resampler = null;
        }

        this.offset = this.metadata.dataStart;
        this.sendMessage("_blobLoaded", {
            requestId: requestId,
            metadata: this.metadata
        });
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.loadBlob = function(args) {
    try {
        if (this.destroyed) return;
        if (this.decoderContext) {
            freeDecoderContext(this.codecName, this.decoderContext);
            this.decoderContext = null;
        }
        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
        }
        this.ended = false;
        this.resampler = this.fileView = this.decoderContext = this.blob = this.metadata = null;
        this.offset = 0;
        this.codecName = "";

        var blob = args.blob;
        if (!(blob instanceof Blob) && !(blob instanceof File)) {
            return this.sendMessage("_error", {message: "Blob must be a file or blob"});
        }

        var codecName = sniffer.getCodecName(blob);
        if (!codecName) {
            return this.sendMessage("_error", {message: "Codec not supported"});
        }
        this.codecName = codecName;
        var self = this;
        return codec.getCodec(codecName).then(function(codec) {
            self.blob = blob;
            self.gotCodec(codec, args.requestId);
        }).catch(function(e) {
            self.sendMessage("_error", {message: "Unable to load codec: " + e.message});
        });
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

const EMPTY_F32 = new Float32Array(0);
AudioPlayer.prototype._decodeNextBuffer = function(transferList, transferListIndex) {
    var offset = this.offset;
    var samplesNeeded = bufferTime * this.metadata.sampleRate;
    var bytesNeeded = Math.ceil(this.metadata.maxByteSizePerSample * samplesNeeded);
    var src = this.fileView.bufferOfSizeAt(bytesNeeded, offset);
    var srcStart = offset - this.fileView.start;

    var ret = {
        channels: new Array(channelMixer.getChannels()),
        length: 0,
        startTime: this.decoderContext.getCurrentSample() / this.metadata.sampleRate,
        endTime: 0
    };

    var self = this;
    var gotData = false;
    this.decoderContext.once("data", function(channels) {
        gotData = true;
        ret.length = channels[0].length;
        channels = channelMixer.mix(channels);

        for (var ch = 0; ch < channels.length; ++ch) {
            ret[ch] = new Float32Array(transferList[transferListIndex++]);
        }

        if (self.metadata.sampleRate !== hardwareSampleRate) {
            ret.length = self.resampler.getLength(ret.length);
            self.resampler.resample(channels, undefined, ret);
        } else {
            for (var ch = 0; ch < channels.length; ++ch) {
                var dst = ret[ch];
                var src = channels[ch];
                for (var i = 0; i < src.length; ++i) {
                    dst[i] = src[i];
                }
            }
        }
    });

    var srcEnd = this.decoderContext.decodeUntilFlush(src, srcStart);
    this.offset += (srcEnd - srcStart);

    if (!gotData) {
        this.decoderContext.end();
        this.ended = true;

        if (!gotData) {
            for (var ch = 0; ch < ret.channels.length; ++ch) {
                ret.channels[ch] = EMPTY_F32;
            }
        }
    }
    ret.endTime = ret.startTime + (ret.length / hardwareSampleRate);
    return ret;
};

AudioPlayer.prototype._fillBuffers = function(count, requestId, transferList) {
    if (!this.ended) {
        var result = {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };

        var transferListIndex = 0;
        for (var i = 0; i < count; ++i) {
            var decodeResult = this._decodeNextBuffer(transferList, transferListIndex);
            transferListIndex += decodeResult.channels.length;
            result.info.push({
                length: decodeResult.length,
                startTime: decodeResult.startTime,
                endTime: decodeResult.endTime
            })
            result.count++;

            if (this.ended) {
                result.trackEndingBufferIndex = i;
                break;
            }
        }

        return result;
    } else {
        return {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };
    }
};

AudioPlayer.prototype.fillBuffers = function(args, transferList) {
    try {
        var requestId = args.requestId;
        var count = args.count;
        if (this.destroyed) {
            return this.sendMessage("_error", {message: "Destroyed"}, transferList);
        }
        if (!this.blob) {
            return this.sendMessage("_error", {message: "No blob loaded"}, transferList);
        }
        var result = this._fillBuffers(count, requestId, transferList);
        this.sendMessage("_buffersFilled", result, transferList);
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.seek = function(args, transferList) {
    try {
        var requestId = args.requestId;
        var count = args.count;
        var time = args.time;
        if (this.destroyed) {
            return this.sendMessage("_error", {message: "Destroyed"}, transferList);
        }
        if (!this.blob) {
            return this.sendMessage("_error", {message: "No blob loaded"}, transferList);
        }
        if (this.resampler) {
            this.resampler.end();
            this.resampler.start();
        }

        this.ended = false;
        var seekerResult = seeker(this.codecName, time, this.metadata, this.decoderContext, this.fileView);
        this.offset = seekerResult.offset;
        this.decoderContext.applySeek(seekerResult);
        var result = this._fillBuffers(count, requestId, transferList);
        result.baseTime = seekerResult.time;
        result.isUserSeek = args.isUserSeek;
        this.sendMessage("_seeked", result, transferList);
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.sourceEndedPing = function(args) {
    if (this.destroyed) return;
    try {
        this.sendMessage("_sourceEndedPong", {requestId: args.requestId});
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
}

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});
