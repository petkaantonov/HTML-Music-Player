import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import DragRecognizer from "ui/gestures/DragRecognizer";
import {TOUCH_EVENTS, SWIPE_LENGTH, SWIPE_VELOCITY} from "ui/gestures/GestureRecognizerContext";

export default class HorizontalSwipeRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, handler, direction) {
        super(recognizerContext);
        this.handler = handler;
        this.direction = direction;
        this.actives = new ActiveTouchList();
        this.startX = -1;
        this.lastX = -1;
        this.previousTime = -1;
        this.elapsedTotal = 0;
        this.dragRecognizer = new DragRecognizer(recognizerContext,
                                                 this._dragMoveHandler.bind(this),
                                                 this._dragEndHandler.bind(this));
        this._recognizerHandler = this.dragRecognizer._recognizerHandler;
        this._eventType = TOUCH_EVENTS;
    }

    _dragMoveHandler(e) {
        if (this.startX === -1) {
            this.startX = e.clientX;
        } else {
            const now = (e.timeStamp || e.originalEvent.timeStamp);
            this.elapsedTotal += (now - this.previousTime);
            if ((this.direction < 0 && e.clientX - this.lastX > 0) ||
                (this.direction > 0 && e.clientX - this.lastX < 0)) {
                this.clear();
            }
        }
        this.lastX = e.clientX;
        this.previousTime = e.timeStamp || e.originalEvent.timeStamp;
    }

    _dragEndHandler(e) {
        if (this.startX !== -1 && this.elapsedTotal > 10) {
            const diff = e.clientX - this.startX;
            const absDiff = Math.abs(diff);
            const minSwipeLength = SWIPE_LENGTH;
            const velocity = (absDiff / this.elapsedTotal * 1000) | 0;

            if (absDiff > minSwipeLength &&
                velocity > SWIPE_VELOCITY &&
                (diff < 0 && this.direction < 0 ||
                diff > 0 && this.direction > 0)) {
                this.handler.call(e.currentTarget, e);
            }
        }
        this.clear();
    }

    clear() {
        this.previousTime = -1;
        this.startX = -1;
        this.lastX = -1;
        this.elapsedTotal = 0;
    }
}
