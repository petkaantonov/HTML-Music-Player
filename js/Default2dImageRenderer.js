"use strict";


function Default2dImageRenderer(image, canvasVisualizer) {
    this.image = image;
    this.canvasVisualizer = canvasVisualizer;
    this.context = canvasVisualizer.canvas.getContext("2d");
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

Default2dImageRenderer.prototype.draw = function(sourceX, sourceY, sourceWidth, sourceHeight,
                                                          x, y, destWidth, destHeight) {
    this.context.drawImage(this.image, sourceX, sourceY, sourceWidth, sourceHeight,
                                       x, this.height - y - destHeight, sourceWidth, sourceHeight);
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
