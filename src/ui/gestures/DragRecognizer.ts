import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

export default class DragRecognizer extends AbstractGestureRecognizer {
    moveHandler: GestureHandler;
    endHandler: GestureHandler;
    actives: ActiveTouchList;
    currentTouch?: Touch;
    constructor(recognizerContext: GestureRecognizerContext, moveHandler: GestureHandler, endHandler: GestureHandler) {
        super(recognizerContext);
        this.moveHandler = moveHandler;
        this.endHandler = endHandler;
        this.actives = new ActiveTouchList();
        this.currentTouch = undefined;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
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
                this.currentTouch = undefined;
            }
        } else if (e.type === TOUCH_MOVE) {
            if (
                !this.actives.contains(this.currentTouch) ||
                this.actives.length() > 1 ||
                this.getDocumentActives().length() > 1
            ) {
                return;
            }

            const touch = changedTouches[0]!;
            const yDelta = Math.abs(touch.clientY - this.currentTouch!.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch!.clientX);

            if (yDelta > 2 || xDelta > 2) {
                this.currentTouch = touch;
                const g = new GestureObject(e, this.currentTouch);
                this.moveHandler.call(e.currentTarget as HTMLElement, g);
            }
        }
    };

    end(e: TouchEvent, touch?: Touch) {
        if (this.currentTouch !== undefined) {
            const g = new GestureObject(e, touch || this.currentTouch);
            this.currentTouch = undefined;
            this.endHandler.call(e.currentTarget as HTMLElement, g);
        }
    }
}
