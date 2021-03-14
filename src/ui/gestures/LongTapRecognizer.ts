import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    LONG_TAP_TIME,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

export default class LongTapRecognizer extends AbstractGestureRecognizer {
    noTrigger: boolean;
    handler: GestureHandler;
    actives: ActiveTouchList;
    currentTouch?: Touch;
    event?: TouchEvent;
    timeoutId: number;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler, noTrigger: boolean) {
        super(recognizerContext);
        this.noTrigger = noTrigger;
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.currentTouch = undefined;
        this.event = undefined;
        this.timeoutId = -1;
        this._eventType = TOUCH_EVENTS;
    }

    _longTapTimedOut = () => {
        const ev = this.event!;
        const touch = this.currentTouch!;
        this.clear();
        if (this.getDocumentActives().length() <= 1) {
            const g = new GestureObject(ev, touch);
            this.handler.call(ev.currentTarget as HTMLElement, g);
        }
    };

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
        this.actives.update(e, changedTouches);

        if (e.type === TOUCH_START) {
            if (this.getDocumentActives().length() === 1 && this.currentTouch === undefined) {
                this.currentTouch = this.actives.first();
                this.event = e;
                const timeout = this.recognizerContext.createSingleTapTimeout(
                    this._longTapTimedOut,
                    this.clear,
                    LONG_TAP_TIME
                );
                this.timeoutId = timeout.id;
                if (!this.noTrigger) {
                    this.fireLongPressStart(this.currentTouch!);
                }
            } else {
                this.clear();
            }
        } else if (e.type === TOUCH_MOVE) {
            const touch = changedTouches[0]!;
            if (
                this.actives.length() !== 1 ||
                !this.actives.contains(this.currentTouch) ||
                !this.actives.contains(touch)
            ) {
                this.clear();
                return;
            }
            const yDelta = Math.abs(touch.clientY - this.currentTouch!.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch!.clientX);
            this.currentTouch = touch;

            if (xDelta > 2 || yDelta > 2) {
                this.clear();
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            this.clear();
        }
    };

    clear = () => {
        this.recognizerContext.page.clearTimeout(this.timeoutId);
        this.timeoutId = -1;

        if (this.currentTouch !== undefined) {
            if (!this.noTrigger) {
                this.fireLongPressEnd(this.currentTouch);
            }
            this.currentTouch = undefined;
        }
        this.event = undefined;
    };
}
