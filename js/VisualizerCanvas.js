"use strict";

const SHADOW_BLUR = 2;
const SHADOW_COLOR = "rgb(11,32,53)";
const Animator = require("./Animator");

const $ = require("../lib/jquery");

function TransitionInfo(visualizerCanvas) {
    this.capStarted = -1;
    this.peakSample = -1;
    this.visualizerCanvas = visualizerCanvas;
}

TransitionInfo.prototype.getCapPosition = function(now) {
    if (this.capStarted === -1) return 0;
    var elapsed = now - this.capStarted;
    var duration = this.visualizerCanvas.capDropTime;
    if (elapsed >= duration) {
        this.capStarted = -1;
    }

    return (1 - this.visualizerCanvas.capInterpolator(elapsed, duration)) * this.peakSample;
};

TransitionInfo.prototype.inProgress = function() {
    return this.capStarted !== -1;
};

TransitionInfo.prototype.reset = function() {
    this.capStarted = -1;
    this.peakSample = -1;
};

TransitionInfo.prototype.start = function(peakSample, now) {
    this.capStarted = now;
    this.peakSample = peakSample;
};

function VisualizerCanvas(targetCanvas, opts) {
    targetCanvas = $(targetCanvas)[0];
    this.needToDraw = true;
    this.targetCanvas = targetCanvas;
    this.context = this.targetCanvas.getContext("2d");
    this.width = +targetCanvas.width;
    this.height = +targetCanvas.height;
    this.binWidth = opts.binWidth;
    this.gapWidth = opts.gapWidth;
    this.capHeight = opts.capHeight;
    this.capSeparator = opts.capSeparator;
    this.gradients = new Array(this.height + 1);
    this.capStyle = opts.capStyle;
    this.targetFps = opts.targetFps;
    this.capInterpolator = null;
    this.setCapInterpolator(opts.capInterpolator || "ACCELERATE_QUAD");
    this.ghostOpacity = opts.ghostOpacity || 0.25;
    this.capDropTime = opts.capDropTime;
    this.currentCapPositions = new Float64Array(this.getNumBins());
    this.emptyBins = new Float64Array(this.getNumBins());

    for (var i = 0; i < this.gradients.length; ++i) {
        var gradient = this.context.createLinearGradient(0, 0, 0, i);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');
        this.gradients[i] = gradient;
    }

    this.transitionInfoArray = new Array(this.getNumBins());

    for (var i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i] = new TransitionInfo(this);
    }


    this.binCache = null;
    this.capCache = null;
    this.context.imageSmoothingEnabled = false;
    this.populateCache();
    this.drawIdleBins(Date.now());
}

VisualizerCanvas.prototype.resetCaps = function() {
    for (var i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i].reset();
    }
};

VisualizerCanvas.prototype.populateCache = function() {
    this.binCache = new Array(this.height * 2 + 1);

    for (var j = 0; j < this.binCache.length; ++j) {
        var y = j * 0.5;
        var canvas = document.createElement("canvas");
        canvas.style.transform = "translate3d(0,0,0)";
        canvas.height = ((y + 0.5) | 0) + SHADOW_BLUR;
        canvas.width = this.binWidth + this.gapWidth * 2;
        var context = canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.save();
        context.fillStyle = this.gradients[y|0];
        context.shadowBlur = SHADOW_BLUR;
        context.shadowColor = SHADOW_COLOR
        context.fillRect(this.gapWidth, SHADOW_BLUR, this.binWidth, y);
        context.restore();
        this.binCache[j] = canvas;
    }

    this.capCache = document.createElement("canvas");
    this.capCache.style.transform = "translate3d(0,0,0)";
    this.capCache.width = this.binWidth + this.gapWidth * 2;
    this.capCache.height = this.capHeight + SHADOW_BLUR;
    var context = this.capCache.getContext("2d");
    context.imageSmoothingEnabled = false;
    context.save();
    context.fillStyle = this.capStyle;
    context.shadowBlur = SHADOW_BLUR;
    context.shadowColor = SHADOW_COLOR;
    context.fillRect(this.gapWidth, SHADOW_BLUR / 2, this.binWidth, this.capHeight);
    context.restore();
};

VisualizerCanvas.prototype.setCapInterpolator = function(name) {
    if (typeof Animator[name] !== "function") throw new Error(name + " is not a known interpolator");
    this.capInterpolator = Animator[name];
};

VisualizerCanvas.prototype.getTargetFps = function() {
    return this.targetFps;
};

VisualizerCanvas.prototype.getNumBins = function() {
    return Math.floor(this.width / (this.binWidth + this.gapWidth));
};

VisualizerCanvas.prototype.getHighestY = function() {
    return this.height - (this.capSeparator + this.capHeight);
};

VisualizerCanvas.prototype.drawCap = function(x, y) {
    this.context.drawImage(this.capCache, x|0, (this.height - y)|0);
};

VisualizerCanvas.prototype.drawBin = function(x, y) {
    this.context.drawImage(this.binCache[y << 1], x|0, (this.height - y)|0);
};

VisualizerCanvas.prototype.drawIdleBins = function(now) {
    if (this.needToDraw) {
        this.drawBins(now, this.emptyBins);
        var currentCapPositions = this.currentCapPositions;
        for (var i = 0; i < currentCapPositions.length; ++i) {
            if (currentCapPositions[i] !== -1) {
                return;
            }
        }
        this.needToDraw = false;
    }
};

VisualizerCanvas.prototype.drawBins = function(now, bins) {
    this.context.clearRect(0, 0, this.width, this.height);
    this.needToDraw = true;

    var highestY = this.getHighestY();
    var binSpace = this.binWidth + this.gapWidth;
    var context = this.context;
    var height = this.height;
    var capHeight = this.capHeight;
    var capSpace = this.capHeight + this.capSeparator;
    var binWidth = this.binWidth;

    var currentCapPositions = this.currentCapPositions;
    var transitionInfoArray = this.transitionInfoArray;
    
    this.context.globalAlpha = this.ghostOpacity;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var transitionInfo = transitionInfoArray[i];
        var currentCapBasePosition = -1;

        if (transitionInfo.inProgress()) {
            currentCapBasePosition = transitionInfo.getCapPosition(now);
        }

        if (binValue < currentCapBasePosition) {
            currentCapPositions[i] = currentCapBasePosition;
            var y = Math.round(currentCapBasePosition * this.getHighestY() * 2) / 2;
            var x = i * binSpace;
            this.drawBin(x, y);
        } else {
            currentCapPositions[i] = -1;
            transitionInfo.start(binValue, now);
        }
    }

    context.fillStyle = this.capStyle;
    context.globalAlpha = 1;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var y = Math.round(binValue * highestY * 2) / 2;
        var x = i * binSpace;

        var currentCapBasePosition = currentCapPositions[i];
        if (binValue < currentCapBasePosition) {
            var capY = Math.round((currentCapBasePosition * highestY + capSpace) * 2) / 2;
            this.drawCap(x, capY);
        } else {
            this.drawCap(x, y + capSpace);
        }
        this.drawBin(x, y);
    }
};

module.exports = VisualizerCanvas;
