"use strict";

var Resampler = require("./Resampler");

const decoderPool = Object.create(null);
const resamplers = Object.create(null);
const bufferPool = Object.create(null);


const allocBuffer = function(size, channels) {
    var key = size + " " + channels;

    var buffers = bufferPool[key];
    if (!buffers || !buffers.length) {
        buffers = new Array(channels);
        for (var i = 0; i < channels; ++i) {
            buffers[i] = new Float32Array(size);
        }

        bufferPool[key] = [buffers];
    }

    return bufferPool[key].shift();
}

const freeBuffer = function(size, channels, buffer) {
    var key = size + " " + channels;
    bufferPool[key].push(buffer);
}

const allocResampler = function(channels, from, to) {
    var key = channels + " " + from + " " + to;
    var entry = resamplers[key];
    if (!entry) {
        entry = resamplers[key] = {
            allocationCount: 2,
            instances: [new Resampler(channels, from, to), new Resampler(channels, from, to)]
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new Resampler(channels, from, to));
        entry.allocationCount++;
        if (entry.allocationCount > 6) {
            throw new Error("memory leak");
        }
    }
    var ret = entry.instances.shift();
    ret.start();
    return ret;
};

const freeResampler = function(resampler) {
    var key = resampler.nb_channels + " " + resampler.in_rate + " " + resampler.out_rate;
    resamplers[key].instances.push(resampler);
    resampler.end();
};

const allocDecoderContext = function(name, Context, contextOpts) {
    var entry = decoderPool[name];

    if (!entry) {
        entry = decoderPool[name] = {
            allocationCount: 2,
            instances: [new Context(contextOpts), new Context(contextOpts)]
        };
    }

    if (entry.instances.length === 0) {
        entry.instances.push(new Context(contextOpts));
        entry.allocationCount++;
        if (entry.allocationCount > 6) {
            throw new Error("memory leak");
        }
    }

    return entry.instances.shift();
};

const freeDecoderContext = function(name, context) {
    context.removeAllListeners();
    decoderPool[name].instances.push(context);
    context.end();
};

module.exports = {
    allocResampler: allocResampler,
    freeResampler: freeResampler,
    allocDecoderContext: allocDecoderContext,
    freeDecoderContext: freeDecoderContext,
    allocBuffer: allocBuffer,
    freeBuffer: freeBuffer
};
