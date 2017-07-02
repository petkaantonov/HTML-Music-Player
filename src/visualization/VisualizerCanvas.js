import {addLegacyListener, inherits} from "util";
import {canvasToImage} from "platform/dom/util";
import {Int16Array, Float32Array, performance} from "platform/platform";
import Default2dImageRenderer from "visualization/Default2dImageRenderer";
import WebGl2dImageRenderer from "visualization/WebGl2dImageRenderer";
import EventEmitter from "events";
import {delay} from "platform/PromiseExtensions";
import {ACCELERATE_QUAD_INTERPOLATOR} from "ui/animation/easing";

const SHADOW_BLUR = 2;
const SHADOW_COLOR = `rgb(11,32,53)`;

const LATENCY_POPUP_HTML = `<div class='settings-container latency-popup-content-container'>
            <div class='section-container'>
                <div class='inputs-container'>
                    <div class='label overhead-label'>
                        Increase this value if the visualization is too early or
                        decrease this value if it is too late
                    </div>
                    <div class='latency-slider slider horizontal-slider unlabeled-slider'>
                        <div class='slider-knob'></div>
                        <div class='slider-background'>
                            <div class='slider-fill'></div>
                        </div>
                    </div>
                    <div class='latency-value slider-value-indicator'></div>
                </div>
                <div class='inputs-container'>
                    <div class='label overhead-label'>Changes are effective in real time</div>
                </div>
            </div>
        </div>`;


function TransitionInfo(visualizerCanvas) {
    this.duration = -1;
    this.capStarted = -1;
    this.peakSample = -1;
    this.visualizerCanvas = visualizerCanvas;
}

TransitionInfo.prototype.getCapPosition = function(now) {
    if (this.capStarted === -1) return 0;
    let elapsed = now - this.capStarted;
    let {duration} = this;
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
    const mul = 1 - Math.max(0.36, peakSample);
    this.duration = (1 - (mul * mul)) * this.visualizerCanvas.capDropTime;
};

function GraphicsSource(visualizerCanvas) {
    const {page, gapWidth} = visualizerCanvas;
    const document = page.document();
    const highestBinHeight = visualizerCanvas.getHighestBinHeight();
    const binsNeeded = (highestBinHeight + 1);
    const binWidthPixels = visualizerCanvas.binWidthSourcePixels();
    const binHeightPixels = visualizerCanvas.binHeightSourcePixels();
    const capWidthPixels = (16 * page.devicePixelRatio() + 2 + binWidthPixels) | 0;
    let totalWidth = binsNeeded * binWidthPixels + capWidthPixels;
    const canvasWidth = Math.min(Math.pow(2, Math.ceil(Math.log(totalWidth) * Math.LOG2E)), 1024);

    let rows = 1;
    const columns = (canvasWidth / binWidthPixels) | 0;
    while (totalWidth > canvasWidth) {
        totalWidth -= canvasWidth;
        rows++;
    }
    const canvasHeight = Math.pow(2, Math.ceil(Math.log(binHeightPixels * rows) * Math.LOG2E));

    const canvas = document.createElement(`canvas`);
    canvas.height = canvasHeight;
    canvas.width = canvasWidth;


    const context = canvas.getContext(`2d`);
    context.imageSmoothingEnabled = false;

    context.fillStyle = `#ffffff`;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.shadowColor = `transparent`;

    let col = 0;
    let row = 0;

    this.binPositions = new Int16Array(highestBinHeight * 2);

    const positions = this.binPositions;
    let positionIndex = 0;
    const width = visualizerCanvas.binWidth;
    for (let i = 0; i <= highestBinHeight; i++) {
        const height = i;
        const x = col * binWidthPixels;
        const y = (row * binHeightPixels + ((SHADOW_BLUR * page.devicePixelRatio()) | 0)) + (highestBinHeight - height);
        let gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, `rgb(250, 250, 250)`);
        gradient.addColorStop(0.7, `rgb(189, 196, 204)`);
        gradient.addColorStop(1, `rgb(183, 190, 198)`);

        context.fillStyle = gradient;
        context.fillRect(x - gapWidth, y, width + gapWidth * 2, height + gapWidth);

        gradient = context.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0.0, `rgb(250, 250, 250)`);
        gradient.addColorStop(0.2, `rgb(219, 241, 251)`);
        gradient.addColorStop(0.8, `rgb(184, 228, 246)`);
        gradient.addColorStop(1, `rgb(166, 202, 238)`);
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

    context.shadowBlur = (SHADOW_BLUR * page.devicePixelRatio()) | 0;
    context.shadowColor = SHADOW_COLOR;
    context.globalAlpha = 1;
    context.fillStyle = visualizerCanvas.capStyle;
    const x = col * binWidthPixels + visualizerCanvas.binWidth + 5;
    const y = (row * binHeightPixels + ((SHADOW_BLUR * page.devicePixelRatio()) | 0)) + (16 * page.devicePixelRatio()) | 0;
    context.fillRect(x, y, visualizerCanvas.binWidth, visualizerCanvas.capHeight);

    this.capX = x;
    this.capY = y;
    this.image = null;
    this.ready = (async () => {
        const image = await canvasToImage(canvas, page);
        this.image = image;
        canvas.width = canvas.height = 0;
    })();
}

GraphicsSource.prototype.isReady = function() {
    return this.image !== null;
};

export default function VisualizerCanvas(opts, deps) {
    EventEmitter.call(this);

    this.page = deps.page;
    this.snackbar = deps.snackbar;
    this.recognizerContext = deps.recognizerContext;
    this.sliderContext = deps.sliderContext;
    this.menuContext = deps.menuContext;
    this.rippler = deps.rippler;
    this.applicationPreferences = deps.applicationPreferences;
    this.globalEvents = deps.globalEvents;
    this.player = deps.player;
    this.player.setVisualizerCanvas(this);
    this.webglSupported = WebGl2dImageRenderer.isSupported(this.page.document());
    this.canvasSupported = true;

    this.needToDraw = true;
    this.canvas = this.page.$(opts.target).get(0);
    this.width = -1;
    this.height = -1;
    this.binWidth = opts.binWidth * this.page.devicePixelRatio() | 0;
    this.gapWidth = opts.gapWidth * this.page.devicePixelRatio() | 0;
    this.capHeight = opts.capHeight * this.page.devicePixelRatio() | 0;
    this.capSeparator = opts.capSeparator * this.page.devicePixelRatio() | 0;
    this.capStyle = opts.capStyle;
    this.targetFps = opts.targetFps;
    this.sectionContainerSelector = opts.sectionContainerSelector || `.visualizer-section-container`;
    this.capInterpolator = null;
    this.setCapInterpolator(opts.capInterpolator || ACCELERATE_QUAD_INTERPOLATOR);
    this.ghostOpacity = opts.ghostOpacity || 0.25;
    this.capDropTime = opts.capDropTime;
    this.currentCapPositions = null;
    this.emptyBins = null;
    this.transitionInfoArray = null;
    this.enabledMediaMatcher = opts.enabledMediaMatcher || null;
    this.emptyBinDrawerFrameId = -1;


    this.binSizeMediaMatchChanged = this.binSizeMediaMatchChanged.bind(this);
    this.enabledMediaMatchChanged = this.enabledMediaMatchChanged.bind(this);
    this.latencyPopupOpened = this.latencyPopupOpened.bind(this);
    this.playerStopped = this.playerStopped.bind(this);
    this.playerStarted = this.playerStarted.bind(this);
    this.emptyBinDraw = this.emptyBinDraw.bind(this);
    this.latencyPopup = deps.popupContext.makePopup(`Playback latency`, LATENCY_POPUP_HTML, `.synchronize-with-audio`);

    this.applicationPreferences.on(`change`, this.applicationPreferencesChanged.bind(this));

    this.enabled = true;
    this.shown = true;
    this.source = null;
    this.renderer = null;
    this.contextMenu = null;

}
inherits(VisualizerCanvas, EventEmitter);

VisualizerCanvas.prototype.initialize = async function() {
    const width = this.canvas.clientWidth * this.page.devicePixelRatio() | 0;
    const height = this.canvas.clientHeight * this.page.devicePixelRatio() | 0;
    this.width = width;
    this.height = height;
    this.currentCapPositions = new Float32Array(this.getNumBins());
    this.emptyBins = new Float32Array(this.getNumBins());
    this.transitionInfoArray = new Array(this.getNumBins());
    this.canvas.width = width;
    this.canvas.height = height;

    for (let i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i] = new TransitionInfo(this);
    }

    if (this.enabledMediaMatcher) {
        addLegacyListener(this.enabledMediaMatcher, `change`, this.enabledMediaMatchChanged);
        this.enabledMediaMatchChanged();
    }

    this.globalEvents.on(`resize`, this.binSizeMediaMatchChanged);
    this.latencyPopup.on(`open`, this.latencyPopupOpened);
    this.player.on(`stop`, this.playerStopped);
    this.player.on(`play`, this.playerStarted);

    this.source = new GraphicsSource(this);
    this.enabled = this.applicationPreferences.preferences().getEnableVisualizer();
    this.setupCanvasContextMenu();

    let properRendererLoaded = false;

    while (!properRendererLoaded) {
        await this.source.ready;
        properRendererLoaded = true;

        if (this.canUseHardwareRendering()) {
            this.renderer = new WebGl2dImageRenderer(this.source.image, this);
        } else {
            this.snackbar.show(`Hardware acceleration disabled`, {
                tag: null
            });
        }

        if (!this.renderer) {
            this.resetCanvas();
            this.renderer = new Default2dImageRenderer(this.source.image, this);
        }

        try {
            this.renderer.init(this.width, this.height);
        } catch (e) {
            this.snackbar.show(e.message);
            if (this.canUseHardwareRendering()) {
                this.webglSupported = false;
                this.renderer = null;
                this.source.ready = delay(100);
                properRendererLoaded = false;
                continue;
            } else {
                this.canvasSupported = false;
                this.hide();
            }
        }
        this.drawIdleBins(performance.now());
        this.refreshContextMenu();
    }
};

VisualizerCanvas.prototype.refreshContextMenu = function() {
    if (this.contextMenu) {
        this.contextMenu.refreshAll();
    }
};

VisualizerCanvas.prototype.applyVisibility = function() {
    if (this.enabled) {
        this.show();
    } else {
        this.hide();
    }
};

VisualizerCanvas.prototype.applicationPreferencesChanged = function() {
    if (this.enabled !== this.applicationPreferences.preferences().getEnableVisualizer()) {
        this.enabled = !this.enabled;
        this.refreshContextMenu();
        this.applyVisibility();
    }
};

VisualizerCanvas.prototype.setupCanvasContextMenu = function() {
    const {menuContext} = this;
    this.destroyCanvasContextMenu();
    this.contextMenu = menuContext.createContextMenu({
        target: this.canvas,
        menu: [{
            id: `hardware-acceleration`,
            disabled: true,
            onClick(e) {
                e.preventDefault();
            },
            content: () => menuContext.createMenuItem(`Hardware acceleration`,
                                                      this.isHardwareRendering() ? `glyphicon glyphicon-ok` : null)

        }, {
            divider: true
        }, {
            id: `hardware-latency`,
            content: menuContext.createMenuItem(`Synchronize with audio...`),
            onClick: () => {
                this.latencyPopup.open();
            }
        }, {
            id: `visualizer-enabled`,
            content: () => menuContext.createMenuItem(`Enabled`, this.isEnabled() ? `glyphicon glyphicon-ok` : null),
            onClick: (e) => {
                e.preventDefault();
                this.enabled = !this.enabled;
                this.applicationPreferences.setVisualizerEnabled(this.enabled);
                this.refreshContextMenu();
                this.applyVisibility();
            }
        }]
    });
};

VisualizerCanvas.prototype.latencyPopupOpened = function(popup, needsInitialization) {
    const hardwareLatency = (this.player.getAudioHardwareLatency() * 1000) | 0;
    const maxLatency = (this.player.getMaximumAudioHardwareLatency() * 1000) | 0;
    const minLatency = 0;
    if (needsInitialization) {
        const sliderValue = this.latencyPopup.$().find(`.latency-value`);
        const slider = this.sliderContext.createSlider({
            target: this.latencyPopup.$().find(`.latency-slider`)
        });
        slider.setValue((hardwareLatency + minLatency) / (maxLatency - minLatency));
        sliderValue.setText(`${hardwareLatency}ms`);
        popup.on(`open`, () => {
            slider.setValue((hardwareLatency + minLatency) / (maxLatency - minLatency));
            sliderValue.setText(`${hardwareLatency}ms`);
        });

        slider.on(`slide`, (p) => {
            const latency = Math.round(p * (maxLatency - minLatency) + minLatency);
            sliderValue.setText(`${latency}ms`);
            this.player.setAudioHardwareLatency(latency / 1000);
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
    const canvas = this.page.createElement(`canvas`).get(0);
    canvas.className = this.canvas.className;
    canvas.width = this.width;
    canvas.height = this.height;
    this.canvas.parentNode.replaceChild(canvas, this.canvas);
    this.emit(`canvasChange`, canvas, this.canvas);
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
    this.snackbar.show(`Hardware acceleration disabled`);
};

VisualizerCanvas.prototype.canUseHardwareRendering = function() {
    return this.webglSupported;
};

VisualizerCanvas.prototype.isHardwareRendering = function() {
    if (!this.renderer) return false;
    return this.renderer.usesHardwareAcceleration();
};

VisualizerCanvas.prototype.enabledMediaMatchChanged = function() {
    this.binSizeMediaMatchChanged();
    this.refreshContextMenu();
    if (this.source && this.source.isReady()) {
        this.drawIdleBins(performance.now());
    }
};

VisualizerCanvas.prototype.binSizeMediaMatchChanged = function() {
    if (!this.shown) return;
    const width = this.canvas.clientWidth * this.page.devicePixelRatio() | 0;
    if (width !== this.width) {
        this.width = width;
        this.canvas.width = width;

        this.currentCapPositions = new Float32Array(this.getNumBins());
        this.emptyBins = new Float32Array(this.getNumBins());
        this.transitionInfoArray = new Array(this.getNumBins());

        for (let i = 0; i < this.transitionInfoArray.length; ++i) {
            this.transitionInfoArray[i] = new TransitionInfo(this);
        }

        this.resetCaps();

        if (this.renderer) {
            this.renderer.setDimensions(this.width, this.height);
        }

        if (!this.needToDraw) {
            this.needToDraw = true;
            this.drawIdleBins(performance.now());
        }

    }
};

VisualizerCanvas.prototype.isEnabled = function() {
    return this.enabled;
};

VisualizerCanvas.prototype.isSupported = function() {
    return this.enabledMediaMatcher.matches && this.canvasSupported;
};

VisualizerCanvas.prototype.resetCaps = function() {
    for (let i = 0; i < this.transitionInfoArray.length; ++i) {
        this.transitionInfoArray[i].reset();
    }
};

VisualizerCanvas.prototype.binWidthSourcePixels = function() {
    return this.binWidth + this.gapWidth;
};

VisualizerCanvas.prototype.binHeightSourcePixels = function() {
    return (this.height + (SHADOW_BLUR * this.page.devicePixelRatio()) | 0);
};

VisualizerCanvas.prototype.setCapInterpolator = function(interpolator) {
    if (typeof interpolator !== `function`) throw new Error(`${interpolator} is not a function`);
    this.capInterpolator = interpolator;
};

VisualizerCanvas.prototype.getTargetFps = function() {
    return this.targetFps;
};

VisualizerCanvas.prototype.getMaxBins = function() {
    return Math.floor((762 * this.page.devicePixelRatio()) / (this.binWidth + this.gapWidth));
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
        const {currentCapPositions} = this;
        for (let i = 0; i < currentCapPositions.length; ++i) {
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
    return this.needToDraw || (this.isEnabled() && this.isSupported());
};

VisualizerCanvas.prototype.shouldHideWhenNothingToDraw = function() {
    return !this.applicationPreferences.preferences().getEnableVisualizer() || !this.isSupported();
};

VisualizerCanvas.prototype.emptyBinDraw = function(now) {
    this.emptyBinDrawerFrameId = -1;
    this.drawIdleBins(now);
    if (this.needToDraw) {
        this.emptyBinDrawerFrameId = this.page.requestAnimationFrame(this.emptyBinDraw);
    } else {
        this.hide();
    }
};

VisualizerCanvas.prototype.playerStarted = function() {
    this.page.cancelAnimationFrame(this.emptyBinDrawerFrameId);
    this.emptyBinDrawerFrameId = -1;
};

VisualizerCanvas.prototype.playerStopped = function() {
    this.needToDraw = true;
    this.emptyBinDrawerFrameId = this.page.requestAnimationFrame(this.emptyBinDraw);
};

VisualizerCanvas.prototype.show = function() {
    if (this.shown) return;
    if (!this.enabled || !this.isSupported()) {
        this.hide();
        return;
    }
    this.shown = true;
    this.page.$(this.canvas).closest(this.sectionContainerSelector).show();
    this.binSizeMediaMatchChanged();
    this.globalEvents._triggerSizeChange();
};

VisualizerCanvas.prototype.hide = function() {
    if (!this.shown || !this.shouldHideWhenNothingToDraw()) return;
    this.shown = false;
    this.needToDraw = false;
    this.page.$(this.canvas).closest(this.sectionContainerSelector).hide();
    this.binSizeMediaMatchChanged();
    this.globalEvents._triggerSizeChange();
};

VisualizerCanvas.prototype.drawBins = function(now, bins) {
    if (bins.length !== this.getNumBins()) return;
    if (!this.source.isReady()) return;
    if (!this.isEnabled() || !this.isSupported()) {
        bins = this.emptyBins;
    }
    this.show();
    if (!this.shown) {
        return;
    }
    this.renderer.initScene(bins, 3);

    const {currentCapPositions, transitionInfoArray} = this;
    let anythingToDraw = false;

    for (let i = 0; i < bins.length; ++i) {
        const binValue = bins[i];
        const transitionInfo = transitionInfoArray[i];
        let currentCapBasePosition = -1;

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
