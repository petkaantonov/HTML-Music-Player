import { EffectPreferences } from "Application";
import { MIN_BUFFER_LENGTH_SECONDS } from "audio/buffering";
import { AbstractPreferenceManager } from "preferences/PreferenceCreator";
import { typedKeys } from "types/helpers";

export type EqualizerGains = [number, number, number, number, number, number, number, number, number, number];
export const equalizerPresets = {
    None: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as EqualizerGains,
    Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] as EqualizerGains,
    Classical: [
        0,
        0,
        0,
        0,
        0,
        0,
        -4.64516129032258,
        -4.64516129032258,
        -4.64516129032258,
        -6.193548387096774,
    ] as EqualizerGains,
    Club: [
        0,
        0,
        1.935483870967742,
        3.483870967741936,
        3.483870967741936,
        3.483870967741936,
        1.935483870967742,
        0,
        0,
        0,
    ] as EqualizerGains,
    Dance: [
        5.806451612903226,
        4.258064516129032,
        1.161290322580645,
        0,
        0,
        -3.870967741935484,
        -4.64516129032258,
        -4.64516129032258,
        0,
        0,
    ] as EqualizerGains,
    "Full Bass": [
        5.806451612903226,
        5.806451612903226,
        5.806451612903226,
        3.483870967741936,
        0.7741935483870968,
        -2.7096774193548385,
        -5.419354838709677,
        -6.580645161290322,
        -6.967741935483872,
        -6.967741935483872,
    ] as EqualizerGains,
    "Full Bass & Treble": [
        4.258064516129032,
        3.483870967741936,
        0,
        -4.64516129032258,
        -3.096774193548387,
        0.7741935483870968,
        5.032258064516129,
        6.580645161290322,
        7.35483870967742,
        7.35483870967742,
    ] as EqualizerGains,
    "Full Treble": [
        -6.193548387096774,
        -6.193548387096774,
        -6.193548387096774,
        -2.7096774193548385,
        1.5483870967741935,
        6.580645161290322,
        9.677419354838708,
        9.677419354838708,
        9.677419354838708,
        10.451612903225806,
    ] as EqualizerGains,
    "Laptop Speakers / Headphone": [
        2.7096774193548385,
        6.580645161290322,
        3.096774193548387,
        -2.32258064516129,
        -1.5483870967741935,
        0.7741935483870968,
        2.7096774193548385,
        5.806451612903226,
        7.741935483870968,
        8.903225806451612,
    ] as EqualizerGains,
    "Large Hall": [
        6.193548387096774,
        6.193548387096774,
        3.483870967741936,
        3.483870967741936,
        0,
        -3.096774193548387,
        -3.096774193548387,
        -3.096774193548387,
        0,
        0,
    ] as EqualizerGains,
    Live: [
        -3.096774193548387,
        0,
        2.32258064516129,
        3.096774193548387,
        3.483870967741936,
        3.483870967741936,
        2.32258064516129,
        1.5483870967741935,
        1.5483870967741935,
        1.161290322580645,
    ] as EqualizerGains,
    Party: [
        4.258064516129032,
        4.258064516129032,
        0,
        0,
        0,
        0,
        0,
        0,
        4.258064516129032,
        4.258064516129032,
    ] as EqualizerGains,
    Pop: [
        -1.161290322580645,
        2.7096774193548385,
        4.258064516129032,
        4.64516129032258,
        3.096774193548387,
        -0.7741935483870968,
        -1.5483870967741935,
        -1.5483870967741935,
        -1.161290322580645,
        -1.161290322580645,
    ] as EqualizerGains,
    Reggae: [
        0,
        0,
        -0.3870967741935484,
        -3.870967741935484,
        0,
        3.870967741935484,
        3.870967741935484,
        0,
        0,
        0,
    ] as EqualizerGains,
    Rock: [
        4.64516129032258,
        2.7096774193548385,
        -3.483870967741936,
        -5.032258064516129,
        -2.32258064516129,
        2.32258064516129,
        5.419354838709677,
        6.580645161290322,
        6.580645161290322,
        6.580645161290322,
    ] as EqualizerGains,
    Ska: [
        -1.5483870967741935,
        -3.096774193548387,
        -2.7096774193548385,
        -0.3870967741935484,
        2.32258064516129,
        3.483870967741936,
        5.419354838709677,
        5.806451612903226,
        6.580645161290322,
        5.806451612903226,
    ] as EqualizerGains,
    Soft: [
        2.7096774193548385,
        0.7741935483870968,
        -0.7741935483870968,
        -1.5483870967741935,
        -0.7741935483870968,
        2.32258064516129,
        5.032258064516129,
        5.806451612903226,
        6.580645161290322,
        7.35483870967742,
    ] as EqualizerGains,
    "Soft Rock": [
        2.32258064516129,
        2.32258064516129,
        1.161290322580645,
        -0.3870967741935484,
        -2.7096774193548385,
        -3.483870967741936,
        -2.32258064516129,
        -0.3870967741935484,
        1.5483870967741935,
        5.419354838709677,
    ] as EqualizerGains,
    Techno: [
        4.64516129032258,
        3.483870967741936,
        0,
        -3.483870967741936,
        -3.096774193548387,
        0,
        4.64516129032258,
        5.806451612903226,
        5.806451612903226,
        5.419354838709677,
    ] as EqualizerGains,
};
export type BandType = "lowshelf" | "peaking" | "highshelf";

export const equalizerBands: [number, BandType][] = [
    [70, `lowshelf`],
    [180, `peaking`],
    [320, `peaking`],
    [600, `peaking`],
    [1000, `peaking`],
    [3000, `peaking`],
    [6000, `peaking`],
    [12000, `peaking`],
    [14000, `peaking`],
    [16000, `highshelf`],
];

export const EQUALIZER_MAX_GAIN = 12;
export const EQUALIZER_MIN_GAIN = -12;
export const STORAGE_KEY = `effect-preferences`;
export const CROSSFADE_MIN_DURATION = Math.max(MIN_BUFFER_LENGTH_SECONDS, 1);
export const CROSSFADE_MAX_DURATION = 5;
export const CROSSFADE_DEFAULT_DURATION = Math.min(CROSSFADE_MAX_DURATION, Math.max(CROSSFADE_MIN_DURATION, 5));
export const MIN_NOISE_SHARPENING_EFFECT_SIZE = 0;
export const MAX_NOISE_SHARPENING_EFFECT_SIZE = 2;
export const DEFAULT_NOISE_SHARPENING_EFFECT_SIZE = 0.6;
export const MIN_BASS_BOOST_EFFECT_SIZE = 0;
export const MAX_BASS_BOOST_EFFECT_SIZE = 1;
export const DEFAULT_BASS_BOOST_EFFECT_SIZE = 0.4;

export const gainValueToProgress = function (gainValue: number) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
};

export const progressToGainValue = function (progress: number) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
};

export const formatFreq = function (freq: number) {
    if (freq < 1000) {
        return `${freq} Hz`;
    } else {
        return `${Math.round(freq / 1000)} KHz`;
    }
};

export const equalizerPresetKeys = typedKeys(equalizerPresets);
export type EqualizerPresetKey = keyof typeof equalizerPresets | "Custom";

export class EffectPreferencesManager
    extends AbstractPreferenceManager<EffectPreferences>
    implements EffectPreferences {
    equalizer: EqualizerGains;
    bassBoostEnabled: boolean;
    bassBoostStrength: number;
    noiseSharpeningEnabled: boolean;
    noiseSharpeningStrength: number;
    shouldAlbumNotCrossfade: boolean;
    crossfadeDuration: number;
    crossfadeEnabled: boolean;

    constructor(prefs?: EffectPreferences) {
        super(EffectPreferences);
        this.equalizer = equalizerPresets.None;
        this.bassBoostEnabled = false;
        this.bassBoostStrength = DEFAULT_BASS_BOOST_EFFECT_SIZE;
        this.noiseSharpeningEnabled = false;
        this.noiseSharpeningStrength = DEFAULT_NOISE_SHARPENING_EFFECT_SIZE;
        this.shouldAlbumNotCrossfade = true;
        this.crossfadeEnabled = false;
        this.crossfadeDuration = CROSSFADE_DEFAULT_DURATION;
        if (prefs) {
            this.copyFrom(prefs);
        }
    }

    getMatchingEqualizerPresetName(): EqualizerPresetKey {
        const equalizer = this.get("equalizer");
        mainloop: for (let i = 0; i < equalizerPresetKeys.length; ++i) {
            const name = equalizerPresetKeys[i]!;
            const preset = equalizerPresets[name];
            for (let j = 0; j < preset.length; ++j) {
                if (preset[j] !== equalizer[j]) {
                    continue mainloop;
                }
            }
            return name;
        }
        return `Custom`;
    }

    setEqualizer(value: number[]) {
        if (value.length !== 10) {
            return;
        }

        for (let i = 0; i < value.length; ++i) {
            value[i] = Math.max(EQUALIZER_MIN_GAIN, Math.min(EQUALIZER_MAX_GAIN, +value[i]!)) || 0;
        }

        this.equalizer = value as EqualizerGains;
    }

    setBassBoostStrength(value: number) {
        const ret = Math.max(MIN_BASS_BOOST_EFFECT_SIZE, Math.min(MAX_BASS_BOOST_EFFECT_SIZE, +value));
        if (isFinite(ret)) {
            this.bassBoostStrength = ret;
        }
    }

    setNoiseSharpeningStrength(value: number) {
        const ret = Math.max(MIN_NOISE_SHARPENING_EFFECT_SIZE, Math.min(MAX_NOISE_SHARPENING_EFFECT_SIZE, +value));
        if (isFinite(ret)) {
            this.noiseSharpeningStrength = ret;
        }
    }

    setCrossfadeDuration(value: number) {
        const ret = Math.min(Math.max(CROSSFADE_MIN_DURATION, +value), CROSSFADE_MAX_DURATION);
        if (isFinite(ret)) {
            this.crossfadeDuration = ret;
        }
    }
}
