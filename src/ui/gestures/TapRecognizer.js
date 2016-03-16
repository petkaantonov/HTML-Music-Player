"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function TapRecognizer(recognizerContext, handler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this.currentTouch = null;
    this.started = -1;
    this.actives = new ActiveTouchList();
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(TapRecognizer, AbstractGestureRecognizer);

TapRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    this.actives.update(e, changedTouches);

    if (e.type === TOUCH_START) {
        if (this.actives.length() <= 1) {
            this.started = (e.timeStamp || e.originalEvent.timeStamp);
            this.currentTouch = this.actives.first();
        } else {
            this.clear();
        }

    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.actives.length() !== 0 || this.currentTouch === null || this.getDocumentActives().length() !== 0) {
            this.clear();
            return;
        }

        var touch = changedTouches[0];
        var yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        var xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);
        var elapsed = (e.timeStamp || e.originalEvent.timeStamp) - this.started;

        if (elapsed > 20 && elapsed < this.recognizerContext.TAP_TIME && xDelta <= 25 && yDelta <= 25) {
            var g = new GestureObject(e, touch);
            this.handler.call(e.currentTarget, g);
        }
        this.clear();
    } else if (e.type === TOUCH_MOVE) {
        if (this.getDocumentActives().length() > 1) {
            this.clear();
        }
    }
};

TapRecognizer.prototype.clear = function() {
    this.currentTouch = null;
    this.started = -1;
};
