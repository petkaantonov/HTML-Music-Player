var crossfading = crossfading || new EventEmitter();
(function() {"use strict";

const PROGRESS_INCREASE = 1;
const PROGRESS_DECREASE = 2;

const DEFAULT_CURVE = "sCurve";
const MIN_TIME = 0;
const MAX_TIME = 12;
const DEFAULT_TIME = 5;

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
    "<div class='fade-enabler-container'>                                                             \
        <div class='checkbox-container'>                                                              \
            <label class='fade-enable-label checkbox-label'>                                          \
                <input type='checkbox' class='fade-enable-checkbox checkbox'>                         \
                <span class='fade-enable-text'></span>                                                \
            </label>                                                                                  \
            <div class='fade-indicator'></div>                                                        \
        </div>                                                                                        \
                                                                                                      \
    </div>                                                                                            \
    <div class='fade-inputs-container'>                                                               \
        <div class='normal-fade-label'>Time</div>                                                     \
        <div class='app-general-slider-wrap left fade-slider'>                                        \
            <div class='app-general-slider-knob'></div>                                               \
            <div class='app-general-slider-bg'></div>                                                 \
        </div>                                                                                        \
        <div class='normal-fade-value'></div>                                                         \
        <br class='clear' />                                                                          \
    </div>                                                                                            \
    <div class='fade-inputs-container'>                                                               \
        <div class='fade-curve-label'>Curve</div>                                                     \
        <div class='fade-curve-container'></div>                                                      \
        <br class='clear' />                                                                          \
        </div>                                                                                        \
    </div>";

function CrossFadePreferences(inEnabled, inTime, inCurve,
                             outEnabled, outTime, outCurve,
                             shouldAlbumCrossFade) {
    this.inEnabled = CrossFadePreferences.asValidEnabled(inEnabled);
    this.inTime = CrossFadePreferences.asValidTime(inTime);
    this.inCurve = CrossFadePreferences.asValidCurve(inCurve);
    this.outEnabled = CrossFadePreferences.asValidEnabled(outEnabled);
    this.outTime = CrossFadePreferences.asValidTime(outTime);
    this.outCurve = CrossFadePreferences.asValidCurve(outCurve);
    this.shouldAlbumCrossFade = CrossFadePreferences.asValidShouldAlbumCrossFade(shouldAlbumCrossFade);
    Object.seal(this);
}

CrossFadePreferences.prototype.equals = function(other) {
    if (!other || !(other instanceof CrossFadePreferences)) return false;
    return  this.inEnabled === other.inEnabled &&
            this.inTime === other.inTime &&
            this.inCurve === other.inCurve &&
            this.outEnabled === other.outEnabled &&
            this.outTime === other.outTime &&
            this.outCurve === other.outCurve &&
            this.shouldAlbumCrossFade === other.shouldAlbumCrossFade;
};

CrossFadePreferences.prototype.copyFrom = function(other) {
    this.inEnabled = other.inEnabled;
    this.inTime = other.inTime;
    this.inCurve = other.inCurve;
    this.outEnabled = other.outEnabled;
    this.outTime = other.outTime;
    this.outCurve = other.outCurve;
    this.shouldAlbumCrossFade = other.shouldAlbumCrossFade;
};

CrossFadePreferences.prototype.toJSON = function() {
    return {
        inEnabled: this.inEnabled,
        inTime: this.inTime,
        inCurve: this.inCurve,
        outEnabled: this.outEnabled,
        outTime: this.outTime,
        outCurve: this.outCurve,
        shouldAlbumCrossFade: this.shouldAlbumCrossFade
    };
};

CrossFadePreferences.prototype.getShouldAlbumCrossFade = function() {
    return this.shouldAlbumCrossFade && (this.outEnabled || this.inEnabled);
};

CrossFadePreferences.prototype.getInEnabled = function() {
    return this.inEnabled;
};

CrossFadePreferences.prototype.getInTime = function() {
    return this.getInEnabled() ? this.inTime : 0;
};

CrossFadePreferences.prototype.getInCurve = function() {
    return this.inCurve;
};

CrossFadePreferences.prototype.getOutEnabled = function() {
    return this.outEnabled;
};

CrossFadePreferences.prototype.getOutTime = function() {
    return this.getOutEnabled() ? this.outTime : 0;
};

CrossFadePreferences.prototype.getOutCurve = function() {
    return this.outCurve;
};

CrossFadePreferences.prototype.getInCurveSamples = function() {
    return getSamplesForCurve(this.inCurve, PROGRESS_INCREASE);
};

CrossFadePreferences.prototype.getOutCurveSamples = function() {
    return getSamplesForCurve(this.outCurve, PROGRESS_DECREASE);
};

CrossFadePreferences.asValidTime = function(time) {
    if (!isFinite(+time)) return DEFAULT_TIME;
    return Math.min(Math.max(MIN_TIME, +time), MAX_TIME);
};

CrossFadePreferences.asValidEnabled = function(enabled) {
    return !!enabled;
};

CrossFadePreferences.asValidShouldAlbumCrossFade = function(albumCrossFade) {
    return !!albumCrossFade;
};

CrossFadePreferences.asValidCurve = function(curve) {
    return CURVE_MAP.hasOwnProperty(curve + "") ? curve : DEFAULT_CURVE;
};

CrossFadePreferences.getPresetMatchingPreferences = function(preferences) {
    var presetNames = Object.keys(presets);
    for (var i = 0; i < presetNames.length; ++i) {
        if (presets[presetNames[i]].equals(preferences)) {
            return presetNames[i];
        }
    }
    return "Custom";
};

const presets = {
    "Default": new CrossFadePreferences(true, 5, "sCurve", true, 5, "sCurve", false),
    "Normal": new CrossFadePreferences(true, 5, "linear", true, 5, "linear", false),
    "Sudden death": new CrossFadePreferences(true, 5, "exponentialFromStart", true, 5, "sCurve", false),
    "Disabled": new CrossFadePreferences(false, 0, "sCurve", false, 0, "sCurve", false),
    "Custom": new CrossFadePreferences(false, 0, "sCurve", false, 0, "sCurve", false)
};

const PRESET_HTML = (function() {
    return "<select class='fade-preset-select'>" + Object.keys(presets).map(function(key) {
        return "<option value='"+key+"'>"+key+"</option>";
    }).join("") + "</select>";
})();

const POPUP_EDITOR_HTML = "<div class='cross-fade-album-preference-container'>               \
                <div class='checkbox-container'>                                             \
                    <label class='checkbox-label'>                                           \
                        <input type='checkbox' class='album-crossfade-preference checkbox'>  \
                        Don't crossfade between consecutive tracks of the same album         \
                    </label>                                                                 \
                    <div class='cross-fade-preset-container'>                                \
                        <label>Preset:</label>                                               \
                        "+PRESET_HTML+"                                                      \
                    </div>                                                                   \
                </div>                                                                       \
            </div>                                                                           \
            <div class='section-separator'></div>                                            \
            <div class='left fade-in-configurator fade-configurator-container'></div>        \
            <div class='right fade-out-configurator fade-configurator-container'></div>      \
            <div class='clear'></div>                                                        \
            <div class='section-separator'></div>                                            \
            <canvas width='530' height='230' class='cross-fade-visualizer'></canvas>";

const crossfadingPopup = PanelControls.makePopup("Crossfading", POPUP_EDITOR_HTML);
var preferences = new CrossFadePreferences();
preferences.copyFrom(presets["Default"]);
crossfading.getPreferences = function() {
    return preferences;
};

keyValueDatabase.getInitialValues().then(function(values) {
    if (STORAGE_KEY in values) {
        const store = values[STORAGE_KEY];
        preferences = new CrossFadePreferences(store.inEnabled, store.inTime, store.nCurve,
                                               store.outEnabled, store.outTime, store.outCurve,
                                               store.shouldAlbumCrossFade);
    }
});

const savePreferences = function(preferences) {
    keyValueDatabase.set(STORAGE_KEY, preferences.toJSON());
    crossfading.emit("crossFadingChange", preferences);
};

const openPopup = function() {
    crossfadingPopup.open();
    var manager = new CrossFadeManager(crossfadingPopup.$(), crossfading.getPreferences());
    crossfadingPopup.once("close", function() {
        manager.destroy();
    });
    manager.on("preferencesUpdate", function() {
        savePreferences(manager.preferences);
    });
};

$(".menul-crossfade").click(openPopup);

hotkeyManager.addDescriptor({
    category: "General actions",
    action: "Open crossfading options",
    description: "Opens the crossfading options popup.",
    handler: openPopup
});

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

function FadeConfigurator(manager, domNode, config) {
    this._domNode = domNode;
    this.manager = manager;
    this.config = config;
    this.slided = $.proxy(this.slided, this);
    this.curveChanged = $.proxy(this.curveChanged, this);
    this.enabledChanged = $.proxy(this.enabledChanged, this);

    this.$().html(FADE_CONFIGURATOR_HTML);
    this.$().find(".fade-curve-container").html(CURVE_SELECTOR_HTML);
    this.$().find(".fade-indicator").addClass(config.indicatorClass);
    this.$().find(".fade-enable-text").text(config.enablerText);

    this.slider = new Slider($(".fade-slider", this.$()));
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
    this.setTime(p * MAX_TIME);
};

FadeConfigurator.prototype.update = function() {
    var time = this.getTime();
    var timePercentage = time / MAX_TIME;
    this.$().find(".normal-fade-value").text(time.toPrecision(2) + "s");
    this.$().find(".app-general-slider-knob").css("left", timePercentage * 105 -5);
    this.$().find(".app-general-slider-bg").css("width", (timePercentage * 100) + "%");
    this.$().find(".fade-curve-select").val(this.getCurve());
    this.$().find(".fade-enable-checkbox").prop("checked", this.getEnabled());

    var sectionsSelector = ".normal-fade-value, .app-general-slider-knob, .app-general-slider-bg, .fade-curve-container";
    if (!this.getEnabled()) {
        this.$().find(sectionsSelector).addClass("inactive-section");
    } else {
        this.$().find(sectionsSelector).removeClass("inactive-section");
    }
};

FadeConfigurator.prototype.managerUpdated = function() {
    this.update();
};

FadeConfigurator.prototype.setTime = function(time) {
    time = CrossFadePreferences.asValidTime(time);
    this.manager.preferences[this.config.preferenceKey + "Time"] = time;
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.setEnabled = function(enabled) {
    enabled = CrossFadePreferences.asValidEnabled(enabled);
    this.manager.preferences[this.config.preferenceKey + "Enabled"] = enabled;
    this.manager.configuratorUpdated();
    this.update();
};

FadeConfigurator.prototype.setCurve = function(curve) {
    curve = CrossFadePreferences.asValidCurve(curve);
    this.manager.preferences[this.config.preferenceKey + "Curve"] = curve;
    this.manager.configuratorUpdated();
    if (!this.getEnabled()) this.setEnabled(true);
    this.update();
};

FadeConfigurator.prototype.getTime = function() {
    return this.manager.preferences[this.config.preferenceKey + "Time"];
};

FadeConfigurator.prototype.getEnabled = function() {
    return this.manager.preferences[this.config.preferenceKey + "Enabled"];
};

FadeConfigurator.prototype.getCurve = function() {
    return this.manager.preferences[this.config.preferenceKey + "Curve"];
};

FadeConfigurator.prototype.$ = function() {
    return this._domNode;
};

function CrossFadeManager(domNode, preferences) {
    EventEmitter.call(this);
    this._domNode = $(domNode);
    this.preferences = preferences;
    this.inFadeConfigurator = new FadeConfigurator(this, this.$().find(".fade-in-configurator"), {
        enablerText: "Enable fade in",
        indicatorClass: "fade-in-color",
        preferenceKey: "in"
    });
    this.outFadeConfigurator = new FadeConfigurator(this, this.$().find(".fade-out-configurator"), {
        enablerText: "Enable fade out",
        indicatorClass: "fade-out-color",
        preferenceKey: "out"
    });

    this.visualizer = new CrossFadeVisualizer(".cross-fade-visualizer", this);

    this.shouldAlbumCrossFadeChanged = $.proxy(this.shouldAlbumCrossFadeChanged, this);
    this.presetChanged = $.proxy(this.presetChanged, this);
    this.$().find(".fade-preset-select").on("change", this.presetChanged);
    this.$().find(".album-crossfade-preference").on("change", this.shouldAlbumCrossFadeChanged);
    this.update();
}
util.inherits(CrossFadeManager, EventEmitter);

CrossFadeManager.prototype.destroy = function() {
    this.inFadeConfigurator.destroy();
    this.outFadeConfigurator.destroy();
    this.removeAllListeners();
    this.$().find(".fade-preset-select").off("change", this.presetChanged);
    this.$().find(".album-crossfade-preference").off("change", this.shouldAlbumCrossFadeChanged);
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
        this.preferences.copyFrom(presets[val]);
        this.inFadeConfigurator.managerUpdated();
        this.outFadeConfigurator.managerUpdated();
        this.update();
        this.emit("preferencesUpdate");
    }
};

CrossFadeManager.prototype.configuratorUpdated = function() {
    this.update();
    this.emit("preferencesUpdate");
};

CrossFadeManager.prototype.update = function() {
    var presetName = this.getPresetName();
    this.$().find(".fade-preset-select").val(presetName);
    this.$().find(".album-crossfade-preference").prop("checked", !this.preferences.getShouldAlbumCrossFade());
    this.visualizer.update();
};

CrossFadeManager.prototype.getPresetName = function() {
    return CrossFadePreferences.getPresetMatchingPreferences(this.preferences);
};

CrossFadeManager.prototype.$ = function() {
    return this._domNode;
};

function CrossFadeVisualizer(domNode, manager) {
    domNode = $(domNode);
    this.width = domNode.prop("width");
    this.height = domNode.prop("height");
    this.context = domNode[0].getContext("2d");
    this.manager = manager;
};

CrossFadeVisualizer.prototype.getContext = function() {
    return this.context;
};

CrossFadeVisualizer.prototype.update = function() {
    var ctx = this.getContext();
    var preferences = this.manager.preferences;
    var width = this.width;
    var height = this.height;

    ctx.clearRect(0, 0, width, height);

    if (!preferences.inEnabled && !preferences.outEnabled) return;

    ctx.font = "11px helvetica";
    ctx.fillStyle = "#444444";
    ctx.fillText("Relative volume", 0, 15);

    var yLabelGap = (height - 51) / 5;
    var percentage = 0;
    for (var i = 35; i <= height - 15; i += yLabelGap) {
        ctx.fillText(percentage + " %", 5, i - 6);
        percentage += 20;
    }

    var maxTime = Math.max(preferences.getInTime(), preferences.getOutTime());

    var xLabels = maxTime + 1;
    var xLabelGap = Math.floor((width - 55 - 12) / (xLabels -1));
    for (var i = 0; i < xLabels; ++i) {
        ctx.fillText(i + "s", 55 + i * xLabelGap, height - 15);
    }

    if (preferences.getInEnabled()) {
        this._drawFade({
            time: preferences.getInTime(),
            curve: preferences.getInCurve(),
            maxTime: maxTime,
            xLabelGap: xLabelGap,
            progressDirection: PROGRESS_INCREASE,
            strokeStyle: "rgb(0, 0, 128)",
            fillStyle: "rgba(0, 0, 128, 0.45)"
        });
    }

    if (preferences.getOutEnabled()) {
        this._drawFade({
            time: preferences.getOutTime(),
            curve: preferences.getOutCurve(),
            maxTime: maxTime,
            xLabelGap: xLabelGap,
            progressDirection: PROGRESS_DECREASE,
            strokeStyle: "rgb(0, 100, 0)",
            fillStyle: "rgba(0, 100, 0, 0.45)"
        });
    }
};

CrossFadeVisualizer.prototype._drawFade = function(specs) {
    var ctx = this.getContext();
    var width = this.width;
    var height = this.height;
    var interpolator = curveInterpolator[specs.curve];
    var progressDirection = specs.progressDirection;
    var start = (specs.maxTime - specs.time) * specs.xLabelGap + 55;
    var end = width;

    var ticks = 0;
    var maxTicks = end - start;

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.moveTo(start, height - 25);


    for (var i = start; i <= end; ++i) {
        ctx.lineTo(i, height - (25 + interpolator(ticks, maxTicks, progressDirection) * (height - 51)));
        ticks++;
    }

    ctx.strokeStyle = specs.strokeStyle;
    ctx.stroke();
    ctx.lineTo(end, height - 25);
    ctx.lineTo(start, height - 25);
    ctx.lineTo(start, height - (25 + interpolator(0, maxTicks, progressDirection) * (height - 51)));
    ctx.fillStyle = specs.fillStyle;
    ctx.fill();
    ctx.closePath();
};

})();
