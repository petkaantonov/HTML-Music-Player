"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function ModifierDragRecognizer(recognizerContext, moveHandler, endHandler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.moveHandler = moveHandler;
    this.endHandler = endHandler;
    this.currentTouch = null;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(ModifierDragRecognizer, AbstractGestureRecognizer);

ModifierDragRecognizer.prototype._recognizerHandler = function(e) {
    if (!this.hasModifierTouch() || this.getDocumentActives().length() > 2) {
        return this.end(e);
    }
    var modifierTouch = this.getModifierTouch();

    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;

    if (e.type === TOUCH_START) {
        for (var i = 0; i < changedTouches.length; ++i) {
            if (changedTouches[i].identifier !== modifierTouch.identifier) {
                this.currentTouch = changedTouches[i];
                return;
            }
        }
        this.end(e);
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        this.end(e);
    } else if (e.type === TOUCH_MOVE) {
        if (this.currentTouch === null || !this.hasSettledModifierTouch(e.timeStamp)) return;

        var touch = null;
        for (var i = 0; i < changedTouches.length; ++i) {
            if (changedTouches[i].identifier === this.currentTouch.identifier) {
                touch = changedTouches[i];
                break;
            }
        }

        if (touch === null) return;

        var yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        var xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

        if (yDelta > 0 || xDelta > 0) {
            this.currentTouch = touch;
            var g = new GestureObject(e, this.currentTouch);
            this.moveHandler.call(e.currentTarget, g);
        }
    }
};

ModifierDragRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        var g = new GestureObject(e, touch || this.currentTouch);
        this.currentTouch = null;
        this.endHandler.call(e.currentTarget, g);
    }
};
