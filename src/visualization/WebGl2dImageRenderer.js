

import {Int16Array, Int32Array, Uint8Array} from "platform/platform";

const VERTEX_SHADER_SOURCE = `
    precision mediump float;

    attribute vec4 aPosition;
    attribute float aAlpha;

    uniform vec2 uTexResolution;
    uniform vec2 uCanvasResolution;

    varying vec2 vTexCoord;
    varying float vAlpha;

    void main(void) {
        gl_Position.xy = aPosition.xy / uCanvasResolution * 2.0 - 1.0;
        gl_Position.zw = vec2(0.0, 1.0);
        vTexCoord = aPosition.zw / uTexResolution;
        vAlpha = aAlpha;
    }
`;

const FRAGMENT_SHADER_SOURCE = `
    precision mediump float;

    varying vec2 vTexCoord;
    varying float vAlpha;
    uniform sampler2D sTexture;

    void main(void) {
        vec4 texColor = texture2D(sTexture, vTexCoord);
        gl_FragColor = texColor * vAlpha;
    }
`;

function getContext(canvas) {
    let gl;
    try {
        gl = canvas.getContext(`webgl`, {premultipliedAlpha: true, alpha: false});
    } catch (e) {
        gl = null;
    }

    if (gl) return gl;

    try {
        gl = canvas.getContext(`experimental-webgl`, {premultipliedAlpha: true, alpha: false});
    } catch (e) {
        gl = null;
    }

    return gl;
}

export default function WebGl2dImageRenderer(image, visualizerCanvas) {
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
    for (let i = 0; i < this.alphaValues.length; ++i) {
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

    this.visualizerCanvas.canvas.addEventListener(`webglcontextlost`, this.contextLost, false);
    this.visualizerCanvas.canvas.addEventListener(`webglcontextrestored`, this.contextRestored, false);
    this.visualizerCanvas.canvas.addEventListener(`webglcontextcreationerror`, this.contextCreationErrored, false);
    this.visualizerCanvas.on(`canvasChange`, this.canvasChanged);
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
    // Noop
};

WebGl2dImageRenderer.prototype.destroy = function() {
    this.visualizerCanvas.canvas.removeEventListener(`webglcontextlost`, this.contextLost, false);
    this.visualizerCanvas.canvas.removeEventListener(`webglcontextrestored`, this.contextRestored, false);
    this.visualizerCanvas.canvas.removeEventListener(`webglcontextcreationerror`, this.contextCreationErrored, false);
    this.visualizerCanvas.removeListener(`canvasChange`, this.canvasChanged);
};

WebGl2dImageRenderer.prototype.canvasChanged = function(newCanvas, oldCanvas) {
    oldCanvas.removeEventListener(`webglcontextlost`, this.contextLost, false);
    oldCanvas.removeEventListener(`webglcontextrestored`, this.contextRestored, false);
    oldCanvas.removeEventListener(`webglcontextcreationerror`, this.contextCreationErrored, false);
    newCanvas.addEventListener(`webglcontextlost`, this.contextLost, false);
    newCanvas.addEventListener(`webglcontextrestored`, this.contextRestored, false);
    newCanvas.addEventListener(`webglcontextcreationerror`, this.contextCreationErrored, false);
};

WebGl2dImageRenderer.isSupported = function(document) {
    return !!getContext(document.createElement(`canvas`));
};

WebGl2dImageRenderer.prototype.usesHardwareAcceleration = function() {
    return true;
};

WebGl2dImageRenderer.prototype.init = function(width, height) {
    const {gl} = this;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    if (!gl.isContextLost() && (this.image.width > maxTextureSize ||
        this.image.height > maxTextureSize)) {
        throw new Error(`texture size not supported`);
    }

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, VERTEX_SHADER_SOURCE);
    gl.compileShader(vertexShader);

    if (!gl.isContextLost() && !gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(vertexShader));
    }
    this.vertexShader = vertexShader;
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, FRAGMENT_SHADER_SOURCE);

    gl.compileShader(fragmentShader);

    if (!gl.isContextLost() && !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(fragmentShader));
    }
    this.fragmentShader = fragmentShader;
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.isContextLost() && !gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`link error`);
    }
    this.program = program;
    gl.useProgram(program);

    this.sampler = gl.getUniformLocation(program, `sTexture`);
    this.positionAttribute = gl.getAttribLocation(program, `aPosition`);
    this.alphaAttribute = gl.getAttribLocation(program, `aAlpha`);
    this.texResolution = gl.getUniformLocation(program, `uTexResolution`);
    this.canvasResolution = gl.getUniformLocation(program, `uCanvasResolution`);

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

    const texture = gl.createTexture();
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
    const {gl} = this;
    if (!gl) {
        this.reinitBrokenCanvas();
        return;
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
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if (this.draws > 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.alphaBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, this.actuallyChangedAlphaValuesStartIndex(), this.alphaStart);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);

        gl.drawArrays(gl.TRIANGLES, 0, this.draws * 6);
    }
};

WebGl2dImageRenderer.prototype.populateCapTexturePositions = function(bins) {
    if (this.capTexturePositionsPopulatedForLength !== bins.length) {
        const capSourceX = this.visualizerCanvas.source.capX - this.visualizerCanvas.gapWidth;
        const capSourceY = this.visualizerCanvas.source.capY - this.visualizerCanvas.gapWidth;
        const capWidth = this.visualizerCanvas.binWidth + this.visualizerCanvas.gapWidth * 2;
        const capHeight = this.visualizerCanvas.capHeight + this.visualizerCanvas.gapWidth * 2;

        this.capTexturePositionsPopulatedForLength = bins.length;
        const {positions} = this;
        let j = 0;

        for (let i = 0; i < bins.length; ++i) {
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
    if (this.positionIndex !== 0) throw new Error(`caps must be drawn first`);
    this.populateCapTexturePositions(bins);
    const highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    const {currentCapPositions, gapWidth, capSeparator, binWidth} = this.visualizerCanvas;
    const {positions} = this;
    const binSpace = binWidth + gapWidth;
    const capWidth = binWidth + gapWidth * 2;
    const capHeight = this.visualizerCanvas.capHeight + gapWidth * 2;

    let j = 0;
    for (let i = 0; i < bins.length; ++i) {
        const binValue = bins[i];
        const currentCapBasePosition = currentCapPositions[i];
        const x1 = i * binSpace - gapWidth;
        let y1 = (binValue < currentCapBasePosition ? (currentCapBasePosition * highestBinHeight)
                                                    : (binValue * highestBinHeight)) | 0;
        y1 += capSeparator;
        const x2 = x1 + capWidth;
        const y2 = y1 + capHeight;

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
    const positions = this.positionsInt32View;
    let j = this.positionIndex / 2;

    const highestBinHeight = this.visualizerCanvas.getHighestBinHeight();
    const {binWidth, gapWidth} = this.visualizerCanvas;
    const fullWidth = binWidth + gapWidth * 2;
    const width = binWidth + gapWidth;
    const sourceBinPositions = this.visualizerCanvas.source.binPositions;
    // TODO: this is actually sourceRowHeight.
    const canvasHeight = this.height;

    for (let i = 0; i < bins.length; ++i) {
        const binValue = bins[i];
        const x1 = i * width - gapWidth;
        const y1 = 0;
        const x2 = x1 + fullWidth;
        const y2 = (binValue * highestBinHeight) | 0;
        const srcX1 = sourceBinPositions[y2 * 2];
        const srcY1 = sourceBinPositions[y2 * 2 + 1];
        const srcX2 = srcX1 + fullWidth;
        const srcY2 = srcY1 + (highestBinHeight - (srcY1 % canvasHeight));

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
    const numBins = this.visualizerCanvas.getMaxBins();
    const objectsPerBin = this.visualizerCanvas.objectsPerBin();
    return (numBins * objectsPerBin * (3 + 3) * 2 * 2);
};

WebGl2dImageRenderer.prototype.alphaCount = function() {
    return this.positionCount() / 4;
};

WebGl2dImageRenderer.prototype.actuallyChangedAlphaValuesStartIndex = function() {
    return this.alphaCount() / 3 * 2;
};

WebGl2dImageRenderer.prototype.setDimensions = function() {
    this.width = this.gl.drawingBufferWidth;
    this.height = this.gl.drawingBufferHeight;
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.uniform2f(this.canvasResolution, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
};
