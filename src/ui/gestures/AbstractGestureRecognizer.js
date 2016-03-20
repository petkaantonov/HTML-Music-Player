"use strict";

import { DomWrapper } from "platform/dom/Page";

export default function AbstractGestureRecognizer(recognizerContext) {
    this.recognizerContext = recognizerContext;
}

AbstractGestureRecognizer.prototype.page = function() {
    return this.recognizerContext.page;
};

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

AbstractGestureRecognizer.prototype._recognizeOn = function(elem, useCapture) {
    if (!elem || (typeof elem.nodeType !== "number" && !(elem instanceof DomWrapper))) {
        throw new TypeError("elem is not a dom node");
    }
    var eventTypes = this._eventType;
    for (var i = 0; i < eventTypes.length; ++i) {
        elem.addEventListener(eventTypes[i], this._recognizerHandler, !!useCapture);
    }
};

AbstractGestureRecognizer.prototype._unrecognizeOn = function(elem, useCapture) {
    if (!elem || (typeof elem.nodeType !== "number" && !(elem instanceof DomWrapper))) {
        throw new TypeError("elem is not a dom node");
    }
    var eventTypes = this._eventType;
    for (var i = 0; i < eventTypes.length; ++i) {
        elem.removeEventListener(eventTypes[i], this._recognizerHandler, !!useCapture);
    }
};

AbstractGestureRecognizer.prototype.recognizeBubbledOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    this._recognizeOn(elem, false);
};

AbstractGestureRecognizer.prototype.unrecognizeBubbledOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    this._unrecognizeOn(elem, false);
};

AbstractGestureRecognizer.prototype.recognizeCapturedOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    this._recognizeOn(elem, true);
};

AbstractGestureRecognizer.prototype.unrecognizeCapturedOn = function(elem) {
    if (!this.recognizerContext.isTouchSupported()) return;
    this._unrecognizeOn(elem, true);
};
