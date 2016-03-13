"use strict"

import { onCapture, offCapture } from "lib/util";
import $ from "lib/jquery";

export default function AbstractGestureRecognizer(recognizerMaker) {
    this.recognizerMaker = recognizerMaker;
}

AbstractGestureRecognizer.prototype.hasSettledModifierTouch = function(now) {
    var modifierTouch = this.recognizerMaker.modifierTouch;
    return !!(modifierTouch && (now - modifierTouch.started > this.recognizerMaker.TAP_TIME * 0.5));
};

AbstractGestureRecognizer.prototype.hasModifierTouch = function() {
    return this.recognizerMaker.modifierTouch !== null;
};

AbstractGestureRecognizer.prototype.getDocumentActives = function() {
    return this.recognizerMaker.documentActives;
};

AbstractGestureRecognizer.prototype.getModifierTouch = function() {
    return this.recognizerMaker.modifierTouch;
};

AbstractGestureRecognizer.prototype.recognizeBubbledOn = function($elem, selector) {
    if (!this.recognizerMaker.isTouchSupported()) return;

    if (arguments.length <= 1) {
        $elem.on(this._eventType, this._recognizerHandler);
    } else if arguments.length === 2) {
        $elem.on(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.unrecognizeBubbledOf = function($elem, selector) {
    if (!this.recognizerMaker.isTouchSupported()) return;

    if (arguments.length <= 1) {
        $elem.off(this._eventType, this._recognizerHandler);
    } else if arguments.length === 2) {
        $elem.off(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.recognizeCapturedOn = function(elem) {
    if (!this.recognizerMaker.isTouchSupported()) return;
    onCapture(elem, this._eventType, this._recognizerHandler);
};

AbstractGestureRecognizer.prototype.unrecognizeCapturedOf = function(elem) {
    if (!this.recognizerMaker.isTouchSupported()) return;
    offCapture(elem, this._eventType, this._recognizerHandler);
};

