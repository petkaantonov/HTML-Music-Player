export default class Default2dImageRenderer {
    constructor(image, visualizerCanvas) {
        this.image = image;
        this.visualizerCanvas = visualizerCanvas;
        this.context = visualizerCanvas.canvas.getContext(`2d`, {alpha: false});
        this.width = this.height = 0;
    }

    destroy() {
        // NOOP
    }

    init(width, height) {
        this.setDimensions(width, height);
    }

    initScene() {
        this.context.fillStyle = `rgba(255, 255, 255, 255)`;
        this.context.fillRect(0, 0, this.width, this.height);
    }

    drawScene() {
        // DrawImage calls already drew it.
    }

    drawCaps(bins) {
        const highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
        const {gapWidth, capSeparator, currentCapPositions} = this.visualizerCanvas;
        const binSpace = this.visualizerCanvas.binWidth + gapWidth;
        const capSourceX = this.visualizerCanvas.source.capX - gapWidth;
        const capSourceY = this.visualizerCanvas.source.capY - gapWidth;
        const capWidth = this.visualizerCanvas.binWidth + gapWidth * 2;
        const capHeight = this.visualizerCanvas.capHeight + gapWidth * 2;

        for (let i = 0; i < bins.length; ++i) {
            const binValue = bins[i];
            const currentCapBasePosition = currentCapPositions[i];
            const x1 = i * binSpace - gapWidth;
            let y1 = (binValue < currentCapBasePosition ? (currentCapBasePosition * highestBinHeight)
                                                      : (binValue * highestBinHeight)) | 0;
            y1 += capSeparator;
            /* Var x2 = x1 + capWidth;
            var y2 = y2 + capHeight;*/

            this.context.drawImage(this.image, capSourceX, capSourceY, capWidth, capHeight,
                                               x1, this.height - y1 - capHeight, capWidth, capHeight);
        }
    }

    drawBins(bins) {
        const highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
        const {binWidth, gapWidth} = this.visualizerCanvas;
        const fullWidth = binWidth + gapWidth * 2;
        const width = binWidth + gapWidth;
        // TODO this is actually sourceRowHeight.
        // Var canvasHeight = this.height;
        const sourceBinPositions = this.visualizerCanvas.source.binPositions;

        for (let i = 0; i < bins.length; ++i) {
            const binValue = bins[i];
            const x1 = i * width - gapWidth;
            const y1 = 0;
            // Var x2 = x1 + fullWidth;
            const y2 = (binValue * highestBinHeight) | 0;

            const srcX1 = sourceBinPositions[y2 * 2];
            const srcY1 = sourceBinPositions[y2 * 2 + 1];
            /* Var srcX2 = srcX1 + fullWidth;
            var srcY2 = srcY1 + (highestBinHeight - (srcY1 % canvasHeight));*/

            this.context.drawImage(this.image, srcX1, srcY1,
                                               fullWidth, highestBinHeight - srcY1,
                                               x1, this.height - y1 - y2,
                                               fullWidth, y2);
        }
    }

    setDimensions(width, height) {
        this.width = width;
        this.height = height;
    }

    usesHardwareAcceleration() {
        return false;
    }
}

Default2dImageRenderer.isSupported = function() {
    return true;
};
