"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function VerticalPinchRecognizer(recognizerMaker, handler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.started = -1;
    this.currentATouch = null;
    this.currentBTouch = null;
    this.aChanged = false;
    this.bChanged = false;
    this._eventType = recognizerMaker.TOUCH_EVENTS;
    this._recognizerHandler = this._recognizerHandler.bind(this);
}
inherits(VerticalPinchRecognizer, AbstractGestureRecognizer);

VerticalPinchRecognizer.prototype._recognizerHandler = function(e) {
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
        }
        this.started = this.currentATouch !== null && this.currentBTouch !== null ?
                                                        (e.timeStamp || e.originalEvent.timeStamp) : -1;
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (!this.actives.contains(this.currentATouch) || !this.actives.contains(this.currentBTouch)) {
            this.clear();
        }
    } else if (e.type === TOUCH_MOVE) {
        if (this.actives.length() !== 2 ||
            !this.actives.contains(this.currentATouch) ||
            !this.actives.contains(this.currentBTouch) ||
            this.getDocumentActives().length() > 2) {
            return;
        }

        if (!this.aChanged || !this.bChanged) {
            for (var i = 0; i < changedTouches.length; ++i) {
                var touch = changedTouches[i];
                var delta;
                if (touch.identifier === this.currentATouch.identifier) {
                    delta = Math.abs(touch.clientY - this.currentATouch.clientY);
                    if (delta > 25) {
                        this.aChanged = true;
                        this.currentATouch = touch;
                    }
                } else if (touch.identifier === this.currentBTouch.identifier) {
                    delta = Math.abs(touch.clientY - this.currentATouch.clientY);
                    if (delta > 25) {
                        this.bChanged = true;
                        this.currentBTouch = touch;
                    }
                }

                if (this.aChanged && this.bChanged) {
                    break;
                }
            }
        }

        if ((this.aChanged || this.bChanged) &&
            this.started !== -1 &&
            ((e.timeStamp || e.originalEvent.timeStamp) - this.started) > (this.recognizerMaker.TAP_TIME * 2)) {
            this.aChanged = this.bChanged = false;
            var start, end;

            if (this.currentATouch.clientY > this.currentBTouch.clientY) {
                start = this.currentBTouch;
                end = this.currentATouch;
            } else {
                start = this.currentATouch;
                end = this.currentBTouch;
            }
            this.handler.call(null, start.clientY, end.clientY);
        }
    }
};

VerticalPinchRecognizer.prototype.clear = function() {
    this.currentATouch = this.currentBTouch = null;
    this.aChanged = this.bChanged = false;
    this.started = -1;
};
