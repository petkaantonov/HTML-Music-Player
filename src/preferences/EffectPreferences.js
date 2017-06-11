

import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import createPreferences from "preferences/PreferenceCreator";

const EQUALIZER_MAX_GAIN = 12;
const EQUALIZER_MIN_GAIN = -12;
const STORAGE_KEY = `effect-preferences`;

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

export default function EffectPreferences(opts, deps) {
    opts = noUndefinedGet(opts);
    AbstractPreferences.call(this, new Preferences(), opts, deps);
}
inherits(EffectPreferences, AbstractPreferences);


EffectPreferences.prototype.STORAGE_KEY = STORAGE_KEY;
EffectPreferences.prototype.TITLE = `Effects`;

/* eslint-disable no-use-before-define */
EffectPreferences.prototype._createManager = function() {
    return new EffectManager(`.equalizer-popup-content-container`, this);
};
/* eslint-enable no-use-before-define */

EffectPreferences.prototype.amplitudeRatioToDecibelChange = function(ratio) {
    if (!isFinite(+ratio)) throw new Error(`ratio must be a number`);
    return 20 * Math.log(ratio) * Math.LOG10E;
};

EffectPreferences.prototype.decibelChangeToAmplitudeRatio = function(decibel) {
    if (!isFinite(+decibel)) return 1;
    return Math.pow(10, (decibel / 20));
};

EffectPreferences.prototype.frequencyToIndex = (function() {
    const map = Object.create(null);

    equalizerBands.forEach((band, index) => {
        map[band[0]] = index;
    });

    return function(freq) {
        return map[freq];
    };
}());

EffectPreferences.prototype.indexToFrequency = function(index) {
    return equalizerBands[index][0];
};

EffectPreferences.prototype.getEqualizerSetup = function() {
    return {
        specs: equalizerBands,
        gains: this.preferences().getEqualizer()
    };
};

EffectPreferences.prototype.getAudioPlayerEffects = function() {
    const pref = this.preferences();
    return [{
        name: `noise-sharpening`,
        effectSize: pref.getNoiseSharpeningEnabled() ? pref.getNoiseSharpeningStrength() : 0
    }];
};

EffectPreferences.prototype.getHtml = function() {
    let noiseSharpeningEffectHtml = `<div class='inputs-container'>
        <div class='label wide-label subtitle'>Noise sharpening</div>
    </div>`;

    noiseSharpeningEffectHtml += `<div class='inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='noise-sharpening-enable-checkbox checkbox' id='noise-sharpening-enable-label-id'>
        </div>
        <div class='noise-sharpening-enable-label label wide-label'>
            <label for='noise-sharpening-enable-label-id'>Enable noise sharpening</label>
        </div>
    </div>`;

    noiseSharpeningEffectHtml += `<div class='inputs-container'>
        <div class='label'>Strength</div>
        <div class='noise-sharpening-slider slider horizontal-slider'>
            <div class='slider-knob'></div>
            <div class='slider-background'>
                <div class='slider-fill'></div>
            </div>
        </div>
        <div class='noise-sharpening-value slider-value-indicator'></div>
    </div>`;

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

    const presetHtml = `<select class='equalizer-preset-selector'><option selected value='Custom'>Custom</option>${
        equalizerPresetKeys.map(presetName => `<option value='${presetName}'>${presetName}</option>`).join(``)
    }</select>`;

    const presetContainerHtml = `<div class='section-container'>
            <div class='inputs-container'>
                <div class='label'>Preset</div>
                <div class='select-container'>
                    ${presetHtml}
                </div>
            </div>
        </div>`;


    return `<div class='settings-container equalizer-popup-content-container'>
                <div class='section-container'>${noiseSharpeningEffectHtml}</div>
                <div class='section-separator'></div>
                <div class='section-container'>${sliderContainerHtml}</div>
                ${presetContainerHtml}
            </div>`;
};



function NoiseSharpeningEffectManager(effectsManager) {
    this._effectsManager = effectsManager;
    this._slider = effectsManager.effectPreferences.sliderContext().createSlider({
        target: this.$().find(`.noise-sharpening-slider`)
    });

    this._strengthChanged = this._strengthChanged.bind(this);
    this._enabledChanged = this._enabledChanged.bind(this);

    this._slider.on(`slide`, this._strengthChanged);
    this.$().find(`.noise-sharpening-enable-checkbox`).addEventListener(`change`, this._enabledChanged);
    this._renderedStrength = -1;
    this._renderedEnabled = null;
}

NoiseSharpeningEffectManager.prototype.$ = function() {
    return this._effectsManager.$();
};

NoiseSharpeningEffectManager.prototype._strengthChanged = function(p) {
    const strength = (p * (2 - 0)) + 0;
    this._effectsManager.preferences.setNoiseSharpeningStrength(strength);
    this._effectsManager.preferences.setNoiseSharpeningEnabled(true);
    this._updateSlider(strength, true);
    this._updateCheckbox(true);
    this._effectsManager.preferencesUpdated(true);
};

NoiseSharpeningEffectManager.prototype._enabledChanged = function() {
    const enabled = this.$().find(`.noise-sharpening-enable-checkbox`)[0].checked;
    this._effectsManager.preferences.setNoiseSharpeningEnabled(enabled);
    this._updateSlider(this._effectsManager.preferences.getNoiseSharpeningStrength(), enabled);
    this._effectsManager.preferencesUpdated(true);
};

NoiseSharpeningEffectManager.prototype._updateSlider = function(strength, enabled) {
    this._renderedStrength = strength;
    this.$().find(`.noise-sharpening-value`).setText(strength.toFixed(1));
    if (enabled) {
        this.$().find(`.noise-sharpening-slider`).removeClass(`slider-inactive`);
    } else {
        this.$().find(`.noise-sharpening-slider`).addClass(`slider-inactive`);
    }
    this._slider.setValue((strength - 0) / (2 - 0));
};

NoiseSharpeningEffectManager.prototype._updateCheckbox = function(enabled) {
    this._renderedEnabled = enabled;
    this.$().find(`.noise-sharpening-enable-checkbox`).setProperty(`checked`, enabled);
};

NoiseSharpeningEffectManager.prototype.update = function() {
    const enabled = this._effectsManager.preferences.getNoiseSharpeningEnabled();
    const strength = this._effectsManager.preferences.getNoiseSharpeningStrength();

    if (enabled === this._renderedEnabled && strength === this._renderedStrength) {
        return;
    }

    this._updateSlider(strength, enabled);
    this._updateCheckbox(enabled);
};

function EqualizerEffectManager(effectsManager) {
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

    this.$().find(`.equalizer-preset-selector`).addEventListener(`change`, this.equalizerPresetChanged.bind(this));
}

EqualizerEffectManager.prototype.$ = function() {
    return this._effectsManager.$();
};

EqualizerEffectManager.prototype.equalizerPresetChanged = function(e) {
    const val = this._effectsManager.effectPreferences.page().$(e.target).value();

    if (equalizerPresets[val]) {
        this._effectsManager.preferences.setEqualizer(equalizerPresets[val]);
        this._effectsManager.preferencesUpdated();
        this._updateSliders();
    }
};

EqualizerEffectManager.prototype._updatePreset = function() {
    const presetName = this._effectsManager.preferences.getMatchingEqualizerPresetName();
    this.$().find(`.equalizer-preset-selector`).setValue(presetName);
};

EqualizerEffectManager.prototype._updateSliders = function() {
    const eq = this._effectsManager.preferences.getInPlaceEqualizer();
    for (let i = 0; i < eq.length; ++i) {
        this._equalizerSliders[i].setValue(gainValueToProgress(eq[i]));
    }
};

EqualizerEffectManager.prototype.update = function() {
    this._updatePreset();
    this._updateSliders();
};

function EffectManager(domNode, effectPreferences) {
    EventEmitter.call(this);
    this.effectPreferences = effectPreferences;
    this._domNode = effectPreferences.page().$(domNode).eq(0);
    this.preferences = effectPreferences.preferences();
    this.defaultPreferences = new Preferences();
    this.unchangedPreferences = null;
    this._noiseSharpeningEffectManager = new NoiseSharpeningEffectManager(this);
    this._equalizerEffectManager = new EqualizerEffectManager(this);
}
inherits(EffectManager, EventEmitter);

EffectManager.prototype.$ = function() {
    return this._domNode;
};

EffectManager.prototype.applyPreferencesFrom = function(preferences) {
    this.preferences.copyFrom(preferences);
    this._noiseSharpeningEffectManager.update();
    this._equalizerEffectManager.update();
    this.preferencesUpdated();
};

EffectManager.prototype.preferencesUpdated = function() {
    this.emit(`update`);
    this.update();
};

EffectManager.prototype.update = function() {
    this.effectPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
    this.effectPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));
};

EffectManager.prototype.restoreDefaults = function() {
    this.applyPreferencesFrom(this.defaultPreferences);
};

EffectManager.prototype.undoChanges = function() {
    this.applyPreferencesFrom(this.unchangedPreferences);
};

EffectManager.prototype.setUnchangedPreferences = function() {
    this.unchangedPreferences = this.preferences.snapshot();
    this.update();
    this._noiseSharpeningEffectManager.update();
    this._equalizerEffectManager.update();
};
