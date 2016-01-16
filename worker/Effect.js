"use strict";

const util = require("../js/util");

function Effect(spec) {
    this.name = spec.name;
}

Effect.prototype.applyToChannel = function(channelIndex, samples) {};
Effect.prototype.isEffective = function() {
    return false;
};

function NoiseSharpeningEffect(spec) {
    Effect.call(this, spec);
    this.effectSize = Math.max(0, Math.min(2, (+spec.effectSize) || 0));
}
util.inherits(NoiseSharpeningEffect, Effect);

NoiseSharpeningEffect.prototype.applyToChannel = function(channelIndex, samples) {
    var a = this.effectSize;
    if (a <= 0) return;
    for (var i = samples.length - 1; i >= 1; --i) {
        var sample = samples[i];
        var diff = sample - samples[i - 1];
        samples[i] = sample + a * diff;
    }
};

NoiseSharpeningEffect.prototype.isEffective = function() {
    return this.effectSize !== 0;
};

module.exports = Effect;
Effect.create = function(spec) {
    switch (spec.name) {
        case "noise-sharpening":
            return new NoiseSharpeningEffect(spec);
        return;
        default: throw new Error("unknown effect: " + spec.name);
    }
};
