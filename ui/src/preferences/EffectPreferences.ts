import {
    CROSSFADE_DEFAULT_DURATION,
    CROSSFADE_MAX_DURATION,
    CROSSFADE_MIN_DURATION,
    DEFAULT_BASS_BOOST_EFFECT_SIZE,
    DEFAULT_NOISE_SHARPENING_EFFECT_SIZE,
    EffectPreferences,
    EQUALIZER_MAX_GAIN,
    EQUALIZER_MIN_GAIN,
    EqualizerGains,
    EqualizerPresetKey,
    equalizerPresetKeys,
    equalizerPresets,
    MAX_BASS_BOOST_EFFECT_SIZE,
    MAX_NOISE_SHARPENING_EFFECT_SIZE,
    MIN_BASS_BOOST_EFFECT_SIZE,
    MIN_NOISE_SHARPENING_EFFECT_SIZE,
} from "shared/preferences";
import { AbstractPreferenceManager } from "ui/preferences/PreferenceCreator";

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
