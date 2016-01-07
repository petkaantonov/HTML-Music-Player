"use strict";


function Default2dImageRenderer(image, visualizerCanvas) {
    this.image = image;
    this.visualizerCanvas = visualizerCanvas;
    this.context = visualizerCanvas.canvas.getContext("2d");
    this.width = this.height = 0;
}

Default2dImageRenderer.prototype.init = function(width, height) {
    this.setDimensions(width, height);
};

Default2dImageRenderer.prototype.initScene = function() {
    this.context.fillStyle = "rgba(255, 255, 255, 255)";
    this.context.fillRect(0, 0, this.width, this.height);
};

Default2dImageRenderer.prototype.drawScene = function() {
    // drawImage calls already drew it.
};

Default2dImageRenderer.prototype.drawCaps = function(bins) {
    var highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    var currentCapPositions = this.visualizerCanvas.currentCapPositions;
    var gapWidth = this.visualizerCanvas.gapWidth;
    var binSpace = this.visualizerCanvas.binWidth + gapWidth;
    var capSeparator = this.visualizerCanvas.capSeparator;
    var capSourceX = this.visualizerCanvas.source.capX - this.visualizerCanvas.gapWidth;
    var capSourceY = this.visualizerCanvas.source.capY - this.visualizerCanvas.gapWidth;
    var capWidth = this.visualizerCanvas.binWidth + this.visualizerCanvas.gapWidth * 2;
    var capHeight = this.visualizerCanvas.capHeight + this.visualizerCanvas.gapWidth * 2;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var currentCapBasePosition = currentCapPositions[i];
        var x1 = i * binSpace - gapWidth;
        var y1 = (binValue < currentCapBasePosition ? (currentCapBasePosition * highestBinHeight)
                                                  : (binValue * highestBinHeight))|0;
        y1 += capSeparator;
        var x2 = x1 + capWidth;
        var y2 = y2 + capHeight;

        this.context.drawImage(this.image, capSourceX, capSourceY, capWidth, capHeight,
                                           x1, this.height - y1 - capHeight, capWidth, capHeight);
    }
};

Default2dImageRenderer.prototype.drawBins = function(bins) {
    var highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    var binWidth = this.visualizerCanvas.binWidth;
    var gapWidth = this.visualizerCanvas.gapWidth;
    var fullWidth = binWidth + gapWidth * 2;
    var width = binWidth + gapWidth;
    var sourceBinPositions = this.visualizerCanvas.source.binPositions;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var x1 = i * width - gapWidth;
        var y1 = 0;
        var x2 = x1 + fullWidth;
        var y2 = (binValue * highestBinHeight)|0;

        var srcX1 = sourceBinPositions[y2 * 2];
        var srcY1 = sourceBinPositions[y2 * 2 + 1];
        var srcX2 = srcX1 + fullWidth;
        var srcY2 = srcY1 + (highestBinHeight - srcY1);

        this.context.drawImage(this.image, srcX1, srcY1,
                                           fullWidth, highestBinHeight - srcY1,
                                           x1, this.height - y1 - y2,
                                           fullWidth, y2);
    }
};

Default2dImageRenderer.prototype.setDimensions = function(width, height) {
    this.width = width;
    this.height = height;
};

Default2dImageRenderer.prototype.usesHardwareAcceleration = function() {
    return false;
};

Default2dImageRenderer.isSupported = function() {
    return true;
};

module.exports = Default2dImageRenderer;
