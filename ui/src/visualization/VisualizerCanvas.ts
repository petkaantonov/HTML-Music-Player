import { EventEmitterInterface } from "shared/types/helpers";
import { addLegacyListener, delay } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapperSelector } from "ui/platform/dom/Page";
import { canvasToImage } from "ui/platform/dom/util";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import PlayerController from "ui/player/PlayerController";
import { ExpandoImage } from "ui/player/PlayerPictureManager";
import { ACCELERATE_QUAD_INTERPOLATOR } from "ui/ui/animation/easing";
import GestureRecognizerContext from "ui/ui/gestures/GestureRecognizerContext";
import MenuContext from "ui/ui/MenuContext";
import Rippler from "ui/ui/Rippler";
import SliderContext from "ui/ui/SliderContext";
import Snackbar from "ui/ui/Snackbar";
import Default2dImageRenderer from "ui/visualization/Default2dImageRenderer";
import WebGl2dImageRenderer from "ui/visualization/WebGl2dImageRenderer";
import EventEmitter from "vendor/events";

const SHADOW_BLUR = 2;
const SHADOW_COLOR = `rgb(11,32,53)`;

class TransitionInfo {
    duration: number;
    capStarted: number;
    peakSample: number;
    visualizerCanvas: VisualizerCanvas;
    constructor(visualizerCanvas: VisualizerCanvas) {
        this.duration = -1;
        this.capStarted = -1;
        this.peakSample = -1;
        this.visualizerCanvas = visualizerCanvas;
    }

    getCapPosition(now: number) {
        if (this.capStarted === -1) return 0;
        let elapsed = now - this.capStarted;
        let { duration } = this;
        if (elapsed >= duration) {
            this.capStarted = -1;
        }

        if (elapsed < 95) return this.peakSample;

        elapsed -= 95;
        duration -= 95;

        return (1 - this.visualizerCanvas.capInterpolator(elapsed, duration)) * this.peakSample;
    }

    inProgress() {
        return this.capStarted !== -1;
    }

    reset() {
        this.capStarted = -1;
        this.peakSample = -1;
        this.duration = -1;
    }

    start(peakSample: number, now: number) {
        this.capStarted = now;
        this.peakSample = peakSample;
        const mul = 1 - Math.max(0.36, peakSample);
        this.duration = (1 - mul * mul) * this.visualizerCanvas.capDropTime;
    }
}

class GraphicsSource {
    binPositions: Int16Array;
    capX: number;
    capY: number;
    image: ExpandoImage | null;
    ready: Promise<void>;
    constructor(visualizerCanvas: VisualizerCanvas) {
        const { page, gapWidth } = visualizerCanvas;
        const document = page.document();
        const highestBinHeight = visualizerCanvas.getHighestBinHeight();
        const binsNeeded = highestBinHeight + 1;
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

        const context = canvas.getContext(`2d`)!;
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
            const y =
                row * binHeightPixels + ((SHADOW_BLUR * page.devicePixelRatio()) | 0) + (highestBinHeight - height);
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
        const y =
            (row * binHeightPixels + ((SHADOW_BLUR * page.devicePixelRatio()) | 0) + 16 * page.devicePixelRatio()) | 0;
        context.fillRect(x, y, visualizerCanvas.binWidth, visualizerCanvas.capHeight);

        this.capX = x;
        this.capY = y;
        this.image = null;
        this.ready = (async () => {
            const image = await canvasToImage(canvas);
            this.image = image;
            canvas.width = canvas.height = 0;
        })();
    }

    isReady() {
        return this.image !== null;
    }
}

type Deps = SelectDeps<
    | "page"
    | "snackbar"
    | "recognizerContext"
    | "menuContext"
    | "rippler"
    | "globalEvents"
    | "env"
    | "player"
    | "sliderContext"
>;

interface Opts {
    target: DomWrapperSelector;
    binWidth: number;
    gapWidth: number;
    capHeight: number;
    capSeparator: number;
    capStyle: string;
    sectionContainerSelector?: string;
    capInterpolator?: (current: number, total: number) => number;
    ghostOpacity?: number;
    capDropTime: number;
    enabledMediaMatcher?: MediaQueryList;
}

export default class VisualizerCanvas extends EventEmitter implements Deps {
    page: Page;
    snackbar: Snackbar;
    recognizerContext: GestureRecognizerContext;
    menuContext: MenuContext;
    rippler: Rippler;
    globalEvents: GlobalEvents;
    env: Env;
    player: PlayerController;
    sliderContext: SliderContext;

    webglSupported: boolean;
    canvasSupported: boolean = true;
    needToDraw: boolean = true;
    canvas: HTMLCanvasElement;
    width: number = -1;
    height: number = -1;
    binWidth: number;
    gapWidth: number;
    capHeight: number;
    capSeparator: number;
    capStyle: string;
    sectionContainerSelector: string;
    capInterpolator: (current: number, total: number) => number;
    ghostOpacity: number;
    capDropTime: number;
    currentCapPositions: null | Float64Array;
    emptyBins: null | Float64Array;
    transitionInfoArray: null | TransitionInfo[];
    enabledMediaMatcher: null | MediaQueryList;
    emptyBinDrawerFrameId: number;
    enabled: boolean;
    shown: boolean = false;
    source: null | GraphicsSource = null;
    renderer: null | WebGl2dImageRenderer | Default2dImageRenderer = null;

    constructor(opts: Opts, deps: Deps) {
        super();

        this.page = deps.page;
        this.snackbar = deps.snackbar;
        this.recognizerContext = deps.recognizerContext;
        this.sliderContext = deps.sliderContext;
        this.menuContext = deps.menuContext;
        this.rippler = deps.rippler;
        this.globalEvents = deps.globalEvents;
        this.env = deps.env;
        this.player = deps.player;

        this.webglSupported = WebGl2dImageRenderer.isSupported();
        this.canvasSupported = true;

        this.needToDraw = true;
        this.canvas = this.page.$(opts.target).get(0)! as HTMLCanvasElement;
        this.width = -1;
        this.height = -1;
        this.binWidth = (opts.binWidth * this.page.devicePixelRatio()) | 0;
        this.gapWidth = (opts.gapWidth * this.page.devicePixelRatio()) | 0;
        this.capHeight = (opts.capHeight * this.page.devicePixelRatio()) | 0;
        this.capSeparator = (opts.capSeparator * this.page.devicePixelRatio()) | 0;
        this.capStyle = opts.capStyle;
        this.sectionContainerSelector = opts.sectionContainerSelector || `.visualizer-section-container`;
        this.capInterpolator = opts.capInterpolator || ACCELERATE_QUAD_INTERPOLATOR;
        this.ghostOpacity = opts.ghostOpacity || 0.25;
        this.capDropTime = opts.capDropTime;
        this.currentCapPositions = null;
        this.emptyBins = null;
        this.transitionInfoArray = null;
        this.enabledMediaMatcher = opts.enabledMediaMatcher || null;
        this.emptyBinDrawerFrameId = -1;

        this.enabled = this.env.isDesktop();
        this.shown = false;
        this.source = null;
        this.renderer = null;
        this.applyVisibility();
    }

    async initialize() {
        const width = (this.canvas.clientWidth * this.page.devicePixelRatio()) | 0 || 120;
        const height = (this.canvas.clientHeight * this.page.devicePixelRatio()) | 0 || 50;
        this.width = width;
        this.height = height;
        this.currentCapPositions = new Float64Array(this.getNumBins());
        this.emptyBins = new Float64Array(this.getNumBins());
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
        this.player.on("playbackStopped", this.playerStopped);
        this.player.on("playbackStarted", this.playerStarted);

        this.source = new GraphicsSource(this);
        this.enabled = this.env.isDesktop();
        this.applyVisibility();

        let properRendererLoaded = false;

        while (!properRendererLoaded) {
            await this.source.ready;
            properRendererLoaded = true;

            if (this.canUseHardwareRendering()) {
                this.renderer = new WebGl2dImageRenderer(this.source.image!, this);
            } else {
                void this.snackbar.show(`Hardware acceleration disabled`, {});
            }

            if (!this.renderer) {
                this.resetCanvas();
                this.renderer = new Default2dImageRenderer(this.source.image!, this);
            }

            try {
                this.renderer.init(this.width, this.height);
            } catch (e) {
                void this.snackbar.show(e.message);
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
        }
    }

    applyVisibility() {
        if (this.enabled) {
            this.show();
        } else {
            this.hide();
        }
    }

    resetCanvas() {
        const canvas = this.page.createElement(`canvas`).get(0) as HTMLCanvasElement;
        canvas.className = this.canvas.className;
        canvas.width = this.width;
        canvas.height = this.height;
        this.canvas!.parentNode!.replaceChild(canvas, this.canvas);
        this.emit(`canvasChange`, canvas, this.canvas);
        this.canvas = canvas;
    }

    useSoftwareRendering() {
        if (this.renderer) {
            if (!this.renderer.usesHardwareAcceleration()) return;
            if (this.renderer instanceof Default2dImageRenderer) return;
            this.renderer.destroy();
        }
        this.resetCanvas();
        this.renderer = new Default2dImageRenderer(this.source!.image!, this);
        void this.snackbar.show(`Hardware acceleration disabled`);
    }

    canUseHardwareRendering() {
        return this.webglSupported;
    }

    isHardwareRendering() {
        if (!this.renderer) return false;
        return this.renderer.usesHardwareAcceleration();
    }

    enabledMediaMatchChanged = () => {
        this.binSizeMediaMatchChanged();
        if (this.source && this.source.isReady()) {
            this.drawIdleBins(performance.now());
        }
    };

    binSizeMediaMatchChanged = () => {
        this.applyVisibility();
        if (!this.shown) return;
        const width = (this.canvas.clientWidth * this.page.devicePixelRatio()) | 0;
        if (width !== this.width) {
            this.width = width;
            this.canvas.width = width;

            this.currentCapPositions = new Float64Array(this.getNumBins());
            this.emptyBins = new Float64Array(this.getNumBins());
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

    isEnabled() {
        return this.enabled;
    }

    isSupported() {
        return (this.enabledMediaMatcher ? this.enabledMediaMatcher.matches : true) && this.canvasSupported;
    }

    resetCaps() {
        for (let i = 0; i < this.transitionInfoArray!.length; ++i) {
            this.transitionInfoArray![i]!.reset();
        }
    }

    binWidthSourcePixels() {
        return this.binWidth + this.gapWidth;
    }

    binHeightSourcePixels() {
        return (this.height + SHADOW_BLUR * this.page.devicePixelRatio()) | 0;
    }

    getMaxBins() {
        return Math.floor((762 * this.page.devicePixelRatio()) / (this.binWidth + this.gapWidth));
    }

    getNumBins() {
        return Math.floor(this.width / (this.binWidth + this.gapWidth));
    }

    getHighestBinHeight() {
        return this.height - (this.capSeparator + this.capHeight);
    }

    drawIdleBins(now: number) {
        if (this.needToDraw) {
            this.drawBins(now, this.emptyBins!);
            const { currentCapPositions } = this;
            for (let i = 0; i < currentCapPositions!.length; ++i) {
                if (currentCapPositions![i]! !== -1) {
                    return;
                }
            }

            this.needToDraw = false;
        }
    }

    /* eslint-disable class-methods-use-this */
    objectsPerBin() {
        return 3;
    }
    /* eslint-enable class-methods-use-this */

    needsToDraw() {
        return this.needToDraw || (this.isEnabled() && this.isSupported() && this.player.isPlaying);
    }

    shouldHideWhenNothingToDraw() {
        return !this.isSupported();
    }

    emptyBinDraw = (now: number) => {
        this.emptyBinDrawerFrameId = -1;
        this.drawIdleBins(now);
        if (this.needToDraw) {
            this.emptyBinDrawerFrameId = this.page.requestAnimationFrame(this.emptyBinDraw);
        } else {
            this.hide();
        }
    };

    playerStarted = () => {
        this.needToDraw = true;
        this.page.cancelAnimationFrame(this.emptyBinDrawerFrameId);
        this.emptyBinDrawerFrameId = -1;
    };

    playerStopped = () => {
        this.needToDraw = true;
        this.emptyBinDrawerFrameId = this.page.requestAnimationFrame(this.emptyBinDraw);
    };

    show() {
        if (this.shown) return;
        if (!this.enabled || !this.isSupported()) {
            this.hide();
            return;
        }
        this.shown = true;
        this.needToDraw = true;
        this.page.$(this.canvas).closest(this.sectionContainerSelector).show("block");
        this.binSizeMediaMatchChanged();
    }

    hide() {
        if (!this.shown || !this.shouldHideWhenNothingToDraw()) return;
        this.shown = false;
        this.needToDraw = false;
        this.page.$(this.canvas).closest(this.sectionContainerSelector).hide();
        this.binSizeMediaMatchChanged();
        this.globalEvents._triggerSizeChange();
    }

    drawBins(now: number, bins: Float64Array) {
        if (bins.length !== this.getNumBins()) return;
        if (!this.source!.isReady()) return;
        if (!this.isEnabled() || !this.isSupported()) {
            bins = this.emptyBins!;
        }
        this.show();
        if (!this.shown) {
            return;
        }

        this.renderer!.initScene();

        const { currentCapPositions, transitionInfoArray } = this;
        let anythingToDraw = false;

        for (let i = 0; i < bins.length; ++i) {
            const binValue = bins[i]!;
            const transitionInfo = transitionInfoArray![i]!;
            let currentCapBasePosition = -1;

            if (transitionInfo.inProgress()) {
                currentCapBasePosition = transitionInfo.getCapPosition(now);
            }

            if (binValue < currentCapBasePosition) {
                currentCapPositions![i] = currentCapBasePosition;
                anythingToDraw = true;
            } else {
                currentCapPositions![i] = -1;
                transitionInfo.start(binValue, now);
                if (binValue !== 0) {
                    anythingToDraw = true;
                }
            }
        }

        this.needToDraw = anythingToDraw;
        if (anythingToDraw) {
            this.renderer!.drawCaps(bins);
            this.renderer!.drawBins(bins);
        }
        this.renderer!.drawScene();
        if (!anythingToDraw) {
            this.hide();
        }
    }
}

interface VisualizerCanvasEventsMap {
    canvasChange: (newCanvas: HTMLCanvasElement, oldCanvas: HTMLCanvasElement) => void;
}
export default interface VisualizerCanvas extends EventEmitterInterface<VisualizerCanvasEventsMap> {}
