

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import {TOUCH_EVENTS, LONG_TAP_TIME, TOUCH_START, TOUCH_END, TOUCH_MOVE, TOUCH_CANCEL} from "ui/gestures/GestureRecognizerContext";

export default class LongTapRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, handler, noTrigger) {
        super(recognizerContext);
        this.noTrigger = noTrigger;
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.currentTouch = null;
        this.event = null;
        this.timeoutId = -1;
        this._eventType = TOUCH_EVENTS;

        this._longTapTimedOut = this._longTapTimedOut.bind(this);
        this.clear = this.clear.bind(this);
        this._recognizerHandler = this._recognizerHandler.bind(this);
    }

    _longTapTimedOut() {
        const ev = this.event;
        const touch = this.currentTouch;
        this.clear();
        if (this.getDocumentActives().length() <= 1) {
            const g = new GestureObject(ev, touch);
            this.handler.call(ev.currentTarget, g);
        }
    }

    _recognizerHandler(e) {
        const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        this.actives.update(e, changedTouches);

        if (e.type === TOUCH_START) {
            if (this.getDocumentActives().length() === 1 && this.currentTouch === null) {
                this.currentTouch = this.actives.first();
                this.event = e;
                const timeout = this.recognizerContext.createSingleTapTimeout(this._longTapTimedOut,
                                                                          this.clear,
                                                                          LONG_TAP_TIME);
                this.timeoutId = timeout.id;
                if (!this.noTrigger) {
                    this.fireLongPressStart(this.currentTouch);
                }
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_MOVE) {
            const touch = changedTouches[0];
            if (this.actives.length() !== 1 || !this.actives.contains(this.currentTouch) || !this.actives.contains(touch)) {
                this.clear();
                return;
            }
            const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);
            this.currentTouch = touch;

            if (xDelta > 2 || yDelta > 2) {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            this.clear();
        } else if (e.type === TOUCH_MOVE) {
            if (this.getDocumentActives().length() > 1) {
                this.clear();
            }
        }
    }

    clear() {
        this.recognizerContext.page.clearTimeout(this.timeoutId);
        this.timeoutId = -1;

        if (this.currentTouch !== null) {
            if (!this.noTrigger) {
                this.fireLongPressEnd(this.currentTouch);
            }
            this.currentTouch = null;
        }
        this.event = null;
    }
}
