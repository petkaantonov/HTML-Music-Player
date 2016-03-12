"use strict";
import $ from "lib/jquery";
import EventEmitter from "lib/events";
import { inherits, throttle } from "lib/util";
import { makePopup } from "ui/GlobalUi";
import Popup from "ui/Popup";
import Slider from "ui/Slider";
import { TOUCH_EVENTS, tapHandler } from "lib/DomUtil";
import preferenceCreator from "PreferenceCreator";

const PROGRESS_INCREASE = 1;
const PROGRESS_DECREASE = 2;

const DEFAULT_CURVE = "sCurve";
const MIN_TIME = 1;
const MAX_TIME = 12;
const DEFAULT_TIME = 5;

const RESTORE_DEFAULTS_BUTTON = "restore-defaults";
const UNDO_CHANGES_BUTTON = "undo-changes";
const STORAGE_KEY = "crossfading-preference";

const CURVE_MAP = {
    "linear": "Linear",
    "sCurve": "S-Curve",
    "cubicFromStart": "Cubic",
    "exponentialFromStart": "Exponential Start",
    "exponentialToEnd": "Exponential End"
};

const curveInterpolator = {
    cubicFromStart: function(ticks, maxTicks, progressDirection) {
        var ret = (ticks = ticks / maxTicks - 1) * ticks * ticks + 1;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    linear: function(ticks, maxTicks, progressDirection) {
        var ret = ticks / maxTicks;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    sCurve: function(ticks, maxTicks, progressDirection) {
        ticks = ticks / (maxTicks / 2);

        var ret;
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

    exponentialFromStart: function(ticks, maxTicks, progressDirection) {
        var ret = (ticks == maxTicks) ? 1 : -Math.pow(2, -10 * ticks /
            maxTicks) + 1;
        if (progressDirection === PROGRESS_DECREASE) {
            return 1 - ret;
        }
        return ret;
    },

    exponentialToEnd: function(ticks, maxTicks, progressDirection) {
        var ret = (ticks == 0) ? 0 : Math.pow(2, 10 * (ticks / maxTicks -
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

    for (var i = 0; i < maxTicks; ++i) {
        ret[i] = interpolator(i, maxTicks - 1, progressDirection);
    }
    return ret;
};

const Preferences = preferenceCreator({
    methods: {
        getInCurveSamples: function() {
            return getSamplesForCurve(this.getInCurve(), PROGRESS_INCREASE);
        },

        getOutCurveSamples: function() {
            return getSamplesForCurve(this.getOutCurve(), PROGRESS_DECREASE);
        },

        getMatchingPresetName: function() {
            var presetNames = Object.keys(presets);
            for (var i = 0; i < presetNames.length; ++i) {
                if (presets[presetNames[i]].equals(this)) {
                    return presetNames[i];
                }
            }
            return "Custom";
        }
    },

    preferences: {
        inEnabled: {
            defaultValue: false,
            asValidValue: function(value) {
                return !!value;
            }
        },
        outEnabled: {
            defaultValue: false,
            asValidValue: function(value) {
                return !!value;
            }
        },
        inTime: {
            defaultValue: DEFAULT_TIME,
            asValidValue: function(value) {
                if (!isFinite(+value)) return DEFAULT_TIME;
                return Math.min(Math.max(MIN_TIME, +value), MAX_TIME);
            }
        },
        outTime: {
            defaultValue: DEFAULT_TIME,
            asValidValue: function(value) {
                if (!isFinite(+value)) return DEFAULT_TIME;
                return Math.min(Math.max(MIN_TIME, +value), MAX_TIME);
            }
        },
        inCurve: {
            defaultValue: "sCurve",
            asValidValue: function(value) {
                value = value + "";
                return CURVE_MAP.hasOwnProperty(value) ? value : DEFAULT_CURVE;
            }
        },
        outCurve: {
            defaultValue: "sCurve",
            asValidValue: function(value) {
                value = value + "";
                return CURVE_MAP.hasOwnProperty(value) ? value : DEFAULT_CURVE;
            }
        },
        shouldAlbumCrossFade: {
            defaultValue: false,
            asValidValue: function(value) {
                return !!value;
            }
        },
    }
});

const presets = {
    "Default (Disabled)": new Preferences(),
    "Basic": new Preferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: "linear",
        outCurve: "linear"
    }),
    "Sudden death": new Preferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: "exponentialFromStart",
        outCurve: "sCurve"
    }),
    "Custom": new Preferences()
};

export default function CrossfadingPreferences(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.opts = opts;
    this.rippler = opts.rippler;
    this.env = opts.env;
    this.db = opts.db;
    this.preferences = new Preferences();
    this.popup = makePopup("Crossfading", this.getHtml(), opts.preferencesButton, [{
        id: RESTORE_DEFAULTS_BUTTON,
        text: "Restore defaults",
        action: function(e) {
            this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
            this.manager.restoreDefaults();
        }.bind(this)
    }, {
        id: UNDO_CHANGES_BUTTON,
        text: "Undo changes",
        action: function(e) {
            this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
            this.manager.undoChanges();
        }.bind(this)
    }]);

    this.manager = null;

    $(opts.preferencesButton).click(this.popup.open.bind(this.popup));

    if (this.env.hasTouch()) {
        $(opts.preferencesButton).on(TOUCH_EVENTS, tapHandler(this.popup.open.bind(this.popup)));
    }
    this.popup.on("open", this.popupOpened.bind(this));

    if (opts.dbValues && STORAGE_KEY in opts.dbValues) {
        this.preferences.copyFrom(opts.dbValues[STORAGE_KEY]);
        this.emit("change", this.preferences);
    }
}
inherits(CrossfadingPreferences, EventEmitter);

CrossfadingPreferences.prototype.savePreferences = throttle(function() {
    this.emit("change", this.preferences);
    this.db.set(STORAGE_KEY, this.preferences.toJSON());
}, 250);

CrossfadingPreferences.prototype.getPreferences = function() {
    return this.preferences;
};

CrossfadingPreferences.prototype.popupOpened = function() {
    if (!this.manager) {
        this.manager = new CrossFadeManager(this.popup.$(), this.popup, this.preferences);
        this.manager.on("update", this.savePreferences.bind(this));
    }
    this.manager.setUnchangedPreferences();
};

CrossfadingPreferences.prototype.getHtml = function() {
    var PRESET_HTML = (function() {
        return "<select class='fade-preset-select'>" + Object.keys(presets).map(function(key) {
            return "<option value='"+key+"'>"+key+"</option>";
        }).join("") + "</select>";
    })();

    return "<div class='settings-container crossfade-settings-container'>                                                                                                \
            <div class='section-container'>                                                                                                                      \
                <div class='fade-inputs-container inputs-container'>                                                                                                              \
                    <div class='checkbox-container'>                                                                                                             \
                        <input type='checkbox' id='album-preference-checkbox-id' class='album-preference-checkbox checkbox'>                                        \
                    </div>                                                                                                                                       \
                    <div class='album-preference-label label wide-label'>                                                                                        \
                        <label class='album-preference-text' for='album-preference-checkbox-id'>Don't crossfade between consecutive tracks of the same album</label>\
                    </div>                                                                                                                                       \
                </div>                                                                                                                                           \
            </div>                                                                                                                                               \
        <div class='section-separator'></div>                                                                                                                    \
        <div class='left fade-in-configurator fade-configurator-container'></div>                                                                                \
        <div class='right fade-out-configurator fade-configurator-container'></div>                                                                              \
        <div class='section-separator'></div>                                                                                                                    \
        <div class='section-container'>                                                                                                                          \
            <div class='fade-inputs-container inputs-container'>                                                                                                                  \
                <div class='label fade-preset-label'>Preset</div>                                                                                                \
                <div class='select-container preset-selector-container'>                                                                                                          \
                    " + PRESET_HTML + "                                                                                                                          \
                </div>                                                                                                                                           \
            </div>                                                                                                                                               \
        </div>                                                                                                                                                                                                                                                                                                                                                                                                                                                         \
        </div>";
};

const CURVE_SELECTOR_HTML = (function() {
    return "<select class='fade-curve-select'>" + Object.keys(CURVE_MAP).map(function(key) {
        return "<option value='"+key+"'>"+CURVE_MAP[key]+"</option>";
    }).join("") + "</select>";
})();

const FADE_CONFIGURATOR_HTML =
    "<div class='fade-inputs-container inputs-container'>                                                              \
        <div class='checkbox-container'>                                                              \
            <input type='checkbox' class='fade-enable-checkbox checkbox'>                             \
        </div>                                                                                        \
        <div class='fade-enable-label label wide-label'>                                              \
            <label class='fade-enable-text'></label>                                                  \
        </div>                                                                                        \
    </div>                                                                                            \
    <div class='fade-inputs-container inputs-container'>                                                               \
        <div class='fade-time-label label'>Time</div>                                                 \
        <div class='fade-time-slider slider horizontal-slider'>                                       \
            <div class='slider-knob'></div>                                                           \
            <div class='slider-background'>                                                           \
                <div class='slider-fill'></div>                                                       \
            </div>                                                                                    \
        </div>                                                                                        \
        <div class='fade-time-value'></div>                                                           \
    </div>                                                                                            \
    <div class='fade-inputs-container inputs-container'>                                                               \
        <div class='fade-curve-label label'>Curve</div>                                               \
        <div class='select-container fade-curve-container'></div>                                                      \
        </div>                                                                                        \
    </div>";

function FadeConfigurator(manager, domNode, config) {
    this._domNode = domNode;
    this.manager = manager;
    this.config = config;
    this.slided = $.proxy(this.slided, this);
    this.curveChanged = $.proxy(this.curveChanged, this);
    this.enabledChanged = $.proxy(this.enabledChanged, this);

    this.$().html(FADE_CONFIGURATOR_HTML);
    this.$().find(".fade-curve-container").html(CURVE_SELECTOR_HTML);
    var enabledId = (config.enablerText + "").replace(/[^a-zA-Z0-9]+/g, "");
    this.$().find(".fade-enable-checkbox").prop("id", enabledId);
    this.$().find(".fade-enable-text").text(config.enablerText).prop("htmlFor", enabledId);

    this.slider = new Slider($(".fade-time-slider", this.$()));
    this.slider.on("slide", this.slided);
    this.$().find(".fade-enable-checkbox").on("change", this.enabledChanged);
    this.$().find(".fade-curve-select").on("change", this.curveChanged);
    this.update();
}

FadeConfigurator.prototype.destroy = function() {
    this.slider.removeAllListeners();
    this.slider = null;
    this.$().find(".fade-enable-checkbox").off("change", this.enabledChanged);
    this.$().find(".fade-curve-select").off("change", this.curveChanged);
    this._domNode = null;
};

FadeConfigurator.prototype.curveChanged = function(e) {
    this.setCurve($(e.target).val());
};

FadeConfigurator.prototype.enabledChanged = function(e) {
    this.setEnabled(e.target.checked);
};

FadeConfigurator.prototype.slided = function(p) {
    this.setTime((p * (MAX_TIME - MIN_TIME) + MIN_TIME));
};

FadeConfigurator.prototype.update = function() {
    var time = this.getTime();
    var timePercentage = (time - MIN_TIME) / (MAX_TIME - MIN_TIME);
    this.$().find(".fade-time-value").text(time.toPrecision(2) + "s");
    this.$().find(".fade-curve-select").val(this.getCurve());
    this.$().find(".fade-enable-checkbox").prop("checked", this.getEnabled());


    if (!this.getEnabled()) {
        this.$().find(".fade-time-slider").addClass("slider-inactive");
    } else {
        this.$().find(".fade-time-slider").removeClass("slider-inactive");
    }
    this.slider.setValue(timePercentage);
};

FadeConfigurator.prototype.managerUpdated = function() {
    this.update();
};

FadeConfigurator.prototype.setTime = function(time) {
    this.manager.preferences["set" + this.config.preferenceKey + "Time"](time);
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.setEnabled = function(enabled) {
    this.manager.preferences["set" + this.config.preferenceKey + "Enabled"](enabled);
    this.manager.configuratorUpdated();
    this.update();
};

FadeConfigurator.prototype.setCurve = function(curve) {
    this.manager.preferences["set" + this.config.preferenceKey + "Curve"](curve);
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.getTime = function() {
    return this.manager.preferences["get" + this.config.preferenceKey + "Time"]();
};

FadeConfigurator.prototype.getEnabled = function() {
    return this.manager.preferences["get" + this.config.preferenceKey + "Enabled"]();
};

FadeConfigurator.prototype.getCurve = function() {
    return this.manager.preferences["get" + this.config.preferenceKey + "Curve"]();
};

FadeConfigurator.prototype.$ = function() {
    return this._domNode;
};

function CrossFadeManager(domNode, popup, preferences) {
    EventEmitter.call(this);
    this._domNode = $(domNode);
    this._popup = popup;
    this.preferences = preferences;
    this.defaultPreferences = presets["Default (Disabled)"].snapshot();
    this.unchangedPreferences = null;
    this.inFadeConfigurator = new FadeConfigurator(this, this.$().find(".fade-in-configurator"), {
        enablerText: "Enable fade in",
        preferenceKey: "In"
    });
    this.outFadeConfigurator = new FadeConfigurator(this, this.$().find(".fade-out-configurator"), {
        enablerText: "Enable fade out",
        preferenceKey: "Out"
    });

    this.shouldAlbumCrossFadeChanged = $.proxy(this.shouldAlbumCrossFadeChanged, this);
    this.presetChanged = $.proxy(this.presetChanged, this);
    this.$().find(".fade-preset-select").on("change", this.presetChanged);
    this.$().find(".album-preference-checkbox").on("change", this.shouldAlbumCrossFadeChanged);
    this.update();
}
inherits(CrossFadeManager, EventEmitter);

CrossFadeManager.prototype.destroy = function() {
    this.inFadeConfigurator.destroy();
    this.outFadeConfigurator.destroy();
    this.removeAllListeners();
    this.$().find(".fade-preset-select").off("change", this.presetChanged);
    this.$().find(".album-preference-checkbox").off("change", this.shouldAlbumCrossFadeChanged);
    this._domNode = null;
};

CrossFadeManager.prototype.shouldAlbumCrossFadeChanged = function(e) {
    var val = $(e.target).prop("checked");
    this.preferences.shouldAlbumCrossFade = CrossFadePreferences.asValidShouldAlbumCrossFade(!val);
    this.update();
    this.emit("update");
};

CrossFadeManager.prototype.presetChanged = function(e) {
    var val = $(e.target).val();

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
    this.emit("update");
};

CrossFadeManager.prototype.update = function() {
    var presetName = this.preferences.getMatchingPresetName();
    this.$().find(".fade-preset-select").val(presetName);
    this.$().find(".album-preference-checkbox").prop("checked", !this.preferences.shouldAlbumCrossFade);
    var restoreDefaultsEnabled = !this.preferences.equals(this.defaultPreferences);
    this._popup.setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, restoreDefaultsEnabled);
    var undoChangesEnabled = !this.preferences.equals(this.unchangedPreferences);
    this._popup.setButtonEnabledState(UNDO_CHANGES_BUTTON, undoChangesEnabled);
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

