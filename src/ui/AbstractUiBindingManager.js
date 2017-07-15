import EventEmitter from "events";
import {_, titleCase} from "util";
import {equals} from "preferences/PreferenceCreator";

export default class AbstractUiBindingManager extends EventEmitter {
    constructor(rootSelector, bindingContext, defaultPreferences) {
        super();
        this._domNode = bindingContext.page().$(rootSelector).eq(0);
        this._bindingContext = bindingContext;

        this.preferences = bindingContext.preferences();
        this.defaultPreferences = defaultPreferences;
        this.unchangedPreferences = null;
        this.bindings = [];
    }

    bindingContext() {
        return this._bindingContext;
    }

    addBinding(binding) {
        this.bindings.push(binding);
        return this;
    }

    $() {
        return this._domNode;
    }

    layoutUpdated() {
        this.bindings.forEach(_.layoutUpdated);
    }

    applyPreferencesFrom(preferences) {
        this.emit("willUpdatePreferences", this.preferences, preferences);
        this.preferences.copyFrom(preferences);
        this.bindings.forEach(_.update);
        this.preferencesUpdated();
    }

    willUpdate(key, oldValue, newValue) {
        if (!equals(oldValue, newValue)) {
            this.emit("willUpdatePreference", key, oldValue, newValue);
            return true;
        }
        return false;
    }

    setPreference(key, value) {
        const oldValue = this.preferences.get(key);
        if (this.willUpdate(key, oldValue, value)) {
            this.preferences.set(key, value);
            this.bindings.forEach(_.update);
            this.preferencesUpdated();
        }
    }

    preferencesUpdated() {
        this.emit(`update`);
        this.update();
    }

    update() {
        this.bindingContext().setResetDefaultsEnabled(!this.preferences.equals(this.defaultPreferences));
        this.bindingContext().setUndoChangesEnabled(!this.preferences.equals(this.unchangedPreferences));
    }

    restoreDefaults() {
        this.applyPreferencesFrom(this.defaultPreferences);
    }

    undoChanges() {
        this.applyPreferencesFrom(this.unchangedPreferences);
    }

    uiWillBecomeActive() {
        this.update();
        this.bindings.forEach(_.update);
    }

    setUnchangedPreferences() {
        this.unchangedPreferences = this.preferences.snapshot();
    }
}
