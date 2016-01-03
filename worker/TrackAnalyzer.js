"use strict";
self.EventEmitter = require("events");

var Resampler = require("./Resampler");
var ChannelMixer = require("./ChannelMixer");
var FileView = require("./FileView");
var demuxer = require("./demuxer");
var codec = require("./codec");
var sniffer = require("./sniffer");
var pool = require("./pool");
var AcoustId = require("./AcoustId");
var Ebur128 = require("./ebur128");

var allocBuffer = pool.allocBuffer;
var freeBuffer = pool.freeBuffer;
var allocResampler = pool.allocResampler;
var allocDecoderContext = pool.allocDecoderContext;
var freeResampler = pool.freeResampler;
var freeDecoderContext = pool.freeDecoderContext;

const BUFFER_DURATION = 10;
const WORST_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_DURATION = 120;
const FINGERPRINT_CHANNELS = 1;

const fingerprintMixer = new ChannelMixer(FINGERPRINT_CHANNELS);

var queue = [];
var processing = false;

function nextJob() {
    processing = true;

    if (queue.length === 0) {
        processing = false;
        return;
    }

    var job = queue.shift();
    var id = job.id;
    var file = job.file;
    var fingerprint = job.fingerprint;
    var loudness = job.loudness;
    var codecName = sniffer.getCodecName(file);
    var decoder;
    var resamplerFingerprint;
    var fingerprintBuffers;
    var fingerprintSource;
    var sampleRate;
    var channels;

    if (!codecName) {
        return error(id, new Error("file type not supported"));
    }

    var view = new FileView(file);

    codec.getCodec(codecName).then(function(codec) {
        var metadata = demuxer(codec.name, view);

        if (!metadata) {
            return error(id, new Error("file type not supported"));
        }

        decoder = allocDecoderContext(codec.name, codec.Context, {
            seekable: false,
            dataType: codec.Context.FLOAT,
            targetBufferLengthSeconds: BUFFER_DURATION
        });

        sampleRate = metadata.sampleRate;
        channels = metadata.channels;

        var samplesDecoded = 0;
        var fingerprintSamples = sampleRate * FINGERPRINT_DURATION;
        var fingerprintBufferLength = 0;
        fingerprint = fingerprint && metadata.duration >= 7;
        var ebur128;

        if (fingerprint) {
            fingerprintBuffers = allocBuffer(BUFFER_DURATION * sampleRate, channels);
            fingerprintSource = allocBuffer(FINGERPRINT_DURATION * FINGERPRINT_SAMPLE_RATE, 1);

            if (sampleRate !== FINGERPRINT_SAMPLE_RATE) {
                resamplerFingerprint = allocResampler(1, sampleRate, FINGERPRINT_SAMPLE_RATE, WORST_RESAMPLER_QUALITY);    
            }
        }

        if (loudness) {
            ebur128 = new Ebur128(channels, sampleRate, Ebur128.EBUR128_MODE_I | Ebur128.EBUR128_MODE_SAMPLE_PEAK);
        }

        decoder.start(metadata);

        var flushed = false;
        decoder.on("data", function(channels) {
            flushed = true;
            var sampleCount = channels[0].length;
            samplesDecoded += sampleCount;
            fingerprint = fingerprint && samplesDecoded <= fingerprintSamples;

            if (fingerprint) {
                for (var ch = 0; ch < channels.length; ++ch) {
                    var src = channels[ch];
                    var dst = fingerprintBuffers[ch];
                    for (var i = 0; i < src.length; ++i) {
                        dst[i] = src[i];
                    }
                }

                var samples = fingerprintMixer.mix(fingerprintBuffers, sampleCount);
                var len = sampleCount;
                if (resamplerFingerprint) {
                    samples = resamplerFingerprint.resample([samples[0]], sampleCount);
                    len = samples[0].length;
                }

                var src = samples[0];
                var dst = fingerprintSource[0];
                for (var i = 0; i < len; ++i) {
                    dst[i + fingerprintBufferLength] = src[i];
                }
                fingerprintBufferLength += len;
            }

            if (loudness && ebur128) {
                ebur128.add_frames(channels, sampleCount);
            }
        });

        var error;
        decoder.on("error", function(e) {
            error = e;
        });

        var offset = metadata.dataStart;


        while (offset < metadata.dataEnd && error === undefined) {
            flushed = false;
            var buffer = view.bufferOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset);
            var srcStart = view.toBufferOffset(offset);
            var srcEnd = decoder.decodeUntilFlush(buffer, srcStart);
            var bytesRead = (srcEnd - srcStart);
            offset += bytesRead;
            progress(id, (offset - metadata.dataStart) / (metadata.dataEnd - metadata.dataStart));
            if (!flushed) {
                break;
            }
        }

        if (error === undefined) {
            decoder.end();
        }

        if (error) {
            return error(id, error);
        }
        var result = {
            loudness: null,
            fingerprint: null,
            duration: metadata.duration
        };

        if (fingerprintSource && fingerprintBufferLength > 0) {
            var fpcalc = new AcoustId(fingerprintSource[0], fingerprintBufferLength);
            result.fingerprint = {
                fingerprint: fpcalc.calculate(false)
            };
        }

        if (loudness && ebur128) {
            var trackGain = Ebur128.REFERENCE_LUFS - ebur128.loudness_global();
            var trackPeak = Math.max.apply(Math, ebur128.getSamplePeak());
            var silence = ebur128.getSilence();
            result.loudness = {
                trackGain: trackGain,
                trackPeak: trackPeak,
                silence: silence
            };
        }
        success(id, result);
    }).catch(function(e) {
        error(id, e);
    }).then(cleanup, cleanup);

    function cleanup() {
        if (decoder) {
            freeDecoderContext(codecName, decoder);
            decoder = null;
        }

        if (resamplerFingerprint) {
            freeResampler(resamplerFingerprint);
            resamplerFingerprint = null;
        }
        if (fingerprintBuffers) {
            freeBuffer(BUFFER_DURATION * sampleRate, channels, fingerprintBuffers);
            fingerprintBuffers = null;
        }
        if (fingerprintSource) {
            freeBuffer(FINGERPRINT_DURATION * FINGERPRINT_SAMPLE_RATE, 1, fingerprintSource);
            fingerprintSource = null;
        }
        nextJob();
    }
}

function progress(id, amount) {
    self.postMessage({
        id: id,
        type: "progress",
        progress: amount
    });
}

function error(id, e) {
    self.postMessage({
        id: id,
        type: "error",
        error: {
            message: e.message,
            stack: e.stack
        }
    });
}

function success(id, result) {
    self.postMessage({
        id: id,
        type: "success",
        result: result
    });
}

self.onmessage = function(event) {
    var data = event.data;

    if (data.action === "analyze") {
        queue.push(data.args);
        if (!processing) nextJob();
    }
};

// Preload mp3.
codec.getCodec("mp3");
