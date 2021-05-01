import AbstractGestureRecognizer from "ui/ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/ui/gestures/ActiveTouchList";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/ui/gestures/GestureRecognizerContext";

export default class HoverRecognizer extends AbstractGestureRecognizer {
    startHandler: GestureHandler;
    endHandler: GestureHandler;
    currentTouch?: Touch;
    actives: ActiveTouchList;

    constructor(recognizerContext: GestureRecognizerContext, startHandler: GestureHandler, endHandler: GestureHandler) {
        super(recognizerContext);
        this.startHandler = startHandler;
        this.endHandler = endHandler;
        this.currentTouch = undefined;
        this.actives = new ActiveTouchList();
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const { changedTouches } = e;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 1) {
            this.end(e);
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() === 1 && this.currentTouch === undefined) {
                this.currentTouch = this.actives.first()!;
                const g = new GestureObject(e, this.currentTouch);
                this.startHandler.call(e.currentTarget as HTMLElement, g);
            } else {
                this.end(e);
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.actives.length() !== 0 || this.currentTouch === undefined) {
                this.end(e);
                return;
            }
            this.end(e, changedTouches[0]);
        } else if (e.type === TOUCH_MOVE) {
            if (this.currentTouch === undefined || this.actives.length() !== 1) {
                this.end(e, changedTouches[0]);
                return;
            }

            const touch = changedTouches[0]!;
            const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

            if (yDelta > 25 || xDelta > 25) {
                this.end(e, touch);
            }
        }
    };

    end(e: TouchEvent, touch?: Touch): void {
        if (this.currentTouch !== undefined) {
            const g = new GestureObject(e, touch || this.currentTouch);
            this.currentTouch = undefined;
            this.endHandler.call(e.currentTarget as HTMLElement, g);
        }
    }
}
