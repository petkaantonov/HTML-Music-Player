"use strict";
self.EventEmitter = require("events");

const Promise = require("../lib/bluebird");
Promise.setScheduler(function(fn) { fn(); });
Promise.config({
    cancellation: false,
    warnings: false,
    longStackTraces: false
});

const Resampler = require("./Resampler");
const ChannelMixer = require("./ChannelMixer");
const FileView = require("./FileView");
const demuxer = require("./demuxer");
const codec = require("./codec");
const sniffer = require("./sniffer");
const pool = require("./pool");
const AcoustId = require("./AcoustId");
const Ebur128 = require("./ebur128");

const allocBuffer = pool.allocBuffer;
const freeBuffer = pool.freeBuffer;
const allocResampler = pool.allocResampler;
const allocDecoderContext = pool.allocDecoderContext;
const freeResampler = pool.freeResampler;
const freeDecoderContext = pool.freeDecoderContext;

const BUFFER_DURATION = 1;
const WORST_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_DURATION = 120;
const FINGERPRINT_CHANNELS = 1;

const fingerprintMixer = new ChannelMixer(FINGERPRINT_CHANNELS);

var queue = [];
var processing = false;
var shouldAbort = false;
var currentJobId = -1;

function delay(value, ms) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(value);
        }, ms);
    });
}

function doAbort(args) {
    var jobId = args.id;
    if (currentJobId === jobId) {
        shouldAbort = true;
    }
}

function nextJob() {
    currentJobId = -1;
    shouldAbort = false;
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
    
    var decoder;
    var resamplerFingerprint;
    var fingerprintBuffers;
    var fingerprintSource;
    var sampleRate;
    var channels;
    var codecName;
    currentJobId = id;

    var view = new FileView(file);

    sniffer.getCodecName(view).then(function(codecName) {
        if (!codecName) {
            error(id, new Error("file type not supported"));
            return;
        }
        return codec.getCodec(codecName);
    }).then(function(codec) {
        if (!codec) return;
        
        return demuxer(codec.name, view).then(function(metadata) {
            if (!metadata) {
                error(id, new Error("file type not supported"));
                return;
            }
            codecName = codec.name;
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
            var aborted = false;
            var started = Date.now();
            
            return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2).then(function loop() {
                flushed = false;
                var buffer = view.block();
                var srcStart = view.toBufferOffset(offset);
                var srcEnd = decoder.decodeUntilFlush(buffer, srcStart);
                var bytesRead = (srcEnd - srcStart);
                offset += bytesRead;

                var progress = (offset - metadata.dataStart) / (metadata.dataEnd - metadata.dataStart);

                if (progress > 0.10 && started > 0) {
                    var elapsed = Date.now() - started;
                    var estimate = Math.round(elapsed / progress - elapsed);
                    started = -1;
                    reportEstimate(id, estimate);
                }
            
                if (!flushed &&
                    (metadata.dataEnd - offset <= metadata.maxByteSizePerSample * metadata.samplesPerFrame * 10)) {
                    return;
                }

                if (shouldAbort) {
                    aborted = true;
                    reportAbort(id);
                    return;
                }

                return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2).then(loop);
            }).then(function() {
                if (aborted) {
                    return;
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
            });
        });
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

function reportAbort(id) {
    self.postMessage({
        id: id,
        type: "abort"
    });
}

function reportEstimate(id, value) {
    self.postMessage({
        id: id,
        type: "estimate",
        value: value
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
    } else if (data.action === "abort") {
        doAbort(data.args);
    }
};

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});
