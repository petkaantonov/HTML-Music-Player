import KeyValueDatabase from "shared/idb/KeyValueDatabase";
import {
    PopupPreferenceKey,
    PreferenceArray,
    PreferenceCategoryKey,
    Preferences,
    StoredKVValues,
} from "shared/preferences";
import { EventEmitterInterface } from "shared/types/helpers";
import { throttle } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import { AbstractPreferenceManager } from "ui/preferences/PreferenceCreator";
import EventEmitter from "vendor/events";

import AbstractUiBindingManager from "./AbstractUiBindingManager";
import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import Popup from "./Popup";
import Rippler from "./Rippler";
import SliderContext from "./SliderContext";

const RESTORE_DEFAULTS_BUTTON = `restore-defaults`;
const UNDO_CHANGES_BUTTON = `undo-changes`;

type Deps = SelectDeps<
    | "page"
    | "env"
    | "rippler"
    | "popupContext"
    | "db"
    | "dbValues"
    | "recognizerContext"
    | "sliderContext"
    | "globalEvents"
>;

interface Opts {
    preferenceCategoryKey: PreferenceCategoryKey;
    popupPreferenceKey: PopupPreferenceKey;
    title: string;
    template: string;
}

export default interface AbstractPreferencesBindingContext<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    UBM extends AbstractUiBindingManager<P, PM>
> extends EventEmitterInterface<{ change: (pm: PM) => void; newDecodingLatencyValue: () => void }> {}

export default abstract class AbstractPreferencesBindingContext<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    UBM extends AbstractUiBindingManager<P, PM>
> extends EventEmitter {
    _page: Page;
    _env: Env;
    _rippler: Rippler;
    _db: KeyValueDatabase;
    _recognizerContext: GestureRecognizerContext;
    _sliderContext: SliderContext;
    _globalEvents: GlobalEvents;
    _popupPreferenceKey: PopupPreferenceKey;
    _preferenceCategoryKey: PreferenceCategoryKey;
    _preferencesManager: PM;
    _uiBindingManager: UBM | null;
    private _popup: Popup;

    constructor(preferences: PM, deps: Deps, opts: Opts) {
        super();
        this._page = deps.page;
        this._preferencesManager = preferences;
        this._env = deps.env;
        this._rippler = deps.rippler;
        this._db = deps.db;
        this._recognizerContext = deps.recognizerContext;
        this._sliderContext = deps.sliderContext;
        this._globalEvents = deps.globalEvents;

        this._preferencesManager = preferences;
        this._popupPreferenceKey = opts.popupPreferenceKey;
        this._preferenceCategoryKey = opts.preferenceCategoryKey;
        this._popup = deps.popupContext.makePopup(opts.title, opts.template, this._popupPreferenceKey, [
            {
                id: RESTORE_DEFAULTS_BUTTON,
                text: `Restore defaults`,
                action: this.restoreDefaultsClicked,
            },
            {
                id: UNDO_CHANGES_BUTTON,
                text: `Undo changes`,
                action: this.undoChangesClicked,
            },
        ]);

        this._uiBindingManager = null;

        this._popup.on(`open`, this.popupOpened);
        this._popup.on(`layoutUpdate`, this.layoutUpdated);
        this._globalEvents.on("shutdownSavePreferences", this._shutdownSavePreferences);
        this._persistPreferences = throttle(this._persistPreferences, 2500, this);
        void this._loadPersistedPreferences(deps.dbValues);
    }

    protected abstract _createManager(): UBM;
    abstract willUpdatePreferences(oldPreferences: P, newPreferences: P): void;
    abstract willUpdatePreference<Key extends keyof P>(key: Key): void;

    async _loadPersistedPreferences(dbValues: StoredKVValues) {
        const preferences = dbValues[this._preferenceCategoryKey];
        if (preferences) {
            this.preferencesManager().copyFrom(preferences as any);
            this.emit(`change`, this.preferencesManager());
        }
    }

    openPopup = () => {
        void this._popup.open();
    };

    popupOpened = () => {
        if (!this._uiBindingManager) {
            this._uiBindingManager = this._createManager();
            this._uiBindingManager.on(`update`, this.savePreferences.bind(this));
            this._uiBindingManager.on(`willUpdatePreferences`, this.willUpdatePreferences.bind(this));
            this._uiBindingManager.on(`willUpdatePreference`, this.willUpdatePreference.bind(this));
        }
        this._uiBindingManager.uiWillBecomeActive();
        this._uiBindingManager.setUnchangedPreferences();
    };

    layoutUpdated = () => {
        if (this._uiBindingManager) {
            this._uiBindingManager.layoutUpdated();
        }
    };

    page() {
        return this._page;
    }

    env() {
        return this._env;
    }

    sliderContext() {
        return this._sliderContext;
    }

    rippler() {
        return this._rippler;
    }

    db() {
        return this._db;
    }

    recognizerContext() {
        return this._recognizerContext;
    }

    preferencesManager() {
        return this._preferencesManager;
    }

    isActive() {
        return this._popup.isShown();
    }

    popup() {
        return this._popup;
    }

    restoreDefaultsClicked = () => {
        return this._uiBindingManager!.restoreDefaults();
    };

    undoChangesClicked = () => {
        return this._uiBindingManager!.undoChanges();
    };

    savePreferences() {
        this.emit(`change`, this.preferencesManager());
        this._persistPreferences();
    }

    setResetDefaultsEnabled(value: boolean) {
        this.popup().setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, !!value);
    }

    setUndoChangesEnabled(value: boolean) {
        this.popup().setButtonEnabledState(UNDO_CHANGES_BUTTON, !!value);
    }

    getPreference<Key extends keyof P>(key: Key) {
        return this.preferencesManager().get(key);
    }

    setPreference<Key extends keyof P>(key: Key, value: P[Key]) {
        if (this._uiBindingManager) {
            this._uiBindingManager.setPreference(key, value);
        } else {
            this.preferencesManager().set(key, value);
        }
    }

    setPreferenceDeferred = async <Key extends keyof P>(key: Key, value: P[Key]) => {
        this.setPreference(key, value);
    };

    _shutdownSavePreferences = (preferences: PreferenceArray) => {
        preferences.push({
            key: this._preferenceCategoryKey,
            value: this.preferencesManager().toJSON(),
        });
    };

    _persistPreferences() {
        void this._db.set(this._preferenceCategoryKey, this.preferencesManager().toJSON());
    }
}
