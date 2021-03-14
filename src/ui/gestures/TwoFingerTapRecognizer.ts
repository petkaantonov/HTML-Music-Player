import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureRecognizerContext, {
    TAP_MAX_MOVEMENT,
    TAP_TIME,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
    TWO_FINGER_TAP_MINIMUM_DISTANCE,
} from "ui/gestures/GestureRecognizerContext";

type Handler = (this: HTMLElement, a: Touch, b: Touch) => void;

export default class TwoFingerTapRecognizer extends AbstractGestureRecognizer {
    handler: Handler;
    actives: ActiveTouchList;
    currentATouch?: Touch;
    currentBTouch?: Touch;
    started: number;
    constructor(recognizerContext: GestureRecognizerContext, handler: Handler) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.currentATouch = undefined;
        this.currentBTouch = undefined;
        this.started = -1;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 2) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() <= 2) {
                this.currentATouch = this.actives.first();
                if (this.actives.length() > 1) {
                    this.currentBTouch = this.actives.nth(1);
                }
            } else {
                this.clear();
            }

            if (this.currentATouch !== undefined && this.currentBTouch === undefined) {
                this.started = e.timeStamp;
            } else if (this.currentATouch !== undefined && this.currentBTouch !== undefined) {
                this.maybeStart(e, this.currentATouch, this.currentBTouch);
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.currentATouch === undefined || this.currentBTouch === undefined) {
                this.clear();
                return;
            }

            if (
                this.actives.length() <= 1 &&
                !this.checkDelta(changedTouches, this.currentATouch, this.currentBTouch)
            ) {
                return;
            } else if (this.actives.length() > 1 || this.getDocumentActives().length() > 1) {
                this.clear();
                return;
            }

            if (this.actives.length() !== 0) {
                return;
            }

            const elapsed = e.timeStamp - this.started;
            if (elapsed > 20 && elapsed < TAP_TIME) {
                this.handler.call(e.currentTarget as HTMLElement, this.currentATouch, this.currentBTouch);
            }
            this.clear();
        } else if (e.type === TOUCH_MOVE) {
            if (this.getDocumentActives().length() > 2) {
                this.clear();
            }
        }
    };

    clear() {
        this.currentATouch = this.currentBTouch = undefined;
        this.started = -1;
    }

    maybeStart(e: TouchEvent, currentATouch: Touch, currentBTouch: Touch) {
        const deltaX = Math.abs(currentATouch.clientX - currentBTouch.clientX);
        const deltaY = Math.abs(currentATouch.clientY - currentBTouch.clientY);
        // Fingers are too close together.
        if (deltaX > TWO_FINGER_TAP_MINIMUM_DISTANCE || deltaY > TWO_FINGER_TAP_MINIMUM_DISTANCE) {
            if (this.started === -1) {
                this.started = e.timeStamp;
            }
        } else {
            this.clear();
        }
    }

    checkDelta(changedTouches: TouchList, currentATouch: Touch, currentBTouch: Touch) {
        for (let i = 0; i < changedTouches.length; ++i) {
            const touch = changedTouches[i]!;
            let xDelta, yDelta;
            if (touch.identifier === currentATouch.identifier) {
                yDelta = Math.abs(touch.clientY - currentATouch.clientY);
                xDelta = Math.abs(touch.clientX - currentATouch.clientX);
                // First finger moved too much while tapping.
                if (xDelta > TAP_MAX_MOVEMENT || yDelta > TAP_MAX_MOVEMENT) {
                    this.clear();
                    return false;
                }
            } else if (touch.identifier === currentBTouch.identifier) {
                yDelta = Math.abs(touch.clientY - currentBTouch.clientY);
                xDelta = Math.abs(touch.clientX - currentBTouch.clientX);
                // Second finger moved too much while tapping.
                if (xDelta > TAP_MAX_MOVEMENT || yDelta > TAP_MAX_MOVEMENT) {
                    this.clear();
                    return false;
                }
            }
        }
        return true;
    }
}
