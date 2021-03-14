import { BandType, equalizerBands, EqualizerGains } from "src/preferences/EffectPreferences";
import WebAssemblyWrapper, { moduleEvents } from "wasm/WebAssemblyWrapper";

import { typedKeys } from "../../src/types/helpers";
import { ChannelCount } from "./ChannelMixer";

const FILTER_COEFFS = 5;
const DOUBLE_BYTE_SIZE = 8;

const DEFAULT_EQUALIZER_GAINS: EqualizerGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
export interface BaseEffectSpec {
    name: string;
}

export interface NoiseSharpeningEffectSpec extends BaseEffectSpec {
    name: "noise-sharpening";
    effectSize: number;
}
export interface BassBoostEffectSpec extends BaseEffectSpec {
    name: "bass-boost";
    effectSize: number;
}

export interface EqualizerEffectSpec extends BaseEffectSpec {
    name: "equalizer";
    gains: EqualizerGains;
}
export type EffectSpec = NoiseSharpeningEffectSpec | BassBoostEffectSpec | EqualizerEffectSpec;
export type EffectSpecList = EffectSpec[];

interface EffectApplicationResult {
    samplePtr: number;
    byteLength: number;
}
interface BaseEffectImplementation<T extends EffectSpec> {
    apply: (
        effects: any,
        samplePtr: number,
        byteLength: number,
        audioInfo: { channelCount: ChannelCount; sampleRate: number }
    ) => EffectApplicationResult;
    _applySpec: (spec: T | null) => void;
}
interface NoiseSharpeningEffectImplementation extends BaseEffectImplementation<NoiseSharpeningEffectSpec> {
    effectSize: number;
}
interface BassBoostEffectImplementation extends BaseEffectImplementation<BassBoostEffectSpec> {
    effectSize: number;
}
interface EqualizerEffectImplementation extends BaseEffectImplementation<EqualizerEffectSpec> {
    isEffective: boolean;
    isDirty: boolean;
    writtenForSampleRate: number;
    gains: EqualizerGains;
}

interface EffectsMap {
    noiseSharpening: NoiseSharpeningEffectImplementation;
    bassBoost: BassBoostEffectImplementation;
    equalizer: EqualizerEffectImplementation;
}

function writeBandParam(
    type: BandType,
    frequency: number,
    gain: number,
    sampleRate: number,
    basePtr: number,
    index: number,
    wasm: WebAssemblyWrapper
) {
    let a0, a1, a2, b0, b1, b2;
    const Q = Math.sqrt(2) * 1;
    const A = Math.pow(10, gain / 40);
    const w0 = (Math.PI * 2 * frequency) / sampleRate;
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

let effects_noise_sharpening: (
    effectSize: number,
    channelCount: ChannelCount,
    samplePtr: number,
    byteLength: number
) => void;

let effects_equalizer_reset: () => void;
let effects_equalizer_apply: (
    samplePtr: number,
    byteLength: number,
    channelCount: ChannelCount,
    paramPtr: number
) => void;

let effects_bass_boost_reset: () => void;
let effects_bass_boost_apply: (
    effectSize: number,
    channelCount: ChannelCount,
    samplePtr: number,
    byteLength: number
) => void;

export default class Effects {
    _effects: EffectsMap;
    _wasm: WebAssemblyWrapper;
    _equalizerParamPtr: number;
    constructor(wasm: WebAssemblyWrapper) {
        this._wasm = wasm;
        this._equalizerParamPtr = wasm.malloc(FILTER_COEFFS * equalizerBands.length * DOUBLE_BYTE_SIZE);

        this._effects = {
            noiseSharpening: {
                effectSize: 0,
                apply(_effects, samplePtr, byteLength, { channelCount }) {
                    if (this.effectSize > 0) {
                        effects_noise_sharpening(this.effectSize, channelCount, samplePtr, byteLength);
                    }
                    return { samplePtr, byteLength };
                },

                _applySpec(spec: NoiseSharpeningEffectSpec | null = null) {
                    this.effectSize = spec ? spec.effectSize : 0;
                },
            },
            bassBoost: {
                effectSize: 0,
                apply(_effects, samplePtr, byteLength, { channelCount }) {
                    if (this.effectSize > 0) {
                        effects_bass_boost_apply(this.effectSize, channelCount, samplePtr, byteLength);
                    }
                    return { samplePtr, byteLength };
                },

                _applySpec(spec: BassBoostEffectSpec | null = null) {
                    effects_bass_boost_reset();
                    this.effectSize = spec ? spec.effectSize : 0;
                },
            },
            equalizer: {
                isEffective: false,
                isDirty: true,
                writtenForSampleRate: 0,
                gains: DEFAULT_EQUALIZER_GAINS,
                apply(
                    this: EqualizerEffectImplementation,
                    effects,
                    samplePtr,
                    byteLength,
                    { channelCount, sampleRate }
                ) {
                    if (!this.isEffective) {
                        return { samplePtr, byteLength };
                    }

                    if (this.isDirty || this.writtenForSampleRate !== sampleRate) {
                        const { gains } = this;
                        for (let index = 0; index < gains.length; ++index) {
                            const gain = gains[index]!;
                            const [frequency, type] = equalizerBands[index]!;
                            writeBandParam(
                                type,
                                frequency,
                                gain,
                                sampleRate,
                                effects._equalizerParamPtr,
                                index,
                                effects._wasm
                            );
                        }
                        this.isDirty = false;
                        this.writtenForSampleRate = sampleRate;
                    }

                    effects_equalizer_apply(samplePtr, byteLength, channelCount, effects._equalizerParamPtr);
                    return { samplePtr, byteLength };
                },

                _applySpec(this: EqualizerEffectImplementation, spec: EqualizerEffectSpec | null = null) {
                    if (!spec) {
                        this.gains = DEFAULT_EQUALIZER_GAINS;
                        this.isEffective = false;
                    } else {
                        const { gains } = spec;
                        this.gains = gains;
                    }
                    const gains = this.gains;
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
                },
            },
        };
    }

    *[Symbol.iterator]() {
        for (const key of typedKeys(this._effects)) {
            yield this._effects[key];
        }
    }

    setEffects(spec: EffectSpecList = []) {
        for (const specEffect of spec) {
            switch (specEffect.name) {
                case "bass-boost":
                    this._effects.bassBoost._applySpec(specEffect);
                    break;
                case "equalizer":
                    this._effects.equalizer._applySpec(specEffect);
                    break;
                case "noise-sharpening":
                    this._effects.noiseSharpening._applySpec(specEffect);
                    break;
            }
        }
    }
}

moduleEvents.on(`main_afterInitialized`, (_wasm, exports: WebAssembly.Exports) => {
    effects_noise_sharpening = exports.effects_noise_sharpening as any;
    effects_equalizer_apply = exports.effects_equalizer_apply as any;
    effects_equalizer_reset = exports.effects_equalizer_reset as any;
    effects_bass_boost_reset = exports.effects_bass_boost_reset as any;
    effects_bass_boost_apply = exports.effects_bass_boost_apply as any;
});
