"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function TargetHoverRecognizer(recognizerContext, startHandler, endHandler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.startHandler = startHandler;
    this.endHandler = endHandler;
    this.actives = new ActiveTouchList();
    this.currentTouch = null;
    this.bounds = null;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(TargetHoverRecognizer, AbstractGestureRecognizer);

TargetHoverRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    var targetTouches = e.targetTouches || e.originalEvent.targetTouches;

    if (e.type === TOUCH_START) {
        if (this.currentTouch === null && targetTouches.length > 0) {
            this.currentTouch = targetTouches[0];
            this.bounds = this.startHandler.call(e.currentTarget, e);
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL || e.type === TOUCH_MOVE) {
        if (this.currentTouch !== null) {
            if (targetTouches.length === 0) {
                this.end(e);
                return;
            }
            for (var i = 0; i < changedTouches.length; ++i) {
                if (changedTouches[i].identifier === this.currentTouch.identifier) {
                    var touch = changedTouches[i];
                    var x = touch.clientX;
                    var y = touch.clientY;

                    if (!(x >= this.bounds.left && x <= this.bounds.right &&
                        y >= this.bounds.top && y <= this.bounds.bottom)) {
                        this.end(e);
                    }
                    return;
                }
            }
        }
    }
};

TargetHoverRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        var g = new GestureObject(e, touch || this.currentTouch);
        this.bounds =  this.currentTouch = null;
        this.endHandler.call(e.currentTarget, g);
    }
};
