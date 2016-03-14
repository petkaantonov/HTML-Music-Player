"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function LongTapRecognizer(recognizerMaker, handler, noTrigger) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.noTrigger = noTrigger;
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.currentTouch = null;
    this.event = null;
    this.timeoutId = -1;
    this._eventType = recognizerMaker.TOUCH_EVENTS;

    this._longTapTimedOut = this._longTapTimedOut.bind(this);
    this.clear = this.clear.bind(this);
    this._recognizerHandler = this._recognizerHandler.bind(this);
}
inherits(LongTapRecognizer, AbstractGestureRecognizer);

LongTapRecognizer.prototype._longTapTimedOut = function() {
    var ev = this.event;
    var touch = this.currentTouch;
    this.clear();
    if (this.getDocumentActives().length() <= 1) {
        var g = new GestureObject(ev, touch);
        this.handler.call(ev.currentTarget, g);
    }
};

LongTapRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    this.actives.update(e, changedTouches);

    if (e.type === TOUCH_START) {
        if (this.getDocumentActives().length() === 1 && this.currentTouch === null) {
            this.currentTouch = this.actives.first();
            this.event = e;
            var timeout = this.recognizerMaker.createSingleTapTimeout(this._longTapTimedOut,
                                                                      this.clear,
                                                                      this.recognizerMaker.LONG_TAP_TIME);
            this.timeoutId = timeout.id;
            if (!this.noTrigger) {
                this.fireLongPressStart(this.currentTouch);
            }
        } else {
            this.clear();
        }
    } else if (e.type === TOUCH_MOVE) {
        var touch = changedTouches[0];
        if (this.actives.length() !== 1 || !this.actives.contains(this.currentTouch) || !this.actives.contains(touch)) {
            this.clear();
            return;
        }
        var yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        var xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);
        this.currentTouch = touch;

        if (xDelta > 2 || yDelta > 2) {
            this.clear();
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        this.clear();
    } else if (e.type === TOUCH_MOVE) {
        if (this.getDocumentActives().length() > 1) {
            this.clear();
        }
    }
};

LongTapRecognizer.prototype.clear = function() {
    if (this.timeoutId !== -1) {
        clearTimeout(this.timeoutId);
        this.timeoutId = -1;
    }
    if (this.currentTouch !== null) {
        if (!this.noTrigger) {
            this.fireLongPressEnd(this.currentTouch);
        }
        this.currentTouch = null;
    }
    this.event = null;
};
