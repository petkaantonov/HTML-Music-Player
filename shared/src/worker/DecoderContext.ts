import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";

export interface SeekResult {
    frame: number;
    samplesToSkip: number;
}

export type FlushCallback = (samplePtr: number, byteLength: number) => void;

let autoIncrementId = 0;
export default abstract class DecoderContext<T extends SeekResult> {
    _wasm: WebAssemblyWrapper;
    _id: number;
    _started: boolean;
    _channelCount: number;
    _sampleRate: number;
    _targetBufferLengthAudioFrames: number;
    abstract targetBufferLengthChanged(): void;
    constructor(wasm: WebAssemblyWrapper) {
        this._wasm = wasm;
        this._id = autoIncrementId++;
        this._started = false;
        this._channelCount = -1;
        this._sampleRate = -1;
        this._targetBufferLengthAudioFrames = 0;
    }

    get channelCount() {
        if (this._channelCount === -1) {
            throw new Error(`channelCount has not been set`);
        }
        return this._channelCount;
    }

    get sampleRate() {
        if (this._sampleRate === -1) {
            throw new Error(`sampleRate has not been set`);
        }
        return this._sampleRate;
    }

    get id() {
        return this._id;
    }

    get targetBufferLengthAudioFrames() {
        return this._targetBufferLengthAudioFrames;
    }

    set targetBufferLengthAudioFrames(val) {
        this._targetBufferLengthAudioFrames = Math.ceil(val) >>> 0;
        this.targetBufferLengthChanged();
    }

    hasEstablishedMetadata() {
        return this._channelCount !== -1;
    }

    getCurrentAudioFrame() {
        throw new Error(`Error: getCurrentAudioFrame() not implemented by ${this.constructor.name}`);
    }

    start() {
        if (this._started) throw new Error(`previous decoding in session, call .end()`);
        this._started = true;
    }

    isStarted() {
        return this._started;
    }

    end() {
        if (!this._started) {
            return false;
        }
        this._started = false;
        return true;
    }

    establishChannelCount(channelCount: number) {
        if (this._channelCount !== -1) {
            throw new Error(`channelCount already established`);
        }
        if (channelCount <= 0) {
            throw new Error(`cannot establish channelCount to invalid value`);
        }
        this._channelCount = channelCount;
    }

    establishSampleRate(sampleRate: number) {
        if (this._sampleRate !== -1) {
            throw new Error(`sampleRate already established`);
        }
        if (sampleRate <= 0) {
            throw new Error(`cannot establish sampleRate to invalid value`);
        }
        this._sampleRate = sampleRate;
    }

    decodeUntilFlush(_src: Uint8Array, _flushCallback: FlushCallback) {
        if (!this._started)
            throw new Error(`call .start() before calling decode
                                                ${this.id} ${this.channelCount} ${this.sampleRate}`);
    }

    applySeek(_seekResult: T) {
        if (!this._started) throw new Error(`cannot apply seek to unstarted context`);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    _flush(_ptr: number, _byteLength: number, _callback: (ptr: number, byteLength: number) => void) {}

    _resetState() {
        this._started = false;
        this._channelCount = -1;
        this._sampleRate = -1;
    }

    _error(message = `decoder error`) {
        this._resetState();
        throw new Error(message);
    }
}
