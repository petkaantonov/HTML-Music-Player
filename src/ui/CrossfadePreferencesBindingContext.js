import {Preferences, presets, CURVE_MAP, MIN_TIME, MAX_TIME, STORAGE_KEY} from "preferences/CrossfadingPreferences";
import {SingleSelectableValue,
        ToggleableValue,
        ToggleableSlideableValue} from "ui/templates";
import {SingleSelectableValuePreferenceUiBinding,
        ToggleableValuePreferenceUiBinding,
        ToggleableSlideableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";
import AbstractPreferencesBindingContext from "ui/AbstractPreferencesBindingContext";

const TEMPLATE = `<div class='settings-container crossfade-settings-container'>
    <div class='section-container album-preference-container'></div>
    <div class='section-separator'></div>
    <div class='left'>
        <div class="fade-in-slide-toggle-container"></div>
        <div class="fade-in-curve-container"></div>
    </div>
    <div class='section-separator no-border'></div>
    <div class='right'>
        <div class="fade-out-slide-toggle-container"></div>
        <div class="fade-out-curve-container"></div>
    </div>
    <div class='section-separator no-border'></div>
    <div class='section-separator'></div>
    <div class='section-container preset-container'></div>
</div>`;


class CrossfadeBindingManager extends AbstractUiBindingManager {
    constructor(rootSelector, bindingContext) {
        super(rootSelector, bindingContext, presets[`Default (Disabled)`].snapshot());

        const sliderContext = bindingContext.sliderContext();

        this.
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.album-preference-container`),
            new ToggleableValue({checkboxLabel: `Don't crossfade between consecutive tracks of the same album`}),
            `shouldAlbumNotCrossFade`,
            this
        )).
        addBinding(new ToggleableSlideableValuePreferenceUiBinding(
            this.$().find(`.fade-in-slide-toggle-container`),
            new ToggleableSlideableValue({
                checkboxLabel: `Enable fade in`,
                sliderLabel: `Time`,
                valueFormatter: value => `${value.toFixed(1)}s`,
                minValue: MIN_TIME,
                maxValue: MAX_TIME
            }, {sliderContext}),
            `inTime`,
            `inEnabled`,
            this
        )).
        addBinding(new SingleSelectableValuePreferenceUiBinding(
            this.$().find(`.fade-in-curve-container`),
            new SingleSelectableValue({
                label: `Curve`,
                valueTextMap: CURVE_MAP
            }),
            `inCurve`,
            this
        )).
        addBinding(new ToggleableSlideableValuePreferenceUiBinding(
            this.$().find(`.fade-out-slide-toggle-container`),
            new ToggleableSlideableValue({
                checkboxLabel: `Enable fade out`,
                sliderLabel: `Time`,
                valueFormatter: value => `${value.toFixed(1)}s`,
                minValue: MIN_TIME,
                maxValue: MAX_TIME
            }, {sliderContext}),
            `outTime`,
            `outEnabled`,
            this
        )).
        addBinding(new SingleSelectableValuePreferenceUiBinding(
            this.$().find(`.fade-out-curve-container`),
            new SingleSelectableValue({
                label: `Curve`,
                valueTextMap: CURVE_MAP
            }),
            `outCurve`,
            this
        )).
        addBinding({
            update: () => {
                this._updatePreset();
            },
            layoutUpdated() {
                // Noop
            }
        });

        this._presetSelector = new SingleSelectableValue({
            label: `Preset`,
            valueTextMap: Object.keys(presets),
            onValueChange: this.presetChanged.bind(this)
        });
        this._presetSelector.renderTo(this.$().find(`.preset-container`));

        this.update();
    }


    presetChanged(val) {
        if (presets[val]) {
            this.applyPreferencesFrom(presets[val]);
        }
    }

    _updatePreset() {
        const presetName = this.preferences.getMatchingPresetName();
        this._presetSelector.setValue(presetName);
    }
}

export default class CrossfadePreferencesBindingContext extends AbstractPreferencesBindingContext {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Crossfading`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`crossfading`, this.openPopup.bind(this));
    }

    _createManager() {
        return new CrossfadeBindingManager(this.popup().$(), this);
    }
}

