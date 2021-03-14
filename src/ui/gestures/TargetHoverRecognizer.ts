import { Rect } from "types/helpers";
import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject, { GestureOrEvent } from "ui/gestures/GestureObject";
import GestureRecognizerContext, {
    GestureHandler,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

type StartHandler = (this: HTMLElement, g: GestureOrEvent) => Rect;

export default class TargetHoverRecognizer extends AbstractGestureRecognizer {
    startHandler: StartHandler;
    endHandler: GestureHandler;
    actives: ActiveTouchList;
    currentTouch?: Touch;
    bounds?: Rect;
    constructor(recognizerContext: GestureRecognizerContext, startHandler: StartHandler, endHandler: GestureHandler) {
        super(recognizerContext);
        this.startHandler = startHandler;
        this.endHandler = endHandler;
        this.actives = new ActiveTouchList();
        this.currentTouch = undefined;
        this.bounds = undefined;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
        const targetTouches = e.targetTouches;

        if (e.type === TOUCH_START) {
            if (this.currentTouch === undefined && targetTouches.length > 0) {
                this.currentTouch = targetTouches[0];
                this.bounds = this.startHandler.call(e.currentTarget as HTMLElement, e);
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL || e.type === TOUCH_MOVE) {
            if (this.currentTouch !== undefined && this.bounds !== undefined) {
                if (targetTouches.length === 0) {
                    this.end(e);
                    return;
                }
                for (let i = 0; i < changedTouches.length; ++i) {
                    if (changedTouches[i]!.identifier === this.currentTouch.identifier) {
                        const touch = changedTouches[i]!;
                        const x = touch.clientX;
                        const y = touch.clientY;

                        if (
                            !(
                                x >= this.bounds.left &&
                                x <= this.bounds.right &&
                                y >= this.bounds.top &&
                                y <= this.bounds.bottom
                            )
                        ) {
                            this.end(e);
                        }
                        return;
                    }
                }
            }
        }
    };

    end(e: TouchEvent, touch?: Touch) {
        if (this.currentTouch !== undefined) {
            const g = new GestureObject(e, touch || this.currentTouch);
            this.bounds = this.currentTouch = undefined;
            this.endHandler.call(e.currentTarget as HTMLElement, g);
        }
    }
}
