import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import {TOUCH_EVENTS, TOUCH_START, TOUCH_END, TOUCH_MOVE, TOUCH_CANCEL} from "ui/gestures/GestureRecognizerContext";

export default class DragRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, moveHandler, endHandler) {
        super(recognizerContext);
        this.moveHandler = moveHandler;
        this.endHandler = endHandler;
        this.actives = new ActiveTouchList();
        this.currentTouch = null;
        this._recognizerHandler = this._recognizerHandler.bind(this);
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler(e) {
        const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 1) {
            this.end(e);
            return;
        }

        if (e.type === TOUCH_START) {
            this.currentTouch = this.actives.first();
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.actives.length() > 0) {
                this.currentTouch = this.actives.first();
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

            const touch = changedTouches[0];
            const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

            if (yDelta > 2 || xDelta > 2) {
                this.currentTouch = touch;
                const g = new GestureObject(e, this.currentTouch);
                this.moveHandler.call(e.currentTarget, g);
            }
        }
    }

    end(e, touch) {
        if (this.currentTouch !== null) {
            const g = new GestureObject(e, touch || this.currentTouch);
            this.currentTouch = null;
            this.endHandler.call(e.currentTarget, g);
        }
    }
}
