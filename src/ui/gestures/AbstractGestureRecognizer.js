"use strict"

import { onCapture, offCapture } from "lib/util";
import $ from "lib/jquery";

export default function AbstractGestureRecognizer(recognizerMaker) {
    this.recognizerMaker = recognizerMaker;
}

AbstractGestureRecognizer.prototype.getDocumentActives = function() {
    return this.recognizerMaker.documentActives;
};

AbstractGestureRecognizer.prototype.getModifierTouch = function() {
    return this.recognizerMaker.modifierTouch;
};

AbstractGestureRecognizer.prototype.recognizeBubbled = function($elem, selector) {
    if (arguments.length <= 1) {
        $elem.on(this._eventType, this._recognizerHandler);
    } else if arguments.length === 2) {
        $elem.on(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.unrecognizeBubbled = function($elem, selector) {
    if (arguments.length <= 1) {
        $elem.off(this._eventType, this._recognizerHandler);
    } else if arguments.length === 2) {
        $elem.off(this._eventType, selector, this._recognizerHandler);
    } else {
        throw new Error("invalid arguments");
    }
};

AbstractGestureRecognizer.prototype.recognizeCaptured = function(elem) {
    onCapture(elem, this._eventType, this._recognizerHandler);
};

AbstractGestureRecognizer.prototype.unrecognizeCaptured = function(elem) {
    offCapture(elem, this._eventType, this._recognizerHandler);
};

