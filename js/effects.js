"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const GlobalUi = require("./GlobalUi");
const keyValueDatabase = require("./KeyValueDatabase");
const hotkeyManager = require("./HotkeyManager");
const Slider = require("./Slider");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const createPreferences = require("./PreferenceCreator");
const Popup = require("./Popup");

const EQUALIZER_MAX_GAIN = 12;
const EQUALIZER_MIN_GAIN = -12;
const RESTORE_DEFAULTS_BUTTON = "restore-defaults";
const UNDO_CHANGES_BUTTON = "undo-changes";
const STORAGE_KEY = "effects-preferences";

const effects = new EventEmitter();
module.exports = effects;

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
    "Techno": [8,5,-1,-5,-4,-1,8,9,9,]
};

const equalizerPresetKeys = Object.keys(equalizerPresets);

const EffectsPreferences = createPreferences({
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
        }
    }
});

const preferences = new EffectsPreferences();

const formatFreq = function(freq) {
    if (freq < 1000) {
        return freq + " Hz";
    } else {
        return Math.round(freq / 1000) + " KHz";
    }
};


var html = (function() {
    var equalizerBandGroups = [];
    var groupSize = 5;
    var cur = 0;
    while (cur < equalizerBands.length) {
        var equalizerBandGroup = equalizerBands.slice(cur, cur + groupSize);
        equalizerBandGroups.push(equalizerBandGroup);
        cur += groupSize;
    }

    var sliderContainerHtml = "<div class='equalizer-sliders-container row'>" +
        equalizerBandGroups.map(function(bands) {
            return "<div class='equalizer-band-group-container col-lg-6'>" +
                    bands.map(function(band) {
                        var sliderId = "equalizer-band-" + band[0] + "-slider";
                        return "<div class='equalizer-band-configurator-container'>                                               \
                                <div class='equalizer-slider-container'>                                                          \
                                    <div class='"+sliderId+" slider equalizer-slider vertical-slider'>                            \
                                        <div class='slider-knob'></div>                                                           \
                                        <div class='slider-background'>                                                           \
                                            <div class='slider-fill'></div>                                                       \
                                        </div>                                                                                    \
                                    </div>                                                                                        \
                                </div>                                                                                            \
                                <div class='equalizer-band-label-container'>                                                      \
                                    <div class='notextflow band-frequency-label'>"+formatFreq(band[0])+"</div>                    \
                                </div>                                                                                            \
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
                <div class='section-container'>"+sliderContainerHtml+"</div>                 \
                <div class='section-separator'></div>                                       \
                "+presetContainerHtml+"                                                     \
            </div>";
})();

function EffectsManager(domNode, popup, preferences) {
    EventEmitter.call(this);
    this._domNode = $($(domNode)[0]);
    this._popup = popup;
    this.preferences = preferences;
    this.defaultPreferences = new EffectsPreferences();
    this.unchangedPreferences = null;

    this._sliders = equalizerBands.map(function(band, index) {
        var self = this;
        var slider = new Slider(this.$().find(".equalizer-band-" + band[0] + "-slider"), {
            direction: "vertical"
        });

        var eq;
        slider.on("slideBegin", function() {
            eq = self.preferences.getEqualizer();
        });

        slider.on("slide", function(p) {
            var value = progressToGainValue(p);
            eq[index] = value;
            self.preferences.setInPlaceEqualizer(eq);
            self.preferencesUpdated(true);
        });

        slider.on("slideEnd", function() {
            eq = null;
        });

        return slider;
    }, this);

    this.$().find(".equalizer-preset-selector").on("change", this.equalizerPresetChanged.bind(this));
}
util.inherits(EffectsManager, EventEmitter);

EffectsManager.prototype.$ = function() {
    return this._domNode;
};

EffectsManager.prototype.applyPreferencesFrom = function(preferences) {
    this.preferences.copyFrom(preferences);
    this.preferencesUpdated();
};

EffectsManager.prototype.preferencesUpdated = function(noDomEqUpdate) {
    this.emit("preferencesUpdate");
    this.update(!!noDomEqUpdate);
};

EffectsManager.prototype.equalizerPresetChanged = function(e) {
    var val = $(e.target).val();

    if (equalizerPresets[val]) {
        this.preferences.setEqualizer(equalizerPresets[val]);
        this.preferencesUpdated();

    }
};

EffectsManager.prototype.update = function(noDomEqUpdate) {
    var presetName = this.preferences.getMatchingEqualizerPresetName();
    this.$().find(".equalizer-preset-selector").val(presetName);

    if (!noDomEqUpdate) {
        var eq = this.preferences.getInPlaceEqualizer();
        for (var i = 0; i < eq.length; ++i) {
            this._sliders[i].setValue(gainValueToProgress(eq[i]));
        }
    }

    var restoreDefaultsEnabled = !this.preferences.equals(this.defaultPreferences);
    this._popup.setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, restoreDefaultsEnabled);
    var undoChangesEnabled = !this.preferences.equals(this.unchangedPreferences);
    this._popup.setButtonEnabledState(UNDO_CHANGES_BUTTON, undoChangesEnabled);
};

EffectsManager.prototype.restoreDefaults = function() {
    this.applyPreferencesFrom(this.defaultPreferences);
};

EffectsManager.prototype.undoChanges = function() {
    this.applyPreferencesFrom(this.unchangedPreferences);
};

EffectsManager.prototype.setUnchangedPreferences = function() {
    this.unchangedPreferences = this.preferences.snapshot();
    this.update();
};

const equalizerPopup = GlobalUi.makePopup("Effects", html, ".menul-effects", [
{
    id: RESTORE_DEFAULTS_BUTTON,
    text: "Restore defaults",
    action: function(e) {
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
        effectsManager.restoreDefaults();
    }
},
{
    id: UNDO_CHANGES_BUTTON,
    text: "Undo changes",
    action: function(e) {
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
        effectsManager.undoChanges();
    }
}
]);
var effectsManager;

equalizerPopup.on("open", function(popup, needsInitialization) {
    if (needsInitialization) {
        effectsManager = new EffectsManager(".equalizer-popup-content-container", popup, preferences);

        effectsManager.on("preferencesUpdate", function() {
            savePreferences(effectsManager.preferences);
        });
    }
    effectsManager.setUnchangedPreferences();
});


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

const openEditor = function(e) {
    GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    equalizerPopup.open();
}

keyValueDatabase.getInitialValues().then(function(values) {
    if (STORAGE_KEY in values) {
        preferences.copyFrom(values[STORAGE_KEY]);
    }
});

const savePreferences = util.throttle(function() {
    keyValueDatabase.set(STORAGE_KEY, preferences.toJSON());
    effects.emit("effectsChange", preferences);
}, 250);

effects.amplitudeRatioToDecibelChange = function(ratio) {
    if (!isFinite(+ratio)) throw new Error("ratio must be a number");
    return 20 * Math.log(ratio) * Math.LOG10E;
};

effects.decibelChangeToAmplitudeRatio = function(decibel) {
    if (!isFinite(+decibel)) return 1;
    return Math.pow(10, (decibel / 20));
};

effects.getPreferences = function() {
    return preferences;
};

effects.frequencyToIndex = (function() {
    var map = Object.create(null);

    equalizerBands.forEach(function(band, index) {
        map[band[0]] = index;
    });

    return function(freq) {
        return map[freq];
    };
})();

effects.indexToFrequency = function(index) {
    return equalizerBands[index][0];
};

effects.getEqualizerSetup = function(track) {
    return {
        specs: equalizerBands,
        gains: effects.getPreferences().getEqualizer()
    };
};

$(".menul-effects").click(openEditor);

if (touch) {
    $(".menul-effects").on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(openEditor));
}

hotkeyManager.addDescriptor({
    category: "General actions",
    action: "Open effects",
    description: "Opens the effects customization popup.",
    handler: openEditor
});
