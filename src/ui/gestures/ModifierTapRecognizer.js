

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/gestures/GestureObject";
import {inherits} from "util";

const TOUCH_START = `touchstart`;
const TOUCH_END = `touchend`;
const TOUCH_MOVE = `touchmove`;
const TOUCH_CANCEL = `touchcancel`;

export default function ModifierTapRecognizer(recognizerContext, handler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this.currentTouch = null;
    this.started = -1;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(ModifierTapRecognizer, AbstractGestureRecognizer);

ModifierTapRecognizer.prototype._recognizerHandler = function(e) {
    const changedTouches = e.changedTouches || e.originalEvent.changedTouches;

    if (!this.hasModifierTouch()) {
        this.clear();
        return;
    }

    const modifierTouch = this.getModifierTouch();

    if (e.type === TOUCH_START) {
        if (this.getDocumentActives().length() !== 2) {
            this.clear();
            return;
        }

        for (let i = 0; i < changedTouches.length; ++i) {
            if (changedTouches[i].identifier !== modifierTouch.identifier) {
                this.started = e.timeStamp || e.originalEvent.timeStamp;
                this.currentTouch = changedTouches[i];
                return;
            }
        }
        this.clear();
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.currentTouch === null) {
            return;
        }
        if (this.getDocumentActives().length() !== 1) {
            this.clear();
            return;
        }
        let touch = null;
        for (let i = 0; i < changedTouches.length; ++i) {
            if (changedTouches[i].identifier === this.currentTouch.identifier) {
                touch = changedTouches[i];
                break;
            }
        }

        if (!touch) {
            this.clear();
            return;
        }

        const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);
        const elapsed = (e.timeStamp || e.originalEvent.timeStamp) - this.started;

        if (elapsed > 20 && elapsed < this.recognizerContext.TAP_TIME && xDelta <= 25 && yDelta <= 25) {
            if (this.hasSettledModifierTouch(e.timeStamp)) {
                const g = new GestureObject(e, touch);
                this.handler.call(e.currentTarget, g);
            }
        }
        this.clear();
    } else if (e.type === TOUCH_MOVE &&
               this.getDocumentActives().length() !== 2) {
        this.clear();
    }
};

ModifierTapRecognizer.prototype.clear = function() {
    this.currentTouch = null;
    this.started = -1;
};
