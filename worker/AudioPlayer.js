"use strict";
self.EventEmitter = require("events");

var Resampler = require("./Resampler");
var ChannelMixer = require("./ChannelMixer");
var sniffer = require("./sniffer");
var codec = require("./codec");
var demuxer = require("./demuxer");
var FileView = require("./FileView");
var seeker = require("./seeker");

const channelMixer = new ChannelMixer(2);
var hardwareSampleRate = 0;
var bufferTime = 0;

const audioPlayerMap = Object.create(null);
const decoderPool = Object.create(null);
const resamplers = Object.create(null);

const getResampler = function(channels, from, to) {
    var key = channels + " " + from + " " + to;
    if (!resamplers[key]) {
        resamplers[key] = [
            new Resampler(channels, from, to),
            new Resampler(channels, from, to),
            new Resampler(channels, from, to)
        ];
    }
    var ret = resamplers[key].shift();
    ret.start();
    return ret;
};

const freeResampler = function(resampler) {
    var key = resampler.nb_channels + " " + resampler.in_rate + " " + resampler.out_rate;
    resampler.end();
    resamplers[key].push(resampler);
};

const allocDecoderContext = function(name, Context, contextOpts) {
    var pool = decoderPool[name];

    if (!pool) {
        pool = [new Context(contextOpts), new Context(contextOpts), new Context(contextOpts)];
        decoderPool[name] = pool;
    }

    return pool.shift();
};

const freeDecoderContext = function(name, context) {
    context.removeAllListeners();
    context.end();
    decoderPool[name].push(context);
};

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

function AudioPlayer(id) {
    EventEmitter.call(this);
    this.id = id;
    this.decoderContext = null;
    this.blob = null;
    this.offset = 0;
    this.codecName = "";
    this.destroyed = false;
    this.metadata = null;
    this.fileView = null;
    this.resampler = null;
}
AudioPlayer.prototype = Object.create(EventEmitter.prototype);
AudioPlayer.prototype.constructor = AudioPlayer;

AudioPlayer.prototype.getBlobSize = function() {
    return this.blob.size;
};

AudioPlayer.prototype.destroy = function() {
    if (this.destroyed) return;
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

    this.errored = this.errored.bind(this);
};

AudioPlayer.prototype.errored = function(e) {
    message(this.id, "_error", {message: "Decoder error: " + e.message});
};

AudioPlayer.prototype.gotCodec = function(codec, requestId) {
    if (this.destroyed) return;
    var metadata = demuxer(codec.name, this.blob);
    if (!metadata) {
        return message(this.id, "_error", {message: "Invalid " + codec.name + " file"});
    }
    this.decoderContext = allocDecoderContext(codec.name, codec.Context, {
        seekable: true,
        dataType: codec.Context.FLOAT,
        targetBufferLengthSeconds: bufferTime
    });

    this.decoderContext.start();
    this.decoderContext.on("error", this.errored);
    this.metadata = metadata;

    if (this.metadata.sampleRate !== hardwareSampleRate) {
        this.resampler = getResampler(this.metadata.channels,
                                      this.metadata.sampleRate,
                                      hardwareSampleRate);
    } else {
        if (this.resampler) freeResampler(this.resampler);
        this.resampler = null;
    }

    this.offset = this.metadata.dataStart;
    this.fileView = new FileView(this.blob);
    message(this.id, "_blobLoaded", {
        requestId: requestId,
        metadata: this.metadata
    });
};

AudioPlayer.prototype.loadBlob = function(args) {
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
    if (!(blob instanceof Blob) && !(blob instanceof File)) {
        return message(this.id, "_error", {message: "Blob must be a file or blob"});
    }
    var codecName = sniffer.getCodecName(blob);
    if (!codecName) {
        return message(this.id, "_error", {message: "Codec not supported"});
    }
    this.codecName = codecName;
    var self = this;
    return codec.getCodec(codecName).then(function(codec) {
        self.blob = blob;
        self.gotCodec(codec, args.requestId);
    }).catch(function(e) {
        message(self.id, "_error", {message: "Unable to load codec: " + e.message});
    });
};

const EMPTY_F32 = new Float32Array(0);
AudioPlayer.prototype._decodeNextBuffer = function(transferList, transferListIndex) {
    var offset = this.offset;
    var samplesNeeded = bufferTime * this.metadata.sampleRate;
    var bytesNeeded = Math.ceil(this.metadata.maxByteSizePerSample * samplesNeeded);
    var src = this.fileView.bufferOfSizeAt(bytesNeeded, offset);
    var srcStart = offset - this.fileView.start;

    var ret = new Array(channelMixer.getChannels());
    var self = this;
    var gotData = false;
    this.decoderContext.once("data", function(channels) {
        gotData = true;
        channels = channelMixer.mix(channels);

        if (self.metadata.sampleRate !== hardwareSampleRate) {
            channels = self.resampler.resample(channels);
        }

        for (var ch = 0; ch < channels.length; ++ch) {
            var dst = new Float32Array(transferList[transferListIndex++]);
            var src = channels[ch];
            for (var j = 0; j < src.length; ++j) {
                dst[j] = src[j];
            }
            ret[ch] = dst;
        }
    });
    var srcEnd = this.decoderContext.decodeUntilFlush(src, srcStart);
    this.offset += (srcEnd - srcStart);
    if (!gotData) {
        this.decoderContext.end();
        this.ended = true;
        if (!gotData) {
            for (var ch = 0; ch < ret.length; ++ch) {
                ret[ch] = EMPTY_F32;
            }
        }
    }
    return ret;
};

AudioPlayer.prototype._fillBuffers = function(count, requestId, transferList) {
    if (!this.ended) {
        var result = {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            lengths: []
        };

        var transferListIndex = 0;
        for (var i = 0; i < count; ++i) {
            var channels = this._decodeNextBuffer(transferList, transferListIndex);
            transferListIndex += channels.length;
            result.lengths.push(channels[0].length);
            result.count++;

            if (this.ended) {
                break;
            }
        }

        return result;
    } else {
        return {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            lengths: []
        };
    }
};

AudioPlayer.prototype.fillBuffers = function(args, transferList) {
    var requestId = args.requestId;
    var count = args.count;
    if (this.destroyed) {
        return message(this.id, "_error", {message: "Destroyed"}, transferList);
    }
    if (!this.blob) {
        return message(this.id, "_error", {message: "No blob loaded"}, transferList);
    }
    var result = this._fillBuffers(count, requestId, transferList);
    message(this.id, "_buffersFilled", result, transferList);
};

AudioPlayer.prototype.seek = function(args, transferList) {
    var requestId = args.requestId;
    var count = args.count;
    var time = args.time;
    if (this.destroyed) {
        return message(this.id, "_error", {message: "Destroyed"}, transferList);
    }
    if (!this.blob) {
        return message(this.id, "_error", {message: "No blob loaded"}, transferList);
    }
    if (this.resampler) {
        this.resampler.end();
        this.resampler.start();
    }
    this.decoderContext.removeAllListeners("data");
    this.decoderContext.end();
    this.decoderContext.start();
    this.ended = false;
    var seekerResult = seeker(this.codecName, time, this.metadata, this.decoderContext, this.blob);
    this.offset = seekerResult.offset;
    var result = this._fillBuffers(count, requestId, transferList);
    result.baseTime = seekerResult.time;
    message(this.id, "_seeked", result, transferList);
};
