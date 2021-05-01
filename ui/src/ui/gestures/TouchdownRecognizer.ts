import AbstractGestureRecognizer from "ui/ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/ui/gestures/ActiveTouchList";
import GestureObject from "ui/ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_EVENTS_NO_MOVE,
    TOUCH_START,
} from "ui/ui/gestures/GestureRecognizerContext";

export default class TouchdownRecognizer extends AbstractGestureRecognizer {
    handler: GestureHandler;
    actives: ActiveTouchList;
    constructor(recognizerContext: GestureRecognizerContext, handler: GestureHandler) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this._eventType = TOUCH_EVENTS_NO_MOVE;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
        const newTouches = this.actives.update(e, changedTouches);

        if (e.type === TOUCH_START && this.getDocumentActives().length() <= 1) {
            for (let i = 0; i < newTouches.length; ++i) {
                const touch = newTouches[i]!;
                const g = new GestureObject(e, touch, touch.identifier === this.actives.first()?.identifier);
                this.handler.call(e.currentTarget as HTMLElement, g);
            }
        }
    };
}
