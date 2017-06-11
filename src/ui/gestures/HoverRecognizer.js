

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import {inherits} from "util";

const TOUCH_START = `touchstart`;
const TOUCH_END = `touchend`;
const TOUCH_MOVE = `touchmove`;
const TOUCH_CANCEL = `touchcancel`;

export default function HoverRecognizer(recognizerContext, startHandler, endHandler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.startHandler = startHandler;
    this.endHandler = endHandler;
    this.currentTouch = null;
    this.actives = new ActiveTouchList();
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(HoverRecognizer, AbstractGestureRecognizer);

HoverRecognizer.prototype._recognizerHandler = function(e) {
    const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    this.actives.update(e, changedTouches);

    if (this.getDocumentActives().length() > 1) {
        this.end(e);
        return;
    }

    if (e.type === TOUCH_START) {
        if (this.actives.length() === 1 && this.currentTouch === null) {
            this.currentTouch = this.actives.first();
            const g = new GestureObject(e, this.currentTouch);
            this.startHandler.call(e.currentTarget, g);
        } else {
            this.end(e);
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.actives.length() !== 0 || this.currentTouch === null) {
            this.end(e);
            return;
        }
        this.end(e, changedTouches[0]);
    } else if (e.type === TOUCH_MOVE) {
        if (this.currentTouch === null || this.actives.length() !== 1) {
            this.end(e, changedTouches[0]);
            return;
        }

        const touch = changedTouches[0];
        const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

        if (yDelta > 25 || xDelta > 25) {
            this.end(e, touch);
        }
    }
};

HoverRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        const g = new GestureObject(e, touch || this.currentTouch);
        this.currentTouch = null;
        this.endHandler.call(e.currentTarget, g);
    }
};
