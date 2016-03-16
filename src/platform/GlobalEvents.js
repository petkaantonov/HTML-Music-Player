"use strict";

import EventEmitter from "events";
import { inherits, onCapture, throttle } from "util";
import { isTextInputElement } from "platform/DomUtil";

const documentHidden = (function() {
    var prefix = ["h", "mozH", "msH", "webkitH"].reduce(function(prefix, curr) {
        if (prefix) return prefix;
        return (curr + "idden") in document ? curr : prefix;
    }, null);
    var prop = prefix + "idden";
    var eventName = prefix.slice(0, -1) + "visibilitychange";
    return {
        propertyName: prop,
        eventName: eventName
    };
})();

export default function GlobalEvents() {
    EventEmitter.call(this);
    this.setMaxListeners(99999999);
    this._blurred = undefined;
    this._fireSizeChangeEvents = true;
    this._pendingSizeChange = false;

    this._triggerSizeChange = this._triggerSizeChange.bind(this);
    this._firePendingSizeChangeEvent = this._firePendingSizeChangeEvent.bind(this);
    this._resetFireSizeChangeEvents = this._resetFireSizeChangeEvents.bind(this);
    this._elementFocused = this._elementFocused.bind(this);
    this._elementBlurred = this._elementBlurred.bind(this);

    document.addEventListener(documentHidden.eventName, this._windowVisibilityChanged.bind(this), false);
    window.addEventListener("blur", this._windowBlurred.bind(this), false);
    window.addEventListener("focus", this._windowFocused.bind(this), false);
    onCapture(document, "focus", this._elementFocused);
    onCapture(document, "blur", this._elementBlurred);
    onCapture(window, "resize", this._triggerSizeChange);
    window.addEventListener("unload", this.emit.bind(this, "shutdown"), false);
}
inherits(GlobalEvents, EventEmitter);

GlobalEvents.prototype._windowBlurred = function() {
    this._blurred = true;
    this.emit("visibilityChange");
};

GlobalEvents.prototype._windowFocused = function() {
    this._blurred = false;
    this.emit("visibilityChange");
};

GlobalEvents.prototype._windowVisibilityChanged = function() {
    if (this.isWindowBackgrounded()) {
        this.emit("background");
    } else {
        this.emit("foreground");
    }
    this.emit("visibilityChange");
};

GlobalEvents.prototype._fireLongPressStart = function(t) {
    this.emit("longPressStart", t);
};

GlobalEvents.prototype._fireLongPressEnd = function(t) {
    this.emit("longPressEnd", t);
};

GlobalEvents.prototype._fireClear = function() {
    this.emit("clear");
};

GlobalEvents.prototype._triggerSizeChange = function() {
    if (!this._fireSizeChangeEvents) {
        return;
    }

    var activeElement = document.activeElement;
    if (activeElement && isTextInputElement(activeElement)) {
        this._pendingSizeChange = true;
        return;
    }
    this.emit("resize");
};

GlobalEvents.prototype._firePendingSizeChangeEvent =
    throttle(GlobalEvents.prototype._triggerSizeChange, 100);

GlobalEvents.prototype._resetFireSizeChangeEvents = throttle(function() {
    this._fireSizeChangeEvents = true;
}, 500);

GlobalEvents.prototype._elementFocused = function(e) {
    if (isTextInputElement(e.target)) {
        this._fireSizeChangeEvents = false;
        this._resetFireSizeChangeEvents();
    }
};

GlobalEvents.prototype._elementBlurred = function(e) {
    if (isTextInputElement(e.target)) {
        window.scrollTo(0, 0);
        if (this._pendingSizeChange) {
            this._pendingSizeChange = false;
            this._firePendingSizeChangeEvent();
        }
    }
};

GlobalEvents.prototype.isWindowBlurred = function() {
    if (this._blurred === undefined) return this.isWindowBackgrounded();
    if (this._blurred === true) return true;
    return this.isWindowBackgrounded();
};

GlobalEvents.prototype.isWindowBackgrounded = function() {
    return document[documentHidden.propertyName];
};

