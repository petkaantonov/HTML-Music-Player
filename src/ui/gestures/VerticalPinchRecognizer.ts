import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureRecognizerContext, {
    TAP_TIME,
    TOUCH_CANCEL,
    TOUCH_END,
    TOUCH_EVENTS,
    TOUCH_MOVE,
    TOUCH_START,
} from "ui/gestures/GestureRecognizerContext";

type Handler = (this: HTMLElement, startY: number, endY: number) => void;

export default class VerticalPinchRecognizer extends AbstractGestureRecognizer {
    handler: Handler;
    actives: ActiveTouchList;
    started: number;
    currentATouch?: Touch;
    currentBTouch?: Touch;
    aChanged: boolean;
    bChanged: boolean;
    constructor(recognizerContext: GestureRecognizerContext, handler: Handler) {
        super(recognizerContext);
        this.handler = handler;
        this.actives = new ActiveTouchList();
        this.started = -1;
        this.currentATouch = undefined;
        this.currentBTouch = undefined;
        this.aChanged = false;
        this.bChanged = false;
        this._eventType = TOUCH_EVENTS;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const changedTouches = e.changedTouches;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 2) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            if (this.actives.length() <= 2) {
                this.currentATouch = this.actives.first();
                if (this.actives.length() > 1) {
                    this.currentBTouch = this.actives.nth(1);
                }
            }

            this.started = this.currentATouch !== undefined && this.currentBTouch !== undefined ? e.timeStamp : -1;
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (!this.actives.contains(this.currentATouch) || !this.actives.contains(this.currentBTouch)) {
                this.clear();
            }
        } else if (e.type === TOUCH_MOVE) {
            if (
                this.actives.length() !== 2 ||
                !this.actives.contains(this.currentATouch) ||
                !this.actives.contains(this.currentBTouch) ||
                this.getDocumentActives().length() > 2
            ) {
                return;
            }

            if (this.currentATouch !== undefined && this.currentBTouch !== undefined) {
                if (!this.aChanged || !this.bChanged) {
                    for (let i = 0; i < changedTouches.length; ++i) {
                        const touch = changedTouches[i]!;
                        let delta;
                        if (touch.identifier === this.currentATouch.identifier) {
                            delta = Math.abs(touch.clientY - this.currentATouch.clientY);
                            if (delta > 25) {
                                this.aChanged = true;
                                this.currentATouch = touch;
                            }
                        } else if (touch.identifier === this.currentBTouch.identifier) {
                            delta = Math.abs(touch.clientY - this.currentATouch.clientY);
                            if (delta > 25) {
                                this.bChanged = true;
                                this.currentBTouch = touch;
                            }
                        }

                        if (this.aChanged && this.bChanged) {
                            break;
                        }
                    }
                }

                if (
                    (this.aChanged || this.bChanged) &&
                    this.started !== -1 &&
                    e.timeStamp - this.started > TAP_TIME * 2
                ) {
                    this.aChanged = this.bChanged = false;
                    let start, end;

                    if (this.currentATouch.clientY > this.currentBTouch.clientY) {
                        start = this.currentBTouch;
                        end = this.currentATouch;
                    } else {
                        start = this.currentATouch;
                        end = this.currentBTouch;
                    }
                    this.handler.call(e.currentTarget as HTMLElement, start.clientY, end.clientY);
                }
            }
        }
    };

    clear() {
        this.currentATouch = this.currentBTouch = undefined;
        this.aChanged = this.bChanged = false;
        this.started = -1;
    }
}
