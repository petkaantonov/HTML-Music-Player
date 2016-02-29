"use strict";

const pixelRatio = window.devicePixelRatio || 1;

const SHADOW_BLUR = 2 * pixelRatio | 0;
const SHADOW_COLOR = "rgb(11,32,53)";
const Animator = require("ui/Animator");
const util = require("lib/util");
const domUtil = require("lib/DomUtil");
const Default2dImageRenderer = require("ui/Default2dImageRenderer");
const WebGl2dImageRenderer = require("ui/WebGl2dImageRenderer");
const EventEmitter = require("lib/events");
const GlobalUi = require("ui/GlobalUi");
const Slider = require("ui/Slider");
const ContextMenu = require("ui/ActionMenu").ContextMenu;
const applicationPreferences = require("application_preferences");

const LATENCY_POPUP_HTML = "<div class='settings-container latency-popup-content-container'>            \
            <div class='section-container'>                                                             \
                <div class='inputs-container'>                                                          \
                    <div class='label overhead-label'>                                                  \
                        Increase this value if the visualization is too early or                        \
                        decrease this value if it is too late                                           \
                    </div>                                                                              \
                    <div class='latency-slider slider horizontal-slider unlabeled-slider'>              \
                        <div class='slider-knob'></div>                                                 \
                        <div class='slider-background'>                                                 \
                            <div class='slider-fill'></div>                                             \
                        </div>                                                                          \
                    </div>                                                                              \
                    <div class='latency-value slider-value-indicator'></div>                            \
                </div>                                                                                  \
                <div class='inputs-container'>                                                          \
                    <div class='label overhead-label'>Changes are effective in real time</div>          \
                </div>                                                                                  \
            </div>                                                                                      \
        </div>";

const $ = require("lib/jquery");

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
    var capWidthPixels = (16 * pixelRatio + 2 + binWidthPixels) | 0;
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
    var y = (row * binHeightPixels + SHADOW_BLUR) + (16 * pixelRatio)|0;
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
    var width = $targetCanvas.width() * pixelRatio | 0;
    var height = $targetCanvas.height() * pixelRatio | 0;
    this.needToDraw = true;
    this.canvas = targetCanvas;
    this.width = targetCanvas.width = width;
    this.height = targetCanvas.height = height;
    this.binWidth = opts.binWidth * pixelRatio | 0;
    this.gapWidth = opts.gapWidth * pixelRatio | 0;
    this.capHeight = opts.capHeight * pixelRatio | 0;
    this.capSeparator = opts.capSeparator * pixelRatio | 0;
    this.capStyle = opts.capStyle;
    this.targetFps = opts.targetFps;
    this.sectionContainerSelector = opts.sectionContainerSelector || ".visualizer-section-container";
    this.capInterpolator = null;
    this.setCapInterpolator(opts.capInterpolator || "ACCELERATE_QUAD");
    this.ghostOpacity = opts.ghostOpacity || 0.25;
    this.capDropTime = opts.capDropTime;
    this.currentCapPositions = new Float32Array(this.getNumBins());
    this.emptyBins = new Float32Array(this.getNumBins());
    this.transitionInfoArray = new Array(this.getNumBins());
    this.enabledMediaMatcher = opts.enabledMediaMatcher || null;
    this.binSizeChangeMatcher = opts.binSizeChangeMatcher || null;
    this.emptyBinDrawerFrameId = -1;

    this.binSizeMediaMatchChanged = this.binSizeMediaMatchChanged.bind(this);
    this.enabledMediaMatchChanged = this.enabledMediaMatchChanged.bind(this);
    this.latencyPopupOpened = this.latencyPopupOpened.bind(this);
    this.playerStopped = this.playerStopped.bind(this);
    this.playerStarted = this.playerStarted.bind(this);
    this.emptyBinDraw = this.emptyBinDraw.bind(this);

    this.latencyPopup = GlobalUi.makePopup("Playback latency", LATENCY_POPUP_HTML, ".synchronize-with-audio");
    this.latencyPopup.on("open", this.latencyPopupOpened);
    this.player.on("stop", this.playerStopped);
    this.player.on("play", this.playerStarted);

    for (var i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i] = new TransitionInfo(this);
    }

    if (this.enabledMediaMatcher) {
        util.addLegacyListener(this.enabledMediaMatcher, "change", this.enabledMediaMatchChanged);
        this.enabledMediaMatchChanged();
    }

    if (this.binSizeChangeMatcher) {
        util.addLegacyListener(this.binSizeChangeMatcher, "change", this.binSizeMediaMatchChanged);
        $(window).on("resize", this.binSizeMediaMatchChanged);
    }

    this.enabled = true;
    this.shown = true;
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
                this.hide();
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

VisualizerCanvas.prototype.latencyPopupOpened = function(popup, needsInitialization) {
    var latency = (this.player.getAudioHardwareLatency() * 1000)|0;
    var maxLatency = (this.player.getMaximumAudioHardwareLatency() * 1000)|0;
    var minLatency = 0;
    var self = this;

    if (needsInitialization) {
        var sliderValue = this.latencyPopup.$().find(".latency-value");
        var slider = new Slider(this.latencyPopup.$().find(".latency-slider"));
        slider.setValue((latency + minLatency) / (maxLatency - minLatency));
        sliderValue.text(latency + "ms");
        popup.on("open", function() {
            slider.setValue((latency + minLatency) / (maxLatency - minLatency));
            sliderValue.text(latency + "ms");
        });

        slider.on("slide", function(p) {
            var latency = Math.round(p * (maxLatency - minLatency) + minLatency);
            sliderValue.text(latency + "ms");
            self.player.setAudioHardwareLatency(latency / 1000);
        });
    }
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
    if (this.renderer) {
        if (!this.renderer.usesHardwareAcceleration()) return;
        if (this.renderer instanceof Default2dImageRenderer) return;
        this.renderer.destroy();
    }
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
    if (!this.shown) return;
    var width = $(this.canvas).width() * pixelRatio | 0;
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

        if (!this.needToDraw) {
            this.needToDraw = true;
            this.drawIdleBins(Date.now());
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
    return Math.floor((762 * pixelRatio) / (this.binWidth + this.gapWidth));
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

VisualizerCanvas.prototype.emptyBinDraw = function(now) {
    this.emptyBinDrawerFrameId = -1;
    this.drawIdleBins(now);
    if (this.needToDraw) {
        this.emptyBinDrawerFrameId = requestAnimationFrame(this.emptyBinDraw);
    } else {
        this.hide();
    }
};

VisualizerCanvas.prototype.playerStarted = function() {
    if (this.emptyBinDrawerFrameId !== -1) {
        cancelAnimationFrame(this.emptyBinDrawerFrameId);
        this.emptyBinDrawerFrameId = -1;
    }
};

VisualizerCanvas.prototype.playerStopped = function() {
    this.needToDraw = true;
    this.emptyBinDrawerFrameId = requestAnimationFrame(this.emptyBinDraw);
};

VisualizerCanvas.prototype.show = function() {
    if (this.shown) return;
    if (!this.enabled || this.enabledMediaMatcher && !this.enabledMediaMatcher.matches) {
        return this.hide();
    }
    this.shown = true;
    $(this.canvas).closest(this.sectionContainerSelector).show();
    $(window).trigger("resize");
};

VisualizerCanvas.prototype.hide = function() {
    if (!this.shown || (this.enabled && (this.enabledMediaMatcher && this.enabledMediaMatcher.matches))) return;
    this.shown = false;
    $(this.canvas).closest(this.sectionContainerSelector).hide();
    $(window).trigger("resize");
};

VisualizerCanvas.prototype.drawBins = function(now, bins) {
    if (bins.length !== this.getNumBins()) return;
    if (!this.source.isReady()) return;
    if (!this.isEnabled()) {
        bins = this.emptyBins;
    }
    this.show();
    if (!this.shown) {
        return;
    }
    this.renderer.initScene(bins, 3);

    var currentCapPositions = this.currentCapPositions;
    var transitionInfoArray = this.transitionInfoArray;
    var anythingToDraw = false;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var transitionInfo = transitionInfoArray[i];
        var currentCapBasePosition = -1;

        if (transitionInfo.inProgress()) {
            currentCapBasePosition = transitionInfo.getCapPosition(now);
        }

        if (binValue < currentCapBasePosition) {
            currentCapPositions[i] = currentCapBasePosition;
            anythingToDraw = true;
        } else {
            currentCapPositions[i] = -1;
            transitionInfo.start(binValue, now);
            if (binValue !== 0) {
                anythingToDraw = true;
            }
        }
    }

    this.needToDraw = anythingToDraw;
    if (anythingToDraw) {
        this.renderer.drawCaps(bins);
        this.renderer.drawBins(bins);
    }
    this.renderer.drawScene();
    if (!anythingToDraw) {
        this.hide();
    }
};


module.exports = VisualizerCanvas;
