

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/gestures/GestureObject";
import {inherits} from "util";
import {TOUCH_START, TOUCH_END, TOUCH_MOVE, TOUCH_CANCEL, TOUCH_EVENTS} from "ui/gestures/GestureRecognizerContext";

export default function ModifierDragRecognizer(recognizerContext, moveHandler, endHandler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.moveHandler = moveHandler;
    this.endHandler = endHandler;
    this.currentTouch = null;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = TOUCH_EVENTS;
}
inherits(ModifierDragRecognizer, AbstractGestureRecognizer);

ModifierDragRecognizer.prototype._recognizerHandler = function(e) {
    if (!this.hasModifierTouch() || this.getDocumentActives().length() > 2) {
        this.end(e);
        return;
    }
    const modifierTouch = this.getModifierTouch();

    const changedTouches = e.changedTouches || e.originalEvent.changedTouches;

    if (e.type === TOUCH_START) {
        for (let i = 0; i < changedTouches.length; ++i) {
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

        let touch = null;
        for (let i = 0; i < changedTouches.length; ++i) {
            if (changedTouches[i].identifier === this.currentTouch.identifier) {
                touch = changedTouches[i];
                break;
            }
        }

        if (touch === null) return;

        const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

        if (yDelta > 0 || xDelta > 0) {
            this.currentTouch = touch;
            const g = new GestureObject(e, this.currentTouch);
            this.moveHandler.call(e.currentTarget, g);
        }
    }
};

ModifierDragRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        const g = new GestureObject(e, touch || this.currentTouch);
        this.currentTouch = null;
        this.endHandler.call(e.currentTarget, g);
    }
};
