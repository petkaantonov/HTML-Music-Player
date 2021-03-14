import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    SWIPE_LENGTH,
    SWIPE_VELOCITY,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

import { DirectionType } from "./AbstractDimensionCommittedDragRecognizer";

export default class HorizontalSwipeRecognizer extends AbstractGestureRecognizer {
    handler: GestureHandler;
    actives: ActiveTouchList;
    direction: number;
    currentTouch?: Touch;
    startX: number;
    lastY: number;
    lastX: number;
    startTime: number;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler, direction: DirectionType) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.direction = direction;
        this.currentTouch = undefined;
        this.startX = -1;
        this.lastY = -1;
        this.lastX = -1;
        this.startTime = -1;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const { changedTouches } = e;
        const now = e.timeStamp;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 1) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() === 1) {
                this.currentTouch = this.actives.first()!;
                this.startX = this.currentTouch.clientX;
                this.lastX = this.startX;
                this.lastY = this.currentTouch.clientY;
                this.startTime = now;
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.currentTouch === undefined) return;
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i]!;
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
            if (this.currentTouch !== undefined) {
                for (let i = 0; i < changedTouches.length; ++i) {
                    const touch = changedTouches[i]!;

                    if (touch.identifier === this.currentTouch.identifier) {
                        this.lastX = touch.clientX;
                        this.lastY = touch.clientY;
                    }
                }
            }
        }
    };

    checkCompletion(elapsedTotal: number, e: TouchEvent, touch: Touch) {
        if (this.startX !== -1 && this.getDocumentActives().length() === 0) {
            const diff = this.lastX - this.startX;
            const absDiff = Math.abs(diff);
            const velocity = ((absDiff / elapsedTotal) * 1000) | 0;
            const { direction } = this;

            if (
                absDiff > SWIPE_LENGTH &&
                velocity > SWIPE_VELOCITY &&
                ((diff < 0 && direction < 0) || (diff > 0 && direction > 0))
            ) {
                const g = new GestureObject(e, touch);
                this.handler.call(e.currentTarget as HTMLElement, g);
            }
        }
        this.clear();
    }

    clear() {
        this.currentTouch = undefined;
        this.lastY = this.startX = this.lastX = -1;
        this.startTime = -1;
    }
}
