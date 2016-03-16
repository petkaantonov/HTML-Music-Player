"use strict";

import { onCapture, offCapture } from "util";

export default function AbstractGestureRecognizer(recognizerContext) {
    this.recognizerContext = recognizerContext;
}

AbstractGestureRecognizer.prototype.fireLongPressStart = function(t) {
    this.recognizerContext.globalEvents._fireLongPressStart(t);
};

AbstractGestureRecognizer.prototype.fireLongPressEnd = function(t) {
    this.recognizerContext.globalEvents._fireLongPressEnd(t);
};

AbstractGestureRecognizer.prototype.hasSettledModifierTouch = function(now) {
    var modifierTouch = this.recognizerContext.modifierTouch;
    return !!(modifierTouch && (now - modifierTouch.started > this.recognizerContext.TAP_TIME * 0.5));
};

AbstractGestureRecognizer.prototype.hasModifierTouch = function() {
    return this.recognizerContext.modifierTouch !== null;
};

AbstractGestureRecognizer.prototype.getDocumentActives = function() {
    return this.recognizerContext.documentActives;
};

AbstractGestureRecognizer.prototype.getModifierTouch = function() {
    return this.recognizerContext.modifierTouch;
};

AbstractGestureRecognizer.prototype.recognizeBubbledOn = function($elem, selector) {
    if (!this.recognizerContext.isTouchSupported()) return;

    if (arguments.length <= 1) {
        $elem.on(this._eventType, this._recognizerHandler);
    } else if (arguments.length === 2) {
        $elem.on(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.unrecognizeBubbledOn = function($elem, selector) {
    if (!this.recognizerContext.isTouchSupported()) return;

    if (arguments.length <= 1) {
        $elem.off(this._eventType, this._recognizerHandler);
    } else if (arguments.length === 2) {
        $elem.off(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.recognizeCapturedOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    onCapture(elem, this._eventType, this._recognizerHandler);
};

AbstractGestureRecognizer.prototype.unrecognizeCapturedOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    offCapture(elem, this._eventType, this._recognizerHandler);
};

