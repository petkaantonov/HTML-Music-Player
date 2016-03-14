"use strict";
import initTextCodec from "lib/text_codec";
import simulateTick from "lib/patchtimers";
import Promise from "bluebird";
import blobPatch from "lib/blobpatch";
import { assign } from "lib/util";
import TagDatabase from "TagDatabase";
import MetadataParser from "audio/MetadataParser";
import Resampler from "audio/Resampler";
import ChannelMixer from "audio/ChannelMixer";
import FileView from "lib/FileView";
import demuxer from "audio/demuxer";
import codec from "audio/codec";
import sniffer from "audio/sniffer";
import {allocBuffer, freeBuffer, allocResampler, allocDecoderContext, freeResampler, freeDecoderContext} from "pool";
import AcoustId from "audio/AcoustId";
import Ebur128 from "audio/ebur128";
import EventEmitter from "lib/events";

initTextCodec(self);
self.EventEmitter = EventEmitter;

const db = new TagDatabase();
// Utilize 20% of one core.
const MAX_CPU_UTILIZATION = 0.2;

const getDowntime = function(cpuUsedTime) {
    return cpuUsedTime / MAX_CPU_UTILIZATION - cpuUsedTime;
};


Promise.setScheduler(function(fn) { fn(); });
Promise.config({
    cancellation: false,
    warnings: false,
    longStackTraces: false
});

blobPatch();


const BUFFER_DURATION = 30;
const WORST_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_DURATION = 120;
const FINGERPRINT_CHANNELS = 1;

const fingerprintMixer = new ChannelMixer(FINGERPRINT_CHANNELS);

var queue = [];
var processing = false;
var shouldAbort = false;
var currentJobId = -1;

const promiseMessageSuccessErrorHandler = function(args, p, jobType) {
    return p.then(function(result) {
        postMessage({
            id: args.id,
            result: result,
            jobType: jobType,
            type: "success"
        });
        return result;
    }).catch(function(e) {
        console.log(e.stack);
        postMessage({
            id: args.id,
            type: "error",
            jobType: jobType,
            error: {
                message: e.message,
                stack: e.stack
            }
        });
    })
};

const apiActions = {
    analyze: function(args) {
        queue.push(args);
        if (!processing) nextJob();
    },
    abort: function(args) {
        var jobId = args.id;
        if (currentJobId === jobId) {
            shouldAbort = true;
        }
    },
    parseMetadata: function(args) {
        promiseMessageSuccessErrorHandler(args, MetadataParser.parse(args), "metadata");
    },

    fetchAnalysisData: function(args) {
        promiseMessageSuccessErrorHandler(args, MetadataParser.fetchAnalysisData(args), "analysisData");
    },

    fetchAcoustId: function(args) {
        promiseMessageSuccessErrorHandler(args, AcoustId.fetch(args), "acoustId");
    },

    fetchAcoustIdImage: function(args) {
        promiseMessageSuccessErrorHandler(args, AcoustId.fetchImage(args), "acoustIdImage");
    },

    rateTrack: function(args) {
        tagDatabase.updateRating(args.uid, args.rating);
    },

    tick: simulateTick,

    search: function(args) {
        self.postMessage({
            searchSessionId: args.sessionId,
            type: "searchResults",
            results: MetadataParser.searchIndex.search(args.normalizedQuery)
        });
    },

    updateSearchIndex: function(args) {
        MetadataParser.searchIndex.update(args.transientId, args.metadata);
    },

    removeFromSearchIndex: function(args) {
        MetadataParser.searchIndex.remove(args.transientId);
    }
}


function delay(value, ms) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(value);
        }, ms);
    });
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
            reportError(id, new Error("file type not supported"));
            return;
        }
        return codec.getCodec(codecName);
    }).then(function(codec) {
        if (!codec) return;

        return demuxer(codec.name, view).then(function(metadata) {
            if (!metadata) {
                reportError(id, new Error("file type not supported"));
                return;
            }

            var result = {
                loudness: null,
                fingerprint: null,
                duration: metadata.duration
            };

            var tooLongToScan = false;
            if (metadata.duration) {
                tooLongToScan = metadata.duration > 30 * 60;
            } else {
                tooLongToScan = file.size > 100 * 1024 * 1024;
            }

            if (tooLongToScan) {
                return reportSuccess(id, result);
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
                ebur128 = new Ebur128(channels, sampleRate, Ebur128.EBUR128_MODE_I | Ebur128.EBUR128_MODE_SAMPLE_PEAK);
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

            var offset = metadata.dataStart;
            var aborted = false;
            var started = Date.now();

            return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2).then(function loop() {
                flushed = false;
                var buffer = view.block();
                var decodeStart = Date.now();
                var srcStart = view.toBufferOffset(offset);
                var srcEnd = decoder.decodeUntilFlush(buffer, srcStart);
                var downtime = getDowntime(Date.now() - decodeStart);
                var bytesRead = (srcEnd - srcStart);
                offset += bytesRead;

                var progress = (offset - metadata.dataStart) / (metadata.dataEnd - metadata.dataStart);

                if (progress > 0.15 && started > 0) {
                    var elapsed = Date.now() - started;
                    var estimate = Math.round(elapsed / progress - elapsed);
                    started = -1;
                    reportEstimate(id, estimate);
                }

                if (!flushed &&
                    (metadata.dataEnd - offset <= metadata.maxByteSizePerSample * metadata.samplesPerFrame * 10)) {
                    return Promise.delay(downtime);
                }

                if (shouldAbort) {
                    aborted = true;
                    reportAbort(id);
                    return Promise.delay(downtime);
                }

                var readStarted = Date.now();
                return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2)
                        .then(function() {
                            var waitTime = Math.max(0, downtime - (Date.now() - readStarted));
                            return Promise.delay(waitTime).then(loop);
                        });
            }).then(function() {
                if (aborted) {
                    return;
                }

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

                var flattened = assign({duration: result.duration},
                                            result.loudness || {},
                                            result.fingerprint || {});
                return tagDatabase.insert(job.uid, flattened)
                    .catch(function(e) {})
                    .then(function() {
                        reportSuccess(id, flattened);
                    });
            });
        });
    }).catch(function(e) {
        reportError(id, e);
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
        type: "abort",
        jobType: "analyze"
    });
}

function reportEstimate(id, value) {
    self.postMessage({
        id: id,
        type: "estimate",
        value: value,
        jobType: "analyze"
    });
}

function reportError(id, e) {
    self.postMessage({
        id: id,
        type: "error",
        jobType: "analyze",
        error: {
            message: e.message,
            stack: e.stack
        }
    });
}

function reportSuccess(id, result) {
    self.postMessage({
        id: id,
        type: "success",
        jobType: "analyze",
        result: result
    });
}

self.onmessage = function(event) {
    var data = event.data;

    var method = apiActions[data.action];

    if (typeof method === "function") {
        method(data.args);
    } else {
        throw new Error("unknown api action: " + data.action);
    }
};

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});
