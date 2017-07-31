import {Symbol} from "platform/platform";
import {moduleEvents} from "wasm/WebAssemblyWrapper";

const FILTER_COEFFS = 5;
const FLOAT_BYTE_SIZE = 4;

export const equalizerBands = [
    [70, `lowshelf`],
    [180, `peaking`],
    [320, `peaking`],
    [600, `peaking`],
    [1000, `peaking`],
    [3000, `peaking`],
    [6000, `peaking`],
    [12000, `peaking`],
    [14000, `peaking`],
    [16000, `highshelf`]
];

export const equalizerPresets = {
    "None": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Classical": [-1, -1, -1, -1, -1, -1, -7, -7, -7, -9],
    "Club": [-1, -1, 8, 5, 5, 5, 3, -1, -1, -1],
    "Dance": [9, 7, 2, -1, -1, -5, -7, -7, -1, -1],
    "Full Bass": [-8, 9, 9, 5, 1, -4, -8, -10, -11, -11],
    "Full Bass & Treble": [7, 5, -1, -7, -4, 1, 8, 11, 12, 12],
    "Full Treble": [-9, -9, -9, -4, 2, 11, 12, 12, 12, 12],
    "Laptop Speakers / Headphone": [4, 11, 5, -3, -2, 1, 4, 9, 12, 12],
    "Large Hall": [10, 10, 5, 5, -1, -4, -4, -4, -1, -1],
    "Live": [-4, -1, 4, 5, 5, 5, 4, 2, 2, 2],
    "Party": [7, 7, -1, -1, -1, -1, -1, -1, 7, 7],
    "Pop": [-1, 4, 7, 8, 5, -1, -2, -2, -1, -1],
    "Reggae": [-1, -1, -1, -5, -1, 6, 6, -1, -1, -1],
    "Rock": [8, 4, -5, -8, -3, 4, 8, 11, 11, 11],
    "Ska": [-2, -4, -4, -1, 4, 5, 8, 9, 11, 9],
    "Soft": [4, 1, -1, -2, -1, 4, 8, 9, 11, 12],
    "Soft Rock": [4, 4, 2, -1, -4, -5, -3, -1, 2, 8],
    "Techno": [8, 5, -1, -5, -4, -1, 8, 9, 9, 8]
};

function writeBandParam(type, frequency, gain, sampleRate, basePtr, index, wasm) {
    let a0, a1, a2, b0, b1, b2;
    const A = Math.pow(10, gain / 40);
    const w0 = Math.PI * 2 * frequency / sampleRate;
    const S = 1;
    const alphaS = 0.5 * Math.sin(w0) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const alphaQ = Math.sin(w0) / 2;
    const k = Math.cos(w0);
    const k2 = 2 * Math.sqrt(A) * alphaS;
    const aPlusOne = A + 1;
    const aMinusOne = A - 1;
    if (type === `lowshelf`) {
        b0 = A * (aPlusOne - aMinusOne * k + k2);
        b1 = 2 * A * (aMinusOne - aPlusOne * k);
        b2 = A * (aPlusOne - aMinusOne * k - k2);
        a0 = aPlusOne + aMinusOne * k + k2;
        a1 = -2 * (aMinusOne + aPlusOne * k);
        a2 = aPlusOne + aMinusOne * k - k2;
    } else if (type === `highshelf`) {
        b0 = A * (aPlusOne + aMinusOne * k + k2);
        b1 = -2 * A * (aMinusOne + aPlusOne * k);
        b2 = A * (aPlusOne + aMinusOne * k - k2);
        a0 = aPlusOne - aMinusOne * k + k2;
        a1 = 2 * (aMinusOne - aPlusOne * k);
        a2 = aPlusOne - aMinusOne * k - k2;
    } else {
        b0 = 1 + alphaQ * A;
        b1 = -2 * k;
        b2 = 1 - alphaQ * A;
        a0 = 1 + alphaQ / A;
        a1 = -2 * k;
        a2 = 1 - alphaQ / A;
    }
    a1 *= (1 / a0);
    a2 *= (1 / a0);
    b0 *= (1 / a0);
    b1 *= (1 / a0);
    b2 *= (1 / a0);

    const out = wasm.f32view(basePtr + index * 6 * FLOAT_BYTE_SIZE, 6);
    out[0] = gain;
    out[1] = a1;
    out[2] = a2;
    out[3] = b0;
    out[4] = b1;
    out[5] = b2;
}

const DEFAULT_EQUALIZER_GAINS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

let effects_noise_sharpening, effects_equalizer_apply, effects_equalizer_reset;
export default class Effects {
    constructor(wasm) {
        this._wasm = wasm;
        this._equalizerParamPtr = wasm.malloc((FILTER_COEFFS + 1) * equalizerBands.length * FLOAT_BYTE_SIZE);

        this._effects = {
            "noise-sharpening": {
                effectSize: 0,
                apply(effects, samplePtr, byteLength, {channelCount}) {
                    if (this.effectSize > 0) {
                        effects_noise_sharpening(this.effectSize, channelCount, samplePtr, byteLength);
                    }
                    return {samplePtr, byteLength};
                },

                _applySpec(spec = null) {
                    this.effectSize = spec ? spec.effectSize : 0;
                }
            },
            "equalizer": {
                isEffective: false,
                isDirty: true,
                writtenForSampleRate: 0,
                gains: DEFAULT_EQUALIZER_GAINS,
                apply(effects, samplePtr, byteLength, {channelCount, sampleRate}) {
                    if (!this.isEffective) {
                        return {samplePtr, byteLength};
                    }

                    if (this.isDirty || this.writtenForSampleRate !== sampleRate) {
                        const {gains} = this;
                        for (let index = 0; index < gains.length; ++index) {
                            const gain = gains[index];
                            const [frequency, type] = equalizerBands[index];
                            writeBandParam(type, frequency, gain, sampleRate, effects._equalizerParamPtr, index, effects._wasm);
                        }
                        this.isDirty = false;
                        this.writtenForSampleRate = sampleRate;
                    }

                    effects_equalizer_apply(samplePtr, byteLength, channelCount, effects._equalizerParamPtr);
                    return {samplePtr, byteLength};
                },

                _applySpec(spec = null) {
                    if (!spec) {
                        this.gains = DEFAULT_EQUALIZER_GAINS;
                        this.isEffective = false;
                    }
                    const {gains} = spec;
                    this.gains = gains;
                    let isEffective = false;
                    for (let i = 0; i < gains.length; ++i) {
                        if (gains[i] !== 0) {
                            isEffective = true;
                            break;
                        }
                    }
                    this.isEffective = isEffective;
                    effects_equalizer_reset();
                    this.isDirty = true;
                }
            }
        };
        this._effectNames = Object.keys(this._effects);
    }

    * [Symbol.iterator]() {
        for (let i = 0; i < this._effectNames.length; ++i) {
            yield this._effects[this._effectNames[i]];
        }
    }

    setEffects(spec = []) {
        for (const specEffect of spec) {
            this._effects[specEffect.name]._applySpec(specEffect);
        }
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    ({effects_noise_sharpening, effects_equalizer_apply, effects_equalizer_reset} = exports);
});
