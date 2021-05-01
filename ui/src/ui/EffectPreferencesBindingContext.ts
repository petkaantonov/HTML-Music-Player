import {
    AudioPlayerEffects,
    CROSSFADE_MAX_DURATION,
    CROSSFADE_MIN_DURATION,
    EffectPreferences,
    equalizerBands,
    EqualizerGains,
    EqualizerPresetKey,
    equalizerPresetKeys,
    equalizerPresets,
    formatFreq,
    gainValueToProgress,
    MAX_BASS_BOOST_EFFECT_SIZE,
    MAX_NOISE_SHARPENING_EFFECT_SIZE,
    MIN_BASS_BOOST_EFFECT_SIZE,
    MIN_NOISE_SHARPENING_EFFECT_SIZE,
    progressToGainValue,
} from "shared/preferences";
import { SelectDeps } from "ui/Application";
import { DomWrapperSelector } from "ui/platform/dom/Page";
import { EffectPreferencesManager } from "ui/preferences/EffectPreferences";
import {
    ToggleableSlideableValuePreferenceUiBinding,
    ToggleableValuePreferenceUiBinding,
} from "ui/preferences/uibinders";
import AbstractPreferencesBindingContext from "ui/ui/AbstractPreferencesBindingContext";
import AbstractUiBindingManager from "ui/ui/AbstractUiBindingManager";
import { SingleSelectableValue, ToggleableSlideableValue, ToggleableValue } from "ui/ui/templates";

import Slider from "./Slider";

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
                 <div class="equalizer">${equalizerBands
                     .map(band => {
                         const sliderId = `equalizer-band-${band[0]}-slider`;
                         return `<div class="slider-input slider-input-${band[0]}">
                                <div class='${sliderId} slider equalizer-slider vertical-slider'>
                                    <div class='slider-knob'></div>
                                    <div class='slider-background'>
                                        <div class='slider-fill'></div>
                                    </div>
                                </div>
                            </div>
                            <div class="band-label-${band[0]} band-label">${formatFreq(band[0])}</div>`;
                     })
                     .join(``)}</div>
            </section>`;

class EqualizerUiBinding {
    private _effectUiBindingManager: EffectUiBindingManager;
    private _equalizerSliders: Slider[];
    private _presetSelector: SingleSelectableValue<EqualizerPresetKey>;
    constructor(effectUiBindingManager: EffectUiBindingManager) {
        this._effectUiBindingManager = effectUiBindingManager;
        this._equalizerSliders = equalizerBands.map((band, index) => {
            const slider = effectUiBindingManager
                .bindingContext()
                .sliderContext()
                .createSlider({
                    direction: `vertical`,
                    target: this.$().find(`.equalizer-band-${band[0]}-slider`),
                });

            let eq: EqualizerGains | null;
            slider.on(`slideBegin`, () => {
                eq = this._effectUiBindingManager.preferencesManager.get("equalizer") as EqualizerGains;
            });

            slider.on(`slide`, p => {
                const value = progressToGainValue(p);
                eq![index] = value;
                this._effectUiBindingManager.preferencesManager.set("equalizer", eq!);
                this._effectUiBindingManager.preferencesUpdated();
                this._updatePreset();
            });

            slider.on(`slideEnd`, () => {
                eq = null;
            });

            return slider;
        });

        this._presetSelector = new SingleSelectableValue<EqualizerPresetKey>({
            label: `Preset`,
            valueTextMap: equalizerPresetKeys,
            onValueChange: this.equalizerPresetChanged,
        });
        this._presetSelector.renderTo(this.$().find(`.js-equalizer-container`));
    }

    $() {
        return this._effectUiBindingManager.$();
    }

    layoutUpdated() {
        this._equalizerSliders.forEach(s => s.forceRelayout());
    }

    equalizerPresetChanged = (val: EqualizerPresetKey) => {
        if ((equalizerPresets as any)[val]) {
            this._effectUiBindingManager.preferencesManager.set("equalizer", (equalizerPresets as any)[val]);
            this._effectUiBindingManager.preferencesUpdated();
            this._updateSliders();
        }
    };

    _updatePreset() {
        const presetName = this._effectUiBindingManager.preferencesManager.getMatchingEqualizerPresetName();
        this._presetSelector.setValue(presetName);
    }

    _updateSliders() {
        const eq = this._effectUiBindingManager.preferencesManager.get("equalizer");
        for (let i = 0; i < eq.length; ++i) {
            this._equalizerSliders[i]!.setValue(gainValueToProgress(eq[i]!));
        }
    }

    update() {
        this._updatePreset();
        this._updateSliders();
    }
}

class EffectUiBindingManager extends AbstractUiBindingManager<EffectPreferences, EffectPreferencesManager> {
    constructor(rootSelector: DomWrapperSelector, bindingContext: EffectPreferencesBindingContext) {
        super(rootSelector, bindingContext, new EffectPreferencesManager().toJSON());
        const sliderContext = bindingContext.sliderContext();

        this.addBinding(new EqualizerUiBinding(this))
            .addBinding(
                new ToggleableSlideableValuePreferenceUiBinding(
                    this.$().find(`.js-noise-sharpening-container`),
                    new ToggleableSlideableValue(
                        {
                            checkboxLabel: `Enable noise sharpening`,
                            sliderLabel: `Strength`,
                            valueFormatter: value => value.toFixed(1),
                            minValue: MIN_NOISE_SHARPENING_EFFECT_SIZE,
                            maxValue: MAX_NOISE_SHARPENING_EFFECT_SIZE,
                        },
                        { sliderContext }
                    ),
                    `noiseSharpeningStrength`,
                    `noiseSharpeningEnabled`,
                    this
                )
            )
            .addBinding(
                new ToggleableSlideableValuePreferenceUiBinding(
                    this.$().find(`.js-bass-boost-container`),
                    new ToggleableSlideableValue(
                        {
                            checkboxLabel: `Enable bass boost`,
                            sliderLabel: `Strength`,
                            valueFormatter: value => value.toFixed(1),
                            minValue: MIN_BASS_BOOST_EFFECT_SIZE,
                            maxValue: MAX_BASS_BOOST_EFFECT_SIZE,
                        },
                        { sliderContext }
                    ),
                    `bassBoostStrength`,
                    `bassBoostEnabled`,
                    this
                )
            )
            .addBinding(
                new ToggleableSlideableValuePreferenceUiBinding(
                    this.$().find(`.js-crossfade-container`),
                    new ToggleableSlideableValue(
                        {
                            checkboxLabel: `Enable crossfading`,
                            sliderLabel: `Duration`,
                            valueFormatter: value => `${value.toFixed(1)}s`,
                            minValue: CROSSFADE_MIN_DURATION,
                            maxValue: CROSSFADE_MAX_DURATION,
                        },
                        { sliderContext }
                    ),
                    `crossfadeDuration`,
                    `crossfadeEnabled`,
                    this
                )
            )
            .addBinding(
                new ToggleableValuePreferenceUiBinding(
                    this.$().find(`.js-album-preference-container`),
                    new ToggleableValue({
                        checkboxLabel: `Don't crossfade between consecutive tracks of the same album`,
                    }),
                    `shouldAlbumNotCrossfade`,
                    this
                )
            );
        this.update();
    }
}

type Deps = SelectDeps<
    | "page"
    | "env"
    | "rippler"
    | "popupContext"
    | "db"
    | "dbValues"
    | "recognizerContext"
    | "sliderContext"
    | "globalEvents"
    | "mainMenu"
>;

export default class EffectPreferencesBindingContext extends AbstractPreferencesBindingContext<
    EffectPreferences,
    EffectPreferencesManager,
    EffectUiBindingManager
> {
    constructor(deps: Deps) {
        super(new EffectPreferencesManager(), deps, {
            popupPreferenceKey: "effectPreferencesPopup",
            preferenceCategoryKey: "effectPreferences",
            title: `Effects`,
            template: TEMPLATE,
        });
        deps.mainMenu.on(`effects`, this.openPopup.bind(this));
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    willUpdatePreferences() {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    willUpdatePreference() {}

    _createManager() {
        return new EffectUiBindingManager(this.popup().$body(), this);
    }

    pm() {
        return this._preferencesManager;
    }

    getNoiseSharpeningEffectSize() {
        return this.pm().get("noiseSharpeningEnabled") ? this.pm().get("noiseSharpeningStrength") : 0;
    }

    getBassBoostEffectSize() {
        return this.pm().get("bassBoostEnabled") ? this.pm().get("bassBoostStrength") : 0;
    }

    getCrossfadeDuration() {
        return this.pm().get("crossfadeEnabled") ? this.pm().get("crossfadeDuration") : 0;
    }

    getShouldAlbumNotCrossfade() {
        return this.pm().get("shouldAlbumNotCrossfade");
    }

    getAudioPlayerEffects(): AudioPlayerEffects {
        return [
            {
                name: `noise-sharpening`,
                effectSize: this.getNoiseSharpeningEffectSize(),
            },
            {
                name: `bass-boost`,
                effectSize: this.getBassBoostEffectSize(),
            },
            {
                name: `equalizer`,
                gains: this.pm().get("equalizer") as EqualizerGains,
            },
        ];
    }
}
