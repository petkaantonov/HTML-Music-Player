import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import createPreferences from "preferences/PreferenceCreator";

const STORAGE_KEY = `application-preferences`;

const validBoolean = function(val) {
    return !!val;
};

const Preferences = createPreferences({
    methods: {},
    preferences: {
        enableMobileNetwork: {
            defaultValue: false,
            asValidValue: validBoolean
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
    opts = noUndefinedGet(opts);
    AbstractPreferences.call(this, new Preferences(), opts, deps);
}
inherits(ApplicationPreferences, AbstractPreferences);

ApplicationPreferences.prototype._createManager = function() {
    return new PreferencesManager(this.popup().$(), this);
};

ApplicationPreferences.prototype.STORAGE_KEY = STORAGE_KEY;
ApplicationPreferences.prototype.TITLE = `Preferences`;

ApplicationPreferences.prototype.getHtml = function() {
    const mobileNetworkHtml = `<div class='inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='mobile-network-enable-checkbox checkbox' id='mobile-network-enable-label-id'>\
        </div>
        <div class='mobile-network-enable-label label wide-label'>
            <label for='mobile-network-enable-label-id'>Enable cellular network syncing </label>
        </div>
    </div>`;


    const trackOfflineDownloadHtml = `<div class='inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='offline-enable-checkbox checkbox' id='offline-enable-label-id'>
        </div>
        <div class='offline-enable-label label wide-label'>
            <label for='offline-enable-label-id'>Download tracks for offline use</label>
        </div>
    </div>`;

    const loudnessNormalizationHtml = `<div class='inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='loudness-normalization-enable-checkbox checkbox' id='loudness-normalization-enable-label-id'>\
        </div>
        <div class='loudness-normalization-enable-label label wide-label'>
            <label for='loudness-normalization-enable-label-id'>Normalize loudness</label>
        </div>
    </div>`;


    const albumArtSettingsHtml = `<div class='inputs-container'>
        <div class='checkbox-container'>
            <input type='checkbox' class='album-art-enable-checkbox checkbox' id='album-art-enable-label-id'>
        </div>
        <div class='album-art-enable-label label wide-label'>
            <label for='album-art-enable-label-id'>Show album art</label>
        </div>
    </div>`;


    return `<div class='settings-container preferences-popup-content-container'>
            <div class='section-container'>
                <div class='inputs-container'>
                            <div class='label wide-label subtitle'>Playback</div>
                    </div>
                    ${albumArtSettingsHtml}
                    ${loudnessNormalizationHtml}
                </div>
                <div class='section-separator'></div>
                <div class='section-container'>
                    <div class='inputs-container'>
                            <div class='label wide-label subtitle'>Network</div>
                    </div>
                    ${mobileNetworkHtml}
                    ${trackOfflineDownloadHtml}
                </div>
            </div>`;
};

function PreferencesManager(domNode, applicationPreferences) {
    EventEmitter.call(this);
    this.applicationPreferences = applicationPreferences;
    this._domNode = applicationPreferences.page().$(domNode).eq(0);
    this.preferences = applicationPreferences.preferences();
    this.defaultPreferences = new Preferences();
    this.unchangedPreferences = null;

    this.$().find(`.mobile-network-enable-checkbox`).addEventListener(`change`, this._mobileNetworkEnabledChanged.bind(this));
    this.$().find(`.offline-enable-checkbox`).addEventListener(`change`, this._offlineEnabledChanged.bind(this));
    this.$().find(`.loudness-normalization-enable-checkbox`).addEventListener(`change`, this._loudnessNormalizationEnabledChanged.bind(this));
    this.$().find(`.album-art-enable-checkbox`).addEventListener(`change`, this._albumArtEnabledChanged.bind(this));
}
inherits(PreferencesManager, EventEmitter);

PreferencesManager.prototype.$ = function() {
    return this._domNode;
};

PreferencesManager.prototype.layoutUpdated = function() {
    // Noop
};

PreferencesManager.prototype.applyPreferencesFrom = function(preferences) {
    this.preferences.copyFrom(preferences);
    this.preferencesUpdated();
};

PreferencesManager.prototype.preferencesUpdated = function(buttonsOnly) {
    this.emit(`update`);
    this.update(buttonsOnly);
};

PreferencesManager.prototype.update = function(buttonsOnly) {
    this.applicationPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
    this.applicationPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));

    if (buttonsOnly) {
        return;
    }

    this.$().find(`.mobile-network-enable-checkbox`).setProperty(`checked`, this.preferences.getEnableMobileNetwork());
    this.$().find(`.offline-enable-checkbox`).setProperty(`checked`, this.preferences.getEnableOffline());
    this.$().find(`.loudness-normalization-enable-checkbox`).setProperty(`checked`, this.preferences.getEnableLoudnessNormalization());
    this.$().find(`.album-art-enable-checkbox`).setProperty(`checked`, this.preferences.getEnableAlbumArt());
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


PreferencesManager.prototype._mobileNetworkEnabledChanged = function(e) {
    const enabled = e.target.checked;
    this.preferences.setEnableMobileNetwork(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._offlineEnabledChanged = function(e) {
    const enabled = e.target.checked;
    this.preferences.setEnableOffline(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._loudnessNormalizationEnabledChanged = function(e) {
    const enabled = e.target.checked;
    this.preferences.setEnableLoudnessNormalization(enabled);
    this.preferencesUpdated();
};

PreferencesManager.prototype._albumArtEnabledChanged = function(e) {
    const enabled = e.target.checked;
    this.preferences.setEnableAlbumArt(enabled);
    this.preferencesUpdated();
};
