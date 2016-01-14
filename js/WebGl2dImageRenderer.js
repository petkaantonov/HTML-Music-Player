"use strict";

const VERTEX_SHADER_SOURCE = "                                              \n\
    precision mediump float;                                                \n\
                                                                            \n\
    attribute vec4 aPosition;                                               \n\
    attribute float aAlpha;                                                 \n\
                                                                            \n\
    uniform vec2 uTexResolution;                                            \n\
    uniform vec2 uCanvasResolution;                                         \n\
                                                                            \n\
    varying vec2 vTexCoord;                                                 \n\
    varying float vAlpha;                                                   \n\
                                                                            \n\
    void main(void) {                                                       \n\
        gl_Position.xy = aPosition.xy / uCanvasResolution * 2.0 - 1.0;      \n\
        gl_Position.zw = vec2(0.0, 1.0);                                    \n\
        vTexCoord = aPosition.zw / uTexResolution;                          \n\
        vAlpha = aAlpha;                                                    \n\
    }                                                                       \n\
";

const FRAGMENT_SHADER_SOURCE = "                                            \n\
    precision mediump float;                                                \n\
                                                                            \n\
    varying vec2 vTexCoord;                                                 \n\
    varying float vAlpha;                                                   \n\
    uniform sampler2D sTexture;                                             \n\
                                                                            \n\
    void main(void) {                                                       \n\
        vec4 texColor = texture2D(sTexture, vTexCoord);                     \n\
        gl_FragColor = texColor * vAlpha;                                   \n\
    }                                                                       \n\
";

function getContext(canvas) {
    var gl;
    try {
        gl = canvas.getContext("webgl", {premultipliedAlpha: true});
    } catch (e) {
        gl = null;
    }

    if (gl) return gl;

    try {
        gl = canvas.getContext("experimental-webgl");
    } catch (e) {
        gl = null;
    }

    return gl;
}

function WebGl2dImageRenderer(image, visualizerCanvas) {
    this.visualizerCanvas = visualizerCanvas;
    this.gl = getContext(visualizerCanvas.canvas);
    this.image = image;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.program = null;
    this.positionAttribute = null;
    this.texResolution = null;
    this.canvasResolution = null;
    this.alphaAttribute = null;
    this.sampler = null;
    this.positionBuffer = null;
    this.positions = new Int16Array(this.positionCount());
    // For applying 2 positions for the price of 1.
    this.positionsInt32View = new Int32Array(this.positions.buffer);
    this.alphaBuffer = null;
    this.alphaValues = new Uint8Array(this.alphaCount());
    this.alphaStart = new Uint8Array(this.alphaValues.buffer, this.actuallyChangedAlphaValuesStartIndex());
    for (var i = 0; i < this.alphaValues.length; ++i) {
        this.alphaValues[i] = 255;
    }
    this.positionIndex = 0;
    this.alphaIndex = 0;
    this.texture = null;
    this.textureWidth = image.width;
    this.textureHeight = image.height;
    this.width = this.height = 0;
    this.draws = 0;
    this.capTexturePositionsPopulatedForLength = 0;
    this.contextLostCallbackCalled = false;
    this.contextLostCallbackCheckedTimes = 0;

    this.contextLost = this.contextLost.bind(this);
    this.contextRestored = this.contextRestored.bind(this);
    this.contextCreationErrored = this.contextCreationErrored.bind(this);
    this.canvasChanged = this.canvasChanged.bind(this);

    this.visualizerCanvas.canvas.addEventListener("webglcontextlost", this.contextLost, false);
    this.visualizerCanvas.canvas.addEventListener("webglcontextrestored", this.contextRestored, false);
    this.visualizerCanvas.canvas.addEventListener("webglcontextcreationerror", this.contextCreationErrored, false);
    this.visualizerCanvas.on("canvasChange", this.canvasChanged);
}

WebGl2dImageRenderer.prototype.contextLost = function(e) {
    this.contextLostCallbackCheckedTimes = 0;
    this.contextLostCallbackCalled = true;
    e.preventDefault();
};

WebGl2dImageRenderer.prototype.contextRestored = function() {
    this.contextLostCallbackCheckedTimes = 0;
    this.contextLostCallbackCalled = false;
    this.gl = getContext(this.visualizerCanvas.canvas);
    this.init(this.width, this.height);
};

WebGl2dImageRenderer.prototype.contextCreationErrored = function() {

};

WebGl2dImageRenderer.prototype.destroy = function() {
    this.visualizerCanvas.canvas.removeEventListener("webglcontextlost", this.contextLost, false);
    this.visualizerCanvas.canvas.removeEventListener("webglcontextrestored", this.contextRestored, false);
    this.visualizerCanvas.canvas.removeEventListener("webglcontextcreationerror", this.contextCreationErrored, false);
    this.visualizerCanvas.removeListener("canvasChange", this.canvasChanged);
};

WebGl2dImageRenderer.prototype.canvasChanged = function(newCanvas, oldCanvas) {
    oldCanvas.removeEventListener("webglcontextlost", this.contextLost, false);
    oldCanvas.removeEventListener("webglcontextrestored", this.contextRestored, false);
    oldCanvas.removeEventListener("webglcontextcreationerror", this.contextCreationErrored, false);
    newCanvas.addEventListener("webglcontextlost", this.contextLost, false);
    newCanvas.addEventListener("webglcontextrestored", this.contextRestored, false);
    newCanvas.addEventListener("webglcontextcreationerror", this.contextCreationErrored, false);
};

WebGl2dImageRenderer.isSupported = function() {
    return !!getContext(document.createElement("canvas"));
};

WebGl2dImageRenderer.prototype.usesHardwareAcceleration = function() {
    return true;
};

WebGl2dImageRenderer.prototype.init = function(width, height) {
    var gl = this.gl;
    var maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    if (!gl.isContextLost() && (this.image.width > maxTextureSize ||
        this.image.height > maxTextureSize)) {
        throw new Error("texture size not supported");
    }

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
    gl.compileShader(vertexShader);

    if (!gl.isContextLost() && !gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(vertexShader));
    }
    this.vertexShader = vertexShader;
    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER_SOURCE);

    gl.compileShader(fragmentShader);

    if (!gl.isContextLost() && !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(fragmentShader));
    }
    this.fragmentShader = fragmentShader;
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.isContextLost() && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("link error");
    }
    this.program = program;
    gl.useProgram(program);

    this.sampler = gl.getUniformLocation(program, "sTexture");
    this.positionAttribute = gl.getAttribLocation(program, "aPosition");
    this.alphaAttribute = gl.getAttribLocation(program, "aAlpha");
    this.texResolution = gl.getUniformLocation(program, "uTexResolution");
    this.canvasResolution = gl.getUniformLocation(program, "uCanvasResolution");

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionAttribute);
    gl.vertexAttribPointer(this.positionAttribute, 4, gl.SHORT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, this.positionCount() * 2, gl.STREAM_DRAW);

    this.alphaBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    gl.enableVertexAttribArray(this.alphaAttribute);
    gl.vertexAttribPointer(this.alphaAttribute, 1, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, this.alphaCount() * 1, gl.STREAM_DRAW);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.alphaValues);

    var texture = gl.createTexture();
    this.texture = texture;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.clearColor(1, 1, 1, 1);
    gl.clearDepth(1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SOURCE_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.sampler, 0);
    gl.uniform2f(this.texResolution, this.textureWidth, this.textureHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.setDimensions(width, height);
};

WebGl2dImageRenderer.prototype.reinitBrokenCanvas = function() {
    this.visualizerCanvas.resetCanvas();
    this.gl = getContext(this.visualizerCanvas.canvas);
    if (!this.gl) {
        this.visualizerCanvas.useSoftwareRenderer();
    } else {
        this.init(this.width, this.height);
    }
};

WebGl2dImageRenderer.prototype.initScene = function() {
    this.draws = 0;
    this.positionIndex = 0;
    this.alphaIndex = 0;
};

WebGl2dImageRenderer.prototype.drawScene = function() {
    var gl = this.gl;
    if (!gl) {
        return this.reinitBrokenCanvas();
    }

    if (gl.isContextLost()) {
        if (!this.contextLostCallbackCalled) {
            this.contextLostCallbackCheckedTimes++;
            if (this.contextLostCallbackCheckedTimes > 5) {
                this.contextLostCallbackCheckedTimes = 0;
                this.reinitBrokenCanvas();
            }
        }
        return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, this.actuallyChangedAlphaValuesStartIndex(), this.alphaStart);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);

    gl.drawArrays(gl.TRIANGLES, 0, this.draws * 6);
};

WebGl2dImageRenderer.prototype.populateCapTexturePositions = function(bins) {
    if (this.capTexturePositionsPopulatedForLength !== bins.length) {
        var capSourceX = this.visualizerCanvas.source.capX - this.visualizerCanvas.gapWidth;
        var capSourceY = this.visualizerCanvas.source.capY - this.visualizerCanvas.gapWidth;
        var capWidth = this.visualizerCanvas.binWidth + this.visualizerCanvas.gapWidth * 2;
        var capHeight = this.visualizerCanvas.capHeight + this.visualizerCanvas.gapWidth * 2;

        this.capTexturePositionsPopulatedForLength = bins.length;
        var positions = this.positions;
        var j = 0;

        for (var i = 0; i < bins.length; ++i) {
            positions[j + 2] = capSourceX;
            positions[j + 3] = capSourceY + capHeight;
            positions[j + 6] = capSourceX + capWidth;
            positions[j + 7] = capSourceY + capHeight;
            positions[j + 10] = capSourceX;
            positions[j + 11] = capSourceY;
            positions[j + 14] = capSourceX;
            positions[j + 15] = capSourceY;
            positions[j + 18] = capSourceX + capWidth;
            positions[j + 19] = capSourceY + capHeight;
            positions[j + 22] = capSourceX + capWidth;
            positions[j + 23] = capSourceY;

            j += 24;
        }
    }
};

WebGl2dImageRenderer.prototype.drawCaps = function(bins) {
    if (this.positionIndex !== 0) throw new Error("caps must be drawn first");
    this.populateCapTexturePositions(bins);
    var highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    var currentCapPositions = this.visualizerCanvas.currentCapPositions;
    var gapWidth = this.visualizerCanvas.gapWidth;
    var binSpace = this.visualizerCanvas.binWidth + gapWidth;
    var capSeparator = this.visualizerCanvas.capSeparator;
    var capWidth = this.visualizerCanvas.binWidth + this.visualizerCanvas.gapWidth * 2;
    var capHeight = this.visualizerCanvas.capHeight + this.visualizerCanvas.gapWidth * 2;

    var positions = this.positions;
    var j = 0;
    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var currentCapBasePosition = currentCapPositions[i];
        var x1 = i * binSpace - gapWidth;
        var y1 = (binValue < currentCapBasePosition ? (currentCapBasePosition * highestBinHeight)
                                                  : (binValue * highestBinHeight))|0;
        y1 += capSeparator;
        var x2 = x1 + capWidth;
        var y2 = y1 + capHeight;

        positions[j + 0] = x1;
        positions[j + 1] = y1;
        positions[j + 4] = x2;
        positions[j + 5] = y1;
        positions[j + 8] = x1;
        positions[j + 9] = y2;
        positions[j + 12] = x1;
        positions[j + 13] = y2;
        positions[j + 16] = x2;
        positions[j + 17] = y1;
        positions[j + 20] = x2;
        positions[j + 21] = y2;
        
        j += 24;
    }

    this.positionIndex = j;
    this.alphaIndex += bins.length * 6;
    this.draws += bins.length;
};

WebGl2dImageRenderer.prototype.drawBins = function(bins) {
    var positions = this.positionsInt32View;
    var j = this.positionIndex / 2;

    var highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    var binWidth = this.visualizerCanvas.binWidth;
    var gapWidth = this.visualizerCanvas.gapWidth;
    var fullWidth = binWidth + gapWidth * 2;
    var width = binWidth + gapWidth;
    var sourceBinPositions = this.visualizerCanvas.source.binPositions;
    // TODO: this is actually sourceRowHeight.
    var canvasHeight = this.height;

    for (var i = 0; i < bins.length; ++i) {
        var binValue = bins[i];
        var x1 = i * width - gapWidth;
        var y1 = 0;
        var x2 = x1 + fullWidth;
        var y2 = (binValue * highestBinHeight)|0;
        var srcX1 = sourceBinPositions[y2 * 2];
        var srcY1 = sourceBinPositions[y2 * 2 + 1];
        var srcX2 = srcX1 + fullWidth;
        var srcY2 = srcY1 + (highestBinHeight - (srcY1 % canvasHeight));

        // TODO: This assumes little-endian.
        positions[j + 0] = (x1 & 0xFFFF) | (y1 << 16);
        positions[j + 1] = (srcX1 & 0xFFFF) | (srcY2 << 16);
        positions[j + 2] = (x2 & 0xFFFF) | (y1 << 16);
        positions[j + 3] = (srcX2 & 0xFFFF) | (srcY2 << 16);
        positions[j + 4] = (x1 & 0xFFFF) | (y2 << 16);
        positions[j + 5] = (srcX1 & 0xFFFF) | (srcY1 << 16);
        positions[j + 6] = (x1 & 0xFFFF) | (y2 << 16);
        positions[j + 7] = (srcX1 & 0xFFFF) | (srcY1 << 16);
        positions[j + 8] = (x2 & 0xFFFF) | (y1 << 16);
        positions[j + 9] = (srcX2 & 0xFFFF) | (srcY2 << 16);
        positions[j + 10] = (x2 & 0xFFFF) | (y2 << 16);
        positions[j + 11] = (srcX2 & 0xFFFF) | (srcY1 << 16);
        j += 12;
    }

    this.positionIndex = j * 2;
    this.alphaIndex += bins.length * 6;
    this.draws += bins.length;
};

WebGl2dImageRenderer.prototype.positionCount = function() {
    var numBins = this.visualizerCanvas.getMaxBins();
    var objectsPerBin = this.visualizerCanvas.objectsPerBin();
    return (numBins * objectsPerBin * (3 + 3) * 2 * 2);
};

WebGl2dImageRenderer.prototype.alphaCount = function() {
    return this.positionCount() / 4;
};

WebGl2dImageRenderer.prototype.actuallyChangedAlphaValuesStartIndex = function() {
    return this.alphaCount() / 3 * 2;
};

WebGl2dImageRenderer.prototype.setDimensions = function(width, height) {
    this.width = this.gl.drawingBufferWidth;
    this.height = this.gl.drawingBufferHeight;
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.uniform2f(this.canvasResolution, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
};

module.exports = WebGl2dImageRenderer;

