"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function TouchdownRecognizer(recognizerMaker, handler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this.actives = new ActiveTouchList();
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerMaker.TOUCH_EVENTS_NO_MOVE;
}
inherits(TouchdownRecognizer, AbstractGestureRecognizer);

TouchdownRecognizer.prototype._recognizerHandler = function(e) {
    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    var newTouches = this.actives.update(e, changedTouches);

    if (e.type === TOUCH_START && this.getDocumentActives().length() <= 1) {
        for (var i = 0; i < newTouches.length; ++i) {
            var touch = newTouches[i];
            var g = new GestureObject(e, touch, touch.identifier === actives.first().identifier);
            this.handler.call(e.currentTarget, g);
        }
    }
};
