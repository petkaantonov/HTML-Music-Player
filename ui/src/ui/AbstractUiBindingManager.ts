import deepEqual from "deep-equal";
import { Preferences } from "shared/src/preferences";
import { EventEmitterInterface } from "shared/types/helpers";
import { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import { AbstractPreferenceManager } from "ui/preferences/PreferenceCreator";
import { UiBinding } from "ui/preferences/uibinders";
import EventEmitter from "vendor/events";

import AbstractPreferencesBindingContext from "./AbstractPreferencesBindingContext";

interface UiBindingManagerEventsMap<P extends Preferences> {
    willUpdatePreferences: (oldPreferences: P, newPreferences: P) => void;
    willUpdatePreference: (key: keyof P, oldValue: P[keyof P], newValue: P[keyof P]) => void;
    update: () => void;
}

export default interface AbstractUiBindingManager<P extends Preferences, PM extends AbstractPreferenceManager<P>>
    extends EventEmitterInterface<UiBindingManagerEventsMap<P>> {}

export default abstract class AbstractUiBindingManager<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>
> extends EventEmitter {
    private _domNode: DomWrapper;
    private _bindingContext: AbstractPreferencesBindingContext<P, PM, AbstractUiBindingManager<P, PM>>;
    preferencesManager: PM;
    defaultPreferences: P;
    unchangedPreferences: null | P;
    bindings: UiBinding[];
    constructor(
        rootSelector: DomWrapperSelector,
        bindingContext: AbstractPreferencesBindingContext<P, PM, AbstractUiBindingManager<P, PM>>,
        defaultPreferences: P
    ) {
        super();
        this._domNode = bindingContext.page().$(rootSelector).eq(0);
        this._bindingContext = bindingContext;

        this.preferencesManager = bindingContext.preferencesManager();
        this.defaultPreferences = defaultPreferences;
        this.unchangedPreferences = null;
        this.bindings = [];
    }

    bindingContext() {
        return this._bindingContext;
    }

    addBinding(binding: UiBinding) {
        this.bindings.push(binding);
        return this;
    }

    $() {
        return this._domNode;
    }

    layoutUpdated() {
        this.bindings.forEach(b => b.layoutUpdated());
    }

    applyPreferencesFrom(preferences: P) {
        this.emit(`willUpdatePreferences`, this.preferencesManager.toJSON(), preferences);
        this.preferencesManager.copyFrom(preferences);
        this.bindings.forEach(b => b.update());
        this.preferencesUpdated();
    }

    willUpdate<Key extends keyof P>(key: Key, oldValue: P[Key], newValue: P[Key]): boolean {
        if (!deepEqual(oldValue, newValue)) {
            this.emit(`willUpdatePreference`, key, oldValue, newValue);
            return true;
        }
        return false;
    }

    setPreference<Key extends keyof P>(key: Key, value: P[Key]) {
        const oldValue = this.preferencesManager.get(key);
        if (this.willUpdate(key, oldValue, value)) {
            this.preferencesManager.set(key, value);
            this.bindings.forEach(b => b.update());
            this.preferencesUpdated();
        }
    }

    preferencesUpdated() {
        this.emit(`update`);
        this.update();
    }

    update() {
        this.bindingContext().setResetDefaultsEnabled(!this.preferencesManager.equals(this.defaultPreferences));
        this.bindingContext().setUndoChangesEnabled(!this.preferencesManager.equals(this.unchangedPreferences));
    }

    restoreDefaults() {
        this.applyPreferencesFrom(this.defaultPreferences);
    }

    undoChanges() {
        this.applyPreferencesFrom(this.unchangedPreferences!);
    }

    uiWillBecomeActive() {
        this.update();
        this.bindings.forEach(b => b.update());
    }

    setUnchangedPreferences() {
        this.unchangedPreferences = this.preferencesManager.toJSON();
        this.bindingContext().setUndoChangesEnabled(!this.preferencesManager.equals(this.unchangedPreferences));
    }
}
