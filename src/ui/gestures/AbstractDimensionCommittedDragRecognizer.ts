import * as io from "io-ts";
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

const VERTICAL = 1;
const HORIZONTAL = -1;
const UNCOMMITTED = 0;
export const DirectionType = io.union([io.literal(VERTICAL), io.literal(HORIZONTAL), io.literal(UNCOMMITTED)]);
export type DirectionType = io.TypeOf<typeof DirectionType>;

export default class AbstractDimensionCommittedDragRecognizer extends AbstractGestureRecognizer {
    actives: ActiveTouchList;
    startHandler: GestureHandler;
    moveHandler: GestureHandler;
    endHandler: GestureHandler;
    currentTouch?: Touch;
    committed: DirectionType;
    protected dimension: DirectionType = 0;
    static VERTICAL: DirectionType;
    static HORIZONTAL: DirectionType;

    protected constructor(
        recognizerContext: GestureRecognizerContext,
        fnStart: GestureHandler,
        fnMove: GestureHandler,
        fnEnd: GestureHandler
    ) {
        super(recognizerContext);
        this.actives = new ActiveTouchList();
        this.startHandler = fnStart;
        this.moveHandler = fnMove;
        this.endHandler = fnEnd;
        this.currentTouch = undefined;
        this.committed = UNCOMMITTED;
        this._eventType = TOUCH_EVENTS;
    }

    end(e: TouchEvent, touch: Touch) {
        if (this.currentTouch !== undefined) {
            const committedDimension = this.committed === this.dimension;
            this.committed = UNCOMMITTED;
            const theTouch = touch || this.currentTouch;
            this.currentTouch = undefined;
            if (committedDimension) {
                const g = new GestureObject(e, theTouch);
                this.endHandler.call(e.target as HTMLElement, g);
            }
        }
        this.committed = UNCOMMITTED;
    }

    clear() {
        this.currentTouch = undefined;
        this.committed = UNCOMMITTED;
    }

    _recognizerHandler = (e: TouchEvent) => {
        const { changedTouches } = e;
        this.actives.update(e, changedTouches);

        if (this.getDocumentActives().length() > 1) {
            this.clear();
            return;
        }

        if (e.type === TOUCH_START) {
            this.currentTouch = this.actives.first();
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            if (this.actives.length() > 0) {
                this.clear();
            } else {
                this.end(e, this.currentTouch!);
            }
        } else if (e.type === TOUCH_MOVE) {
            if (
                !this.actives.contains(this.currentTouch) ||
                this.actives.length() > 1 ||
                this.getDocumentActives().length() > 1
            ) {
                this.clear();
                return;
            }

            const touch = changedTouches[0]!;
            const yDelta = Math.abs(touch.clientY - this.currentTouch!.clientY);
            const xDelta = Math.abs(touch.clientX - this.currentTouch!.clientX);

            if (this.committed === UNCOMMITTED) {
                if (yDelta > 10 && yDelta > xDelta) {
                    this.committed = VERTICAL;
                } else if (xDelta > 10 && xDelta > yDelta) {
                    this.committed = HORIZONTAL;
                }

                if (this.committed === this.dimension) {
                    this.currentTouch = touch;
                    this.startHandler.call(e.currentTarget as HTMLElement, new GestureObject(e, touch));
                }
            } else if (this.committed === this.dimension) {
                this.currentTouch = touch;
                const g = new GestureObject(e, touch);
                this.moveHandler.call(e.currentTarget as HTMLElement, g);
            }
        }
    };
}

AbstractDimensionCommittedDragRecognizer.VERTICAL = VERTICAL;
AbstractDimensionCommittedDragRecognizer.HORIZONTAL = HORIZONTAL;
