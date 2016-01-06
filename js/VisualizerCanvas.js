"use strict";

const SHADOW_BLUR = 2;
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
    var binsNeeded = visualizerCanvas.height * 2 + 1;
    var binWidthPixels = visualizerCanvas.binWidthSourcePixels();
    var binHeightPixels = visualizerCanvas.binHeightSourcePixels();
    var capWidthPixels = 2 + binWidthPixels;
    var totalWidth = binsNeeded * binWidthPixels * 2 + capWidthPixels;
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
    var highestBinHeight = visualizerCanvas.getHighestBinHeight();

    context.shadowBlur = SHADOW_BLUR;
    context.shadowColor = SHADOW_COLOR;

    var col = 0;
    var row = 0;

    this.binPositions = new Int16Array(200 * 2);
    this.alphaBinPositions = new Int16Array(200 * 2);

    var positions = this.binPositions;
    var positionIndex = 0;

    for (var i = 0; i <= 100; i += 0.5) {
        var width = visualizerCanvas.binWidth;
        var height = (i / 100 * highestBinHeight);
        var x = col * binWidthPixels + visualizerCanvas.binWidth;
        var y = (row * binHeightPixels + SHADOW_BLUR) + (highestBinHeight - height);

        var gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');

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

    positions = this.alphaBinPositions;
    positionIndex = 0;
    context.shadowBlur = 0;
    context.shadowColor = "transparent";
    context.globalAlpha = visualizerCanvas.ghostOpacity * 2;

    for (var i = 0; i < this.binPositions.length; i += 2) {
        var width = visualizerCanvas.binWidth;
        var height = (i / 4 / 100 * highestBinHeight);
        var x = col * binWidthPixels + visualizerCanvas.binWidth;
        var y = (row * binHeightPixels + SHADOW_BLUR) + (highestBinHeight - height);
        var srcX = this.binPositions[i];
        var srcY = this.binPositions[i + 1];

        context.drawImage(canvas, srcX - gapWidth, srcY - SHADOW_BLUR,
                                  width + SHADOW_BLUR * 2, height + SHADOW_BLUR * 2,
                                  x|0, y|0,
                                  width + SHADOW_BLUR * 2, height + SHADOW_BLUR * 2);

        positions[positionIndex++] = (x|0) + 2 - gapWidth;
        positions[positionIndex++] = (y|0) + 2;

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
    var y = (row * binHeightPixels + SHADOW_BLUR) + 16;
    context.fillRect(x, y, visualizerCanvas.binWidth, visualizerCanvas.capHeight);

    this.capX = x - SHADOW_BLUR / 2;
    this.capY = y + SHADOW_BLUR / 2;
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
    var width = $targetCanvas.width();
    var height = $targetCanvas.height();
    this.needToDraw = true;
    this.canvas = targetCanvas;
    this.width = targetCanvas.width = width;
    this.height = targetCanvas.height = height;
    this.binWidth = opts.binWidth;
    this.gapWidth = opts.gapWidth;
    this.capHeight = opts.capHeight;
    this.capSeparator = opts.capSeparator;
    this.capStyle = opts.capStyle;
    this.targetFps = opts.targetFps;
    this.capInterpolator = null;
    this.setCapInterpolator(opts.capInterpolator || "ACCELERATE_QUAD");
    this.ghostOpacity = opts.ghostOpacity || 0.25;
    this.capDropTime = opts.capDropTime;
    this.currentCapPositions = new Float64Array(this.getNumBins());
    this.emptyBins = new Float64Array(this.getNumBins());
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
        var width = $(this.canvas).width();
        if (width !== this.width) {
            this.width = width;
            this.canvas.width = width;

            this.currentCapPositions = new Float64Array(this.getNumBins());
            this.emptyBins = new Float64Array(this.getNumBins());
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
    return this.binWidth + this.gapWidth * 2 + SHADOW_BLUR / 2;
};

VisualizerCanvas.prototype.binHeightSourcePixels = function() {
    return (this.height + SHADOW_BLUR * 2);
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
    this.renderer.initScene(bins, 3);
    this.needToDraw = true;

    var highestY = this.getHighestBinHeight();
    var binSpace = this.binWidth + this.gapWidth;
    var drawnBinSpace = binSpace + this.gapWidth;
    var context = this.context;
    var height = this.height;
    var capHeight = this.capHeight;
    var capSpace = this.capHeight + this.capSeparator;
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
            var y = Math.round(currentCapBasePosition * highestY * 2) / 2;

            var sourcePositionIndex = Math.min(398, Math.round(currentCapBasePosition * 100 * 2) * 2);
            var sourcePositionYValue = binPositions[sourcePositionIndex + 1];
            var sourceHeight = height - (sourcePositionYValue % height) + SHADOW_BLUR;
            this.renderer.draw(binPositions[sourcePositionIndex], sourcePositionYValue - SHADOW_BLUR,
                                drawnBinSpace, sourceHeight,
                                x - gapWidth, 0,
                                drawnBinSpace, y);
        } else {
            currentCapPositions[i] = -1;
            transitionInfo.start(binValue, now);
        }
    }

    var capSourceX = this.source.capX;
    var capSourceY = this.source.capY - SHADOW_BLUR;
    var capWidth = binWidth + SHADOW_BLUR;
    var capPixelHeight = capHeight + SHADOW_BLUR;

    binPositions = this.source.binPositions;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var x = i * binSpace;
        var y = Math.round(binValue * highestY * 2) / 2;

        var currentCapBasePosition = currentCapPositions[i];
        if (binValue < currentCapBasePosition) {
            var capY = Math.round((currentCapBasePosition * highestY + capSpace) * 2) / 2;
            this.renderer.draw(capSourceX, capSourceY, capWidth, capPixelHeight,
                               x - gapWidth, capY - SHADOW_BLUR, capWidth, capPixelHeight);
        } else {
            this.renderer.draw(capSourceX, capSourceY, capWidth, capPixelHeight,
                               x - gapWidth, y + capSpace - SHADOW_BLUR, capWidth, capPixelHeight);
        }

        var sourcePositionIndex = Math.min(398, Math.round(binValue * 100 * 2) * 2);
        var sourcePositionYValue = binPositions[sourcePositionIndex + 1];
        var sourceHeight = height - (sourcePositionYValue % height) + SHADOW_BLUR;
        this.renderer.draw(binPositions[sourcePositionIndex], sourcePositionYValue - SHADOW_BLUR,
                           drawnBinSpace, sourceHeight,
                           x - gapWidth, 0,
                           drawnBinSpace, y);
    }
    this.renderer.drawScene();
};

module.exports = VisualizerCanvas;
