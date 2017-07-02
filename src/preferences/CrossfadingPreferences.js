import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import preferenceCreator from "preferences/PreferenceCreator";
import {Float32Array} from "platform/platform";

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
            defaultValue: false,
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

export default function CrossfadingPreferences(opts, deps) {
    opts = noUndefinedGet(opts);
    AbstractPreferences.call(this, new Preferences(), opts, deps);
}
inherits(CrossfadingPreferences, AbstractPreferences);

CrossfadingPreferences.prototype.STORAGE_KEY = STORAGE_KEY;
CrossfadingPreferences.prototype.TITLE = `Crossfading`;

/* eslint-disable no-use-before-define */
CrossfadingPreferences.prototype._createManager = function() {
    return new CrossFadeManager(this.popup().$(), this);
};
/* eslint-enable no-use-before-define */

CrossfadingPreferences.prototype.getHtml = function() {
    const PRESET_HTML = `<select class='fade-preset-select'>
        ${Object.keys(presets).map(key => `<option value='${key}'>${key}</option>`).join(``)}
    </select>`;

    return `<div class='settings-container crossfade-settings-container'>
            <div class='section-container'>
                <div class='fade-inputs-container inputs-container'>
                    <div class='checkbox-container'>
                        <input type='checkbox' id='album-preference-checkbox-id' class='album-preference-checkbox checkbox'>
                    </div>
                    <div class='album-preference-label label wide-label'>
                        <label class='album-preference-text' for='album-preference-checkbox-id'>
                            Don't crossfade between consecutive tracks of the same album
                        </label>
                    </div>
                </div>
            </div>
        <div class='section-separator'></div>
        <div class='left fade-in-configurator fade-configurator-container'></div>
        <div class='right fade-out-configurator fade-configurator-container'></div>
        <div class='section-separator'></div>
        <div class='section-container'>
            <div class='fade-inputs-container inputs-container'>
                <div class='label fade-preset-label'>Preset</div>
                <div class='select-container preset-selector-container'>${PRESET_HTML}</div>
            </div>
        </div>
        </div>`;
};

const CURVE_SELECTOR_HTML = `<select class='fade-curve-select'>
    ${Object.keys(CURVE_MAP).map(key => `<option value='${key}'>${CURVE_MAP[key]}</option>`).join(``)}
</select>`;

const FADE_CONFIGURATOR_HTML =
    `<div class='fade-inputs-container inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='fade-enable-checkbox checkbox'>
        </div>
        <div class='fade-enable-label label wide-label'>
            <label class='fade-enable-text'></label>
        </div>
    </div>
    <div class='fade-inputs-container inputs-container'>
        <div class='fade-time-label label'>Time</div>
        <div class='fade-time-slider slider horizontal-slider'>
            <div class='slider-knob'></div>
            <div class='slider-background'>
                <div class='slider-fill'></div>
            </div>
        </div>
        <div class='fade-time-value'></div>
    </div>
    <div class='fade-inputs-container inputs-container'>
        <div class='fade-curve-label label'>Curve</div>
        <div class='select-container fade-curve-container'></div>
        </div>
    </div>`;

function FadeConfigurator(manager, domNode, config) {
    this._domNode = domNode;
    this.manager = manager;
    this.config = config;
    this.slided = this.slided.bind(this);
    this.curveChanged = this.curveChanged.bind(this);
    this.enabledChanged = this.enabledChanged.bind(this);

    this.$().setHtml(FADE_CONFIGURATOR_HTML);
    this.$().find(`.fade-curve-container`).setHtml(CURVE_SELECTOR_HTML);
    const enabledId = (`${config.enablerText}`).replace(/[^a-zA-Z0-9]+/g, ``);
    this.$().find(`.fade-enable-checkbox`).setProperty(`id`, enabledId);
    this.$().find(`.fade-enable-text`).setText(config.enablerText).setProperty(`htmlFor`, enabledId);

    this.slider = manager.crossfadingPreferences.sliderContext().createSlider({
        target: this.$().find(`.fade-time-slider`)
    });
    this.slider.on(`slide`, this.slided);
    this.$().find(`.fade-enable-checkbox`).addEventListener(`change`, this.enabledChanged);
    this.$().find(`.fade-curve-select`).addEventListener(`change`, this.curveChanged);
    this.update();
}

FadeConfigurator.prototype.destroy = function() {
    this.slider.removeAllListeners();
    this.slider = null;
    this.$().find(`.fade-enable-checkbox`).removeEventListener(`change`, this.enabledChanged);
    this.$().find(`.fade-curve-select`).removeEventListener(`change`, this.curveChanged);
    this._domNode = null;
};

FadeConfigurator.prototype.curveChanged = function(e) {
    this.setCurve(this.manager.crossfadingPreferences.page().$(e.target).value());
};

FadeConfigurator.prototype.enabledChanged = function(e) {
    this.setEnabled(e.target.checked);
};

FadeConfigurator.prototype.slided = function(p) {
    this.setTime((p * (MAX_TIME - MIN_TIME) + MIN_TIME));
};

FadeConfigurator.prototype.update = function() {
    const time = this.getTime();
    const timePercentage = (time - MIN_TIME) / (MAX_TIME - MIN_TIME);
    this.$().find(`.fade-time-value`).setText(`${time.toPrecision(2)}s`);
    this.$().find(`.fade-curve-select`).setValue(this.getCurve());
    this.$().find(`.fade-enable-checkbox`).setProperty(`checked`, this.getEnabled());


    if (!this.getEnabled()) {
        this.$().find(`.fade-time-slider`).addClass(`slider-inactive`);
    } else {
        this.$().find(`.fade-time-slider`).removeClass(`slider-inactive`);
    }
    this.slider.setValue(timePercentage);
};

FadeConfigurator.prototype.managerUpdated = function() {
    this.update();
};

FadeConfigurator.prototype.setTime = function(time) {
    this.manager.preferences[`set${this.config.preferenceKey}Time`](time);
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.setEnabled = function(enabled) {
    this.manager.preferences[`set${this.config.preferenceKey}Enabled`](enabled);
    this.manager.configuratorUpdated();
    this.update();
};

FadeConfigurator.prototype.setCurve = function(curve) {
    this.manager.preferences[`set${this.config.preferenceKey}Curve`](curve);
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.getTime = function() {
    return this.manager.preferences[`get${this.config.preferenceKey}Time`]();
};

FadeConfigurator.prototype.getEnabled = function() {
    return this.manager.preferences[`get${this.config.preferenceKey}Enabled`]();
};

FadeConfigurator.prototype.getCurve = function() {
    return this.manager.preferences[`get${this.config.preferenceKey}Curve`]();
};

FadeConfigurator.prototype.$ = function() {
    return this._domNode;
};

function CrossFadeManager(domNode, crossfadingPreferences) {
    EventEmitter.call(this);
    this._domNode = crossfadingPreferences.page().$(domNode).eq(0);
    this.crossfadingPreferences = crossfadingPreferences;
    this.preferences = crossfadingPreferences.preferences();
    this.defaultPreferences = presets[`Default (Disabled)`].snapshot();
    this.unchangedPreferences = null;
    this.inFadeConfigurator = new FadeConfigurator(this, this.$().find(`.fade-in-configurator`), {
        enablerText: `Enable fade in`,
        preferenceKey: `In`
    });
    this.outFadeConfigurator = new FadeConfigurator(this, this.$().find(`.fade-out-configurator`), {
        enablerText: `Enable fade out`,
        preferenceKey: `Out`
    });

    this.shouldAlbumCrossFadeChanged = this.shouldAlbumCrossFadeChanged.bind(this);
    this.presetChanged = this.presetChanged.bind(this);
    this.$().find(`.fade-preset-select`).addEventListener(`change`, this.presetChanged);
    this.$().find(`.album-preference-checkbox`).addEventListener(`change`, this.shouldAlbumCrossFadeChanged);
    this.update();
}
inherits(CrossFadeManager, EventEmitter);

CrossFadeManager.prototype.destroy = function() {
    this.inFadeConfigurator.destroy();
    this.outFadeConfigurator.destroy();
    this.removeAllListeners();
    this.$().find(`.fade-preset-select`).removeEventListener(`change`, this.presetChanged);
    this.$().find(`.album-preference-checkbox`).removeEventListener(`change`, this.shouldAlbumCrossFadeChanged);
    this._domNode = null;
};

CrossFadeManager.prototype.shouldAlbumCrossFadeChanged = function(e) {
    const val = e.target.checked;
    this.preferences.setShouldAlbumCrossFade(!val);
    this.update();
    this.emit(`update`);
};

CrossFadeManager.prototype.presetChanged = function(e) {
    const val = this.crossfadingPreferences.page().$(e.target).value();

    if (presets[val]) {
        this.applyPreferencesFrom(presets[val]);
    }
};

CrossFadeManager.prototype.applyPreferencesFrom = function(preferences) {
    this.preferences.copyFrom(preferences);
    this.inFadeConfigurator.managerUpdated();
    this.outFadeConfigurator.managerUpdated();
    this.configuratorUpdated();
};

CrossFadeManager.prototype.configuratorUpdated = function() {
    this.update();
    this.emit(`update`);
};

CrossFadeManager.prototype.update = function() {
    const presetName = this.preferences.getMatchingPresetName();
    this.$().find(`.fade-preset-select`).setValue(presetName);
    this.$().find(`.album-preference-checkbox`).setProperty(`checked`, !this.preferences.shouldAlbumCrossFade);

    this.crossfadingPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
    this.crossfadingPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));
};

CrossFadeManager.prototype.restoreDefaults = function() {
    this.applyPreferencesFrom(this.defaultPreferences);
};

CrossFadeManager.prototype.undoChanges = function() {
    this.applyPreferencesFrom(this.unchangedPreferences);
};

CrossFadeManager.prototype.setUnchangedPreferences = function() {
    this.unchangedPreferences = this.preferences.snapshot();
    this.update();
};

CrossFadeManager.prototype.$ = function() {
    return this._domNode;
};

CrossFadeManager.prototype.layoutUpdated = function() {
    // Noop
};
