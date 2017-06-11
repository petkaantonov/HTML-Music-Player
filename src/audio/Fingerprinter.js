import {moduleEvents} from "wasm/WebAssemblyWrapper";

const I16_BYTE_LENGTH = 2;
const FINGERPRINT_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_CHANNELS = 1;

export default class Fingerprinter {
    constructor(wasm) {
        this._wasm = wasm;
        this._ptr = this.chromaprint_create();
        if (!this._ptr) {
            throw new Error(`malloc failed`);
        }
        this.resamplerQuality = FINGERPRINT_RESAMPLER_QUALITY;
        this.destinationChannelCount = FINGERPRINT_CHANNELS;
        this.destinationSampleRate = FINGERPRINT_SAMPLE_RATE;
    }

    newFrames(samplePtr, byteLength) {
        this.chromaprint_add_samples(this._ptr, samplePtr, byteLength / I16_BYTE_LENGTH);
    }

    needFrames() {
        return !!this.chromaprint_needs_samples(this._ptr);
    }

    destroy() {
        if (this._ptr) {
            console.log(`freeing`, this._ptr);
            this.chromaprint_destroy(this._ptr);
            this._ptr = 0;
        }
    }

    calculateFingerprint() {
        if (!this.chromaprint_can_calculate(this._ptr)) {
            throw new Error(`not enough samples to calculate fingerprint`);
        }

        const [err, fingerprint] = this.chromaprint_calculate_fingerprint(this._ptr);
        debugger;
        if (err) {
            throw new Error(`chromaprint err: ${err}`);
        }
        return fingerprint;
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    Fingerprinter.prototype.chromaprint_create = exports.chromaprint_create;
    Fingerprinter.prototype.chromaprint_destroy = exports.chromaprint_destroy;
    Fingerprinter.prototype.chromaprint_add_samples = exports.chromaprint_add_samples;
    Fingerprinter.prototype.chromaprint_needs_samples = exports.chromaprint_needs_samples;
    Fingerprinter.prototype.chromaprint_can_calculate = exports.chromaprint_can_calculate;
    Fingerprinter.prototype.chromaprint_calculate_fingerprint = wasm.createFunctionWrapper({
        name: `chromaprint_calculate_fingerprint`,
        unsafeJsStack: true
    }, `integer`, `string-retval`);
});
