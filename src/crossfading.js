"use strict";
import $ from "lib/jquery";
import EventEmitter from "lib/events";
const util = require("lib/util");
const GlobalUi = require("ui/GlobalUi");
import Popup from "ui/Popup";
import keyValueDatabase from "KeyValueDatabase";
import Slider from "ui/Slider";
const touch = require("features").touch;
const domUtil = require("lib/DomUtil");
const preferenceCreator = require("PreferenceCreator");

const crossfading = new EventEmitter();
module.exports = crossfading;

const PROGRESS_INCREASE = 1;
const PROGRESS_DECREASE = 2;

const DEFAULT_CURVE = "sCurve";
const MIN_TIME = 1;
const MAX_TIME = 12;
const DEFAULT_TIME = 5;

const RESTORE_DEFAULTS_BUTTON = "restore-defaults";
const UNDO_CHANGES_BUTTON = "undo-changes";
const STORAGE_KEY = "crossfade-preference";

const CURVE_MAP = {
    "linear": "Linear",
    "sCurve": "S-Curve",
    "cubicFromStart": "Cubic",
    "exponentialFromStart": "Exponential Start",
    "exponentialToEnd": "Exponential End"
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

const CrossFadePreferences = preferenceCreator({
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

var presets = {
    "Default (Disabled)": new CrossFadePreferences(),
    "Basic": new CrossFadePreferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: "linear",
        outCurve: "linear"
    }),
    "Sudden death": new CrossFadePreferences({
        inEnabled: true,
        outEnabled: true,
        inCurve: "exponentialFromStart",
        outCurve: "sCurve"
    }),
    "Custom": new CrossFadePreferences()
};

const PRESET_HTML = (function() {
    return "<select class='fade-preset-select'>" + Object.keys(presets).map(function(key) {
        return "<option value='"+key+"'>"+key+"</option>";
    }).join("") + "</select>";
})();

const POPUP_EDITOR_HTML = "<div class='settings-container crossfade-settings-container'>                                                                                                \
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

const crossfadingPopup = GlobalUi.makePopup("Crossfading", POPUP_EDITOR_HTML, ".menul-crossfade", [
{
    id: RESTORE_DEFAULTS_BUTTON,
    text: "Restore defaults",
    action: function(e) {
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
        crossFadeManager.restoreDefaults();
    }
},
{
    id: UNDO_CHANGES_BUTTON,
    text: "Undo changes",
    action: function(e) {
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
        crossFadeManager.undoChanges();
    }
}
]);
var preferences = new CrossFadePreferences();
var crossFadeManager;
crossfading.getPreferences = function() {
    return preferences;
};

keyValueDatabase.getInitialValues().then(function(values) {
    if (STORAGE_KEY in values) {
        preferences = new CrossFadePreferences(values[STORAGE_KEY]);
    }
});


const savePreferences = util.throttle(function(preferences) {
    keyValueDatabase.set(STORAGE_KEY, preferences.toJSON());
    crossfading.emit("crossFadingChange", preferences);
}, 250);

const openPopup = function(e) {
    crossfadingPopup.open();
};

crossfadingPopup.on("open", function(popup, needsInitialization) {
    if (needsInitialization) {
        crossFadeManager = new CrossFadeManager(crossfadingPopup.$(), popup, crossfading.getPreferences());
        crossFadeManager.on("preferencesUpdate", function() {
            savePreferences(crossFadeManager.preferences);
        });
    }
    crossFadeManager.setUnchangedPreferences();
});

$(".menul-crossfade").click(openPopup);

if (touch) {
    $(".menul-crossfade").on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(openPopup));
}

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
util.inherits(CrossFadeManager, EventEmitter);

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
    this.emit("preferencesUpdate");
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
    this.emit("preferencesUpdate");
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

