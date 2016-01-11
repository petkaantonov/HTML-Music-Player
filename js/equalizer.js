"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const GlobalUi = require("./GlobalUi");
const keyValueDatabase = require("./KeyValueDatabase");
const hotkeyManager = require("./HotkeyManager");
const Slider = require("./Slider");
var equalizer = new EventEmitter();
module.exports = equalizer;
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

const STORAGE_KEY = "equalizer";
equalizer.amplitudeRatioToDecibelChange = function(ratio) {
    if (!isFinite(+ratio)) throw new Error("ratio must be a number");
    return 20 * Math.log(ratio) * Math.LOG10E;
};

equalizer.decibelChangeToAmplitudeRatio = function(decibel) {
    if (!isFinite(+decibel)) return 1;
    return Math.pow(10, (decibel / 20));
};

var presets = {
    "None": {
        "70": 0,
        "180": 0,
        "320": 0,
        "600": 0,
        "1000": 0,
        "3000": 0,
        "6000": 0,
        "12000": 0,
        "14000": 0,
        "16000": 0,
        "preamp": 0
    },

    "Classical": {
        "70": -1,
        "180": -1,
        "320": -1,
        "600": -1,
        "1000": -1,
        "3000": -1,
        "6000": -7,
        "12000": -7,
        "14000": -7,
        "16000": -9,
        "preamp": -1
    },
    "Club": {
        "70": -1,
        "180": -1,
        "320": 8,
        "600": 5,
        "1000": 5,
        "3000": 5,
        "6000": 3,
        "12000": -1,
        "14000": -1,
        "16000": -1,
        "preamp": -6.71999979019165
    },
    "Dance": {
        "70": 9,
        "180": 7,
        "320": 2,
        "600": -1,
        "1000": -1,
        "3000": -5,
        "6000": -7,
        "12000": -7,
        "14000": -1,
        "16000": -1,
        "preamp": -4.319999694824219
    },
    "Full Bass": {
        "70": -8,
        "180": 9,
        "320": 9,
        "600": 5,
        "1000": 1,
        "3000": -4,
        "6000": -8,
        "12000": -10,
        "14000": -11,
        "16000": -11,
        "preamp": -7.199999809265137
    },
    "Full Bass & Treble": {
        "70": 7,
        "180": 5,
        "320": -1,
        "600": -7,
        "1000": -4,
        "3000": 1,
        "6000": 8,
        "12000": 11,
        "14000": 12,
        "16000": 12,
        "preamp": -10.079999923706055
    },
    "Full Treble": {
        "70": -9,
        "180": -9,
        "320": -9,
        "600": -4,
        "1000": 2,
        "3000": 11,
        "6000": 16,
        "12000": 16,
        "14000": 16,
        "16000": 16,
        "preamp": -12
    },
    "Laptop Speakers / Headphone": {
        "70": 4,
        "180": 11,
        "320": 5,
        "600": -3,
        "1000": -2,
        "3000": 1,
        "6000": 4,
        "12000": 9,
        "14000": 12,
        "16000": 14,
        "preamp": -8.15999984741211
    },
    "Large Hall": {
        "70": 10,
        "180": 10,
        "320": 5,
        "600": 5,
        "1000": -1,
        "3000": -4,
        "6000": -4,
        "12000": -4,
        "14000": -1,
        "16000": -1,
        "preamp": -7.199999809265137
    },
    "Live": {
        "70": -4,
        "180": -1,
        "320": 4,
        "600": 5,
        "1000": 5,
        "3000": 5,
        "6000": 4,
        "12000": 2,
        "14000": 2,
        "16000": 2,
        "preamp": -5.279999732971191
    },
    "Party": {
        "70": 7,
        "180": 7,
        "320": -1,
        "600": -1,
        "1000": -1,
        "3000": -1,
        "6000": -1,
        "12000": -1,
        "14000": 7,
        "16000": 7,
        "preamp": -5.279999732971191
    },
    "Pop": {
        "70": -1,
        "180": 4,
        "320": 7,
        "600": 8,
        "1000": 5,
        "3000": -1,
        "6000": -2,
        "12000": -2,
        "14000": -1,
        "16000": -1,
        "preamp": -6.239999771118164
    },
    "Reggae": {
        "70": -1,
        "180": -1,
        "320": -1,
        "600": -5,
        "1000": -1,
        "3000": 6,
        "6000": 6,
        "12000": -1,
        "14000": -1,
        "16000": -1,
        "preamp": -8.15999984741211
    },
    "Rock": {
        "70": 8,
        "180": 4,
        "320": -5,
        "600": -8,
        "1000": -3,
        "3000": 4,
        "6000": 8,
        "12000": 11,
        "14000": 11,
        "16000": 11,
        "preamp": -10.079999923706055
    },
    "Ska": {
        "70": -2,
        "180": -4,
        "320": -4,
        "600": -1,
        "1000": 4,
        "3000": 5,
        "6000": 8,
        "12000": 9,
        "14000": 11,
        "16000": 9,
        "preamp": -11.039999961853027
    },
    "Soft": {
        "70": 4,
        "180": 1,
        "320": -1,
        "600": -2,
        "1000": -1,
        "3000": 4,
        "6000": 8,
        "12000": 9,
        "14000": 11,
        "16000": 12,
        "preamp": -9.59999942779541
    },
    "Soft Rock": {
        "70": 4,
        "180": 4,
        "320": 2,
        "600": -1,
        "1000": -4,
        "3000": -5,
        "6000": -3,
        "12000": -1,
        "14000": 2,
        "16000": 8,
        "preamp": -5.279999732971191
    },
    "Techno": {
        "70": 8,
        "180": 5,
        "320": -1,
        "600": -5,
        "1000": -4,
        "3000": -1,
        "6000": 8,
        "12000": 9,
        "14000": 9,
        "16000": 8,
        "preamp": -7.679999828338623
    }
};

var EQUALIZER_MAX_GAIN = 12;
var EQUALIZER_MIN_GAIN = -12;

equalizer.bands = [
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

equalizer.equalizer = Object.create(null);

equalizer.toGainValue = function(value) {
    value = parseInt(value, 10);
    if (!isFinite(value)) return 0;
    return Math.max(Math.min(value, EQUALIZER_MAX_GAIN), EQUALIZER_MIN_GAIN);
};

equalizer.frequencyToIndex = (function() {
    var map = Object.create(null);

    equalizer.bands.forEach(function(band, index) {
        map[band[0]] = index;
    });

    return function(freq) {
        return map[freq];
    };
})();

function formatFreq(freq) {
    if (freq < 1000) {
        return freq + " Hz";
    } else {
        return Math.round(freq / 1000) + " KHz";
    }
}

function getCurrentlyMatchingPreset() {
    var freqs = Object.keys(equalizer.equalizer);
    var presetNames = Object.keys(presets);

    for (var i = 0; i < presetNames.length; ++i) {
        var preset = presets[presetNames[i]];

        if (freqs.every(function(freq) {
            return equalizer.equalizer[freq] === preset[freq];
        })) {
            return presetNames[i];
        }
    }
    return "Custom";
}

var html = (function() {
    var descriptorContainerHtml = "<div class='equalizer-descriptor-container'>                         \
        <div id='equalizer-max-gain' class='equalizer-max-gain'>+"+EQUALIZER_MAX_GAIN+" dB</div>        \
        <div id='equalizer-current-gain' class='equalizer-current-gain'>                                \
            <div class='equalizer-current-gain-sign'></div>                                             \
            <div class='equalizer-current-gain-value'>0</div>                                           \
            <div class='equalizer-current-gain-unit'>dB</div>                                           \
        </div>                                                                                          \
        <div id='equalizer-min-gain' class='equalizer-min-gain'>"+EQUALIZER_MIN_GAIN+" dB</div>         \
    </div>";

    var sliderContainerHtml = "<div class='equalizer-sliders-container'>" +
        equalizer.bands.map(function(band) {
            var sliderId = "equalizer-band-" + band[0] + "-slider";
            var knobId = "equalizer-band-" + band[0] + "-knob";
            return "<div class='equalizer-slider-container'>                             \
                <div id='"+sliderId+"' class='app-general-slider-wrap vertical equalizer-slider-wrap'>\
                    <div id='"+knobId+"' class='app-general-slider-knob vertical'></div> \
                </div>                                                                   \
                <div class='notextflow band-frequency-label'>"+formatFreq(band[0])+"</div>          \
            </div>";
        }).join("") + "</div>";

    var presetHtml = "<select id='equalizer-preset-selector'><option selected value='Custom'>Custom</option>" +
        Object.keys(presets).map(function(presetName) {
            return "<option value='"+presetName+"'>"+presetName+"</option>";
        }).join("") +
    "</select>";

    var presetContainerHtml = "<div class='equalizer-preset-container'>                 \
        <span class='equalizer-preset-label'>Load a preset: </span> "+presetHtml+"      \
    </div>";



    return "<div class='equalizer-popup-content-container'>              \
                "+descriptorContainerHtml+"                              \
                "+sliderContainerHtml+"                                  \
                "+presetContainerHtml+"                                  \
            </div>";
})();
const equalizerPopup = GlobalUi.makePopup("Equalizer", html, ".menul-equalizer");

function gainValueToProgress(gainValue) {
    var max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    var abs = gainValue + EQUALIZER_MAX_GAIN;
    return abs / max;
}

function progressToGainValue(progress) {
    var max = Math.abs(EQUALIZER_MIN_GAIN) + Math.abs(EQUALIZER_MAX_GAIN);
    var value = Math.round(progress * max);
    return value - Math.abs(EQUALIZER_MAX_GAIN);
}

function formatGainValue(value) {
    if (value > 0) {
        return ["+", Math.abs(value), "dB"];
    } else if (value < 0) {
        return ["-", Math.abs(value), "dB"];
    } else {
        return ["", 0, "dB"];
    }
}

function selectCurrentlyMatchingPreset() {
    var preset = getCurrentlyMatchingPreset();

    $("#equalizer-preset-selector option").each(function() {
        this.selected = $(this).val() === preset;
    });
}

function selectCustomPreset() {
    $("#equalizer-preset-selector").val("Custom");
}

var triggerEqualizerChange = util.throttle(function() {
    equalizer.emit("equalizerChange");
}, 50);

function openEditor() {
    equalizerPopup.open();

    selectCurrentlyMatchingPreset();
    var currentGain =  $("#equalizer-current-gain");
    var currentGainSign = currentGain.find(".equalizer-current-gain-sign");
    var currentGainValue = currentGain.find(".equalizer-current-gain-value");
    var currentGainUnit = currentGain.find(".equalizer-current-gain-unit");

    var sliders = equalizer.bands.map(function(band) {
        var currentValue = null;
        var freq = band[0];
        var db = equalizer.equalizer[freq];
        var sliderSelector = "#equalizer-band-" + freq + "-slider";
        var knob = document.getElementById("equalizer-band-" + freq + "-knob");


        var slider = new Slider(sliderSelector, {
            direction: "vertical"
        });

        function updateKnob(p) {
            knob.style.top = (p * 110 - 5) + "px";
        }

        slider.on("slideBegin", function() {
            currentValue = null;
            currentGain.show();
        });

        slider.on("slide", function(p) {
            selectCustomPreset();
            updateKnob(p);
            var value = equalizer.toGainValue(progressToGainValue(1 - p));
            var formatting = formatGainValue(value);

            currentGainSign.text(formatting[0]);
            currentGainValue.text(formatting[1]);
            currentGainUnit.text(formatting[2]);
            currentValue = value;
            equalizer.equalizer[freq] = value;
            equalizer.equalizer.preamp = null;
            triggerEqualizerChange();
        });

        slider.on("slideEnd", function() {
            var value = currentValue;
            currentValue = null;
            currentGain.hide();
            equalizer.equalizer[freq] = value;
            keyValueDatabase.set(STORAGE_KEY, equalizer.equalizer);
            triggerEqualizerChange();
        });

        updateKnob(1 - gainValueToProgress(db));

        return {
            update: function(db) {
                updateKnob(1 - gainValueToProgress(db));
            }
        };
    });

    $("#equalizer-preset-selector").bind("change", function() {
        var presetName = $(this).val();

        if (presetName !== "Custom") {
            var preset = presets[presetName];
            Object.keys(equalizer.equalizer).forEach(function(freq, index) {
                // Check for "preamp".
                if (!isFinite(+freq)) return;
                var db = preset[freq];
                sliders[index].update(db);
                equalizer.equalizer[freq] = db;
            });
            equalizer.equalizer.preamp = preset.preamp;
            keyValueDatabase.set(STORAGE_KEY, equalizer.equalizer);
            triggerEqualizerChange();
        }
    });
}

keyValueDatabase.getInitialValues().then(function(values) {
    if (STORAGE_KEY in values) {
        var EQ = Object.create(null);
        equalizer.bands.forEach(function(band) {
            var freq = band[0];
            EQ[freq] = equalizer.toGainValue(values[STORAGE_KEY][freq]);
        });
        equalizer.equalizer = EQ;
    } else {
        equalizer.bands.forEach(function(band) {
            equalizer.equalizer[band[0]] = 0;
        });
    }
});

equalizer.getBands = function() {
    return equalizer.equalizer;
};

if (!touch) {
    $(".menul-equalizer").click(openEditor);
} else {
    $(".menul-equalizer").on("touchstart touchend", domUtil.tapHandler(openEditor));
}

hotkeyManager.addDescriptor({
    category: "General actions",
    action: "Open equalizer",
    description: "Opens the equalizer popup.",
    handler: openEditor
});
