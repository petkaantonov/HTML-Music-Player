import Renderer from "./Renderer";

export default class Default2dImageRenderer {
    image: ImageBitmap;
    renderer: Renderer;
    context: OffscreenCanvasRenderingContext2D;
    width: number;
    height: number;
    constructor(image: ImageBitmap, renderer: Renderer) {
        this.image = image;
        this.renderer = renderer;
        this.context = renderer.canvas.getContext(`2d`, { alpha: false })!;
        this.width = this.height = 0;
    }

    /* eslint-disable class-methods-use-this */
    destroy() {
        // NOOP
    }

    drawScene() {
        // DrawImage calls already drew it.
    }

    usesHardwareAcceleration() {
        return false;
    }
    /* eslint-enable class-methods-use-this */

    init(width: number, height: number) {
        this.setDimensions(width, height);
    }

    initScene() {
        this.context.fillStyle = `rgba(255, 255, 255, 255)`;
        this.context.fillRect(0, 0, this.width, this.height);
    }

    drawCaps(bins: Float64Array) {
        const highestBinHeight = this.renderer.getHighestBinHeight();
        const { gapWidth, capSeparator, currentCapPositions } = this.renderer;
        const binSpace = this.renderer.binWidth + gapWidth;
        const capSourceX = this.renderer.source!.capX - gapWidth;
        const capSourceY = this.renderer.source!.capY - gapWidth;
        const capWidth = this.renderer.binWidth + gapWidth * 2;
        const capHeight = this.renderer.capHeight + gapWidth * 2;

        for (let i = 0; i < bins.length; ++i) {
            const binValue = bins[i]!;
            const currentCapBasePosition = currentCapPositions![i]!;
            const x1 = i * binSpace - gapWidth;
            let y1 =
                (binValue < currentCapBasePosition
                    ? currentCapBasePosition * highestBinHeight
                    : binValue * highestBinHeight) | 0;
            y1 += capSeparator;
            /* Var x2 = x1 + capWidth;
            var y2 = y2 + capHeight;*/

            this.context.drawImage(
                this.image,
                capSourceX,
                capSourceY,
                capWidth,
                capHeight,
                x1,
                this.height - y1 - capHeight,
                capWidth,
                capHeight
            );
        }
    }

    drawBins(bins: Float64Array) {
        const highestBinHeight = this.renderer.getHighestBinHeight();
        const { binWidth, gapWidth } = this.renderer;
        const fullWidth = binWidth + gapWidth * 2;
        const width = binWidth + gapWidth;
        // TODO this is actually sourceRowHeight.
        // Var canvasHeight = this.height;
        const sourceBinPositions = this.renderer.source!.binPositions;

        for (let i = 0; i < bins.length; ++i) {
            const binValue = bins[i]!;
            const x1 = i * width - gapWidth;
            const y1 = 0;
            // Var x2 = x1 + fullWidth;
            const y2 = (binValue * highestBinHeight) | 0;

            const srcX1 = sourceBinPositions[y2 * 2]!;
            const srcY1 = sourceBinPositions[y2 * 2 + 1]!;
            /* Var srcX2 = srcX1 + fullWidth;
            var srcY2 = srcY1 + (highestBinHeight - (srcY1 % canvasHeight));*/

            this.context.drawImage(
                this.image,
                srcX1,
                srcY1,
                fullWidth,
                highestBinHeight - srcY1,
                x1,
                this.height - y1 - y2,
                fullWidth,
                y2
            );
        }
    }

    setDimensions(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    static isSupported() {
        return true;
    }
}
