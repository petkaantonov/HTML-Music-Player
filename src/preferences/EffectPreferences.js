import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet, _, _set} from "util";
import createPreferences from "preferences/PreferenceCreator";
import {ToggleableSlideableValue,
        SingleSelectableValue} from "ui/templates";
import {ToggleableSlideableValuePreferenceUiBinding} from "preferences/uibinders";

const EQUALIZER_MAX_GAIN = 12;
const EQUALIZER_MIN_GAIN = -12;
const STORAGE_KEY = `effect-preferences`;
const ALL_SLIDERS_ON_SAME_ROW_THRESHOLD = 620;

const gainValueToProgress = function(gainValue) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
};

const progressToGainValue = function(progress) {
    const max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    const value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
};

const formatFreq = function(freq) {
    if (freq < 1000) {
        return `${freq} Hz`;
    } else {
        return `${Math.round(freq / 1000)} KHz`;
    }
};

const equalizerBands = [
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

const equalizerPresets = {
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

const equalizerPresetKeys = Object.keys(equalizerPresets);

const equalizerBandGroups = [];
const groupSize = 5;
let cur = 0;
while (cur < equalizerBands.length) {
    const equalizerBandGroup = equalizerBands.slice(cur, cur + groupSize);
    equalizerBandGroups.push(equalizerBandGroup);
    cur += groupSize;
}

let sliderContainerHtml = `<div class='inputs-container'>
    <div class='label wide-label subtitle'>Equalizer</div>
</div>`;

sliderContainerHtml += `<div class='equalizer-sliders-container row'>${
    equalizerBandGroups.map(bands => `<div class='equalizer-band-group-container col-lg-6'>${
                bands.map((band) => {
                    const sliderId = `equalizer-band-${band[0]}-slider`;
                    return `<div class='equalizer-band-configurator-container'>
                            <div class='equalizer-slider-container'>
                                <div class='${sliderId} slider equalizer-slider vertical-slider'>
                                    <div class='slider-knob'></div>
                                    <div class='slider-background'>
                                        <div class='slider-fill'></div>
                                    </div>
                                </div>
                            </div>
                            <div class='equalizer-band-label-container'>
                                <div class='notextflow band-frequency-label'>${formatFreq(band[0])}</div>
                            </div>
                        </div>`;
                }).join(``)
        }</div>`).join(``)}</div>`;


const TEMPLATE = `<div class='settings-container equalizer-popup-content-container'>
                <div class="inputs-container">
                    <div class="label wide-label subtitle">Noise sharpening</div>
                </div>
                <div class='section-container noise-sharpening-container'></div>
                <div class='section-separator'></div>
                <div class='section-container'>${sliderContainerHtml}</div>
                <div class='section-container preset-selector-container'></div>
            </div>`;

const Preferences = createPreferences({
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
            defaultValue: 0.6,
            asValidValue(value) {
                const ret = Math.max(0, Math.min(2, +value));
                return isFinite(ret) ? ret : this.defaultNoiseSharpeningStrength;
            }
        },

        noiseSharpeningEnabled: {
            defaultValue: true,
            asValidValue(value) {
                return !!value;
            }
        }
    }
});

const frequencyToIndexMap = Object.create(null);

equalizerBands.forEach((band, index) => {
    frequencyToIndexMap[band[0]] = index;
});

export default class EffectPreferences extends AbstractPreferences {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Effects`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`effects`, this.openPopup.bind(this));
    }

    /* eslint-disable no-use-before-define */
    _createManager() {
        return new EffectManager(`.equalizer-popup-content-container`, this);
    }
    /* eslint-enable no-use-before-define */

    amplitudeRatioToDecibelChange(ratio) {
        if (!isFinite(+ratio)) throw new Error(`ratio must be a number`);
        return 20 * Math.log(ratio) * Math.LOG10E;
    }

    decibelChangeToAmplitudeRatio(decibel) {
        if (!isFinite(+decibel)) return 1;
        return Math.pow(10, (decibel / 20));
    }

    frequencyToIndex(freq) {
        return frequencyToIndexMap[freq];
    }

    indexToFrequency(index) {
        return equalizerBands[index][0];
    }

    getEqualizerSetup() {
        return {
            specs: equalizerBands,
            gains: this.preferences().getEqualizer()
        };
    }

    getAudioPlayerEffects() {
        const pref = this.preferences();
        return [{
            name: `noise-sharpening`,
            effectSize: pref.getNoiseSharpeningEnabled() ? pref.getNoiseSharpeningStrength() : 0
        }];
    }
}

class EqualizerUiBinding {
    constructor(effectsManager) {
        this._effectsManager = effectsManager;
        this._equalizerSliders = equalizerBands.map((band, index) => {
            const slider = effectsManager.effectPreferences.sliderContext().createSlider({
                direction: `vertical`,
                target: this.$().find(`.equalizer-band-${band[0]}-slider`)
            });

            let eq;
            slider.on(`slideBegin`, () => {
                eq = this._effectsManager.preferences.getEqualizer();
            });

            slider.on(`slide`, (p) => {
                const value = progressToGainValue(p);
                eq[index] = value;
                this._effectsManager.preferences.setInPlaceEqualizer(eq);
                this._effectsManager.preferencesUpdated();
                this._updatePreset();
            });

            slider.on(`slideEnd`, () => {
                eq = null;
            });

            return slider;
        });

        this._presetSelector = new SingleSelectableValue({
            label: `Preset`,
            valueTextMap: equalizerPresetKeys,
            onValueChange: this.equalizerPresetChanged.bind(this)
        });
        this._presetSelector.renderTo(this.$().find(`.preset-selector-container`));
    }

    $() {
        return this._effectsManager.$();
    }

    $equalizerSlidersContainer() {
        return this.$().find(`.equalizer-sliders-container`);
    }

    $equalizerSliderContainers() {
        return this.$equalizerSlidersContainer().find(`.equalizer-band-configurator-container`);
    }

    layoutUpdated() {
        const widthAvailable = this.$equalizerSlidersContainer().innerWidth();
        const slidersPerRow = widthAvailable >= ALL_SLIDERS_ON_SAME_ROW_THRESHOLD ? this._equalizerSliders.length
                                                                                  : this._equalizerSliders.length / 2;
        const sliderContainerWidth = (widthAvailable / slidersPerRow) | 0;
        this.$equalizerSliderContainers().mapToArray(_.style).forEach(_set.width(`${sliderContainerWidth}px`));
    }

    equalizerPresetChanged(val) {
        if (equalizerPresets[val]) {
            this._effectsManager.preferences.setEqualizer(equalizerPresets[val]);
            this._effectsManager.preferencesUpdated();
            this._updateSliders();
        }
    }

    _updatePreset() {
        const presetName = this._effectsManager.preferences.getMatchingEqualizerPresetName();
        this._presetSelector.setValue(presetName);
    }

    _updateSliders() {
        const eq = this._effectsManager.preferences.getInPlaceEqualizer();
        for (let i = 0; i < eq.length; ++i) {
            this._equalizerSliders[i].setValue(gainValueToProgress(eq[i]));
        }
    }

    update() {
        this._updatePreset();
        this._updateSliders();
    }
}

class EffectManager extends EventEmitter {
    constructor(domNode, effectPreferences) {
        super();
        this.effectPreferences = effectPreferences;
        this._domNode = effectPreferences.page().$(domNode).eq(0);
        this.preferences = effectPreferences.preferences();
        this.defaultPreferences = new Preferences();
        this.unchangedPreferences = null;
        this._equalizerUiBinding = new EqualizerUiBinding(this);

        const toggleableSlideableValue = new ToggleableSlideableValue({
            checkboxLabel: `Enable noise sharpening`,
            sliderLabel: `Strength`,
            valueFormatter: value => value.toFixed(1),
            minValue: 0,
            maxValue: 2
        }, {
            sliderContext: effectPreferences.sliderContext()
        });
        this._noiseSharpeningUiBinding = new ToggleableSlideableValuePreferenceUiBinding(
            this.$().find(`.noise-sharpening-container`),
            toggleableSlideableValue,
            `noiseSharpeningStrength`,
            `noiseSharpeningEnabled`,
            this
        );
    }

    $() {
        return this._domNode;
    }

    layoutUpdated() {
        this._equalizerUiBinding.layoutUpdated();
        this._noiseSharpeningUiBinding.layoutUpdated();
    }

    applyPreferencesFrom(preferences) {
        this.preferences.copyFrom(preferences);
        this._noiseSharpeningUiBinding.update();
        this._equalizerUiBinding.update();
        this.preferencesUpdated();
    }

    preferencesUpdated() {
        this.emit(`update`);
        this.update();
    }

    update() {
        this.effectPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
        this.effectPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));
    }

    restoreDefaults() {
        this.applyPreferencesFrom(this.defaultPreferences);
    }

    undoChanges() {
        this.applyPreferencesFrom(this.unchangedPreferences);
    }

    setUnchangedPreferences() {
        this.unchangedPreferences = this.preferences.snapshot();
        this.update();
        this._noiseSharpeningUiBinding.update();
        this._equalizerUiBinding.update();
    }
}

