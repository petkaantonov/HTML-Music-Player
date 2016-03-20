"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import { inherits } from "util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function HorizontalTwoFingerSwipeRecognizer(recognizerContext, handler, direction) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this.direction = direction;
    this.currentATouch = null;
    this.currentBTouch = null;
    this.startAX = -1;
    this.startBX = -1;
    this.lastAY = -1;
    this.lastAX = -1;
    this.lastBX = -1;
    this.lastBY = -1;
    this.startTime = -1;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS;
}
inherits(HorizontalTwoFingerSwipeRecognizer, AbstractGestureRecognizer);

HorizontalTwoFingerSwipeRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches;
    var now = e.timeStamp;
    this.actives.update(e, changedTouches);

    if (this.getDocumentActives().length() > 2) {
        this.clear();
        return;
    }

    if (e.type === TOUCH_START) {
        if (this.actives.length() === 1) {
            this.currentATouch = this.actives.first();
            this.startAX = this.currentATouch.clientX;
            this.lastAX = this.startAX;
            this.lastAY = this.currentATouch.clientY;
            this.startTime = now;
        } else if (this.actives.length() === 2 && this.currentATouch !== null) {
            this.startTime = now;
            this.currentBTouch = this.actives.nth(1);
            this.startBX = this.currentBTouch.clientX;
            this.lastBX = this.startBX;
            this.lastBY = this.currentBTouch.clientY;
            if (this.lastAX !== -1 &&
                (Math.abs(this.lastAX - this.lastBX) > 150 &&
                    Math.abs(this.lastAY - this.lastBY) > 150)) {
                this.clear();
            }
        } else {
            this.clear();
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (this.currentATouch === null || this.currentBTouch === null) return;
        for (var i = 0; i < changedTouches.length; ++i) {
            var touch = changedTouches[i];
            if (touch.identifier === this.currentATouch.identifier) {
                this.lastAX = touch.clientX;
            } else if (touch.identifier === this.currentBTouch.identifier) {
                this.lastBX = touch.clientX;
            }
        }
        if (this.actives.length() === 0) {
            this.checkCompletion(now - this.startTime);
        }
    } else if (e.type === TOUCH_MOVE) {
        if (this.getDocumentActives().length() > 2) {
            this.clear();
            return;
        }
        if (this.currentATouch !== null || this.currentBTouch !== null) {

            for (var i = 0; i < changedTouches.length; ++i) {
                var touch = changedTouches[i];

                if (this.currentATouch !== null && touch.identifier === this.currentATouch.identifier) {
                    this.lastAX = touch.clientX;
                    this.lastAY = touch.clientY;
                } else if (this.currentBTouch !== null && touch.identifier === this.currentBTouch.identifier) {
                    this.lastBX = touch.clientX;
                    this.lastBY = touch.clientY;
                }
            }

            if (this.lastAX !== -1 && this.lastBX !== -1 &&
                (Math.abs(this.lastAX - this.lastBX) > 150 &&
                 Math.abs(this.lastAY - this.lastBY) > 150)) {
                this.clear();
            }
        }
    }
};

HorizontalTwoFingerSwipeRecognizer.prototype.checkCompletion = function(elapsedTotal) {
    if (this.startAX !== -1 && this.startBX !== -1 && this.getDocumentActives().length() === 0) {
        var aDiff = this.lastAX - this.startAX;
        var bDiff = this.lastBX - this.startBX;
        var aAbsDiff = Math.abs(aDiff);
        var bAbsDiff = Math.abs(bDiff);
        var aVelocity = (aAbsDiff / elapsedTotal * 1000)|0;
        var bVelocity = (bAbsDiff / elapsedTotal * 1000)|0;
        var direction = this.direction;
        var minSwipeLength = this.recognizerContext.SWIPE_LENGTH;
        var minSwipeVelocity = this.recognizerContext.SWIPE_VELOCITY;

        if (aAbsDiff > minSwipeLength &&
            bAbsDiff > minSwipeLength &&
            aVelocity > minSwipeVelocity &&
            bVelocity > minSwipeVelocity &&
            (aDiff < 0 && bDiff < 0 && direction < 0 ||
            aDiff > 0 && bDiff > 0 && direction > 0) &&
            Math.abs(aAbsDiff - bAbsDiff) <= 150) {
            this.handler.call(null);
        }
    }
    this.clear();
};

HorizontalTwoFingerSwipeRecognizer.prototype.clear = function() {
    this.currentATouch = this.currentBTouch = null;
    this.lastAY = this.lastBY = this.startAX = this.startBX = this.lastAX = this.lastBX = -1;
    this.startTime = -1;
};
