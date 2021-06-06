import { Interpolator, interpolators } from "shared/src/easing";
import { CanvasOpts, DimensionOpts, RendererOpts } from "shared/visualizer";

import Default2dImageRenderer from "./Default2dImageRenderer";
import WebGl2dImageRenderer from "./WebGl2dImageRenderer";

const SHADOW_BLUR = 2;
const SHADOW_COLOR = `rgb(11,32,53)`;
const MAX_CANVAS_WIDTH = 638;

class GraphicsSource {
    binPositions: Int16Array;
    capX: number;
    capY: number;
    image: ImageBitmap;
    constructor(renderer: Renderer) {
        const { gapWidth } = renderer;
        const highestBinHeight = renderer.getHighestBinHeight();
        const binsNeeded = highestBinHeight + 1;
        const binWidthPixels = renderer.binWidthSourcePixels();
        const binHeightPixels = renderer.binHeightSourcePixels();
        const capWidthPixels = Math.round(16 * renderer.pixelRatio + 2 + binWidthPixels);
        let totalWidth = binsNeeded * binWidthPixels + capWidthPixels;

        const canvasWidth = Math.min(Math.pow(2, Math.ceil(Math.log(totalWidth) * Math.LOG2E)), 1024);

        let rows = 1;
        const columns = (canvasWidth / binWidthPixels) | 0;
        while (totalWidth > canvasWidth) {
            totalWidth -= canvasWidth;
            rows++;
        }
        const canvasHeight = Math.pow(2, Math.ceil(Math.log(binHeightPixels * rows) * Math.LOG2E));
        const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);

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
        const width = renderer.binWidth;
        for (let i = 0; i <= highestBinHeight; i++) {
            const height = i;
            const x = col * binWidthPixels;
            const y = row * binHeightPixels + ((SHADOW_BLUR * renderer.pixelRatio) | 0) + (highestBinHeight - height);
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

        context.shadowBlur = (SHADOW_BLUR * renderer.pixelRatio) | 0;
        context.shadowColor = SHADOW_COLOR;
        context.globalAlpha = 1;
        context.fillStyle = renderer.capStyle;
        const x = col * binWidthPixels + renderer.binWidth + 5;
        const y = (row * binHeightPixels + ((SHADOW_BLUR * renderer.pixelRatio) | 0) + 16 * renderer.pixelRatio) | 0;
        context.fillRect(x, y, renderer.binWidth, renderer.capHeight);

        this.capX = x;
        this.capY = y;
        this.image = canvas.transferToImageBitmap();
    }
}

class TransitionInfo {
    duration: number;
    capStarted: number;
    peakSample: number;
    renderer: Renderer;
    constructor(renderer: Renderer) {
        this.duration = -1;
        this.capStarted = -1;
        this.peakSample = -1;
        this.renderer = renderer;
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

        return (1 - this.renderer.capInterpolator(elapsed, duration)) * this.peakSample;
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
        this.duration = (1 - mul * mul) * this.renderer.capDropTime;
    }
}

export default class Renderer {
    readonly capDropTime: number;
    readonly capInterpolator: Interpolator;

    private renderer: Default2dImageRenderer | WebGl2dImageRenderer;
    readonly canvas: OffscreenCanvas;
    private width: number;
    private height: number;
    currentCapPositions: Float64Array;
    transitionInfoArray: TransitionInfo[];
    readonly binWidth: number;
    readonly gapWidth: number;
    readonly capHeight: number;
    readonly capSeparator: number;
    readonly capStyle: string;
    readonly ghostOpacity: number;
    readonly pixelRatio: number;
    readonly source: GraphicsSource;
    private contextLost: boolean = false;

    constructor({
        canvas,
        width,
        height,
        capDropTime,
        interpolator,
        binWidth,
        gapWidth,
        capHeight,
        capSeparator,
        capStyle,
        ghostOpacity,
        pixelRatio,
    }: DimensionOpts & CanvasOpts & RendererOpts) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.pixelRatio = pixelRatio;
        this.capDropTime = capDropTime;
        this.capInterpolator = interpolators[interpolator];
        this.binWidth = Math.round(binWidth * pixelRatio);
        this.gapWidth = Math.round(gapWidth * pixelRatio);
        this.capHeight = Math.round(capHeight * pixelRatio);
        this.capSeparator = Math.round(capSeparator * pixelRatio);
        this.capStyle = capStyle;
        this.ghostOpacity = ghostOpacity ?? 0.25;
        this.currentCapPositions = new Float64Array(this.getNumBins());
        this.transitionInfoArray = new Array(this.getNumBins());
        for (let i = 0; i < this.transitionInfoArray.length; ++i) {
            this.transitionInfoArray[i] = new TransitionInfo(this);
        }
        this.source = new GraphicsSource(this);

        if (WebGl2dImageRenderer.isSupported(this.canvas)) {
            try {
                this.renderer = new WebGl2dImageRenderer(this.source.image, this);
                this.renderer.init(this.width, this.height);
                this.renderer.on("contextLost", this._WebGlContextLost);
                this.renderer.on("contextRestored", this._WebGlContextRestored);
                this.renderer.on("error", this._WebGlErrored);
            } catch (e) {
                this.renderer = new Default2dImageRenderer(this.source.image, this);
                this.contextLost = false;
            }
        } else {
            this.renderer = new Default2dImageRenderer(this.source.image, this);
            this.contextLost = false;
        }
    }

    _WebGlContextLost = () => {
        this.contextLost = true;
    };

    _WebGlContextRestored = () => {
        this.contextLost = false;
    };

    _WebGlErrored = () => {
        (this.renderer as WebGl2dImageRenderer).removeAllListeners();
        this.renderer = new Default2dImageRenderer(this.source.image, this);
        this.contextLost = false;
    };

    setDimensions({ width, height }: DimensionOpts) {
        const oldBins = this.getNumBins();
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        if (this.getNumBins() !== oldBins) {
            this.currentCapPositions = new Float64Array(this.getNumBins());
            this.transitionInfoArray = new Array(this.getNumBins());
            for (let i = 0; i < this.transitionInfoArray.length; ++i) {
                this.transitionInfoArray[i] = new TransitionInfo(this);
            }
            this.resetCaps();
        }
        this.renderer.setDimensions(this.width, this.height);
    }

    resetCaps() {
        for (let i = 0; i < this.transitionInfoArray!.length; ++i) {
            this.transitionInfoArray![i]!.reset();
        }
    }

    drawBins(now: number, bins: Float64Array) {
        if (this.contextLost) {
            return false;
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

        if (anythingToDraw) {
            this.renderer!.drawCaps(bins);
            this.renderer!.drawBins(bins);
        }
        this.renderer!.drawScene();
        return anythingToDraw;
    }

    get objectsPerBin() {
        return 3;
    }

    binWidthSourcePixels() {
        return this.binWidth + this.gapWidth;
    }

    binHeightSourcePixels() {
        return (this.height + SHADOW_BLUR * this.pixelRatio) | 0;
    }

    getMaxBins() {
        return Math.floor((MAX_CANVAS_WIDTH * this.pixelRatio) / (this.binWidth + this.gapWidth));
    }

    getNumBins() {
        return Math.floor(this.width / (this.binWidth + this.gapWidth));
    }

    getHighestBinHeight() {
        return this.height - (this.capSeparator + this.capHeight);
    }
}
