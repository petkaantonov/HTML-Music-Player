import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import {TOUCH_EVENTS, SWIPE_LENGTH, SWIPE_VELOCITY, TOUCH_START,
        TOUCH_END, TOUCH_MOVE, TOUCH_CANCEL} from "ui/gestures/GestureRecognizerContext";
import GestureObject from "ui/gestures/GestureObject";

export default class HorizontalSwipeRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, handler, direction) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.direction = direction;
        this.currentTouch = null;
        this.startX = -1;
        this.lastY = -1;
        this.lastX = -1;
        this.startTime = -1;
        this._recognizerHandler = this._recognizerHandler.bind(this);
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler(e) {
        const {changedTouches} = e;
        const now = e.timeStamp;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 1) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() === 1) {
                this.currentTouch = this.actives.first();
                this.startX = this.currentTouch.clientX;
                this.lastX = this.startX;
                this.lastY = this.currentTouch.clientY;
                this.startTime = now;
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.currentTouch === null) return;
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i];
                if (touch.identifier === this.currentTouch.identifier) {
                    this.lastX = touch.clientX;
                }
            }
            if (this.actives.length() === 0) {
                this.checkCompletion(now - this.startTime, e, this.currentTouch);
            }
        } else if (e.type === TOUCH_MOVE) {
            if (this.getDocumentActives().length() > 1) {
                this.clear();
                return;
            }
            if (this.currentTouch !== null) {
                for (let i = 0; i < changedTouches.length; ++i) {
                    const touch = changedTouches[i];

                    if (touch.identifier === this.currentTouch.identifier) {
                        this.lastX = touch.clientX;
                        this.lastY = touch.clientY;
                    }
                }
            }
        }
    }

    checkCompletion(elapsedTotal, e, touch) {
        if (this.startX !== -1 && this.getDocumentActives().length() === 0) {
            const diff = this.lastX - this.startX;
            const absDiff = Math.abs(diff);
            const velocity = (absDiff / elapsedTotal * 1000) | 0;
            const {direction} = this;
            const minSwipeLength = SWIPE_LENGTH;
            const minSwipeVelocity = SWIPE_VELOCITY;

            if (absDiff > minSwipeLength &&
                velocity > minSwipeVelocity &&
                (diff < 0 && direction < 0 ||
                diff > 0 && direction > 0)) {
                const g = new GestureObject(e, touch);
                this.handler.call(e.currentTarget, g);
            }
        }
        this.clear();
    }

    clear() {
        this.currentTouch = null;
        this.lastY = this.startX = this.lastX = -1;
        this.startTime = -1;
    }
}
