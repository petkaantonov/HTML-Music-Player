import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import {inherits} from "util";
import {TOUCH_START, TOUCH_EVENTS_NO_MOVE} from "ui/gestures/GestureRecognizerContext";

export default function TouchdownRecognizer(recognizerContext, handler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = TOUCH_EVENTS_NO_MOVE;
}
inherits(TouchdownRecognizer, AbstractGestureRecognizer);

TouchdownRecognizer.prototype._recognizerHandler = function(e) {
    const changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    const newTouches = this.actives.update(e, changedTouches);

    if (e.type === TOUCH_START && this.getDocumentActives().length() <= 1) {
        for (let i = 0; i < newTouches.length; ++i) {
            const touch = newTouches[i];
            const g = new GestureObject(e, touch, touch.identifier === this.actives.first().identifier);
            this.handler.call(e.currentTarget, g);
        }
    }
};
