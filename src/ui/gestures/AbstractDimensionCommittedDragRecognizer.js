"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

const VERTICAL = 1;
const HORIZONTAL = -1;
const UNCOMMITTED = 0;

export default function AbstractDimensionCommittedDragRecognizer(recognizerMaker, fnStart, fnMove, fnEnd) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.startHandler = fnStart;
    this.moveHandler = fnMove;
    this.endHandler = fnEnd;
    this.currentTouch = null;
    this.committed = UNCOMMITTED;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerMaker.TOUCH_EVENTS;
}
inherits(AbstractDimensionCommittedDragRecognizer, AbstractGestureRecognizer);

AbstractDimensionCommittedDragRecognizer.VERTICAL = VERTICAL;
AbstractDimensionCommittedDragRecognizer.HORIZONTAL = HORIZONTAL;

AbstractDimensionCommittedDragRecognizer.prototype.end = function(e, touch) {
    if (this.currentTouch !== null) {
        var committedDimension = this.committed === this.dimension;
        this.committed = UNCOMMITTED;
        var theTouch = touch || this.currentTouch;
        this.currentTouch = null;
        if (committedDimension) {
            var g = new GestureObject(e, theTouch);
            this.endHandler.call(e.currentTouch, g);
        }
    }
};

AbstractDimensionCommittedDragRecognizer.prototype._recognizerHandler = function(e) {
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
            this.currentTouch = actives.first();
        } else {
            this.end(e, this.currentTouch);
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

        if (this.committed === UNCOMMITTED) {
            if (yDelta > 10 && yDelta > xDelta) {
                this.committed = VERTICAL;
            } else if (xDelta > 10 && xDelta > yDelta) {
                this.committed = HORIZONTAL;
            }

            if (this.committed === this.dimension) {
                this.currentTouch = touch;
                this.startHandler.call(e.currentTarget, new GestureObject(e, touch));
            }
        } else if (this.committed === this.dimension) {
            this.currentTouch = touch;
            var g = new GestureObject(e, touch);
            this.moveHandler.call(e.currentTarget, g);
        }
    }
};
