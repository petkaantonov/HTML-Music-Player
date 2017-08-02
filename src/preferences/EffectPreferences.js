import createPreferences from "preferences/PreferenceCreator";
import {MIN_SUSTAINED_AUDIO_SECONDS, MIN_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";
export {equalizerBands, equalizerPresets} from "audio/backend/Effects";
import {equalizerPresets} from "audio/backend/Effects";

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

        bassBoostStrength: {
            defaultValue: DEFAULT_BASS_BOOST_EFFECT_SIZE,
            asValidValue(value) {
                const ret = Math.max(MIN_BASS_BOOST_EFFECT_SIZE, Math.min(MAX_BASS_BOOST_EFFECT_SIZE, +value));
                return isFinite(ret) ? ret : this.defaultBassBoostStrength;
            }
        },

        bassBoostEnabled: {
            defaultValue: false,
            asValidValue(value) {
                return !!value;
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
