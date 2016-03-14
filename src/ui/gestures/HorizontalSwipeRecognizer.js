"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import DragRecognizer from "ui/gestures/DragRecognizer";
import { inherits } from "lib/util";

export default function HorizontalSwipeRecognizer(recognizerMaker, handler, direction) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.direction = direction;
    this.actives = new ActiveTouchList();
    this.startX = -1;
    this.lastX = -1;
    this.previousTime = -1;
    this.elapsedTotal = 0;
    this.dragRecognizer = new DragRecognizer(recognizerMaker,
                                             this._dragMoveHandler.bind(this),
                                             this._dragEndHandler.bind(this));
    this._recognizerHandler = this.dragRecognizer._recognizerHandler;
    this._eventType = recognizerMaker.TOUCH_EVENTS;
}
inherits(HorizontalSwipeRecognizer, AbstractGestureRecognizer);

HorizontalSwipeRecognizer.prototype._dragMoveHandler = function(e) {
    if (this.startX === -1) {
        this.startX = e.clientX;
    } else {
        var now = (e.timeStamp || e.originalEvent.timeStamp);
        this.elapsedTotal += (now - this.previousTime);
        if ((this.direction < 0 && e.clientX - this.lastX > 0) ||
            (this.direction > 0 && e.clientX - this.lastX < 0)) {
            this.clear();
        }
    }
    this.lastX = e.clientX;
    this.previousTime = e.timeStamp || e.originalEvent.timeStamp;
};

HorizontalSwipeRecognizer.prototype._dragEndHandler = function(e) {
    if (this.startX !== -1 && this.elapsedTotal > 10) {
        var diff = e.clientX - this.startX;
        var absDiff = Math.abs(diff);
        var minSwipeLength = this.recognizerMaker.SWIPE_LENGTH;
        var velocity = (absDiff / this.elapsedTotal * 1000)|0;

        if (absDiff > minSwipeLength &&
            velocity > this.recognizerMaker.SWIPE_VELOCITY &&
            (diff < 0 && this.direction < 0 ||
            diff > 0 && this.direction > 0)) {
            this.handler.call(e.currentTarget, e);
        }
    }
    this.clear();
};

HorizontalSwipeRecognizer.prototype.clear = function() {
    this.previousTime = -1;
    this.startX = -1;
    this.lastX = -1;
    this.elapsedTotal = 0;
};

