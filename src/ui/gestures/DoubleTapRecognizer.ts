import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureRecognizerContext, {
    DOUBLE_TAP_MINIMUM_MOVEMENT,
    GestureHandler,
    TAP_TIME,
    TOUCH_EVENTS,
} from "ui/gestures/GestureRecognizerContext";
import TapRecognizer from "ui/gestures/TapRecognizer";

import GestureObject from "./GestureObject";

export default class DoubleTapRecognizer extends AbstractGestureRecognizer {
    handler: GestureHandler;
    actives: ActiveTouchList;
    lastTap: number;
    lastTouch?: Touch;
    tapRecognizer: TapRecognizer;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.lastTap = -1;
        this.lastTouch = undefined;
        this.tapRecognizer = new TapRecognizer(recognizerContext, this._tapHandler);
        this._recognizerHandler = this.tapRecognizer._recognizerHandler;
        this._eventType = TOUCH_EVENTS;
    }

    _tapHandler = (e: GestureObject) => {
        const changedTouches = e.changedTouches;
        const now = e.timeStamp;

        if (this.lastTap === -1) {
            this.lastTap = now;
            this.lastTouch = changedTouches[0];
        } else if (now - this.lastTap < TAP_TIME * 1.62) {
            const touch = this.lastTouch!;
            this.lastTouch = undefined;
            const yDelta = Math.abs(touch.clientY - changedTouches[0]!.clientY);
            const xDelta = Math.abs(touch.clientX - changedTouches[0]!.clientX);
            this.lastTap = -1;
            if (yDelta < DOUBLE_TAP_MINIMUM_MOVEMENT && xDelta < DOUBLE_TAP_MINIMUM_MOVEMENT) {
                this.handler.call(e.currentTarget, e);
            }
        } else {
            this.lastTouch = changedTouches[0];
            this.lastTap = now;
        }
    };
}
