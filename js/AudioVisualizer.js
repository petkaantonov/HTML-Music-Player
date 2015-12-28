"use strict";
const EventEmitter = require("events");
const util = require("./util");
const realFft = require("../lib/realfft");

const weights = new Float32Array([
    0, 0,
    10, 0.0003019951720402013,
    12.5, 0.0006760829753919819,
    16, 0.0014621771744567184,
    20, 0.0029853826189179603,
    25, 0.10351421666793437,
    31.5, 0.19054607179632474,
    40, 0.481131121482591,
    50, 0.5095408738576246,
    63, 0.515408738576246,
    80, 0.525408738576246,
    100, 0.5395408738576246,
    125, 0.5595408738576246,
    160, 0.4195408738576246,
    200, 0.4395408738576246,
    250, 0.4495408738576246,
    315, 0.4595408738576246,
    400, 0.4754399373371569,
    500, 0.5918309709189364,
    630, 0.6035261221856173,
    800, 0.6220108393559098,
    1000, 0.690108393559098,
    1250, 0.680108393559098,
    1600, 0.67108393559098,
    2000, 0.660108393559098,
    2500, 0.650108393559098,
    3150, 0.64108393559098,
    4000, 0.630108393559098,
    5000, 0.620108393559098,
    6300, 0.930108393559098,
    8000, 1.670108393559098,
    10000, 1.79498942093324559,
    12500, 1.826095368972401691,
    16000, 1.9546773514128719823,
    20000, 0.34276778654645035
]);

function makeBuffer(bufferSize, bins) {
    return [
        new Float32Array(bufferSize),
        new Float32Array(bins)
    ];
}

const buffers = {};

function AudioVisualizer(audioContext, sourceNode, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.sampleRate = audioContext.sampleRate;
    this.maxFrequency = opts.maxFrequency || 18500;
    this.minFrequency = opts.minFrequency || 20;
    this.fps = opts.fps || 48;
    this.bufferSize = 2;
    this.bins = opts.bins || this.bufferSize / 2;
    this.baseSmoothingConstant = opts.baseSmoothingConstant || 0.00007;
    this.sourceNode = sourceNode;

    while (this.bufferSize * this.fps < this.sampleRate) {
        this.bufferSize *= 2;
    }

    if (this.bufferSize > 16384) {
        throw new Error("too low fps " +this.fps+ " for sample rate" + this.sampleRate);
    }

    var buffer = buffers[this.bufferSize + " " + this.bins];
    if (!buffer) {
        buffer = buffers[this.bufferSize + " " + this.bins] = makeBuffer(this.bufferSize, this.bins);
    }
    this.buffer = buffer;

    var bins = this.buffer[1];
    for (var i = 0; i < bins.length; ++i) {
        bins[i] = 0;
    }

    this.destroyed = false;
    this.paused = false;
    this.handleAudioProcessingEvent = this.handleAudioProcessingEvent.bind(this);
    this.frameId = requestAnimationFrame(this.handleAudioProcessingEvent);
}
util.inherits(AudioVisualizer, EventEmitter);

AudioVisualizer.prototype.pause = function() {
    if (this.paused) return;
    this.paused = true;
    this.emit("pause");
};

AudioVisualizer.prototype.resume = function() {
    if (!this.paused) return;
    this.paused = false;
    this.emit("resume");
};

AudioVisualizer.prototype.destroy = function() {
    this.destroyed = true;
    this.removeAllListeners();
    cancelAnimationFrame(this.frameId);
    this.sourceNode = null;
};

AudioVisualizer.prototype.handleAudioProcessingEvent = function(now) {
    if (this.destroyed) return;
    this.frameId = requestAnimationFrame(this.handleAudioProcessingEvent);
    if (this.listenerCount("data") === 0) {
        return;
    } else if (this.paused) {
        this.emit("data", {
            paused: true,
            bins: this.buffer[1],
            maxPower: this.maxPower,
            now: now
        });
        return;
    }

    if (!this.sourceNode.getUpcomingSamples(this.buffer[0])) {
        return;
    }
    
    this.hammingWindow();
    this.forwardFft();
    this.calculateBins();
    this.emit("data", {
        paused: false,
        bins: this.buffer[1],
        maxPower: this.maxPower,
        now: now
    });
};

AudioVisualizer.prototype.calculateBins = function() {
    const X = this.buffer[0];
    const imOffset = this.bufferSize >> 1;
    const bins = this.buffer[1];
    const smoothingConstant = Math.pow(this.baseSmoothingConstant, this.bufferSize / this.sampleRate);
    const inverseSmoothingConstant = 1 - smoothingConstant;

    const fftFreqs = Math.ceil(this.maxFrequency / (this.sampleRate / this.bufferSize));
    const binSize = bins.length;

    var binFrequencyStart = 1;
    var aWeightIndex = 2;
    var previousEnd = 0;
    for (var i = 0; i < binSize; ++i) {
        var binFrequencyEnd = ((Math.pow((i + 1) / binSize, 2) * fftFreqs) | 0);

        if (binFrequencyEnd <= previousEnd) {
            binFrequencyEnd = previousEnd + 1;
        }
        previousEnd = binFrequencyEnd;
        binFrequencyEnd = Math.min(fftFreqs, binFrequencyEnd) + 1;

        var binWidth = Math.max(1, binFrequencyEnd - binFrequencyStart);
        var maxPower = 0;
        var binFrequency = 0;

        for (var j = 0; j < binWidth; ++j) {
            var re = X[binFrequencyStart + j];
            var im = X[imOffset + binFrequencyStart + j];
            var power = re * re + im * im;
            if (power > maxPower) {
                binFrequency = ((binFrequencyStart + j) * this.sampleRate / this.bufferSize) | 0;
                maxPower = power;
            }
        }

        maxPower = Math.max(0, Math.log(maxPower));

        for (var j = aWeightIndex; j < weights.length; j += 2) {
            var weightFrequency = weights[j];

            if (binFrequency < weightFrequency) {
                maxPower *= weights[j - 1];
                aWeightIndex = j;
                break;
            }
        }

        maxPower = Math.min(0.97, bins[i] * smoothingConstant + inverseSmoothingConstant * maxPower * 0.24);

        bins[i] = maxPower;
        binFrequencyStart = binFrequencyEnd;
    }
};

AudioVisualizer.prototype.hammingWindow = function() {
    const x = this.buffer[0];
    const N = x.length;
    //const pi2 = Math.PI * 2;
    const a = 2 * Math.pow(Math.sin(-Math.PI / N), 2);
    const b = Math.sin(-Math.PI * 2 / N);
    var tmp;
    var cos = 1;
    var sin = 0;
    for (var n = 0; n < N; ++n) {
        x[n] *= (0.53836 - 0.46164 * cos);
        tmp = cos - (a * cos + b * sin);
        sin = sin + (b * cos - a * sin);
        cos = tmp;
    }
};

AudioVisualizer.prototype.forwardFft = function() {
    realFft(this.buffer[0]);
};

module.exports = AudioVisualizer;
