import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/gestures/GestureObject";
import {TOUCH_EVENTS_NO_MOVE, TOUCH_START} from "ui/gestures/GestureRecognizerContext";

export default class ModifierTouchdownRecognizer extends AbstractGestureRecognizer {
    constructor(recognizerContext, handler) {
        super(recognizerContext);
        this.handler = handler;
        this._recognizerHandler = this._recognizerHandler.bind(this);
        this._eventType = TOUCH_EVENTS_NO_MOVE;
    }

    _recognizerHandler(e) {
        if (!this.hasModifierTouch()) {
            return;
        }

        const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        if (e.type === TOUCH_START) {
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i];
                if (touch.identifier !== this.getModifierTouch().identifier) {
                    const g = new GestureObject(e, touch, true);
                    this.handler.call(e.currentTarget, g);
                    break;
                }
            }
        }
    }
}
