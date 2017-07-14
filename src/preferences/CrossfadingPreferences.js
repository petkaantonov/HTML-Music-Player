import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import preferenceCreator from "preferences/PreferenceCreator";
import {Float32Array} from "platform/platform";
import {SingleSelectableValue,
        ToggleableValue,
        ToggleableSlideableValue} from "ui/templates";
import {SingleSelectableValuePreferenceUiBinding,
        ToggleableValuePreferenceUiBinding,
        ToggleableSlideableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";

const PROGRESS_INCREASE = 1;
const PROGRESS_DECREASE = 2;

const DEFAULT_CURVE = `sCurve`;
const MIN_TIME = 1;
const MAX_TIME = 12;
const DEFAULT_TIME = 5;
const STORAGE_KEY = `crossfading-preference`;

const CURVE_MAP = {
    "linear": `Linear`,
    "sCurve": `S-Curve`,
    "cubicFromStart": `Cubic`,
    "exponentialFromStart": `Exponential Start`,
    "exponentialToEnd": `Exponential End`
};

const curveInterpolator = {
    cubicFromStart(ticks, maxTicks, progressDirection) {
        const ret = (ticks = ticks / maxTicks - 1) * ticks * ticks + 1;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    linear(ticks, maxTicks, progressDirection) {
        const ret = ticks / maxTicks;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    sCurve(ticks, maxTicks, progressDirection) {
        ticks /= (maxTicks / 2);

        let ret;
        if (ticks < 1) {
            ret = 1 / 2 * ticks * ticks * ticks;
        } else {
            ret = 1 / 2 * ((ticks -= 2) * ticks * ticks + 2);
        }
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    exponentialFromStart(ticks, maxTicks, progressDirection) {
        const ret = (ticks === maxTicks) ? 1 : -Math.pow(2, -10 * ticks /
            maxTicks) + 1;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    exponentialToEnd(ticks, maxTicks, progressDirection) {
        const ret = (ticks === 0) ? 0 : Math.pow(2, 10 * (ticks / maxTicks -
            1));
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    }
};

const getSamplesForCurve = function(curve, progressDirection) {
    const interpolator = curveInterpolator[curve];
    const maxTicks = 16;
    const ret = new Float32Array(maxTicks);

    for (let i = 0; i < maxTicks; ++i) {
        ret[i] = interpolator(i, maxTicks - 1, progressDirection);
    }
    return ret;
};

const Preferences = preferenceCreator({
    methods: {
        getInCurveSamples() {
            return getSamplesForCurve(this.getInCurve(), PROGRESS_INCREASE);
        },

        getOutCurveSamples() {
            return getSamplesForCurve(this.getOutCurve(), PROGRESS_DECREASE);
        },

        getMatchingPresetName() {
            /* eslint-disable no-use-before-define */
            const presetNames = Object.keys(presets);
            for (let i = 0; i < presetNames.length; ++i) {
                if (presets[presetNames[i]].equals(this)) {
                    return presetNames[i];
                }
            }
            return `Custom`;
            /* eslint-enable no-use-before-define */
        }
    },

    preferences: {
        inEnabled: {
            defaultValue: false,
            asValidValue(value) {
                return !!value;
            }
        },
        outEnabled: {
            defaultValue: false,
            asValidValue(value) {
                return !!value;
            }
        },
        inTime: {
            defaultValue: DEFAULT_TIME,
            asValidValue(value) {
                if (!isFinite(+value)) return DEFAULT_TIME;
                return Math.min(Math.max(MIN_TIME, +value), MAX_TIME);
            }
        },
        outTime: {
            defaultValue: DEFAULT_TIME,
            asValidValue(value) {
                if (!isFinite(+value)) return DEFAULT_TIME;
                return Math.min(Math.max(MIN_TIME, +value), MAX_TIME);
            }
        },
        inCurve: {
            defaultValue: `sCurve`,
            asValidValue(value) {
                value += ``;
                return CURVE_MAP.hasOwnProperty(value) ? value : DEFAULT_CURVE;
            }
        },
        outCurve: {
            defaultValue: `sCurve`,
            asValidValue(value) {
                value += ``;
                return CURVE_MAP.hasOwnProperty(value) ? value : DEFAULT_CURVE;
            }
        },
        shouldAlbumCrossFade: {
            defaultValue: true,
            asValidValue(value) {
                return !!value;
            }
        }
    }
});

const presets = {
    "Default (Disabled)": new Preferences(),
    "Basic": new Preferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: `linear`,
        outCurve: `linear`
    }),
    "Sudden death": new Preferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: `exponentialFromStart`,
        outCurve: `sCurve`
    }),
    "Custom": new Preferences()
};

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


export default class CrossfadingPreferences extends AbstractPreferences {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Crossfading`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`crossfading`, this.openPopup.bind(this));
    }

    /* eslint-disable no-use-before-define */
    _createManager() {
        return new CrossFadeManager(this.popup().$(), this);
    }
    /* eslint-enable no-use-before-define */
}


class CrossFadeManager extends AbstractUiBindingManager {
    constructor(rootSelector, bindingContext) {
        super(rootSelector, bindingContext, presets[`Default (Disabled)`].snapshot());

        const sliderContext = bindingContext.sliderContext();

        this.
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.album-preference-container`),
            new ToggleableValue({checkboxLabel: `Don't crossfade between consecutive tracks of the same album`}),
            `shouldAlbumCrossFade`,
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
