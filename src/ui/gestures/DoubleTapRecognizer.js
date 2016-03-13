"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import TapRecognizer from "ui/gestures/TapRecognizer";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function DoubleTapRecognizer(recognizerMaker, handler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.lastTap = -1;
    this.lastTouch = null;
    this.tapRecognizer = new TapRecognizer(recognizerMaker, this._tapHandler.bind(this));
    this._recognizerHandler = this.tapRecognizer._recognizerHandler;
    this._eventType = recognizerMaker.TOUCH_EVENTS;
}
inherits(DoubleTapRecognizer, AbstractGestureRecognizer);

DoubleTapRecognizer.prototype._tapHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;

    var now = (e.timeStamp || e.originalEvent.timeStamp);
    if (this.lastTap === -1) {
        this.lastTap = now;
        this.lastTouch = changedTouches[0];
    } else if (now - this.lastTap < this.recognizerMaker.TAP_TIME * 1.62) {
        var touch = this.lastTouch;
        this.lastTouch = null;
        var yDelta = Math.abs(touch.clientY - changedTouches[0].clientY);
        var xDelta = Math.abs(touch.clientX - changedTouches[0].clientX);
        this.lastTap = -1;
        if (yDelta < this.recognizerMaker.DOUBLE_TAP_MINIMUM_MOVEMENT &&
            xDelta < this.recognizerMaker.DOUBLE_TAP_MINIMUM_MOVEMENT) {
            return this.handler.apply(e.currentTarget, arguments);
        }
    } else {
        this.lastTouch = changedTouches[0];
        this.lastTap = now;
    }
};
