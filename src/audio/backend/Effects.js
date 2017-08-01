import {Symbol} from "platform/platform";
import {moduleEvents} from "wasm/WebAssemblyWrapper";

const FILTER_COEFFS = 5;
const DOUBLE_BYTE_SIZE = 8;

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
    "Classical": [0, 0, 0, 0, 0, 0, -4.64516129032258, -4.64516129032258, -4.64516129032258, -6.193548387096774],
    "Club": [0,0,1.935483870967742,3.483870967741936,3.483870967741936,3.483870967741936,1.935483870967742,0,0,0],
    "Dance": [5.806451612903226,4.258064516129032,1.161290322580645,0,0,-3.870967741935484,-4.64516129032258,-4.64516129032258,0,0],
    "Full Bass": [5.806451612903226,5.806451612903226,5.806451612903226,3.483870967741936,0.7741935483870968,-2.7096774193548385,-5.419354838709677,-6.580645161290322,-6.967741935483872,-6.967741935483872],
    "Full Bass & Treble": [4.258064516129032,3.483870967741936,0,-4.64516129032258,-3.096774193548387,0.7741935483870968,5.032258064516129,6.580645161290322,7.35483870967742,7.35483870967742],
    "Full Treble": [-6.193548387096774,-6.193548387096774,-6.193548387096774,-2.7096774193548385,1.5483870967741935,6.580645161290322,9.677419354838708,9.677419354838708,9.677419354838708,10.451612903225806],
    "Laptop Speakers / Headphone": [2.7096774193548385,6.580645161290322,3.096774193548387,-2.32258064516129,-1.5483870967741935,0.7741935483870968,2.7096774193548385,5.806451612903226,7.741935483870968,8.903225806451612],
    "Large Hall": [6.193548387096774,6.193548387096774,3.483870967741936,3.483870967741936,0,-3.096774193548387,-3.096774193548387,-3.096774193548387,0,0],
    "Live": [-3.096774193548387,0,2.32258064516129,3.096774193548387,3.483870967741936,3.483870967741936,2.32258064516129,1.5483870967741935,1.5483870967741935,1.161290322580645],
    "Party": [4.258064516129032,4.258064516129032,0,0,0,0,0,0,4.258064516129032,4.258064516129032],
    "Pop": [-1.161290322580645,2.7096774193548385,4.258064516129032,4.64516129032258,3.096774193548387,-0.7741935483870968,-1.5483870967741935,-1.5483870967741935,-1.161290322580645,-1.161290322580645],
    "Reggae": [0,0,-0.3870967741935484,-3.870967741935484,0,3.870967741935484,3.870967741935484,0,0,0],
    "Rock": [4.64516129032258,2.7096774193548385,-3.483870967741936,-5.032258064516129,-2.32258064516129,2.32258064516129,5.419354838709677,6.580645161290322,6.580645161290322,6.580645161290322],
    "Ska": [-1.5483870967741935,-3.096774193548387,-2.7096774193548385,-0.3870967741935484,2.32258064516129,3.483870967741936,5.419354838709677,5.806451612903226,6.580645161290322,5.806451612903226],
    "Soft": [2.7096774193548385,0.7741935483870968,-0.7741935483870968,-1.5483870967741935,-0.7741935483870968,2.32258064516129,5.032258064516129,5.806451612903226,6.580645161290322,7.35483870967742],
    "Soft Rock": [2.32258064516129,2.32258064516129,1.161290322580645,-0.3870967741935484,-2.7096774193548385,-3.483870967741936,-2.32258064516129,-0.3870967741935484,1.5483870967741935,5.419354838709677],
    "Techno": [4.64516129032258,3.483870967741936,0,-3.483870967741936,-3.096774193548387,0,4.64516129032258,5.806451612903226,5.806451612903226,5.419354838709677]
};

function writeBandParam(type, frequency, gain, sampleRate, basePtr, index, wasm) {
    let a0, a1, a2, b0, b1, b2;
    const Q = Math.sqrt(2) * 2;
    const A = Math.pow(10, gain / 40);
    const w0 = Math.PI * 2 * frequency / sampleRate;
    const S = 1;
    const alphaS = 0.5 * Math.sin(w0) * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
    const alphaQ = Math.sin(w0) / (2 * Q);
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

    b0 /= a0;
    b1 /= a0;
    b2 /= a0;
    a1 /= a0;
    a2 /= a0;

    const out = wasm.f64view(basePtr + index * FILTER_COEFFS * DOUBLE_BYTE_SIZE, FILTER_COEFFS);
    out[0] = b0;
    out[1] = b1;
    out[2] = b2;
    out[3] = a1;
    out[4] = a2;
}

const DEFAULT_EQUALIZER_GAINS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

let effects_noise_sharpening, effects_equalizer_apply, effects_equalizer_reset;
export default class Effects {
    constructor(wasm) {
        this._wasm = wasm;
        this._equalizerParamPtr = wasm.malloc(FILTER_COEFFS * equalizerBands.length * DOUBLE_BYTE_SIZE);

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
