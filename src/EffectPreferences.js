"use strict";
import $ from "lib/jquery";
import EventEmitter from "lib/events";
import { inherits, throttle } from "lib/util";
import Slider from "ui/Slider";
import { TOUCH_EVENTS, tapHandler } from "lib/DomUtil";
import createPreferences from "PreferenceCreator";
import Popup from "ui/Popup";

const EQUALIZER_MAX_GAIN = 12;
const EQUALIZER_MIN_GAIN = -12;
const RESTORE_DEFAULTS_BUTTON = "restore-defaults";
const UNDO_CHANGES_BUTTON = "undo-changes";
const STORAGE_KEY = "effect-preferences";

const gainValueToProgress = function(gainValue) {
    var max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    var abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
};

const progressToGainValue = function(progress) {
    var max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    var value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
};

const formatFreq = function(freq) {
    if (freq < 1000) {
        return freq + " Hz";
    } else {
        return Math.round(freq / 1000) + " KHz";
    }
};

const equalizerBands = [
    [70, 'lowshelf'],
    [180, 'peaking'],
    [320, 'peaking'],
    [600, 'peaking'],
    [1000, 'peaking'],
    [3000, 'peaking'],
    [6000, 'peaking'],
    [12000, 'peaking'],
    [14000, 'peaking'],
    [16000, 'highshelf']
];

const equalizerPresets = {
    "None": [0,0,0,0,0,0,0,0,0,0],
    "Classical": [-1,-1,-1,-1,-1,-1,-7,-7,-7,-9],
    "Club": [-1,-1,8,5,5,5,3,-1,-1,-1],
    "Dance": [9,7,2,-1,-1,-5,-7,-7,-1,-1],
    "Full Bass": [-8,9,9,5,1,-4,-8,-10,-11,-11],
    "Full Bass & Treble": [7,5,-1,-7,-4,1,8,11,12,12],
    "Full Treble": [-9,-9,-9,-4,2,11,12,12,12,12],
    "Laptop Speakers / Headphone": [4,11,5,-3,-2,1,4,9,12,12],
    "Large Hall": [10,10,5,5,-1,-4,-4,-4,-1,-1],
    "Live": [-4,-1,4,5,5,5,4,2,2,2],
    "Party": [7,7,-1,-1,-1,-1,-1,-1,7,7],
    "Pop": [-1,4,7,8,5,-1,-2,-2,-1,-1],
    "Reggae": [-1,-1,-1,-5,-1,6,6,-1,-1,-1],
    "Rock": [8,4,-5,-8,-3,4,8,11,11,11],
    "Ska": [-2,-4,-4,-1,4,5,8,9,11,9],
    "Soft": [4,1,-1,-2,-1,4,8,9,11,12],
    "Soft Rock": [4,4,2,-1,-4,-5,-3,-1,2,8],
    "Techno": [8,5,-1,-5,-4,-1,8,9,9,8]
};

const equalizerPresetKeys = Object.keys(equalizerPresets);

const Preferences = createPreferences({
    methods: {
        getMatchingEqualizerPresetName: function() {
            var equalizer = this.getInPlaceEqualizer();
            for (var i = 0; i < equalizerPresetKeys.length; ++i) {
                var name = equalizerPresetKeys[i];
                var preset = equalizerPresets[name];
                if (this._equals(preset, equalizer)) {
                    return name;
                }
            }
            return "Custom";
        }
    },

    preferences: {
        equalizer: {
            defaultValue: equalizerPresets["None"],
            asValidValue: function(value) {
                if (!Array.isArray(value) || value.length !== 10) {
                    return this.defaultEqualizer;
                }

                for (var i = 0; i < value.length; ++i) {
                    value[i] = (Math.max(EQUALIZER_MIN_GAIN, Math.min(EQUALIZER_MAX_GAIN, +value[i]))) || 0;
                }

                return value;
            }
        },

        noiseSharpeningStrength: {
            defaultValue: 0.6,
            asValidValue: function(value) {
                var ret = Math.max(0, Math.min(2, +value));
                return isFinite(ret) ? ret : this.defaultNoiseSharpeningStrength;
            }
        },

        noiseSharpeningEnabled: {
            defaultValue: true,
            asValidValue: function(value) {
                return !!value;
            }
        }
    }
});

export default function EffectPreferences(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.opts = opts;
    this.rippler = opts.rippler;
    this.db = opts.db;
    this.env = opts.env;
    this.preferences = new Preferences();

    this.popup = opts.popupMaker.makePopup("Effects", this.getHtml(), opts.preferencesButton, [{
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
inherits(EffectPreferences, EventEmitter);

EffectPreferences.prototype.savePreferences = throttle(function() {
    this.emit("change", this.preferences);
    this.db.set(STORAGE_KEY, this.preferences.toJSON());
}, 250);

EffectPreferences.prototype.getPreferences = function() {
    return this.preferences;
};

EffectPreferences.prototype.popupOpened = function() {
    if (!this.manager) {
        this.manager = new EffectManager(".equalizer-popup-content-container", this.popup, this.preferences);
        this.manager.on("update", this.savePreferences.bind(this));
    }
    this.manager.setUnchangedPreferences();
};

EffectPreferences.prototype.amplitudeRatioToDecibelChange = function(ratio) {
    if (!isFinite(+ratio)) throw new Error("ratio must be a number");
    return 20 * Math.log(ratio) * Math.LOG10E;
};

EffectPreferences.prototype.decibelChangeToAmplitudeRatio = function(decibel) {
    if (!isFinite(+decibel)) return 1;
    return Math.pow(10, (decibel / 20));
};

EffectPreferences.prototype.frequencyToIndex = (function() {
    var map = Object.create(null);

    equalizerBands.forEach(function(band, index) {
        map[band[0]] = index;
    });

    return function(freq) {
        return map[freq];
    };
})();

EffectPreferences.prototype.indexToFrequency = function(index) {
    return equalizerBands[index][0];
};

EffectPreferences.prototype.getEqualizerSetup = function(track) {
    return {
        specs: equalizerBands,
        gains: this.preferences.getEqualizer()
    };
};

EffectPreferences.prototype.getAudioPlayerEffects = function(track) {
    var pref = this.preferences;
    return [{
        name: "noise-sharpening",
        effectSize: pref.getNoiseSharpeningEnabled() ? pref.getNoiseSharpeningStrength() : 0
    }];
};

EffectPreferences.prototype.getHtml = function() {
    var noiseSharpeningEffectHtml = "<div class='inputs-container'>                                                 \
        <div class='label wide-label subtitle'>Noise sharpening</div>                                               \
    </div>";

    noiseSharpeningEffectHtml += "<div class='inputs-container'>                                                    \
        <div class='checkbox-container'>                                                                            \
            <input type='checkbox' class='noise-sharpening-enable-checkbox checkbox' id='noise-sharpening-enable-label-id'>\
        </div>                                                                                                      \
        <div class='noise-sharpening-enable-label label wide-label'>                                                \
            <label for='noise-sharpening-enable-label-id'>Enable noise sharpening</label>                           \
        </div>                                                                                                      \
    </div>";

    noiseSharpeningEffectHtml += "<div class='inputs-container'>                                                    \
        <div class='label'>Strength</div>                                                                           \
        <div class='noise-sharpening-slider slider horizontal-slider'>                                              \
            <div class='slider-knob'></div>                                                                         \
            <div class='slider-background'>                                                                         \
                <div class='slider-fill'></div>                                                                     \
            </div>                                                                                                  \
        </div>                                                                                                      \
        <div class='noise-sharpening-value slider-value-indicator'></div>                                           \
    </div>";

    var equalizerBandGroups = [];
    var groupSize = 5;
    var cur = 0;
    while (cur < equalizerBands.length) {
        var equalizerBandGroup = equalizerBands.slice(cur, cur + groupSize);
        equalizerBandGroups.push(equalizerBandGroup);
        cur += groupSize;
    }

    var sliderContainerHtml = "<div class='inputs-container'>                                                       \
        <div class='label wide-label subtitle'>Equalizer</div>                                                      \
    </div>";

    sliderContainerHtml += "<div class='equalizer-sliders-container row'>" +
        equalizerBandGroups.map(function(bands) {
            return "<div class='equalizer-band-group-container col-lg-6'>" +
                    bands.map(function(band) {
                        var sliderId = "equalizer-band-" + band[0] + "-slider";
                        return "<div class='equalizer-band-configurator-container'>                                 \
                                <div class='equalizer-slider-container'>                                            \
                                    <div class='"+sliderId+" slider equalizer-slider vertical-slider'>              \
                                        <div class='slider-knob'></div>                                             \
                                        <div class='slider-background'>                                             \
                                            <div class='slider-fill'></div>                                         \
                                        </div>                                                                      \
                                    </div>                                                                          \
                                </div>                                                                              \
                                <div class='equalizer-band-label-container'>                                        \
                                    <div class='notextflow band-frequency-label'>"+formatFreq(band[0])+"</div>      \
                                </div>                                                                              \
                            </div>";
                    }).join("") +
            "</div>";
    }).join("") + "</div>";

    var presetHtml = "<select class='equalizer-preset-selector'><option selected value='Custom'>Custom</option>" +
        equalizerPresetKeys.map(function(presetName) {
            return "<option value='"+presetName+"'>"+presetName+"</option>";
        }).join("") +
    "</select>";

    var presetContainerHtml = "<div class='section-container'>                                                        \
            <div class='inputs-container'>                                                                            \
                <div class='label'>Preset</div>                                                                       \
                <div class='select-container'>                                                                        \
                    " + presetHtml + "                                                                                \
                </div>                                                                                                \
            </div>                                                                                                    \
        </div>";


    return "<div class='settings-container equalizer-popup-content-container'>              \
                <div class='section-container'>"+noiseSharpeningEffectHtml+"</div>          \
                <div class='section-separator'></div>                                       \
                <div class='section-container'>"+sliderContainerHtml+"</div>                \
                "+presetContainerHtml+"                                                     \
            </div>";
};



function NoiseSharpeningEffectManager(effectsManager) {
    this._effectsManager = effectsManager;
    this._slider = new Slider(this.$().find(".noise-sharpening-slider"));

    this._strengthChanged = this._strengthChanged.bind(this);
    this._enabledChanged = this._enabledChanged.bind(this);

    this._slider.on("slide", this._strengthChanged);
    this.$().find(".noise-sharpening-enable-checkbox").on("change", this._enabledChanged);
    this._renderedStrength = -1;
    this._renderedEnabled = null;
}

NoiseSharpeningEffectManager.prototype.$ = function() {
    return this._effectsManager.$();
};

NoiseSharpeningEffectManager.prototype._strengthChanged = function(p) {
    var strength = (p * (2 - 0)) + 0;
    this._effectsManager.preferences.setNoiseSharpeningStrength(strength);
    this._effectsManager.preferences.setNoiseSharpeningEnabled(true);
    this._updateSlider(strength, true);
    this._updateCheckbox(true);
    this._effectsManager.preferencesUpdated(true);
};

NoiseSharpeningEffectManager.prototype._enabledChanged = function() {
    var enabled = this.$().find(".noise-sharpening-enable-checkbox").prop("checked");
    this._effectsManager.preferences.setNoiseSharpeningEnabled(enabled);
    this._updateSlider(this._effectsManager.preferences.getNoiseSharpeningStrength(), enabled);
    this._effectsManager.preferencesUpdated(true);
};

NoiseSharpeningEffectManager.prototype._updateSlider = function(strength, enabled) {
    this._renderedStrength = strength;
    this.$().find(".noise-sharpening-value").text(strength.toFixed(1));
    if (enabled) {
        this.$().find(".noise-sharpening-slider").removeClass("slider-inactive");
    } else {
        this.$().find(".noise-sharpening-slider").addClass("slider-inactive");
    }
    this._slider.setValue((strength - 0) / (2 - 0));
};

NoiseSharpeningEffectManager.prototype._updateCheckbox = function(enabled) {
    this._renderedEnabled = enabled;
    this.$().find(".noise-sharpening-enable-checkbox").prop("checked", enabled);
};

NoiseSharpeningEffectManager.prototype.update = function() {
    var enabled = this._effectsManager.preferences.getNoiseSharpeningEnabled();
    var strength = this._effectsManager.preferences.getNoiseSharpeningStrength();

    if (enabled === this._renderedEnabled && strength === this._renderedStrength) {
        return;
    }

    this._updateSlider(strength, enabled);
    this._updateCheckbox(enabled);
};

function EqualizerEffectManager(effectsManager) {
    this._effectsManager = effectsManager;
    this._equalizerSliders = equalizerBands.map(function(band, index) {
        var self = this;
        var slider = new Slider(this.$().find(".equalizer-band-" + band[0] + "-slider"), {
            direction: "vertical"
        });

        var eq;
        slider.on("slideBegin", function() {
            eq = self._effectsManager.preferences.getEqualizer();
        });

        slider.on("slide", function(p) {
            var value = progressToGainValue(p);
            eq[index] = value;
            self._effectsManager.preferences.setInPlaceEqualizer(eq);
            self._effectsManager.preferencesUpdated();
            self._updatePreset();
        });

        slider.on("slideEnd", function() {
            eq = null;
        });

        return slider;
    }, this);

    this.$().find(".equalizer-preset-selector").on("change", this.equalizerPresetChanged.bind(this));
}

EqualizerEffectManager.prototype.$ = function() {
    return this._effectsManager.$();
};

EqualizerEffectManager.prototype.equalizerPresetChanged = function(e) {
    var val = $(e.target).val();

    if (equalizerPresets[val]) {
        this._effectsManager.preferences.setEqualizer(equalizerPresets[val]);
        this._effectsManager.preferencesUpdated();
        this._updateSliders();
    }
};

EqualizerEffectManager.prototype._updatePreset = function() {
    var presetName = this._effectsManager.preferences.getMatchingEqualizerPresetName();
    this.$().find(".equalizer-preset-selector").val(presetName);
};

EqualizerEffectManager.prototype._updateSliders = function() {
    var eq = this._effectsManager.preferences.getInPlaceEqualizer();
    for (var i = 0; i < eq.length; ++i) {
        this._equalizerSliders[i].setValue(gainValueToProgress(eq[i]));
    }
};

EqualizerEffectManager.prototype.update = function() {
    this._updatePreset();
    this._updateSliders();
};

function EffectManager(domNode, popup, preferences) {
    EventEmitter.call(this);
    this._domNode = $($(domNode)[0]);
    this._popup = popup;
    this.preferences = preferences;
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
    this.emit("update");
    this.update();
};

EffectManager.prototype.update = function() {
    var restoreDefaultsEnabled = !this.preferences.equals(this.defaultPreferences);
    this._popup.setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, restoreDefaultsEnabled);
    var undoChangesEnabled = !this.preferences.equals(this.unchangedPreferences);
    this._popup.setButtonEnabledState(UNDO_CHANGES_BUTTON, undoChangesEnabled);
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
