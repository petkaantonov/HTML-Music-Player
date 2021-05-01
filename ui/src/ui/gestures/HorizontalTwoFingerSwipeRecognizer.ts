import AbstractGestureRecognizer from "ui/ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/ui/gestures/ActiveTouchList";
import GestureRecognizerContext, {
    SWIPE_LENGTH,
    SWIPE_VELOCITY,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/ui/gestures/GestureRecognizerContext";

import { DirectionType } from "./AbstractDimensionCommittedDragRecognizer";

export default class HorizontalTwoFingerSwipeRecognizer extends AbstractGestureRecognizer {
    handler: (this: null) => void;
    actives: ActiveTouchList;
    direction: number;
    currentATouch?: Touch;
    currentBTouch?: Touch;
    startAX: number;
    startBX: number;
    lastAY: number;
    lastAX: number;
    lastBX: number;
    lastBY: number;
    startTime: number;
    constructor(recognizerContext: GestureRecognizerContext, handler: (this: null) => void, direction: DirectionType) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.direction = direction;
        this.currentATouch = undefined;
        this.currentBTouch = undefined;
        this.startAX = -1;
        this.startBX = -1;
        this.lastAY = -1;
        this.lastAX = -1;
        this.lastBX = -1;
        this.lastBY = -1;
        this.startTime = -1;
        this._recognizerHandler = this._recognizerHandler.bind(this);
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const { changedTouches } = e;
        const now = e.timeStamp;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 2) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() === 1) {
                this.currentATouch = this.actives.first()!;
                this.startAX = this.currentATouch.clientX;
                this.lastAX = this.startAX;
                this.lastAY = this.currentATouch.clientY;
                this.startTime = now;
            } else if (this.actives.length() === 2 && this.currentATouch !== null) {
                this.startTime = now;
                this.currentBTouch = this.actives.nth(1)!;
                this.startBX = this.currentBTouch.clientX;
                this.lastBX = this.startBX;
                this.lastBY = this.currentBTouch.clientY;
                if (
                    this.lastAX !== -1 &&
                    Math.abs(this.lastAX - this.lastBX) > 150 &&
                    Math.abs(this.lastAY - this.lastBY) > 150
                ) {
                    this.clear();
                }
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.currentATouch === undefined || this.currentBTouch === undefined) return;
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i]!;
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
            if (this.currentATouch !== undefined || this.currentBTouch !== undefined) {
                for (let i = 0; i < changedTouches.length; ++i) {
                    const touch = changedTouches[i]!;

                    if (this.currentATouch !== undefined && touch.identifier === this.currentATouch.identifier) {
                        this.lastAX = touch.clientX;
                        this.lastAY = touch.clientY;
                    } else if (this.currentBTouch !== undefined && touch.identifier === this.currentBTouch.identifier) {
                        this.lastBX = touch.clientX;
                        this.lastBY = touch.clientY;
                    }
                }

                if (
                    this.lastAX !== -1 &&
                    this.lastBX !== -1 &&
                    Math.abs(this.lastAX - this.lastBX) > 150 &&
                    Math.abs(this.lastAY - this.lastBY) > 150
                ) {
                    this.clear();
                }
            }
        }
    };

    checkCompletion(elapsedTotal: number) {
        if (this.startAX !== -1 && this.startBX !== -1 && this.getDocumentActives().length() === 0) {
            const aDiff = this.lastAX - this.startAX;
            const bDiff = this.lastBX - this.startBX;
            const aAbsDiff = Math.abs(aDiff);
            const bAbsDiff = Math.abs(bDiff);
            const aVelocity = ((aAbsDiff / elapsedTotal) * 1000) | 0;
            const bVelocity = ((bAbsDiff / elapsedTotal) * 1000) | 0;
            const { direction } = this;
            const minSwipeLength = SWIPE_LENGTH;
            const minSwipeVelocity = SWIPE_VELOCITY;

            if (
                aAbsDiff > minSwipeLength &&
                bAbsDiff > minSwipeLength &&
                aVelocity > minSwipeVelocity &&
                bVelocity > minSwipeVelocity &&
                ((aDiff < 0 && bDiff < 0 && direction < 0) || (aDiff > 0 && bDiff > 0 && direction > 0)) &&
                Math.abs(aAbsDiff - bAbsDiff) <= 150
            ) {
                this.handler.call(null);
            }
        }
        this.clear();
    }

    clear() {
        this.currentATouch = this.currentBTouch = undefined;
        this.lastAY = this.lastBY = this.startAX = this.startBX = this.lastAX = this.lastBX = -1;
        this.startTime = -1;
    }
}
