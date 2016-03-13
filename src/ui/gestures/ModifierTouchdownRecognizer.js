"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "lib/util";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

export default function ModifierTouchdownRecognizer(recognizerMaker, handler) {
    AbstractGestureRecognizer.call(this, recognizerMaker);
    this.handler = handler;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerMaker.TOUCH_EVENTS_NO_MOVE;
}
inherits(ModifierTouchdownRecognizer, AbstractGestureRecognizer);

ModifierTouchdownRecognizer.prototype._recognizerHandler = function(e) {
    if (!this.hasModifierTouch()) return;

    var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
    if (e.type === TOUCH_START) {
        for (var i = 0; i < changedTouches.length; ++i) {
            var touch = changedTouches[i];
            if (touch.identifier !== this.getModifierTouch().identifier) {
                var g = new GestureObject(e, touch, true);
                this.handler.call(e.currentTarget, g);
                break;
            }
        }
    }
};
