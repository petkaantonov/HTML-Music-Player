"use strict";

const VERTEX_SHADER_SOURCE = "                                              \n\
                                                                            \n\
    attribute vec4 aPosition;                                               \n\
    uniform vec2 uTexResolution;                                            \n\
    uniform vec2 uCanvasResolution;                                         \n\
                                                                            \n\
    varying vec2 vTexCoord;                                                 \n\
                                                                            \n\
    void main(void) {                                                       \n\
        gl_Position.xy = aPosition.xy / uCanvasResolution * 2.0 - 1.0;      \n\
        gl_Position.zw = vec2(0.0, 1.0);                                    \n\
        vTexCoord = aPosition.zw / uTexResolution;                          \n\
    }                                                                       \n\
";

const FRAGMENT_SHADER_SOURCE = "                                            \n\
    precision mediump float;                                                \n\
                                                                            \n\
    varying vec2 vTexCoord;                                                 \n\
    uniform sampler2D sTexture;                                             \n\
                                                                            \n\
    void main(void) {                                                       \n\
        gl_FragColor = texture2D(sTexture, vTexCoord);                      \n\
    }                                                                       \n\
";

function getContext(canvas) {
    var gl;
    try {
        gl = canvas.getContext("webgl");
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

function WebGl2dImageRenderer(image, canvasVisualizer) {
    this.gl = getContext(canvasVisualizer.canvas);
    this.image = image;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.program = null;
    this.positionAttribute = null;
    this.texResolution = null;
    this.canvasResolution = null;
    this.sampler = null;
    this.buffer = null;
    this.binSize = 0;
    this.positions = null;
    this.positionIndex = 0;
    this.texture = null;
    this.textureWidth = image.width;
    this.textureHeight = image.height;
    this.width = this.height = 0;
    this.canvasVisualizer = canvasVisualizer;
    this.draws = 0;

    this.contextLost = this.contextLost.bind(this);
    this.contextRestored = this.contextRestored.bind(this);
    this.contextCreationErrored = this.contextCreationErrored.bind(this);
    this.canvasChanged = this.canvasChanged.bind(this);

    this.canvasVisualizer.canvas.addEventListener("webglcontextlost", this.contextLost, false);
    this.canvasVisualizer.canvas.addEventListener("webglcontextrestored", this.contextRestored, false);
    this.canvasVisualizer.canvas.addEventListener("webglcontextcreationerror", this.contextCreationErrored, false);
    this.canvasVisualizer.on("canvasChange", this.canvasChanged);
}

WebGl2dImageRenderer.prototype.contextLost = function(e) {
    e.preventDefault();
};

WebGl2dImageRenderer.prototype.contextRestored = function() {
    this.gl = getContext(this.canvasVisualizer.canvas);
    this.init(this.width, this.height);
};

WebGl2dImageRenderer.prototype.contextCreationErrored = function() {

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
    this.texResolution = gl.getUniformLocation(program, "uTexResolution");
    this.canvasResolution = gl.getUniformLocation(program, "uCanvasResolution");

    gl.enableVertexAttribArray(this.positionAttribute);

    this.buffer = gl.createBuffer();

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

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
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SOURCE_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.sampler, 0);
    gl.uniform2f(this.texResolution, this.textureWidth, this.textureHeight);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.vertexAttribPointer(this.positionAttribute, 4, gl.FLOAT, false, 0, 0);
    this.setDimensions(width, height);
};

WebGl2dImageRenderer.prototype.initScene = function(bins, objectsPerBin) {
    // 1 Object requires 2 triangles.
    // 1 Triangle requires 3 coordinates.
    // 1 Coordinate requires 2 points.
    // All of these are required to be specified both in destination and source. So:
    var requiredLength = (bins.length * objectsPerBin * (3 + 3) * 2 * 2);
    this.binSize = requiredLength;

    if (!this.positions || this.positions.length !== requiredLength) {
        this.positions = new Float32Array(requiredLength);
    }

    this.draws = 0;
    this.positionIndex = 0;
};

WebGl2dImageRenderer.prototype.drawScene = function() {
    var gl = this.gl;
    if (gl.isContextLost()) return;
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.draws * 6);
};

WebGl2dImageRenderer.prototype.draw = function(srcX, srcY, srcWidth, srcHeight,
                                               dstX, dstY, dstWidth, dstHeight) {
    var positionIndex = this.positionIndex;
    var positions = this.positions;

    var srcX2 = (srcX + srcWidth);
    var srcY2 = (srcY + srcHeight);
    var dstX2 = (dstX + dstWidth);
    var dstY2 = (dstY + dstHeight);

    positions[positionIndex++] = dstX;
    positions[positionIndex++] = dstY;
    positions[positionIndex++] = srcX;
    positions[positionIndex++] = srcY2;

    positions[positionIndex++] = dstX2;
    positions[positionIndex++] = dstY;
    positions[positionIndex++] = srcX2;
    positions[positionIndex++] = srcY2;

    positions[positionIndex++] = dstX;
    positions[positionIndex++] = dstY2;
    positions[positionIndex++] = srcX;
    positions[positionIndex++] = srcY;

    positions[positionIndex++] = dstX;
    positions[positionIndex++] = dstY2;
    positions[positionIndex++] = srcX;
    positions[positionIndex++] = srcY;

    positions[positionIndex++] = dstX2;
    positions[positionIndex++] = dstY;
    positions[positionIndex++] = srcX2;
    positions[positionIndex++] = srcY2;

    positions[positionIndex++] = dstX2;
    positions[positionIndex++] = dstY2;
    positions[positionIndex++] = srcX2;
    positions[positionIndex++] = srcY;

    this.positionIndex = positionIndex;
    this.draws++;
};

WebGl2dImageRenderer.prototype.setDimensions = function(width, height) {
    this.width = this.gl.drawingBufferWidth;
    this.height = this.gl.drawingBufferHeight;
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
    this.gl.uniform2f(this.canvasResolution, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
};

module.exports = WebGl2dImageRenderer;

