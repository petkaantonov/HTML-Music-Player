import AbstractPreferences from "preferences/AbstractPreferences";
import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import createPreferences from "preferences/PreferenceCreator";
import {ToggleableValue} from "ui/templates";
import {ToggleableValuePreferenceUiBinding} from "preferences/uibinders";

const STORAGE_KEY = `application-preferences`;

const TEMPLATE = `<div class='settings-container preferences-popup-content-container'>
    <div class="inputs-container">
        <div class="label wide-label subtitle">Playback</div>
    </div>
    <div class='section-container show-album-art-container'></div>
    <div class='section-container normalize-loudness-container'></div>
    <div class='section-separator'></div>
    <div class="inputs-container">
        <div class="label wide-label subtitle">Network</div>
    </div>
    <div class='section-container cellular-network-sync-container'></div>
    <div class='section-container offline-use-container'></div>
</div>`;

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

export default class ApplicationPreferences extends AbstractPreferences {
    constructor(deps) {
        super(new Preferences(), deps, {
            storageKey: STORAGE_KEY,
            title: `Preferences`,
            template: TEMPLATE
        });
        deps.mainMenu.on(`preferences`, this.openPopup.bind(this));
    }

    _createManager() {
        return new PreferencesManager(this.popup().$(), this);
    }
}

class PreferencesManager extends EventEmitter {
    constructor(domNode, applicationPreferences) {
        super();
        this.applicationPreferences = applicationPreferences;
        this._domNode = applicationPreferences.page().$(domNode).eq(0);
        this.preferences = applicationPreferences.preferences();
        this.defaultPreferences = new Preferences();
        this.unchangedPreferences = null;

        this._showAlbumArtBinding = new ToggleableValuePreferenceUiBinding(
            this.$().find(`.show-album-art-container`),
            new ToggleableValue({checkboxLabel: `Show album art`}),
            `enableAlbumArt`,
            this
        );

        this._normalizeLoudnessBinding = new ToggleableValuePreferenceUiBinding(
            this.$().find(`.normalize-loudness-container`),
            new ToggleableValue({checkboxLabel: `Normalize loudness`}),
            `enableLoudnessNormalization`,
            this
        );

        this._enableMobileNetworkBinding = new ToggleableValuePreferenceUiBinding(
            this.$().find(`.cellular-network-sync-container`),
            new ToggleableValue({checkboxLabel: `Enable cellular network syncing`}),
            `enableMobileNetwork`,
            this
        );

        this._enableOfflineBinding = new ToggleableValuePreferenceUiBinding(
            this.$().find(`.offline-use-container`),
            new ToggleableValue({checkboxLabel: `Download tracks for offline use`}),
            `enableOffline`,
            this
        );
    }

    $() {
        return this._domNode;
    }

    layoutUpdated() {
        // Noop
    }

    applyPreferencesFrom(preferences) {
        this.preferences.copyFrom(preferences);
        this._showAlbumArtBinding.update();
        this._normalizeLoudnessBinding.update();
        this._enableMobileNetworkBinding.update();
        this._enableOfflineBinding.update();
        this.preferencesUpdated();
    }

    preferencesUpdated() {
        this.emit(`update`);
        this.update();
    }

    update() {
        this.applicationPreferences.setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
        this.applicationPreferences.setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));
    }

    restoreDefaults() {
        this.applyPreferencesFrom(this.defaultPreferences);
    }

    undoChanges() {
        this.applyPreferencesFrom(this.unchangedPreferences);
    }

    setUnchangedPreferences() {
        this.unchangedPreferences = this.preferences.snapshot();
        this.update();
        this._showAlbumArtBinding.update();
        this._normalizeLoudnessBinding.update();
        this._enableMobileNetworkBinding.update();
        this._enableOfflineBinding.update();
    }
}
