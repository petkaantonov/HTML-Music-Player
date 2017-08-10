import {ToggleableSlideableValue,
        SingleSelectableValue,
        ToggleableValue} from "ui/templates";
import {ToggleableSlideableValuePreferenceUiBinding, ToggleableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";
import AbstractPreferencesBindingContext from "ui/AbstractPreferencesBindingContext";
import {equalizerPresets, formatFreq, STORAGE_KEY,
        equalizerPresetKeys, equalizerBands,
        Preferences, gainValueToProgress, progressToGainValue,
        MIN_NOISE_SHARPENING_EFFECT_SIZE, MAX_NOISE_SHARPENING_EFFECT_SIZE,
        MIN_BASS_BOOST_EFFECT_SIZE, MAX_BASS_BOOST_EFFECT_SIZE,
        CROSSFADE_MIN_DURATION, CROSSFADE_MAX_DURATION} from "preferences/EffectPreferences";
import {_, _set} from "util";

const TEMPLATE = `
            <section class="js-noise-sharpening-container two-item-section">
                <header class="section-header">Noise sharpening</header>
            </section>
            <div class="section-separator"></div>

            <section class="js-bass-boost-container two-item-section">
                <header class="section-header">Bass boost</header>
            </section>
            <div class="section-separator"></div>

            <section class="js-crossfade-container two-item-section">
                <header class="section-header">Crossfading</header>
            </section>
            <section class="one-item-headerless-section js-album-preference-container album-preference-container"></section>
            <div class="section-separator"></div>

            <section class="js-equalizer-container equalizer-section">
                 <header class="section-header">Equalizer</header>
                 <div class="equalizer">${equalizerBands.map(band => {
                        const sliderId = `equalizer-band-${band[0]}-slider`;
                        return `<div class="slider-input slider-input-${band[0]}">
                                <div class='${sliderId} slider equalizer-slider vertical-slider'>
                                    <div class='slider-knob'></div>
                                    <div class='slider-background'>
                                        <div class='slider-fill'></div>
                                    </div>
                                </div>
                            </div>
                            <div class="band-label-${band[0]} band-label">${formatFreq(band[0])}</div>`;}).join("")}</div>
            </section>`;

class EqualizerUiBinding {
    constructor(effectsManager) {
        this._effectsManager = effectsManager;
        this._equalizerSliders = equalizerBands.map((band, index) => {
            const slider = effectsManager.bindingContext().sliderContext().createSlider({
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
        this._presetSelector.renderTo(this.$().find(`.js-equalizer-container`));
    }

    $() {
        return this._effectsManager.$();
    }

    layoutUpdated() {
        this._equalizerSliders.forEach(_.forceRelayout);
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

class EffectManager extends AbstractUiBindingManager {
    constructor(rootSelector, bindingContext) {
        super(rootSelector, bindingContext, new Preferences());
        const sliderContext = bindingContext.sliderContext();

        this.
            addBinding(new EqualizerUiBinding(this)).
            addBinding(new ToggleableSlideableValuePreferenceUiBinding(
                this.$().find(`.js-noise-sharpening-container`),
                new ToggleableSlideableValue({
                    checkboxLabel: `Enable noise sharpening`,
                    sliderLabel: `Strength`,
                    valueFormatter: value => value.toFixed(1),
                    minValue: MIN_NOISE_SHARPENING_EFFECT_SIZE,
                    maxValue: MAX_NOISE_SHARPENING_EFFECT_SIZE
                }, {sliderContext}),
                `noiseSharpeningStrength`,
                `noiseSharpeningEnabled`,
                this
            )).
            addBinding(new ToggleableSlideableValuePreferenceUiBinding(
                this.$().find(`.js-bass-boost-container`),
                new ToggleableSlideableValue({
                    checkboxLabel: `Enable bass boost`,
                    sliderLabel: `Strength`,
                    valueFormatter: value => value.toFixed(1),
                    minValue: MIN_BASS_BOOST_EFFECT_SIZE,
                    maxValue: MAX_BASS_BOOST_EFFECT_SIZE
                }, {sliderContext}),
                `bassBoostStrength`,
                `bassBoostEnabled`,
                this
            )).
            addBinding(new ToggleableSlideableValuePreferenceUiBinding(
                this.$().find(`.js-crossfade-container`),
                new ToggleableSlideableValue({
                    checkboxLabel: `Enable crossfading`,
                    sliderLabel: `Duration`,
                    valueFormatter: value => `${value.toFixed(1)}s`,
                    minValue: CROSSFADE_MIN_DURATION,
                    maxValue: CROSSFADE_MAX_DURATION
                }, {sliderContext}),
                `crossfadeDuration`,
                `crossfadeEnabled`,
                this
            )).
            addBinding(new ToggleableValuePreferenceUiBinding(
                this.$().find(`.js-album-preference-container`),
                new ToggleableValue({checkboxLabel: `Don't crossfade between consecutive tracks of the same album`}),
                `shouldAlbumNotCrossfade`,
                this
            ));
        this.update();
    }
}

export default class EffectPreferencesBindingContext extends AbstractPreferencesBindingContext {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Effects`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`effects`, this.openPopup.bind(this));
    }

    _createManager() {
        return new EffectManager(this.popup().$body(), this);
    }

    getNoiseSharpeningEffectSize() {
        const preferences = this.preferences();
        return preferences.getNoiseSharpeningEnabled() ? preferences.getNoiseSharpeningStrength() : 0;
    }

    getBassBoostEffectSize() {
        const preferences = this.preferences();
        return preferences.getBassBoostEnabled() ? preferences.getBassBoostStrength() : 0;
    }

    getCrossfadeDuration() {
        const preferences = this.preferences();
        return preferences.getCrossfadeEnabled() ? preferences.getCrossfadeDuration() : 0;
    }

    getShouldAlbumNotCrossfade() {
        return this.preferences().getShouldAlbumNotCrossfade();
    }

    getAudioPlayerEffects() {
        return [{
            name: `noise-sharpening`,
            effectSize: this.getNoiseSharpeningEffectSize()
        }, {
            name: `bass-boost`,
            effectSize: this.getBassBoostEffectSize()
        }, {
            name: `equalizer`,
            gains: this.preferences().getEqualizer()
        }];
    }
}
