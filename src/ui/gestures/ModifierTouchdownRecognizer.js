"use strict";

import AbstractGestureRecognizer from "ui/gestures/AbstractGestureRecognizer";
import GestureObject from "ui/gestures/GestureObject";
import { inherits } from "util";

const TOUCH_START = "touchstart";

export default function ModifierTouchdownRecognizer(recognizerContext, handler) {
    AbstractGestureRecognizer.call(this, recognizerContext);
    this.handler = handler;
    this._recognizerHandler = this._recognizerHandler.bind(this);
    this._eventType = recognizerContext.TOUCH_EVENTS_NO_MOVE;
}
inherits(ModifierTouchdownRecognizer, AbstractGestureRecognizer);

ModifierTouchdownRecognizer.prototype._recognizerHandler = function(e) {
    if (!this.hasModifierTouch()) {
        return;
    }

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
