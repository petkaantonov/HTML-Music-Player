"use strict";

import { onCapture } from "lib/util";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import SingleTapTimeout from "ui/gestures/SingleTapTimeout";
import TapRecognizer from "ui/gestures/TapRecognizer";
import TouchdownRecognizer from "ui/gestures/TouchdownRecognizer";
import HoverRecognizer from "ui/gestures/HoverRecognizer";
import TargetHoverRecognizer from "ui/gestures/TargetHoverRecognizer";
import TwoFingerTapRecognizer from "ui/gestures/TwoFingerTapRecognizer";
import ModifierTapRecognizer from "ui/gestures/ModifierTapRecognizer";
import ModifierDragRecognizer from "ui/gestures/ModifierDragRecognizer";
import ModifierTouchdownRecognizer from "ui/gestures/ModifierTouchdownRecognizer";
import DragRecognizer from "ui/gestures/DragRecognizer";
import VerticalDragRecognizer from "ui/gestures/VerticalDragRecognizer";
import HorizontalDragRecognizer from "ui/gestures/HorizontalDragRecognizer";
import VerticalPinchRecognizer from "ui/gestures/VerticalPinchRecognizer";
import HorizontalSwipeRecognizer from "ui/gestures/HorizontalSwipeRecognizer";
import VerticalSwipeRecognizer from "ui/gestures/VerticalSwipeRecognizer";
import HorizontalTwoFingerSwipeRecognizer from "ui/gestures/HorizontalTwoFingerSwipeRecognizer";
import LongTapRecognizer from "ui/gestures/LongTapRecognizer";
import DoubleTapRecognizer from "ui/gestures/DoubleTapRecognizer";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";
const TAP_TIME = 270;
const LONG_TAP_TIME = 600;
const SWIPE_LENGTH = 100;
const SWIPE_VELOCITY = 200;
const TWO_FINGER_TAP_MINIMUM_DISTANCE = 100;
const TAP_MAX_MOVEMENT = 24;
const PINCER_MINIMUM_MOVEMENT = 24;
const DOUBLE_TAP_MINIMUM_MOVEMENT = 24;
const TOUCH_EVENTS = "touchstart touchmove touchend touchcancel";
const TOUCH_EVENTS_NO_MOVE = "touchstart touchend touchcancel";

const rinput = /^(?:input|select|textarea|option|button|label)$/i;
export default function GestureRecognizerMaker(opts) {
    opts = Object(opts);
    this.env = opts.env;
    this.modifierTouch = null;
    this.documentActives = new ActiveTouchList();
    this.singleTapTimeouts = [];

    if (this.env.hasTouch()) {
        onCapture(document, TOUCH_EVENTS_NO_MOVE, this.checkTouchPropagation.bind(this));
        onCapture(document, TOUCH_EVENTS, this.updateModifierTouch.bind(this));
        onCapture(document, [
            "gesturestart",
            "gesturechange",
            "gestureend",
            "MSGestureStart",
            "MSGestureEnd",
            "MSGestureTap",
            "MSGestureHold",
            "MSGestureChange",
            "MSInertiaStart"
        ].join(" "), function(e) {
            if (e.cancelable) {
                e.preventDefault();
            }
        });
    }
}

GestureRecognizerMaker.prototype.TOUCH_EVENTS = TOUCH_EVENTS;
GestureRecognizerMaker.prototype.TOUCH_EVENTS_NO_MOVE = TOUCH_EVENTS_NO_MOVE;
GestureRecognizerMaker.prototype.TAP_TIME = TAP_TIME;
GestureRecognizerMaker.prototype.LONG_TAP_TIME = LONG_TAP_TIME;
GestureRecognizerMaker.prototype.SWIPE_LENGTH = SWIPE_LENGTH;
GestureRecognizerMaker.prototype.SWIPE_VELOCITY = SWIPE_VELOCITY;
GestureRecognizerMaker.prototype.TWO_FINGER_TAP_MINIMUM_DISTANCE = TWO_FINGER_TAP_MINIMUM_DISTANCE;
GestureRecognizerMaker.prototype.TAP_MAX_MOVEMENT = TAP_MAX_MOVEMENT;
GestureRecognizerMaker.prototype.PINCER_MINIMUM_MOVEMENT = PINCER_MINIMUM_MOVEMENT;
GestureRecognizerMaker.prototype.DOUBLE_TAP_MINIMUM_MOVEMENT = DOUBLE_TAP_MINIMUM_MOVEMENT;

GestureRecognizerMaker.prototype.checkTouchPropagation = function(e) {
    if (e.cancelable) {
        var node = e.target;
        var activeElement = document.activeElement;
        var matchesActive = false;
        while (node != null) {
            if (!matchesActive) {
                matchesActive = node === activeElement;
            }

            if (rinput.test(node.nodeName)) {
                return;
            }
            node = node.parentNode;
        }

        if (activeElement && !matchesActive) {
            activeElement.blur();
        }

        e.preventDefault();
    }
};

GestureRecognizerMaker.prototype.updateModifierTouch = function(e) {
    var changedTouches = e.changedTouches;
    this.documentActives.update(e, changedTouches);

    if (this.documentActives.length() > 1 && this.singleTapTimeouts.length > 0) {
        for (var i = 0; i < this.singleTapTimeouts.length; ++i) {
            this.singleTapTimeouts[i].clear();
        }
    }

    if (e.type === TOUCH_START) {
        if (this.modifierTouch === null) {
            this.modifierTouch = this.documentActives.first();
            this.modifierTouch.started = e.timeStamp || e.originalEvent.timeStamp;
        }
    } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
        if (!this.documentActives.contains(this.modifierTouch)) {
            this.modifierTouch = null;
        }
    } else if (e.type === TOUCH_MOVE) {
        if (this.modifierTouch !== null) {
            for (var i = 0; i < changedTouches.length; ++i) {
                var touch = changedTouches[i];

                if (touch.identifier === this.modifierTouch.identifier) {
                    var deltaX = Math.abs(this.modifierTouch.clientX - touch.clientX);
                    var deltaY = Math.abs(this.modifierTouch.clientY - touch.clientY);
                    if (deltaX > 35 || deltaY > 35) {
                        this.modifierTouch = null;
                    }
                    return;
                }
            }
        }
    }
};

GestureRecognizerMaker.prototype.singleTapTimeoutRemoved = function(singleTapTimeout) {
    var i = this.singleTapTimeouts.indexOf(this);
    if (i >= 0) {
        this.singleTapTimeouts.splice(i, 1);
    }
};

GestureRecognizerMaker.prototype.createSingleTapTimeout = function(successHandler, clearHandler, timeout) {
    var ret = new SingleTapTimeout(this, successHandler, clearHandler, timeout);
    this.singleTapTimeouts.push(ret);
    return ret;
};

GestureRecognizerMaker.prototype.haveSettledModifierTouch = function(now) {
    return this.haveModifierTouch() && (now - this.modifierTouch.started > TAP_TIME * 0.5);
};

GestureRecognizerMaker.prototype.haveModifierTouch = function() {
    return this.modifierTouch !== null;
};

GestureRecognizerMaker.prototype.createTapRecognizer = function(fn) {
    return new TapRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createTouchdownRecognizer = function(fn) {
    return new TouchdownRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createHoverRecognizer = function(startFn, endFn) {
    return new HoverRecognizer(this, startFn, endFn);
};

GestureRecognizerMaker.prototype.createTargetHoverRecognizer = function(startFn, endFn) {
    return new TargetHoverRecognizer(this, startFn, endFn);
};

GestureRecognizerMaker.prototype.createTwoFingerTapRecognizer = function(fn) {
    return new TwoFingerTapRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createModifierTapRecognizer = function(fn) {
    return new ModifierTapRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createModifierDragRecognizer = function(fnMove, fnEnd) {
    return new ModifierDragRecognizer(this, fnMove, fnEnd);
};

GestureRecognizerMaker.prototype.createModifierTouchdownRecognizer = function(fn) {
    return new ModifierTouchdownRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createDragRecognizer = function(fnMove, fnEnd) {
    return new DragRecognizer(this, fnMove, fnEnd);
};

GestureRecognizerMaker.prototype.createVerticalDragRecognizer = function(fnStart, fnMove, fnEnd) {
    return new VerticalDragRecognizer(this, fnStart, fnMove, fnEnd);
};

GestureRecognizerMaker.prototype.createHorizontalDragRecognizer = function(fnStart, fnMove, fnEnd) {
    return new HorizontalDragRecognizer(this, fnStart, fnMove, fnEnd);
};

GestureRecognizerMaker.prototype.createVerticalPinchRecognizer = function(fn) {
    return new VerticalPinchRecognizer(this, fn);
};

GestureRecognizerMaker.prototype.createHorizontalSwipeRecognizer = function(fn, direction) {
    return new HorizontalSwipeRecognizer(this, fn, direction);
};

GestureRecognizerMaker.prototype.createVerticalSwipeRecognizer = function(fn, direction) {
    return new VerticalSwipeRecognizer(this, fn, direction);
};

GestureRecognizerMaker.prototype.createHorizontalTwoFingerSwipeRecognizer = function(fn, direction) {
    return new HorizontalTwoFingerSwipeRecognizer(this, fn, direction);
};

GestureRecognizerMaker.prototype.createLongTapRecognizer = function(fn, noTrigger) {
    return new LongTapRecognizer(this, fn, noTrigger);
};

GestureRecognizerMaker.prototype.createDoubleTapRecognizer = function(fn) {
    return new DoubleTapRecognizer(this, fn);
};
