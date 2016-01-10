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
const ContextMenu = require("./ActionMenu").ContextMenu;

const LATENCY_POPUP_HTML = '<div class="latency-input-row row"><div class="col-xs-12">                                \
        <p>Increase this value if the visualization is too early or decrease this value if it is too late.</p>        \
    <form>                                                                                                            \
        <div class="form-group">                                                                                      \
            <div class="input-group">                                                                                 \
                <input type="number" class="form-control latency-input" placeholder="Latency">                        \
                <div class="input-group-addon">ms</div>                                                               \
            </div>                                                                                                    \
        </div>                                                                                                        \
    </form>                                                                                                           \
    <p>Changes are effective in real time.</p>                                                                        \
    </div></div>';


const $ = require("../lib/jquery");

function TransitionInfo(visualizerCanvas) {
    this.duration = -1;
    this.capStarted = -1;
    this.peakSample = -1;
    this.visualizerCanvas = visualizerCanvas;
}

TransitionInfo.prototype.getCapPosition = function(now) {
    if (this.capStarted === -1) return 0;
    var elapsed = now - this.capStarted;
    var duration = this.duration;
    if (elapsed >= duration) {
        this.capStarted = -1;
    }

    if (elapsed < 95) return this.peakSample;

    elapsed -= 95;
    duration -= 95;

    return (1 - this.visualizerCanvas.capInterpolator(elapsed, duration)) * this.peakSample;
};

TransitionInfo.prototype.inProgress = function() {
    return this.capStarted !== -1;
};

TransitionInfo.prototype.reset = function() {
    this.capStarted = -1;
    this.peakSample = -1;
    this.duration = -1;
};

TransitionInfo.prototype.start = function(peakSample, now) {
    this.capStarted = now;
    this.peakSample = peakSample;
    var mul = 1 - Math.max(0.36, peakSample);
    this.duration = (1 - (mul * mul)) * this.visualizerCanvas.capDropTime;
};

function GraphicsSource(visualizerCanvas) {
    var gapWidth = visualizerCanvas.gapWidth;
    var highestBinHeight = visualizerCanvas.getHighestBinHeight();
    var binsNeeded = (highestBinHeight + 1);
    var binWidthPixels = visualizerCanvas.binWidthSourcePixels();
    var binHeightPixels = visualizerCanvas.binHeightSourcePixels();
    var capWidthPixels = 16 * pixelRatio + 2 + binWidthPixels;
    var totalWidth = binsNeeded * binWidthPixels + capWidthPixels;
    var width = Math.min(Math.pow(2, Math.ceil(Math.log(totalWidth) * Math.LOG2E)), 1024);
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

    var positions = this.binPositions;
    var positionIndex = 0;
    var width = visualizerCanvas.binWidth;
    for (var i = 0; i <= highestBinHeight; i++) {
        var height = i;
        var x = col * binWidthPixels;
        var y = (row * binHeightPixels + SHADOW_BLUR) + (highestBinHeight - height);
        var gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.7, "rgb(189, 196, 204)");
        gradient.addColorStop(1, "rgb(183, 190, 198)");
        
        //context.fillStyle = "rgba(99, 113, 126, 255)";
        context.fillStyle = gradient; //"rgba(183, 190, 198, 255)";
        context.fillRect(x - gapWidth, y, width + gapWidth * 2, height + gapWidth);

        gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, 'rgb(250, 250, 250)');
        gradient.addColorStop(0.2, "rgb(219, 241, 251)");
        gradient.addColorStop(0.8, "rgb(184, 228, 246)");
        gradient.addColorStop(1, 'rgb(166, 202, 238)');
        context.fillStyle = gradient;
        context.fillRect(x, y, width, height);


        positions[positionIndex++] = x - gapWidth;
        positions[positionIndex++] = y;

        col++;
        if (col >= columns - 1) {
            col = 1;
            row++;
        }
    }

    col++;
    if (col >= columns - 1) {
        col = 1;
        row++;
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

function VisualizerCanvas(targetCanvas, player, opts) {
    EventEmitter.call(this);
    this.player = player;
    player.setVisualizerCanvas(this);
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
    this.latencyPopupOpened = this.latencyPopupOpened.bind(this);

    this.latencyPopup = GlobalUi.makePopup("Latency", LATENCY_POPUP_HTML, ".synchronize-with-audio");
    this.latencyPopup.on("open", this.latencyPopupOpened);

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
        } else {
            GlobalUi.snackbar.show("Hardware acceleration disabled");
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
        this.refreshContextMenu();
    });

    this.contextMenu = null;

    this.setupCanvasContextMenu();
}
util.inherits(VisualizerCanvas, EventEmitter);

VisualizerCanvas.prototype.refreshContextMenu = function() {
    if (this.contextMenu) {
        this.contextMenu.refreshAll();
    }
};

VisualizerCanvas.prototype.setupCanvasContextMenu = function() {
    this.destroyCanvasContextMenu();
    var self = this;
    var canvas = this.canvas;
    var menuSpec = {
        menu: [{
            id: "hardware-acceleration",
            disabled: true,
            onClick: function(e) {
                e.preventDefault()
            },
            content: function() {
                return GlobalUi.contextMenuItem("Hardware acceleration", self.isHardwareRendering() ? "glyphicon glyphicon-ok" : null);
            }
        }, {
            divider: true
        }, {
            id: "hardware-latency",
            content: GlobalUi.contextMenuItem("Synchronize with audio..."),
            onClick: function(e) {
                self.latencyPopup.open();
            }
        }, {
            id: "visualizer-enabled",
            content: function() {
                return GlobalUi.contextMenuItem("Enabled", self.isEnabled() ? "glyphicon glyphicon-ok" : null);
            },
            onClick: function(e) {
                e.preventDefault();
                self.enabled = !self.enabled;
                self.refreshContextMenu();
            }
        }]
    };
    this.contextMenu = new ContextMenu(canvas, menuSpec);
};

VisualizerCanvas.prototype.latencyPopupOpened = function() {
    var latency = (this.player.getAudioHardwareLatency() * 1000)|0;
    var maxLatency = (this.player.getMaximumAudioHardwareLatency() * 1000)|0;

    var $input = this.latencyPopup.$().find(".latency-input");
    $input.val(latency);
    $input.prop("min", 0);
    $input.prop("max", maxLatency);
    var self = this;
    $input.on("input change", function() {
        var val = (+$(this).val()) / 1000;
        self.player.setAudioHardwareLatency(val);
    });
    this.latencyPopup.$().find("form").on("submit", function(e) {
        e.preventDefault();
        self.latencyPopup.close();
    });
    $input.focus();
};

VisualizerCanvas.prototype.destroyCanvasContextMenu = function() {
    if (this.contextMenu) {
        this.contextMenu.destroy();
        this.contextMenu = null;
    }
};

VisualizerCanvas.prototype.resetCanvas = function() {
    this.destroyCanvasContextMenu();
    var canvas = document.createElement("canvas");
    canvas.className = this.canvas.className;
    canvas.width = this.width;
    canvas.height = this.height;
    this.canvas.parentNode.replaceChild(canvas, this.canvas);
    this.emit("canvasChange", canvas, this.canvas);
    this.canvas = canvas;
    this.setupCanvasContextMenu();
};

VisualizerCanvas.prototype.useSoftwareRendering = function() {
    if (!this.renderer.usesHardwareAcceleration()) return;
    if (this.renderer && (this.renderer instanceof Default2dImageRenderer)) return;
    if (this.renderer) this.renderer.destroy();
    this.resetCanvas();
    this.renderer = new Default2dImageRenderer(this.source.image, this);
    GlobalUi.snackbar.show("Hardware acceleration disabled");
};

VisualizerCanvas.prototype.useHardwareRendering = function() {
    if (this.renderer.usesHardwareAcceleration() || !this.webglSupported) return;
};

VisualizerCanvas.prototype.canUseHardwareRendering = function() {
    return this.webglSupported;
};

VisualizerCanvas.prototype.isHardwareRendering = function() {
    if (!this.renderer) return false;
    return this.renderer.usesHardwareAcceleration();
};

VisualizerCanvas.prototype.enabledMediaMatchChanged = function() {
    this.enabled = !!this.enabledMediaMatcher.matches;
    this.binSizeMediaMatchChanged();
    this.refreshContextMenu();
    if (this.source && this.source.isReady()) {
        this.drawIdleBins(Date.now());
    }
};

VisualizerCanvas.prototype.binSizeMediaMatchChanged = function() {
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

        if (this.renderer) {
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

VisualizerCanvas.prototype.getMaxBins = function() {
    return Math.floor((620 * pixelRatio) / (this.binWidth + this.gapWidth));
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

VisualizerCanvas.prototype.objectsPerBin = function() {
    return 3;
};

VisualizerCanvas.prototype.needsToDraw = function() {
    return this.needToDraw || this.isEnabled();
};

VisualizerCanvas.prototype.drawBins = function(now, bins) {
    if (bins.length !== this.getNumBins()) return;
    if (!this.source.isReady()) return;
    if (!this.isEnabled()) {
        bins = this.emptyBins;
    }
    this.renderer.initScene(bins, 3);
    this.needToDraw = true;

    var currentCapPositions = this.currentCapPositions;
    var transitionInfoArray = this.transitionInfoArray;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var transitionInfo = transitionInfoArray[i];
        var currentCapBasePosition = -1;
    
        if (transitionInfo.inProgress()) {
            currentCapBasePosition = transitionInfo.getCapPosition(now);
        }

        if (binValue < currentCapBasePosition) {
            currentCapPositions[i] = currentCapBasePosition;
        } else {
            currentCapPositions[i] = -1;
            transitionInfo.start(binValue, now);
        }
    }

    this.renderer.drawCaps(bins);
    this.renderer.drawBins(bins);
    this.renderer.drawScene();
};


module.exports = VisualizerCanvas;
