import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";

import { ChannelCount } from "./ChannelMixer";

const FLOAT_BYTE_LENGTH = 4;
const FINGERPRINT_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_CHANNELS = 1;

export default class Fingerprinter {
    _wasm: WebAssemblyWrapper;
    _ptr: number;
    resamplerQuality: number;
    destinationChannelCount: ChannelCount;
    destinationSampleRate: number;
    constructor(wasm: WebAssemblyWrapper) {
        this._wasm = wasm;
        this._ptr = this.chromaprint_create();
        if (!this._ptr) {
            throw new Error(`malloc failed`);
        }
        this.resamplerQuality = FINGERPRINT_RESAMPLER_QUALITY;
        this.destinationChannelCount = FINGERPRINT_CHANNELS;
        this.destinationSampleRate = FINGERPRINT_SAMPLE_RATE;
    }

    newFrames(samplePtr: number, byteLength: number) {
        const err = this.chromaprint_add_samples(this._ptr, samplePtr, byteLength / FLOAT_BYTE_LENGTH);
        if (err) {
            if (err !== 3) {
                throw new Error(`chromaprint error ${err}
                            chromaprint_add_samples(${this._ptr}, ${samplePtr}, ${byteLength / FLOAT_BYTE_LENGTH})
                            state:
                                    frames_processed:  ${this._wasm.u32(this._ptr + 0)}
                                    note_buffer_index: ${this._wasm.u32(this._ptr + 4)}
                                    coeff: ${this._wasm.u32(this._ptr + 8)}
                                    row: ${this._wasm.u32(this._ptr + 12)}
                                    bits_index: ${this._wasm.u32(this._ptr + 16)}
                                    tmp_length: ${this._wasm.u32(this._ptr + 20)}`);
            }
        }
    }

    needFrames() {
        return !!this.chromaprint_needs_samples(this._ptr);
    }

    destroy() {
        if (this._ptr) {
            this.chromaprint_destroy(this._ptr);
            this._ptr = 0;
        }
    }

    calculateFingerprint() {
        if (!this.chromaprint_can_calculate(this._ptr)) {
            throw new Error(`not enough samples to calculate fingerprint`);
        }

        const [err, fingerprint] = this.chromaprint_calculate_fingerprint(this._ptr);

        if (err) {
            throw new Error(`chromaprint err: ${err}`);
        }
        return fingerprint;
    }
}

export default interface Fingerprinter {
    chromaprint_create: () => number;
    chromaprint_destroy: (ptr: number) => void;
    chromaprint_add_samples: (ptr: number, samplesPtr: number, length: number) => number;
    chromaprint_needs_samples: (ptr: number) => number;
    chromaprint_can_calculate: (ptr: number) => number;
    chromaprint_calculate_fingerprint: (ptr: number) => [number, string];
}

moduleEvents.on(`general_afterInitialized`, (wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) => {
    Fingerprinter.prototype.chromaprint_create = exports.chromaprint_create as any;
    Fingerprinter.prototype.chromaprint_destroy = exports.chromaprint_destroy as any;
    Fingerprinter.prototype.chromaprint_add_samples = exports.chromaprint_add_samples as any;
    Fingerprinter.prototype.chromaprint_needs_samples = exports.chromaprint_needs_samples as any;
    Fingerprinter.prototype.chromaprint_can_calculate = exports.chromaprint_can_calculate as any;
    Fingerprinter.prototype.chromaprint_calculate_fingerprint = wasm.createFunctionWrapper(
        {
            name: `chromaprint_calculate_fingerprint`,
            unsafeJsStack: true,
        },
        `pointer`,
        `string-retval`
    );
});
