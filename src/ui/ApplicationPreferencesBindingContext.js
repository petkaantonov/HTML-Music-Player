import {ToggleableValue} from "ui/templates";
import {ToggleableValuePreferenceUiBinding} from "preferences/uibinders";
import AbstractUiBindingManager from "ui/AbstractUiBindingManager";
import {STORAGE_KEY, Preferences} from "preferences/ApplicationPreferences";
import AbstractPreferencesBindingContext from "ui/AbstractPreferencesBindingContext";

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

class PreferencesManager extends AbstractUiBindingManager {
    constructor(rootSelector, bindingContext) {
        super(rootSelector, bindingContext, new Preferences());

        this.
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.show-album-art-container`),
            new ToggleableValue({checkboxLabel: `Show album art`}),
            `enableAlbumArt`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.normalize-loudness-container`),
            new ToggleableValue({checkboxLabel: `Normalize loudness`}),
            `enableLoudnessNormalization`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.cellular-network-sync-container`),
            new ToggleableValue({checkboxLabel: `Enable cellular network syncing`}),
            `enableMobileNetwork`,
            this
        )).
        addBinding(new ToggleableValuePreferenceUiBinding(
            this.$().find(`.offline-use-container`),
            new ToggleableValue({checkboxLabel: `Download tracks for offline use`}),
            `enableOffline`,
            this
        ));

        this.update();
    }
}

export default class ApplicationPreferencesBindingContext extends AbstractPreferencesBindingContext {
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
