"use strict";

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
    8000, 1.270108393559098,
    10000, 1.29498942093324559,
    12500, 1.346095368972401691,
    16000, 1.3946773514128719823,
    20000, 0.34276778654645035
]);

function makeBuffer(bufferSize, bins) {
    return [
        new Float32Array(bufferSize),
        new Float32Array(bins),
        new Float64Array(bufferSize)
    ];
}

const buffers = {};

function AudioVisualizer(audioContext, sourceNode, visualizerCanvas, opts) {
    opts = Object(opts);
    this.visualizerCanvas = visualizerCanvas;
    this.multiplier = 1;
    this.setMultiplier("multiplier" in opts ? +opts.multiplier : 1);
    this.sampleRate = audioContext.sampleRate;
    this.maxFrequency = opts.maxFrequency || 18500;
    this.minFrequency = opts.minFrequency || 20;
    this.bufferSize = 2;
    this.baseSmoothingConstant = opts.baseSmoothingConstant || 0.00007;
    this.sourceNode = sourceNode;

    while (this.bufferSize * this.fps() < this.sampleRate) {
        this.bufferSize *= 2;
    }

    if (this.bufferSize > 16384) {
        throw new Error("too low fps " +this.fps()+ " for sample rate" + this.sampleRate);
    }

    var buffer = buffers[this.bufferSize + " " + this.bins()];
    if (!buffer) {
        buffer = buffers[this.bufferSize + " " + this.bins()] = makeBuffer(this.bufferSize, this.bins());
    }
    this.buffer = buffer;

    var bins = this.buffer[1];
    for (var i = 0; i < bins.length; ++i) {
        bins[i] = 0;
    }

    this.fillWindow();
    this.destroyed = false;
    this.paused = false;
    this.gotFrame = this.gotFrame.bind(this);
    this.frameId = requestAnimationFrame(this.gotFrame);
    this.lastFrameTimeStamp = 0;
    this.frameSkip = 1;
    this.frameNumber = 0;
}

AudioVisualizer.prototype.bins = function() {
    return this.visualizerCanvas.getNumBins();
};

AudioVisualizer.prototype.fps = function() {
    return this.visualizerCanvas.getTargetFps();
};

AudioVisualizer.prototype.setMultiplier = function(value) {
    if (!isFinite(value)) throw new Error("infinite");
    value = Math.max(0.82, Math.min(256, value));
    this.multiplier = value;
};

AudioVisualizer.prototype.pause = function() {
    if (this.paused) return;
    this.paused = true;
};

AudioVisualizer.prototype.resume = function() {
    if (!this.paused) return;
    this.paused = false;
};

AudioVisualizer.prototype.destroy = function() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    this.sourceNode = null;
};


AudioVisualizer.prototype.gotFrame = function(now) {
    if (this.destroyed) return;
    this.frameId = requestAnimationFrame(this.gotFrame);

    var elapsed = now - this.lastFrameTimeStamp;
    var targetFps = this.fps();

    if ((elapsed + 1) < (1000 / targetFps)) {
        var screenFps = Math.ceil(1000 / elapsed);
        var div = screenFps / targetFps;
        if (div !== (div|0)) div = 2;
        var frameSkip = this.frameSkip;
        while (screenFps / div >= targetFps) {
            frameSkip *= div;
            screenFps /= div;
        }

        this.frameSkip = frameSkip;
    } else {
        this.frameSkip = 1;
    }
    this.frameNumber++;

    if (this.frameNumber % this.frameSkip !== 0) {
        return;
    }
    this.lastFrameTimeStamp = now;

    if (this.paused) {
        return this.visualizerCanvas.drawIdleBins(now);
    }

    if (!this.sourceNode.getUpcomingSamples(this.buffer[0], this.multiplier)) {
        return;
    }
    
    this.forwardFft();
    this.calculateBins();
    this.visualizerCanvas.drawBins(now, this.buffer[1]);
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

AudioVisualizer.prototype.fillWindow = function() {
    var window = this.buffer[2];
    var N = window.length;
    for (var n = 0; n < N; ++n) {
        // Hamming window.
        window[n] = (0.53836 - 0.46164 * Math.cos((2 * Math.PI * n) / (N - 1)));
    }
};

AudioVisualizer.prototype.forwardFft = function() {
    var samples = this.buffer[0];
    var window = this.buffer[2];
    for (var i = 0; i < samples.length; ++i) {
        samples[i] = Math.fround(samples[i] * window[i]);
    }
    realFft(this.buffer[0]);
};

module.exports = AudioVisualizer;
