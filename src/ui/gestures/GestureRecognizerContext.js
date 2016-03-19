"use strict";

import SingleTapTimeout from "ui/gestures/SingleTapTimeout";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
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
import HorizontalTwoFingerSwipeRecognizer from "ui/gestures/HorizontalTwoFingerSwipeRecognizer";
import LongTapRecognizer from "ui/gestures/LongTapRecognizer";
import DoubleTapRecognizer from "ui/gestures/DoubleTapRecognizer";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_CANCEL = "touchcancel";
const TOUCH_MOVE = "touchmove";
const TAP_TIME = 270;
const LONG_TAP_TIME = 600;
const SWIPE_LENGTH = 100;
const SWIPE_VELOCITY = 200;
const TWO_FINGER_TAP_MINIMUM_DISTANCE = 100;
const TAP_MAX_MOVEMENT = 24;
const PINCER_MINIMUM_MOVEMENT = 24;
const DOUBLE_TAP_MINIMUM_MOVEMENT = 24;

export default function GestureRecognizerContext(page, env, globalEvents) {
    this.env = env;
    this.page = page;
    this.globalEvents = globalEvents;
    this.modifierTouch = null;
    this.documentActives = new ActiveTouchList();
    this.singleTapTimeouts = [];
    this.checkTouchPropagation = this.checkTouchPropagation.bind(this);
    this.updateModifierTouch = this.updateModifierTouch.bind(this);

    if (this.isTouchSupported()) {
        this.page.addDocumentListener(TOUCH_START, this.updateModifierTouch);
        this.page.addDocumentListener(TOUCH_END, this.updateModifierTouch);
        this.page.addDocumentListener(TOUCH_MOVE, this.updateModifierTouch);
        this.page.addDocumentListener(TOUCH_CANCEL, this.updateModifierTouch);
        this.page.addDocumentListener(TOUCH_START, this.checkTouchPropagation);
        this.page.addDocumentListener(TOUCH_END, this.checkTouchPropagation);
        this.page.addDocumentListener(TOUCH_CANCEL, this.checkTouchPropagation);
        this.page.addDocumentListener("gesturestart", this.page.preventDefaultHandler);
        this.page.addDocumentListener("gesturechange", this.page.preventDefaultHandler);
        this.page.addDocumentListener("gestureend", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSGestureStart", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSGestureEnd", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSGestureTap", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSGestureHold", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSGestureChange", this.page.preventDefaultHandler);
        this.page.addDocumentListener("MSInertiaStart", this.page.preventDefaultHandler);
    }
}

GestureRecognizerContext.prototype.TOUCH_EVENTS = [TOUCH_START, TOUCH_MOVE, TOUCH_CANCEL, TOUCH_END];
GestureRecognizerContext.prototype.TOUCH_EVENTS_NO_MOVE = [TOUCH_START, TOUCH_CANCEL, TOUCH_END];

GestureRecognizerContext.prototype.TAP_TIME = TAP_TIME;
GestureRecognizerContext.prototype.LONG_TAP_TIME = LONG_TAP_TIME;
GestureRecognizerContext.prototype.SWIPE_LENGTH = SWIPE_LENGTH;
GestureRecognizerContext.prototype.SWIPE_VELOCITY = SWIPE_VELOCITY;
GestureRecognizerContext.prototype.TWO_FINGER_TAP_MINIMUM_DISTANCE = TWO_FINGER_TAP_MINIMUM_DISTANCE;
GestureRecognizerContext.prototype.TAP_MAX_MOVEMENT = TAP_MAX_MOVEMENT;
GestureRecognizerContext.prototype.PINCER_MINIMUM_MOVEMENT = PINCER_MINIMUM_MOVEMENT;
GestureRecognizerContext.prototype.DOUBLE_TAP_MINIMUM_MOVEMENT = DOUBLE_TAP_MINIMUM_MOVEMENT;

GestureRecognizerContext.prototype.isTouchSupported = function() {
    return this.env.hasTouch();
};

GestureRecognizerContext.prototype.checkTouchPropagation = function(e) {
    if (e.cancelable) {
        var node = e.target;
        var activeElement = this.page.activeElement();
        var matchesActive = false;
        while (node != null) {
            if (!matchesActive) {
                matchesActive = node === activeElement;
            }

            if (this.page.isAnyInputElement(node)) {
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

GestureRecognizerContext.prototype.updateModifierTouch = function(e) {
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
            this.modifierTouch.started = e.timeStamp;
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

GestureRecognizerContext.prototype.singleTapTimeoutRemoved = function(singleTapTimeout) {
    var i = this.singleTapTimeouts.indexOf(singleTapTimeout);
    if (i >= 0) {
        this.singleTapTimeouts.splice(i, 1);
    }
};

GestureRecognizerContext.prototype.createSingleTapTimeout = function(successHandler, clearHandler, timeout) {
    var ret = new SingleTapTimeout(this, successHandler, clearHandler, timeout);
    this.singleTapTimeouts.push(ret);
    return ret;
};

GestureRecognizerContext.prototype.haveSettledModifierTouch = function(now) {
    return this.haveModifierTouch() && (now - this.modifierTouch.started > TAP_TIME * 0.5);
};

GestureRecognizerContext.prototype.haveModifierTouch = function() {
    return this.modifierTouch !== null;
};

GestureRecognizerContext.prototype.createTapRecognizer = function(fn) {
    return new TapRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createTouchdownRecognizer = function(fn) {
    return new TouchdownRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createHoverRecognizer = function(startFn, endFn) {
    return new HoverRecognizer(this, startFn, endFn);
};

GestureRecognizerContext.prototype.createTargetHoverRecognizer = function(startFn, endFn) {
    return new TargetHoverRecognizer(this, startFn, endFn);
};

GestureRecognizerContext.prototype.createTwoFingerTapRecognizer = function(fn) {
    return new TwoFingerTapRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createModifierTapRecognizer = function(fn) {
    return new ModifierTapRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createModifierDragRecognizer = function(fnMove, fnEnd) {
    return new ModifierDragRecognizer(this, fnMove, fnEnd);
};

GestureRecognizerContext.prototype.createModifierTouchdownRecognizer = function(fn) {
    return new ModifierTouchdownRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createDragRecognizer = function(fnMove, fnEnd) {
    return new DragRecognizer(this, fnMove, fnEnd);
};

GestureRecognizerContext.prototype.createVerticalDragRecognizer = function(fnStart, fnMove, fnEnd) {
    return new VerticalDragRecognizer(this, fnStart, fnMove, fnEnd);
};

GestureRecognizerContext.prototype.createHorizontalDragRecognizer = function(fnStart, fnMove, fnEnd) {
    return new HorizontalDragRecognizer(this, fnStart, fnMove, fnEnd);
};

GestureRecognizerContext.prototype.createVerticalPinchRecognizer = function(fn) {
    return new VerticalPinchRecognizer(this, fn);
};

GestureRecognizerContext.prototype.createHorizontalSwipeRecognizer = function(fn, direction) {
    return new HorizontalSwipeRecognizer(this, fn, direction);
};

GestureRecognizerContext.prototype.createHorizontalTwoFingerSwipeRecognizer = function(fn, direction) {
    return new HorizontalTwoFingerSwipeRecognizer(this, fn, direction);
};

GestureRecognizerContext.prototype.createLongTapRecognizer = function(fn, noTrigger) {
    return new LongTapRecognizer(this, fn, noTrigger);
};

GestureRecognizerContext.prototype.createDoubleTapRecognizer = function(fn) {
    return new DoubleTapRecognizer(this, fn);
};
