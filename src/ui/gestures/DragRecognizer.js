"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function DragRecognizer(recognizerMaker, moveHandler, endHandler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.moveHandler = moveHandler;
    this.endHandler = endHandler;
    this.actives = new ActiveTouchList();
    this.currentTouch = null;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerMaker.TOUCH_EVENTS;
}
inherits(DragRecognizer, AbstractGestureRecognizer);

DragRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    this.actives.update(e, changedTouches);

    if (this.getDocumentActives().length() > 1) {
        this.end(e);
        return;
    }

    if (e.type === TOUCH_START) {
        this.currentTouch = this.actives.first();
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.actives.length() > 0) {
            this.currentTouch = this.actives.first();
        } else {
            this.end( e, currentTouch);
            this.currentTouch = null;
        }
    } else if (e.type === TOUCH_MOVE) {
        if (!this.actives.contains(this.currentTouch) ||
             this.actives.length() > 1 ||
             this.getDocumentActives().length() > 1) {
            return;
        }

        var touch = changedTouches[0];
        var yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
        var xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

        if (yDelta > 2 || xDelta > 2) {
            this.currentTouch = touch;
            var g = new GestureObject(e, this.currentTouch);
            this.moveHandler.call(e.currentTarget, g);
        }
    }
};

DragRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        var g = new GestureObject(e, touch || this.currentTouch);
        this.currentTouch = null;
        this.endHandler.call(e.currentTarget, g);
    }
};
