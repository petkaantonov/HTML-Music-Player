

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import TapRecognizer from "ui/gestures/TapRecognizer";
import {inherits} from "util";

export default function DoubleTapRecognizer(recognizerContext, handler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.lastTap = -1;
    this.lastTouch = null;
    this.tapRecognizer = new TapRecognizer(recognizerContext, this._tapHandler.bind(this));
    this._recognizerHandler = this.tapRecognizer._recognizerHandler;
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(DoubleTapRecognizer, AbstractGestureRecognizer);

DoubleTapRecognizer.prototype._tapHandler = function(e, ...args) {
    const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    const now = (e.timeStamp || e.originalEvent.timeStamp);

    if (this.lastTap === -1) {
        this.lastTap = now;
        this.lastTouch = changedTouches[0];
    } else if (now - this.lastTap < this.recognizerContext.TAP_TIME * 1.62) {
        const touch = this.lastTouch;
        this.lastTouch = null;
        const yDelta = Math.abs(touch.clientY - changedTouches[0].clientY);
        const xDelta = Math.abs(touch.clientX - changedTouches[0].clientX);
        this.lastTap = -1;
        if (yDelta < this.recognizerContext.DOUBLE_TAP_MINIMUM_MOVEMENT &&
            xDelta < this.recognizerContext.DOUBLE_TAP_MINIMUM_MOVEMENT) {
            this.handler.call(e.currentTarget, e, ...args);
        }
    } else {
        this.lastTouch = changedTouches[0];
        this.lastTap = now;
    }
};
