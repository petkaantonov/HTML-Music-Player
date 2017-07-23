import EventEmitter from "events";
import {noUndefinedGet} from "util";
import {SHUTDOWN_SAVE_PREFERENCES_EVENT} from "platform/GlobalEvents";


const RESTORE_DEFAULTS_BUTTON = `restore-defaults`;
const UNDO_CHANGES_BUTTON = `undo-changes`;

export default class AbstractPreferencesBindingContext extends EventEmitter {
    constructor(preferences, deps, opts) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._preferences = preferences;
        this._env = deps.env;
        this._rippler = deps.rippler;
        this._db = deps.db;
        this._recognizerContext = deps.recognizerContext;
        this._sliderContext = deps.sliderContext;
        this._globalEvents = deps.globalEvents;

        this._storageKey = opts.storageKey;
        this._popup = deps.popupContext.makePopup(opts.title, opts.template, [{
            id: RESTORE_DEFAULTS_BUTTON,
            text: `Restore defaults`,
            action: this.restoreDefaultsClicked.bind(this)
        }, {
            id: UNDO_CHANGES_BUTTON,
            text: `Undo changes`,
            action: this.undoChangesClicked.bind(this)
        }]);

        this._manager = null;

        this._popup.on(`open`, this.popupOpened.bind(this));
        this._popup.on(`layoutUpdate`, this.layoutUpdated.bind(this));
        this.checkDbValues(deps.dbValues);
        this._globalEvents.on(SHUTDOWN_SAVE_PREFERENCES_EVENT, this._shutdownSavePreferences.bind(this));
    }

    async checkDbValues(dbValues) {
        await Promise.resolve();
        if (dbValues && this._storageKey in dbValues) {
            this.preferences().copyFrom(dbValues[this._storageKey]);
            this.emit(`change`, this.preferences());
        }
    }

    openPopup() {
        this._popup.open();
    }

    popupOpened() {
        if (!this._manager) {
            this._manager = this._createManager();
            this._manager.on(`update`, this.savePreferences.bind(this));
            this._manager.on(`willUpdatePreferences`, this.willUpdatePreferences.bind(this));
            this._manager.on(`willUpdatePreference`, this.willUpdatePreference.bind(this));
        }
        this._manager.uiWillBecomeActive();
        this._manager.setUnchangedPreferences();
    }

    layoutUpdated() {
        if (this._manager) {
            this._manager.layoutUpdated();
        }
    }

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

    preferences() {
        return this._preferences;
    }

    isActive() {
        return this._popup.isShown();
    }

    popup() {
        return this._popup;
    }

    restoreDefaultsClicked() {
        return this._manager.restoreDefaults();
    }

    undoChangesClicked() {
        return this._manager.undoChanges();
    }

    savePreferences() {
        this.emit(`change`, this.preferences());
    }

    /* eslint-disable class-methods-use-this */
    willUpdatePreferences() {
        // NOOP
    }

    willUpdatePreference() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    setResetDefaultsEnabled(value) {
        this.popup().setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, !!value);
    }

    setUndoChangesEnabled(value) {
        this.popup().setButtonEnabledState(UNDO_CHANGES_BUTTON, !!value);
    }

    getPreference(key) {
        return this.preferences().get(key);
    }

    setPreference(key, value) {
        if (this._manager) {
            this._manager.setPreference(key, value);
        } else {
            this.preferences().set(key, value);
        }
    }

    async setPreferenceDeferred(key, value) {
        await Promise.resolve();
        this.setPreference(key, value);
    }

    _shutdownSavePreferences(preferences) {
        preferences.push({
            key: this._storageKey,
            value: this.preferences().toJSON()
        });
    }
}
