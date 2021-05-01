import AbstractGestureRecognizer from "ui/ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/ui/gestures/GestureRecognizerContext";

export default class ModifierDragRecognizer extends AbstractGestureRecognizer {
    moveHandler: GestureHandler;
    endHandler: GestureHandler;
    currentTouch?: Touch;

    constructor(recognizerContext: GestureRecognizerContext, moveHandler: GestureHandler, endHandler: GestureHandler) {
        super(recognizerContext);
        this.moveHandler = moveHandler;
        this.endHandler = endHandler;
        this.currentTouch = undefined;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        if (!this.hasModifierTouch() || this.getDocumentActives().length() > 2) {
            this.end(e);
            return;
        }
        const modifierTouch = this.getModifierTouch();

        const changedTouches = e.changedTouches;

        if (e.type === TOUCH_START) {
            for (let i = 0; i < changedTouches.length; ++i) {
                if (changedTouches[i]!.identifier !== modifierTouch.identifier) {
                    this.currentTouch = changedTouches[i];
                    return;
                }
            }
            this.end(e);
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            this.end(e);
        } else if (e.type === TOUCH_MOVE) {
            if (this.currentTouch === undefined || !this.hasSettledModifierTouch(e.timeStamp)) return;

            let touch;
            for (let i = 0; i < changedTouches.length; ++i) {
                if (changedTouches[i]!.identifier === this.currentTouch.identifier) {
                    touch = changedTouches[i];
                    break;
                }
            }

            if (touch === undefined || touch === null) return;

            const yDelta = Math.abs(touch.clientY - this.currentTouch.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch.clientX);

            if (yDelta > 0 || xDelta > 0) {
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
