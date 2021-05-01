import AbstractGestureRecognizer from "ui/ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_EVENTS_NO_MOVE,
    TOUCH_START,
} from "ui/ui/gestures/GestureRecognizerContext";

export default class ModifierTouchdownRecognizer extends AbstractGestureRecognizer {
    handler: GestureHandler;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler) {
        super(recognizerContext);
        this.handler = handler;
        this._eventType = TOUCH_EVENTS_NO_MOVE;
    }

    _recognizerHandler = (e: TouchEvent) => {
        if (!this.hasModifierTouch()) {
            return;
        }

        const changedTouches = e.changedTouches;
        if (e.type === TOUCH_START) {
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i]!;
                if (touch.identifier !== this.getModifierTouch().identifier) {
                    const g = new GestureObject(e, touch, true);
                    this.handler.call(e.currentTarget as HTMLElement, g);
                    break;
                }
            }
        }
    };
}
