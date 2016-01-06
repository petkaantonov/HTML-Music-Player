"use strict";

const pixelRatio = window.devicePixelRatio || 1;
const SHADOW_BLUR = 2 * pixelRatio;
const SHADOW_COLOR = "rgb(11,32,53)";
const Animator = require("./Animator");
const util = require("./util");
const domUtil = require("./DomUtil");
const Default2dImageRenderer = require("./Default2dImageRenderer");
const WebGl2dImageRenderer = require("./WebGl2dImageRenderer");
const EventEmitter = require("events");
const GlobalUi = require("./GlobalUi");

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

function GraphicsSource(visualizerCanvas) {
    var gapWidth = visualizerCanvas.gapWidth;
    var highestBinHeight = visualizerCanvas.getHighestBinHeight();
    var binsNeeded = (highestBinHeight + 1) * 2;
    var binWidthPixels = visualizerCanvas.binWidthSourcePixels();
    var binHeightPixels = visualizerCanvas.binHeightSourcePixels();
    var capWidthPixels = 16 * pixelRatio + 2 + binWidthPixels;
    var totalWidth = binsNeeded * binWidthPixels + capWidthPixels;
    var width = 1024;
    var rows = 1;
    var columns = (width / binWidthPixels)|0;
    while (totalWidth > width) {
        totalWidth -= width;
        rows++;
    }
    var height = Math.pow(2, Math.ceil(Math.log(binHeightPixels * rows) * Math.LOG2E));
    var canvas = document.createElement("canvas");
    canvas.height = height;
    canvas.width = width;


    var context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.shadowColor = "transparent";

    var col = 0;
    var row = 0;

    this.binPositions = new Int16Array(highestBinHeight * 2);
    this.alphaBinPositions = new Int16Array(highestBinHeight * 2);

    var positions = this.binPositions;
    var positionIndex = 0;
    var width = visualizerCanvas.binWidth;
    for (var i = 0; i <= highestBinHeight; i++) {
        var height = i;
        var x = col * binWidthPixels;
        var y = (row * binHeightPixels + SHADOW_BLUR) + (highestBinHeight - height);
        var gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');
        
        context.fillStyle = "rgba(99, 113, 126, 255)";
        context.fillRect(x - gapWidth, y, width + gapWidth * 2, height + gapWidth);

        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);


        positions[positionIndex++] = x - gapWidth;
        positions[positionIndex++] = y;

        col++;
        if (col >= columns) {
            col = 0;
            row++;
        }
    }

    col++;
    positions = this.alphaBinPositions;
    positionIndex = 0;
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    context.globalAlpha = visualizerCanvas.ghostOpacity;

    var intermediateCanvas = document.createElement("canvas");
    intermediateCanvas.width = gapWidth * 2 + width;
    intermediateCanvas.height = highestBinHeight + SHADOW_BLUR;
    var intermediateContext = intermediateCanvas.getContext("2d");

    for (var i = 0; i <= highestBinHeight; i++) {
        intermediateContext.fillStyle = "rgba(255, 255, 255, 255)"
        intermediateContext.fillRect(0, 0, intermediateCanvas.width, intermediateCanvas.height);
        var height = i;
        var x = col * binWidthPixels;
        var y = (row * binHeightPixels + SHADOW_BLUR) + (highestBinHeight - height);
        var gradient = intermediateContext.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0.0, 'rgba(250, 250, 250, 0)');
        gradient.addColorStop(0.1, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');
        
        intermediateContext.fillStyle = "rgba(99, 113, 126, 255)";
        intermediateContext.fillRect(0, 0, width + 2 * gapWidth, height + SHADOW_BLUR);
        intermediateContext.fillStyle = gradient;
        intermediateContext.fillRect(gapWidth, gapWidth, width, height);

        context.drawImage(intermediateCanvas, x - gapWidth, y);

        positions[positionIndex++] = x - gapWidth;
        positions[positionIndex++] = y;

        col++;
        if (col >= columns) {
            col = 0;
            row++;
        }
    }

    context.shadowBlur = SHADOW_BLUR;
    context.shadowColor = SHADOW_COLOR;
    context.globalAlpha = 1;
    context.fillStyle = visualizerCanvas.capStyle;
    var x = col * binWidthPixels + visualizerCanvas.binWidth + 5;
    var y = (row * binHeightPixels + SHADOW_BLUR) + 16 * pixelRatio;
    context.fillRect(x, y, visualizerCanvas.binWidth, visualizerCanvas.capHeight);

    this.capX = x;
    this.capY = y;
    this.image = null;
    this.ready = domUtil.canvasToImage(canvas).bind(this).then(function(image) {
        this.image = image;
        canvas.width = canvas.height = 0;
    }).bind();
}

GraphicsSource.prototype.isReady = function() {
    return this.image !== null;
};

function VisualizerCanvas(targetCanvas, opts) {
    EventEmitter.call(this);
    this.webglSupported = WebGl2dImageRenderer.isSupported();
    var $targetCanvas = $(targetCanvas);
    targetCanvas = $targetCanvas[0];
    var width = $targetCanvas.width() * pixelRatio;
    var height = $targetCanvas.height() * pixelRatio;
    this.needToDraw = true;
    this.canvas = targetCanvas;
    this.width = targetCanvas.width = width;
    this.height = targetCanvas.height = height;
    this.binWidth = opts.binWidth * pixelRatio;
    this.gapWidth = opts.gapWidth * pixelRatio;
    this.capHeight = opts.capHeight * pixelRatio;
    this.capSeparator = opts.capSeparator * pixelRatio;
    this.capStyle = opts.capStyle;
    this.targetFps = opts.targetFps;
    this.capInterpolator = null;
    this.setCapInterpolator(opts.capInterpolator || "ACCELERATE_QUAD");
    this.ghostOpacity = opts.ghostOpacity || 0.25;
    this.capDropTime = opts.capDropTime;
    this.currentCapPositions = new Float32Array(this.getNumBins());
    this.emptyBins = new Float32Array(this.getNumBins());
    
    this.transitionInfoArray = new Array(this.getNumBins());
    this.enabledMediaMatcher = opts.enabledMediaMatcher || null;
    this.binSizeChangeMatcher = opts.binSizeChangeMatcher || null;

    this.binSizeMediaMatchChanged = this.binSizeMediaMatchChanged.bind(this);
    this.enabledMediaMatchChanged = this.enabledMediaMatchChanged.bind(this);

    for (var i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i] = new TransitionInfo(this);
    }

    if (this.enabledMediaMatcher) {
        util.addLegacyListener(this.enabledMediaMatcher, "change", this.enabledMediaMatchChanged);
        this.enabledMediaMatchChanged();
    }

    if (this.binSizeChangeMatcher) {
        util.addLegacyListener(this.binSizeChangeMatcher, "change", this.binSizeMediaMatchChanged);
    }

    this.enabled = true;
    this.source = new GraphicsSource(this);
    this.renderer = null;
    this.source.ready.bind(this).then(function onSourceReady() {
        if (this.canUseHardwareRendering()) {
            this.renderer = new WebGl2dImageRenderer(this.source.image, this);
        }

        if (!this.renderer) {
            this.resetCanvas();
            this.renderer = new Default2dImageRenderer(this.source.image, this);
        }

        try {
            this.renderer.init(this.width, this.height);
        } catch (e) {
            GlobalUi.snackbar.show(e.message);
            if (this.canUseHardwareRendering()) {
                this.webglSupported = false;
                this.renderer = null;
                return onSourceReady.call(this);
            } else {
                this.enabled = false;
            }
        }
        this.drawIdleBins(Date.now());
    });
}
util.inherits(VisualizerCanvas, EventEmitter);

VisualizerCanvas.prototype.resetCanvas = function() {
    var canvas = document.createElement("canvas");
    canvas.className = this.canvas.className;
    canvas.width = this.width;
    canvas.height = this.height;
    this.canvas.parentNode.replaceChild(canvas, this.canvas);
    this.emit("canvasChange", canvas, this.canvas);
    this.canvas = canvas;
};

VisualizerCanvas.prototype.useSoftwareRendering = function() {
    if (!this.renderer.usesHardwareAcceleration()) return;
};

VisualizerCanvas.prototype.useHardwareRendering = function() {
    if (this.renderer.usesHardwareAcceleration() || !this.webglSupported) return;
};

VisualizerCanvas.prototype.canUseHardwareRendering = function() {
    return this.webglSupported;
};

VisualizerCanvas.prototype.isHardwareRendering = function() {
    return this.renderer.usesHardwareAcceleration();
};

VisualizerCanvas.prototype.enabledMediaMatchChanged = function() {
    this.enabled = !!this.enabledMediaMatcher.matches;
    this.binSizeMediaMatchChanged();
};

VisualizerCanvas.prototype.binSizeMediaMatchChanged = function() {
    if (this.isEnabled()) {
        var width = $(this.canvas).width() * pixelRatio;
        if (width !== this.width) {
            this.width = width;
            this.canvas.width = width;

            this.currentCapPositions = new Float32Array(this.getNumBins());
            this.emptyBins = new Float32Array(this.getNumBins());
            this.transitionInfoArray = new Array(this.getNumBins());

            for (var i = 0; i < this.transitionInfoArray.length; ++i) {
                this.transitionInfoArray[i] = new TransitionInfo(this);
            }
            this.resetCaps();
            this.renderer.setDimensions(this.width, this.height);
        }
    }
};

VisualizerCanvas.prototype.isEnabled = function() {
    return this.enabled;
};

VisualizerCanvas.prototype.resetCaps = function() {
    for (var i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i].reset();
    }
};

VisualizerCanvas.prototype.binWidthSourcePixels = function() {
    return this.binWidth + this.gapWidth;
};

VisualizerCanvas.prototype.binHeightSourcePixels = function() {
    return (this.height + SHADOW_BLUR);
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

VisualizerCanvas.prototype.getHighestBinHeight = function() {
    return this.height - (this.capSeparator + this.capHeight);
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
    if (bins.length !== this.getNumBins()) return;
    if (!this.source.isReady()) return;
    var prevBins = this.prevBins;
    this.renderer.initScene(bins, 3);
    this.needToDraw = true;

    var highestBinHeight = this.getHighestBinHeight();
    var binSpace = this.binWidth + this.gapWidth;
    var drawnBinSpace = binSpace + this.gapWidth;
    var context = this.context;
    var height = this.height;
    var capHeight = this.capHeight;
    var capSeparator = this.capSeparator;
    var capSpace = this.capHeight + capSeparator;
    var binWidth = this.binWidth;
    var gapWidth = this.gapWidth;
    var currentCapPositions = this.currentCapPositions;
    var transitionInfoArray = this.transitionInfoArray;
    
    var binPositions = this.source.alphaBinPositions;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var transitionInfo = transitionInfoArray[i];
        var currentCapBasePosition = -1;
    
        if (transitionInfo.inProgress()) {
            currentCapBasePosition = transitionInfo.getCapPosition(now);
        }

        if (binValue < currentCapBasePosition) {
            currentCapPositions[i] = currentCapBasePosition;
            var x = i * binSpace;
            var ghostBinY = (currentCapBasePosition * highestBinHeight)|0;
            var sourcePositionYValue = binPositions[ghostBinY * 2 + 1];
            var sourceHeight = highestBinHeight - (sourcePositionYValue % height);
            this.renderer.draw(binPositions[ghostBinY * 2], sourcePositionYValue,
                               drawnBinSpace, sourceHeight,
                               x - gapWidth, 0,
                               drawnBinSpace, ghostBinY);
        } else {
            currentCapPositions[i] = -1;
            transitionInfo.start(binValue, now);
        }
    }

    var capSourceX = this.source.capX - 1 * pixelRatio;
    var capSourceY = this.source.capY - 1 * pixelRatio;
    var capWidth = binWidth + 2 * pixelRatio;
    var capPixelHeight = capHeight + 2 * pixelRatio;

    binPositions = this.source.binPositions;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var x = i * binSpace;
        var y = (binValue * highestBinHeight)|0;

        var currentCapBasePosition = currentCapPositions[i];
        if (binValue < currentCapBasePosition) {
            var capY = (currentCapBasePosition * highestBinHeight) | 0;
            this.renderer.draw(capSourceX, capSourceY, capWidth, capPixelHeight,
                               x - gapWidth, (capY + capSeparator)|0, capWidth, capPixelHeight);
        } else {
            this.renderer.draw(capSourceX, capSourceY, capWidth, capPixelHeight,
                               x - gapWidth, (y + capSeparator)|0, capWidth, capPixelHeight);
        }

        var sourcePositionYValue = binPositions[y * 2 + 1];
        var sourceHeight = highestBinHeight - (sourcePositionYValue % height);

        this.renderer.draw(binPositions[y * 2], sourcePositionYValue,
                           drawnBinSpace, sourceHeight,
                           x - gapWidth, 0,
                           drawnBinSpace, y);
    }
    this.renderer.drawScene();
};

module.exports = VisualizerCanvas;
