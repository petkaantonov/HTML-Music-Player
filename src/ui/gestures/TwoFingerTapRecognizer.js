import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import {TOUCH_START, TOUCH_END, TOUCH_MOVE, TOUCH_CANCEL,
        TAP_TIME, TOUCH_EVENTS, TWO_FINGER_TAP_MINIMUM_DISTANCE,
        TAP_MAX_MOVEMENT} from "ui/gestures/GestureRecognizerContext";

export default class TwoFingerTapRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, handler) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.currentATouch = null;
        this.currentBTouch = null;
        this.started = -1;
        this._recognizerHandler = this._recognizerHandler.bind(this);
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler(e) {
        const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
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
                this.maybeStart(e);
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

            if (this.actives.length() !== 0) {
                return;
            }

            const elapsed = (e.timeStamp || e.originalEvent.timeStamp) - this.started;
            if (elapsed > 20 && elapsed < TAP_TIME) {
                this.handler.call(e.currentTarget, this.currentATouch, this.currentBTouch);
            }
            this.clear();
        } else if (e.type === TOUCH_MOVE) {
            if (this.getDocumentActives().length() > 2) {
                this.clear();
            }
        }
    }

    clear() {
        this.currentATouch = this.currentBTouch = null;
        this.started = -1;
    }

    maybeStart(e) {
        const deltaX = Math.abs(this.currentATouch.clientX - this.currentBTouch.clientX);
        const deltaY = Math.abs(this.currentATouch.clientY - this.currentBTouch.clientY);
        // Fingers are too close together.
        if (deltaX > TWO_FINGER_TAP_MINIMUM_DISTANCE ||
            deltaY > TWO_FINGER_TAP_MINIMUM_DISTANCE) {
            if (this.started === -1) {
                this.started = (e.timeStamp || e.originalEvent.timeStamp);
            }
        } else {
            this.clear();
        }
    }

    checkDelta(changedTouches) {
        for (let i = 0; i < changedTouches.length; ++i) {
            const touch = changedTouches[i];
            let xDelta, yDelta;
            if (touch.identifier === this.currentATouch.identifier) {
                yDelta = Math.abs(touch.clientY - this.currentATouch.clientY);
                xDelta = Math.abs(touch.clientX - this.currentATouch.clientX);
                // First finger moved too much while tapping.
                if (xDelta > TAP_MAX_MOVEMENT ||
                    yDelta > TAP_MAX_MOVEMENT) {
                    this.clear();
                    return false;
                }
            } else if (touch.identifier === this.currentBTouch.identifier) {
                yDelta = Math.abs(touch.clientY - this.currentBTouch.clientY);
                xDelta = Math.abs(touch.clientX - this.currentBTouch.clientX);
                // Second finger moved too much while tapping.
                if (xDelta > TAP_MAX_MOVEMENT ||
                    yDelta > TAP_MAX_MOVEMENT) {
                    this.clear();
                    return false;
                }
            }
        }
        return true;
    }
}
