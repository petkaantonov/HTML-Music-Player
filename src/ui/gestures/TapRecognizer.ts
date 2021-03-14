import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject, { GestureOrEvent } from "ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TAP_TIME,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

export default class TapRecognizer extends AbstractGestureRecognizer {
    handler: GestureHandler;
    currentTouch?: Touch;
    started: number;
    actives: ActiveTouchList;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler) {
        super(recognizerContext);
        this.handler = handler;
        this.currentTouch = undefined;
        this.started = -1;
        this.actives = new ActiveTouchList();
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: GestureOrEvent) => {
        const changedTouches = e.changedTouches;
        this.actives.update(e, changedTouches);
        if (e.type === TOUCH_START) {
            if (this.actives.length() <= 1) {
                this.started = e.timeStamp;
                this.currentTouch = this.actives.first();
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (
                this.actives.length() !== 0 ||
                this.currentTouch === undefined ||
                this.getDocumentActives().length() !== 0
            ) {
                this.clear();
                return;
            }

            const touch = changedTouches[0]!;
            const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);
            const elapsed = e.timeStamp - this.started;
            if (elapsed > 20 && elapsed < TAP_TIME && xDelta <= 25 && yDelta <= 25) {
                const g = new GestureObject(e, touch);
                this.handler.call(e.currentTarget as HTMLElement, g);
            }
            this.clear();
        } else if (e.type === TOUCH_MOVE) {
            if (this.getDocumentActives().length() > 1) {
                this.clear();
            }
        }
    };

    clear() {
        this.currentTouch = undefined;
        this.started = -1;
    }
}
