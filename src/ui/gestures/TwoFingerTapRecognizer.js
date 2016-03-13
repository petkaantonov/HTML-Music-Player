"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function TwoFingerTapRecognizer(recognizerMaker, handler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.currentATouch = null;
    this.currentBTouch = null;
    this.started = -1;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerMaker.TOUCH_EVENTS;
}
inherits(TwoFingerTapRecognizer, AbstractGestureRecognizer);

TwoFingerTapRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    this.actives.update(e, changedTouches);

    if (this.getDocumentActives().length() > 2) {
        this.clear();
        return;
    }

    if (e.type === TOUCH_START) {
        if (this.actives.length() <= 2) {
            this.currentATouch = this.actives.first() || null;
            if (this.actives.length() > 1) {
                this.currentBTouch = this.actives.nth(1) || null;
            }
        } else {
            this.clear();
        }

        if (this.currentATouch !== null && this.currentBTouch === null) {
            this.started = (e.timeStamp || e.originalEvent.timeStamp);
        } else if (this.currentATouch !== null && this.currentBTouch !== null) {
            this.maybeStart();
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.currentATouch === null || this.currentBTouch === null) {
            this.clear();
            return;
        }

        if (this.actives.length() <= 1 && !this.checkDelta(changedTouches)) {
            return;
        } else if (this.actives.length() > 1 || this.getDocumentActives().length() > 1) {
            this.clear();
            return;
        }

        if (this.actives.length() !== 0) return;

        var elapsed = (e.timeStamp || e.originalEvent.timeStamp) - this.started;
        if (elapsed > 20 && elapsed < this.recognizerMaker.TAP_TIME) {
            this.handler.call(e.currentTarget, this.currentATouch, this.currentBTouch);
        }
        this.clear();
    } else if (e.type === TOUCH_MOVE) {
        if (this.getDocumentActives().length() > 2) {
            this.clear();
        }
    }
};

TwoFingerTapRecognizer.prototype.clear = function() {
    this.currentATouch = this.currentBTouch = null;
    this.started = -1;
};

TwoFingerTapRecognizer.prototype.maybeStart = function() {
    var deltaX = Math.abs(this.currentATouch.clientX - this.currentBTouch.clientX);
    var deltaY = Math.abs(this.currentATouch.clientY - this.currentBTouch.clientY);
    // Fingers are too close together.
    if (deltaX > this.recognizerMaker.TWO_FINGER_TAP_MINIMUM_DISTANCE ||
        deltaY > this.recognizerMaker.TWO_FINGER_TAP_MINIMUM_DISTANCE) {
        if (this.started === -1) {
            this.started = (e.timeStamp || e.originalEvent.timeStamp);
        }
    } else {
        this.clear();
    }
};

TwoFingerTapRecognizer.prototype.checkDelta = function(changedTouches) {
    for (var i = 0; i < changedTouches.length; ++i) {
        var touch = changedTouches[i];
        if (touch.identifier === this.currentATouch.identifier) {
            var yDelta = Math.abs(touch.clientY - this.currentATouch.clientY);
            var xDelta = Math.abs(touch.clientX - this.currentATouch.clientX);
            // First finger moved too much while tapping.
            if (xDelta > this.recognizerMaker.TAP_MAX_MOVEMENT ||
                yDelta > this.recognizerMaker.TAP_MAX_MOVEMENT) {
                this.clear();
                return false;
            }
        } else if (touch.identifier === this.currentBTouch.identifier) {
            var yDelta = Math.abs(touch.clientY - this.currentBTouch.clientY);
            var xDelta = Math.abs(touch.clientX - this.currentBTouch.clientX);
            // Second finger moved too much while tapping.
            if (xDelta > this.recognizerMaker.TAP_MAX_MOVEMENT ||
                yDelta > this.recognizerMaker.TAP_MAX_MOVEMENT) {
                this.clear();
                return false;
            }
        }
    }
    return true;
};
