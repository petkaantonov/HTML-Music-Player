import {preventDefaultHandler, isAnyInputElement} from "platform/dom/Page";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import TapRecognizer from "ui/gestures/TapRecognizer";
import TouchdownRecognizer from "ui/gestures/TouchdownRecognizer";
import DragRecognizer from "ui/gestures/DragRecognizer";
import HorizontalSwipeRecognizer from "ui/gestures/HorizontalSwipeRecognizer";

export const TOUCH_START = `touchstart`;
export const TOUCH_END = `touchend`;
export const TOUCH_CANCEL = `touchcancel`;
export const TOUCH_MOVE = `touchmove`;
export const TAP_TIME = 270;
export const LONG_TAP_TIME = 600;
export const SWIPE_LENGTH = 100;
export const SWIPE_VELOCITY = 1200;
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
        if (this.isTouchSupported()) {
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

    createTapRecognizer(fn) {
        return new TapRecognizer(this, fn);
    }

    createTouchdownRecognizer(fn) {
        return new TouchdownRecognizer(this, fn);
    }

    createDragRecognizer(fnMove, fnEnd) {
        return new DragRecognizer(this, fnMove, fnEnd);
    }

    createHorizontalSwipeRecognizer(fn, direction) {
        return new HorizontalSwipeRecognizer(this, fn, direction);
    }
}
