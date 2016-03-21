"use strict";

import EventEmitter from "events";
import { inherits, throttle } from "util";

const RESTORE_DEFAULTS_BUTTON = "restore-defaults";
const UNDO_CHANGES_BUTTON = "undo-changes";

export default function AbstractPreferences(preferences, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._page = opts.page;
    this._preferences = preferences;
    this._env = opts.env;
    this._rippler = opts.rippler;
    this._db = opts.db;
    this._recognizerContext = opts.recognizerContext;
    this._sliderContext = opts.sliderContext;
    this._popup = opts.popupContext.makePopup(this.TITLE, this.getHtml(), opts.preferencesButton, [{
        id: RESTORE_DEFAULTS_BUTTON,
        text: "Restore defaults",
        action: this.restoreDefaultsClicked.bind(this)
    }, {
        id: UNDO_CHANGES_BUTTON,
        text: "Undo changes",
        action: this.undoChangesClicked.bind(this)
    }]);

    this.savePreferences = throttle(this.savePreferences, 250);

    this._manager = null;


    var popupOpen = this._popup.open.bind(this._popup);
    this.page().$(opts.preferencesButton).addEventListener("click", popupOpen);
    this._recognizerContext.createTapRecognizer(popupOpen).recognizeBubbledOn(this.page().$(opts.preferencesButton));
    this._popup.on("open", this.popupOpened.bind(this));
    if (opts.dbValues && this.STORAGE_KEY in opts.dbValues) {
        this.preferences().copyFrom(opts.dbValues[this.STORAGE_KEY]);
        this.emit("change", this.preferences());
    }
}
inherits(AbstractPreferences, EventEmitter);

AbstractPreferences.prototype.popupOpened = function() {
    if (!this._manager) {
        this._manager = this._createManager();
        this._manager.on("update", this.savePreferences.bind(this));
    }
    this._manager.setUnchangedPreferences();
};

AbstractPreferences.prototype.page = function() {
    return this._page;
};

AbstractPreferences.prototype.env = function() {
    return this._env;
};

AbstractPreferences.prototype.sliderContext = function() {
    return this._sliderContext;
};

AbstractPreferences.prototype.rippler = function() {
    return this._rippler;
};

AbstractPreferences.prototype.db = function() {
    return this._db;
};

AbstractPreferences.prototype.recognizerContext = function() {
    return this._recognizerContext;
};

AbstractPreferences.prototype.preferences = function() {
    return this._preferences;
};

AbstractPreferences.prototype.popup = function() {
    return this._popup;
};

AbstractPreferences.prototype.restoreDefaultsClicked = function() {
    return this._manager.restoreDefaults();
};

AbstractPreferences.prototype.undoChangesClicked = function() {
    return this._manager.undoChanges();
};

AbstractPreferences.prototype.savePreferences = function() {
    this.emit("change", this.preferences());
    this._db.set(this.STORAGE_KEY, this.preferences().toJSON());
};

AbstractPreferences.prototype.setResetDefaultsEnabled = function(value) {
    this.popup().setButtonEnabledState(RESTORE_DEFAULTS_BUTTON, !!value);
};

AbstractPreferences.prototype.setUndoChangesEnabled = function(value) {
    this.popup().setButtonEnabledState(UNDO_CHANGES_BUTTON, !!value);
};
