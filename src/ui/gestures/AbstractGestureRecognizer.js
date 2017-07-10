import {DomWrapper} from "platform/dom/Page";
import {PASSIVE_TOUCH_EVENTS, TAP_TIME} from "ui/gestures/GestureRecognizerContext";

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
    const {modifierTouch} = this.recognizerContext;
    return !!(modifierTouch && (now - modifierTouch.started > TAP_TIME * 0.5));
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
    if (!elem || (typeof elem.nodeType !== `number` && !(elem instanceof DomWrapper))) {
        throw new TypeError(`elem is not a dom node`);
    }
    const eventTypes = this._eventType;
    for (let i = 0; i < eventTypes.length; ++i) {
        const type = eventTypes[i];
        elem.addEventListener(type, this._recognizerHandler, {
            passive: PASSIVE_TOUCH_EVENTS[type] === type,
            capture: !!useCapture
        });
    }
};

AbstractGestureRecognizer.prototype._unrecognizeOn = function(elem, useCapture) {
    if (!elem || (typeof elem.nodeType !== `number` && !(elem instanceof DomWrapper))) {
        throw new TypeError(`elem is not a dom node`);
    }
    const eventTypes = this._eventType;

    for (let i = 0; i < eventTypes.length; ++i) {
        const type = eventTypes[i];
        elem.removeEventListener(type, this._recognizerHandler, {
            passive: PASSIVE_TOUCH_EVENTS[type] === type,
            capture: !!useCapture
        });
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
