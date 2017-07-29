import createPreferences from "preferences/PreferenceCreator";
import {MIN_SUSTAINED_AUDIO_SECONDS, MIN_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";

export const EQUALIZER_MAX_GAIN = 12;
export const EQUALIZER_MIN_GAIN = -12;
export const STORAGE_KEY = `effect-preferences`;
export const CROSSFADE_MIN_DURATION = Math.max(MIN_BUFFER_LENGTH_SECONDS, 1);
export const CROSSFADE_MAX_DURATION = Math.min(MIN_SUSTAINED_AUDIO_SECONDS, 12);
export const CROSSFADE_DEFAULT_DURATION = Math.min(CROSSFADE_MAX_DURATION, Math.max(CROSSFADE_MIN_DURATION, 5));
export const MIN_NOISE_SHARPENING_EFFECT_SIZE = 0;
export const MAX_NOISE_SHARPENING_EFFECT_SIZE = 2;
export const DEFAULT_NOISE_SHARPENING_EFFECT_SIZE = 0.6;


export const gainValueToProgress = function(gainValue) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
};

export const progressToGainValue = function(progress) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
};

export const formatFreq = function(freq) {
    if (freq < 1000) {
        return `${freq} Hz`;
    } else {
        return `${Math.round(freq / 1000)} KHz`;
    }
};

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

export const equalizerPresetKeys = Object.keys(equalizerPresets);

export const Preferences = createPreferences({
    methods: {
        getMatchingEqualizerPresetName() {
            const equalizer = this.getInPlaceEqualizer();
            for (let i = 0; i < equalizerPresetKeys.length; ++i) {
                const name = equalizerPresetKeys[i];
                const preset = equalizerPresets[name];
                if (this._equals(preset, equalizer)) {
                    return name;
                }
            }
            return `Custom`;
        }
    },

    preferences: {
        equalizer: {
            defaultValue: equalizerPresets.None,
            asValidValue(value) {
                if (!Array.isArray(value) || value.length !== 10) {
                    return this.defaultEqualizer;
                }

                for (let i = 0; i < value.length; ++i) {
                    value[i] = (Math.max(EQUALIZER_MIN_GAIN, Math.min(EQUALIZER_MAX_GAIN, +value[i]))) || 0;
                }

                return value;
            }
        },

        noiseSharpeningStrength: {
            defaultValue: DEFAULT_NOISE_SHARPENING_EFFECT_SIZE,
            asValidValue(value) {
                const ret = Math.max(MIN_NOISE_SHARPENING_EFFECT_SIZE, Math.min(MAX_NOISE_SHARPENING_EFFECT_SIZE, +value));
                return isFinite(ret) ? ret : this.defaultNoiseSharpeningStrength;
            }
        },

        noiseSharpeningEnabled: {
            defaultValue: true,
            asValidValue(value) {
                return !!value;
            }
        },

        shouldAlbumNotCrossfade: {
            defaultValue: true,
            asValidValue(value) {
                return !!value;
            }
        },

        crossfadeEnabled: {
            defaultValue: false,
            asValidValue(value) {
                return !!value;
            }
        },

        crossfadeDuration: {
            defaultValue: CROSSFADE_DEFAULT_DURATION,
            asValidValue(value) {
                if (!isFinite(+value)) return CROSSFADE_DEFAULT_DURATION;
                return Math.min(Math.max(CROSSFADE_MIN_DURATION, +value), CROSSFADE_MAX_DURATION);
            }
        }
    }
});
