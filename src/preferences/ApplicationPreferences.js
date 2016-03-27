"use strict";

import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import { inherits } from "util";
import createPreferences from "preferences/PreferenceCreator";

const STORAGE_KEY = "application-preferences";

const validBoolean = function(val) {
    return !!val;
};

const Preferences = createPreferences({
    preferences: {
        enableVisualizer: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableMobileNetwork: {
            defaultValue: false,
            asValidValue: validBoolean
        },

        enableTrimStart: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableTrimEnd: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableHideLongTapIndicator: {
            defaultValue: false,
            asValidValue: validBoolean
        },

        backgroundCpuMaxUtilization: {
            defaultValue: 0.5,
            asValidValue: function(val) {
                val = +val;
                if (!isFinite(val)) return this.defaultBackgroundCpuMaxUtilization;
                return Math.min(1, Math.max(0.1, val));
            }
        },

        enableAlbumArt: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableLoudnessNormalization: {
            defaultValue: true,
            asValidValue: validBoolean
        },

        enableOffline: {
            defaultValue: true,
            asValidValue: validBoolean
        }
    }
});

export default function ApplicationPreferences(opts, deps) {
    opts = Object(opts);
    AbstractPreferences.call(this, new Preferences(), opts, deps);
}
inherits(ApplicationPreferences, AbstractPreferences);

ApplicationPreferences.prototype._createManager = function() {
    return new PreferencesManager(this.popup().$(), this);
};

ApplicationPreferences.prototype.setVisualizerEnabled = function(value) {
    this.preferences().setEnableVisualizer(value);
    this.savePreferences();
};

ApplicationPreferences.prototype.STORAGE_KEY = STORAGE_KEY;
ApplicationPreferences.prototype.TITLE = "Preferences";

ApplicationPreferences.prototype.getHtml = function() {
    const mobileNetworkHtml = "<div class='inputs-container'>                                                          \
        <div class='checkbox-container'>                                                                               \
            <input type='checkbox' class='mobile-network-enable-checkbox checkbox' id='mobile-network-enable-label-id'>\
        </div>                                                                                                         \
        <div class='mobile-network-enable-label label wide-label'>                                                     \
            <label for='mobile-network-enable-label-id'>Enable cellular network syncing </label>                       \
        </div>                                                                                                                                                                                                    \
    </div>";

    const trimSilenceAtStartHtml = "<div class='inputs-container'>                                                     \
        <div class='checkbox-container'>                                                                               \
            <input type='checkbox' class='silence-start-enable-checkbox checkbox' id='silence-start-enable-label-id'>  \
        </div>                                                                                                         \
        <div class='silence-start-enable-label label wide-label'>                                                      \
            <label for='silence-start-enable-label-id'>Remove silence from the beginning of tracks</label>             \
        </div>                                                                                                         \
    </div>";

    const trimSilenceAtEndHtml = "<div class='inputs-container'>                                                       \
        <div class='checkbox-container'>                                                                               \
            <input type='checkbox' class='silence-end-enable-checkbox checkbox' id='silence-end-enable-label-id'>      \
        </div>                                                                                                         \
        <div class='silence-end-enable-label label wide-label'>                                                        \
            <label for='silence-end-enable-label-id'>Remove silence from the end of tracks</label>                     \
        </div>                                                                                                         \
    </div>";

    const hideLongTapIndicatorHtml = this.env().hasTouch() ? "<div class='inputs-container'>                                                 \
        <div class='checkbox-container'>                                                                                     \
            <input type='checkbox' class='longtap-indicator-enable-checkbox checkbox' id='longtap-indicator-enable-label-id'>\
        </div>                                                                                                               \
        <div class='longtap-indicator-enable-label label wide-label'>                                                        \
            <label for='longtap-indicator-enable-label-id'>Hide long tap indicator</label>                                   \
        </div>                                                                                                               \
    </div>" : "";

    const trackOfflineDownloadHtml = "<div class='inputs-container'>                                                  \
        <div class='checkbox-container'>                                                                              \
            <input type='checkbox' class='offline-enable-checkbox checkbox' id='offline-enable-label-id'>             \
        </div>                                                                                                        \
        <div class='offline-enable-label label wide-label'>                                                           \
            <label for='offline-enable-label-id'>Download tracks for offline use</label>                              \
        </div>                                                                                                        \
    </div>";

    const loudnessNormalizationHtml = "<div class='inputs-container'>                                                                  \
        <div class='checkbox-container'>                                                                                               \
            <input type='checkbox' class='loudness-normalization-enable-checkbox checkbox' id='loudness-normalization-enable-label-id'>\
        </div>                                                                                                                         \
        <div class='loudness-normalization-enable-label label wide-label'>                                                             \
            <label for='loudness-normalization-enable-label-id'>Normalize loudness</label>                                  \
        </div>                                                                                                                         \
    </div>";


    const albumArtSettingsHtml = "<div class='inputs-container'>                                                      \
        <div class='checkbox-container'>                                                                               \
            <input type='checkbox' class='album-art-enable-checkbox checkbox' id='album-art-enable-label-id'>          \
        </div>                                                                                                         \
        <div class='album-art-enable-label label wide-label'>                                                          \
            <label for='album-art-enable-label-id'>Show album art</label>                                              \
        </div>                                                                                                         \
    </div>";

    const visualizerSettingsHtml = "<div class='inputs-container'>                                                    \
        <div class='checkbox-container'>                                                                              \
            <input type='checkbox' class='visualizer-enable-checkbox checkbox' id='visualizer-enable-label-id'>       \
        </div>                                                                                                        \
        <div class='visualizer-enable-label label wide-label'>                                                        \
            <label for='visualizer-enable-label-id'>Show visualization</label>                                         \
        </div>                                                                                                        \
    </div>";

    const backgroundCpuHtml = "<div class='inputs-container'>                                                         \
        <div class='label overhead-label'>Max background processing CPU usage</div>                                   \
        <div class='cpu-usage-slider slider horizontal-slider unlabeled-slider'>                                      \
            <div class='slider-knob'></div>                                                                           \
            <div class='slider-background'>                                                                           \
                <div class='slider-fill'></div>                                                                       \
            </div>                                                                                                    \
        </div>                                                                                                        \
        <div class='cpu-usage-value slider-value-indicator'>20%</div>                                                 \
    </div>";

    return "<div class='settings-container preferences-popup-content-container'>                                      \
            <div class='section-container'>                                                                           \
                <div class='inputs-container'>                                                                        \
                            <div class='label wide-label subtitle'>Playback</div>                                         \
                    </div>                                                                                                \
                    "+visualizerSettingsHtml+"                                                                            \
                    "+albumArtSettingsHtml+"                                                                              \
                    "+trimSilenceAtStartHtml+"                                                                            \
                    "+trimSilenceAtEndHtml+"                                                                              \
                    "+loudnessNormalizationHtml+"                                                                         \
                </div>                                                                                                    \
                <div class='section-separator'></div>                                                                     \
                <div class='section-container'>                                                                           \
                    <div class='inputs-container'>                                                                        \
                            <div class='label wide-label subtitle'>Network</div>                                          \
                    </div>                                                                                                \
                    "+mobileNetworkHtml+"                                                                                 \
                    "+trackOfflineDownloadHtml+"                                                                          \
                </div>                                                                                                    \
                <div class='section-separator'></div>                                                                     \
                <div class='section-container'>                                                                           \
                    <div class='inputs-container'>                                                                        \
                            <div class='label wide-label subtitle'>Misc</div>                                             \
                    </div>                                                                                                \
                    "+hideLongTapIndicatorHtml+"                                                                          \
                    "+backgroundCpuHtml+"                                                                                 \
                </div>                                                                                                    \
                <div class='section-separator'></div>                                                                     \
            </div>";
};

function CpuUsagePreferenceManager(preferencesManager) {
    this._preferenceManager = preferencesManager;
    this._slider = preferencesManager.applicationPreferences.sliderContext().createSlider({
        target: this.$().find(".cpu-usage-slider")
    });
    this._valueChanged = this._valueChanged.bind(this);
    this._slider.on("slide", this._valueChanged);
}

CpuUsagePreferenceManager.prototype.$ = function() {
    return this._preferenceManager.$();
};

CpuUsagePreferenceManager.prototype._valueChanged = function(p) {
    var value = (p * (1 - 0.1) + 0.1);
    this._updateSlider(value);
    this._preferenceManager.preferences.setBackgroundCpuMaxUtilization(value);
    this._preferenceManager.preferencesUpdated(true);
};

CpuUsagePreferenceManager.prototype.update = function() {
    var value = this._preferenceManager.preferences.getBackgroundCpuMaxUtilization();
    this._updateSlider(value);
};

CpuUsagePreferenceManager.prototype._updateSlider = function(value) {
    this._slider.setValue((value - 0.1) / (1 - 0.1));
    this.$().find(".cpu-usage-value").setText((value * 100).toFixed(0) + "%");
};

function PreferencesManager(domNode, applicationPreferences) {
    EventEmitter.call(this);
    this.applicationPreferences = applicationPreferences;
    this._domNode = applicationPreferences.page().$(domNode).eq(0);
    this.preferences = applicationPreferences.preferences();
    this.defaultPreferences = new Preferences();
    this.unchangedPreferences = null;
    this._cpuUsagePreferenceManager = new CpuUsagePreferenceManager(this);

    this.$().find(".visualizer-enable-checkbox").addEventListener("change", this._visualizerEnabledChanged.bind(this));
    this.$().find(".mobile-network-enable-checkbox").addEventListener("change", this._mobileNetworkEnabledChanged.bind(this));
    this.$().find(".silence-start-enable-checkbox").addEventListener("change", this._silenceStartEnabledChanged.bind(this));
    this.$().find(".silence-end-enable-checkbox").addEventListener("change", this._silenceEndEnabledChanged.bind(this));
    this.$().find(".offline-enable-checkbox").addEventListener("change", this._offlineEnabledChanged.bind(this));
    this.$().find(".loudness-normalization-enable-checkbox").addEventListener("change", this._loudnessNormalizationEnabledChanged.bind(this));
    this.$().find(".album-art-enable-checkbox").addEventListener("change", this._albumArtEnabledChanged.bind(this));

    if (applicationPreferences.env().hasTouch()) {
        this.$().find(".longtap-indicator-enable-checkbox").addEventListener("change", this._longtapIndicatorEnabledChanged.bind(this));
    }
}
inherits(PreferencesManager, EventEmitter);

PreferencesManager.prototype.$ = function() {
    return this._domNode;
};

PreferencesManager.prototype.applyPreferencesFrom = function(preferences) {
    this.preferences.copyFrom(preferences);
    this.preferencesUpdated();
};

PreferencesManager.prototype.preferencesUpdated = function(buttonsOnly) {
    this.emit("update");
    this.update(buttonsOnly);
};

PreferencesManager.prototype.update = function(buttonsOnly) {
    this.applicationPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
    this.applicationPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));

    if (buttonsOnly) {
        return;
    }

    this.$().find(".visualizer-enable-checkbox").setProperty("checked", this.preferences.getEnableVisualizer());
    this.$().find(".mobile-network-enable-checkbox").setProperty("checked", this.preferences.getEnableMobileNetwork());
    this.$().find(".silence-start-enable-checkbox").setProperty("checked", this.preferences.getEnableTrimStart());
    this.$().find(".silence-end-enable-checkbox").setProperty("checked", this.preferences.getEnableTrimEnd());
    this.$().find(".offline-enable-checkbox").setProperty("checked", this.preferences.getEnableOffline());
    this.$().find(".loudness-normalization-enable-checkbox").setProperty("checked", this.preferences.getEnableLoudnessNormalization());
    this.$().find(".album-art-enable-checkbox").setProperty("checked", this.preferences.getEnableAlbumArt());

    if (this.applicationPreferences.env().hasTouch()) {
        this.$().find(".longtap-indicator-enable-checkbox").setProperty("checked", this.preferences.getEnableHideLongTapIndicator());
    }
    this._cpuUsagePreferenceManager.update();
};

PreferencesManager.prototype.restoreDefaults = function() {
    this.applyPreferencesFrom(this.defaultPreferences);
};

PreferencesManager.prototype.undoChanges = function() {
    this.applyPreferencesFrom(this.unchangedPreferences);
};

PreferencesManager.prototype.setUnchangedPreferences = function() {
    this.unchangedPreferences = this.preferences.snapshot();
    this.update();
};

PreferencesManager.prototype._visualizerEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableVisualizer(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._mobileNetworkEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableMobileNetwork(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._silenceStartEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableTrimStart(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._silenceEndEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableTrimEnd(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._longtapIndicatorEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableHideLongTapIndicator(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._offlineEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableOffline(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._loudnessNormalizationEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableLoudnessNormalization(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._albumArtEnabledChanged = function(e) {
    var enabled = e.target.checked;
    this.preferences.setEnableAlbumArt(enabled);
    this.preferencesUpdated();
};
