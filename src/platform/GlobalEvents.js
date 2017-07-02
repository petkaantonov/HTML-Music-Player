

import EventEmitter from "events";
import {inherits, throttle} from "util";

export default function GlobalEvents(page) {
    EventEmitter.call(this);
    this.setMaxListeners(99999999);
    this._page = page;
    this._blurred = undefined;
    this._fireSizeChangeEvents = true;
    this._pendingSizeChange = false;
    this._beforeUnloadListener = null;
    this._history = page.window().history;

    this._triggerSizeChange = this._triggerSizeChange.bind(this);
    this._firePendingSizeChangeEvent = this._firePendingSizeChangeEvent.bind(this);
    this._resetFireSizeChangeEvents = this._resetFireSizeChangeEvents.bind(this);
    this._elementFocused = this._elementFocused.bind(this);
    this._elementBlurred = this._elementBlurred.bind(this);

    this._page.onDocumentVisibilityChange(this._windowVisibilityChanged.bind(this));

    this._page.addDocumentListener(`focus`, this._elementFocused, true);
    this._page.addDocumentListener(`blur`, this._elementBlurred, true);
    this._page.addWindowListener(`blur`, this._windowBlurred.bind(this));
    this._page.addWindowListener(`focus`, this._windowFocused.bind(this));
    this._page.addWindowListener(`resize`, this._triggerSizeChange, true);
    this._page.addWindowListener(`unload`, this.emit.bind(this, `shutdown`));
    this._page.addWindowListener(`beforeunload`, this._beforeUnload.bind(this));
    this._page.addWindowListener(`popstate`, this._historyStatePopped.bind(this));

    this._history.scrollRestoration = `manual`;
    this._ensureHistoryState();

}
inherits(GlobalEvents, EventEmitter);

GlobalEvents.prototype._historyStatePopped = function() {
    this.emit(`backbuttonPress`);
    this._ensureHistoryState();
};

GlobalEvents.prototype._ensureHistoryState = function() {
    const currentState = this._history.state;
    if (!currentState || (currentState && currentState.app !== `soita`)) {
        this._history.pushState({app: `soita`}, ``);
    }
};

GlobalEvents.prototype._windowBlurred = function() {
    this._blurred = true;
    this.emit(`visibilityChange`);
};

GlobalEvents.prototype._windowFocused = function() {
    this._blurred = false;
    this.emit(`visibilityChange`);
};

GlobalEvents.prototype._windowVisibilityChanged = function() {
    if (this.isWindowBackgrounded()) {
        this.emit(`background`);
    } else {
        this.emit(`foreground`);
    }
    this.emit(`visibilityChange`);
};

GlobalEvents.prototype._fireLongPressStart = function(t) {
    this.emit(`longPressStart`, t);
};

GlobalEvents.prototype._fireLongPressEnd = function(t) {
    this.emit(`longPressEnd`, t);
};

GlobalEvents.prototype._fireClear = function() {
    this.emit(`clear`);
};

GlobalEvents.prototype._triggerSizeChange = function() {
    if (!this._fireSizeChangeEvents) {
        return;
    }

    const activeElement = this._page.activeElement();
    if (activeElement && this._page.isTextInputElement(activeElement)) {
        this._pendingSizeChange = true;
        return;
    }
    this.emit(`resize`);
};

GlobalEvents.prototype._resetFireSizeChangeEvents = function() {
    this._fireSizeChangeEvents = true;
};

GlobalEvents.prototype._elementFocused = function(e) {
    if (this._page.isTextInputElement(e.target)) {
        this._fireSizeChangeEvents = false;
        this._resetFireSizeChangeEvents();
    }
};

GlobalEvents.prototype._elementBlurred = function(e) {
    if (this._page.isTextInputElement(e.target)) {
        this._page.window().scrollTo(0, 0);
        if (this._pendingSizeChange) {
            this._pendingSizeChange = false;
            this._firePendingSizeChangeEvent();
        }
    }
};

GlobalEvents.prototype.disableBeforeUnloadHandler = function() {
    this._beforeUnloadListener = null;
};

GlobalEvents.prototype.addBeforeUnloadListener = function(fn) {
    this._beforeUnloadListener = fn;
};

GlobalEvents.prototype._beforeUnload = function(e) {
    if (this._beforeUnloadListener) {
        const ret = this._beforeUnloadListener(e);
        if (ret) {
            e.returnValue = ret;
            return ret;
        }
    }
    return null;
};

GlobalEvents.prototype.isWindowBlurred = function() {
    if (this._blurred === undefined) return this.isWindowBackgrounded();
    if (this._blurred === true) return true;
    return this.isWindowBackgrounded();
};

GlobalEvents.prototype.isWindowBackgrounded = function() {
    return this._page.isDocumentHidden();
};

GlobalEvents.prototype.windowWasForegrounded = function() {
    return new Promise((resolve) => {
        this.once(`foreground`, resolve);
    });
};

GlobalEvents.prototype._firePendingSizeChangeEvent = throttle(GlobalEvents.prototype._triggerSizeChange, 100);
GlobalEvents.prototype._resetFireSizeChangeEvents = throttle(GlobalEvents.prototype._resetFireSizeChangeEvents, 500);

