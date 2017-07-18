import {preventDefaultHandler, isAnyInputElement} from "platform/dom/Page";
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

export const TOUCH_START = `touchstart`;
export const TOUCH_END = `touchend`;
export const TOUCH_CANCEL = `touchcancel`;
export const TOUCH_MOVE = `touchmove`;
export const TAP_TIME = 270;
export const LONG_TAP_TIME = 600;
export const SWIPE_LENGTH = 100;
export const SWIPE_VELOCITY = 200;
export const TWO_FINGER_TAP_MINIMUM_DISTANCE = 100;
export const TAP_MAX_MOVEMENT = 24;
export const PINCER_MINIMUM_MOVEMENT = 24;
export const DOUBLE_TAP_MINIMUM_MOVEMENT = 24;
export const TOUCH_EVENTS = [TOUCH_START, TOUCH_MOVE, TOUCH_CANCEL, TOUCH_END];
export const TOUCH_EVENTS_NO_MOVE = [TOUCH_START, TOUCH_CANCEL, TOUCH_END];
export const PASSIVE_TOUCH_EVENTS = {[TOUCH_START]: TOUCH_START, [TOUCH_MOVE]: TOUCH_MOVE};

export default class GestureRecognizerContext {
    constructor(deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.modifierTouch = null;
        this.documentActives = new ActiveTouchList();
        this.singleTapTimeouts = [];
        this.checkTouchPropagation = this.checkTouchPropagation.bind(this);
        this.updateModifierTouch = this.updateModifierTouch.bind(this);

        if (this.isTouchSupported()) {
            this.page.addDocumentListener(TOUCH_START, this.updateModifierTouch, {capture: true, passive: true});
            this.page.addDocumentListener(TOUCH_END, this.updateModifierTouch, {capture: true, passive: true});
            this.page.addDocumentListener(TOUCH_MOVE, this.updateModifierTouch, {capture: true, passive: true});
            this.page.addDocumentListener(TOUCH_CANCEL, this.updateModifierTouch, {capture: true, passive: true});
            this.page.addDocumentListener(TOUCH_START, this.checkTouchPropagation, {capture: true, passive: true});
            this.page.addDocumentListener(TOUCH_END, this.checkTouchPropagation, {capture: true, passive: false});
            this.page.addDocumentListener(TOUCH_CANCEL, this.checkTouchPropagation, {capture: true, passive: true});
            this.page.addDocumentListener(`gesturestart`, preventDefaultHandler);
            this.page.addDocumentListener(`gesturechange`, preventDefaultHandler);
            this.page.addDocumentListener(`gestureend`, preventDefaultHandler);
            this.page.addDocumentListener(`MSGestureStart`, preventDefaultHandler);
            this.page.addDocumentListener(`MSGestureEnd`, preventDefaultHandler);
            this.page.addDocumentListener(`MSGestureTap`, preventDefaultHandler);
            this.page.addDocumentListener(`MSGestureHold`, preventDefaultHandler);
            this.page.addDocumentListener(`MSGestureChange`, preventDefaultHandler);
            this.page.addDocumentListener(`MSInertiaStart`, preventDefaultHandler);
        }
    }


    isTouchSupported() {
        return this.env.hasTouch();
    }

    checkTouchPropagation(e) {
        let node = e.target;
        const activeElement = this.page.activeElement();
        let matchesActive = false;
        while (node !== null && typeof node !== `undefined`) {
            if (!matchesActive) {
                matchesActive = node === activeElement;
            }

            if (isAnyInputElement(node)) {
                return;
            }
            node = node.parentNode;
        }

        if (activeElement && !matchesActive) {
            activeElement.blur();
        }

        if (e.type === TOUCH_END && e.cancelable) {
            e.preventDefault();
        }
    }

    updateModifierTouch(e) {
        const {changedTouches} = e;
        this.documentActives.update(e, changedTouches);

        if (this.documentActives.length() > 1 && this.singleTapTimeouts.length > 0) {
            for (let i = 0; i < this.singleTapTimeouts.length; ++i) {
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
                for (let i = 0; i < changedTouches.length; ++i) {
                    const touch = changedTouches[i];

                    if (touch.identifier === this.modifierTouch.identifier) {
                        const deltaX = Math.abs(this.modifierTouch.clientX - touch.clientX);
                        const deltaY = Math.abs(this.modifierTouch.clientY - touch.clientY);
                        if (deltaX > 35 || deltaY > 35) {
                            this.modifierTouch = null;
                        }
                        return;
                    }
                }
            }
        }
    }

    singleTapTimeoutRemoved(singleTapTimeout) {
        const i = this.singleTapTimeouts.indexOf(singleTapTimeout);
        if (i >= 0) {
            this.singleTapTimeouts.splice(i, 1);
        }
    }

    createSingleTapTimeout(successHandler, clearHandler, timeout) {
        const ret = new SingleTapTimeout(this, successHandler, clearHandler, timeout);
        this.singleTapTimeouts.push(ret);
        return ret;
    }

    haveSettledModifierTouch(now) {
        return this.haveModifierTouch() && (now - this.modifierTouch.started > TAP_TIME * 0.5);
    }

    haveModifierTouch() {
        return this.modifierTouch !== null;
    }

    createTapRecognizer(fn) {
        return new TapRecognizer(this, fn);
    }

    createTouchdownRecognizer(fn) {
        return new TouchdownRecognizer(this, fn);
    }

    createHoverRecognizer(startFn, endFn) {
        return new HoverRecognizer(this, startFn, endFn);
    }

    createTargetHoverRecognizer(startFn, endFn) {
        return new TargetHoverRecognizer(this, startFn, endFn);
    }

    createTwoFingerTapRecognizer(fn) {
        return new TwoFingerTapRecognizer(this, fn);
    }

    createModifierTapRecognizer(fn) {
        return new ModifierTapRecognizer(this, fn);
    }

    createModifierDragRecognizer(fnMove, fnEnd) {
        return new ModifierDragRecognizer(this, fnMove, fnEnd);
    }

    createModifierTouchdownRecognizer(fn) {
        return new ModifierTouchdownRecognizer(this, fn);
    }

    createDragRecognizer(fnMove, fnEnd) {
        return new DragRecognizer(this, fnMove, fnEnd);
    }

    createVerticalDragRecognizer(fnStart, fnMove, fnEnd) {
        return new VerticalDragRecognizer(this, fnStart, fnMove, fnEnd);
    }

    createHorizontalDragRecognizer(fnStart, fnMove, fnEnd) {
        return new HorizontalDragRecognizer(this, fnStart, fnMove, fnEnd);
    }

    createVerticalPinchRecognizer(fn) {
        return new VerticalPinchRecognizer(this, fn);
    }

    createHorizontalSwipeRecognizer(fn, direction) {
        return new HorizontalSwipeRecognizer(this, fn, direction);
    }

    createHorizontalTwoFingerSwipeRecognizer(fn, direction) {
        return new HorizontalTwoFingerSwipeRecognizer(this, fn, direction);
    }

    createLongTapRecognizer(fn, noTrigger) {
        return new LongTapRecognizer(this, fn, noTrigger);
    }

    createDoubleTapRecognizer(fn) {
        return new DoubleTapRecognizer(this, fn);
    }
}
