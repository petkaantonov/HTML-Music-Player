export default class BufferAllocator {
    constructor(wasm) {
        this._wasm = wasm;
        this._buffer = 0;
        this._bufferSize = 0;
    }

    destroy() {
        const buffer = this._buffer;
        if (buffer) {
            this._buffer = 0;
            this._bufferSize = 0;
            this._wasm.free(buffer);
        }
    }

    getBuffer(byteLength) {
        if (this._buffer) {
            if (byteLength > this._bufferSize) {
                const newBuffer = this._wasm.realloc(this._buffer, byteLength);
                this._buffer = newBuffer;
                this._bufferSize = byteLength;
            }
            return this._buffer;
        } else {
            this._buffer = this._wasm.malloc(byteLength);
            this._bufferSize = byteLength;
            return this._buffer;
        }
    }
}
