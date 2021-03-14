import { SelectDeps } from "Application";
import * as io from "io-ts";
import Page, { DelegatedEvent, isAnyInputElement } from "platform/dom/Page";
import Env from "platform/Env";
import GlobalEvents from "platform/GlobalEvents";
import ActiveTouchList from "ui/gestures/ActiveTouchList";
import DragRecognizer from "ui/gestures/DragRecognizer";
import HorizontalSwipeRecognizer from "ui/gestures/HorizontalSwipeRecognizer";
import TapRecognizer from "ui/gestures/TapRecognizer";
import TouchdownRecognizer from "ui/gestures/TouchdownRecognizer";

import GestureObject from "./GestureObject";

export const TOUCH_START = `touchstart`;
export const TOUCH_END = `touchend`;
export const TOUCH_CANCEL = `touchcancel`;
export const TOUCH_MOVE = `touchmove`;
export const PassiveTouchEventType = io.union([io.literal(TOUCH_START), io.literal(TOUCH_MOVE)]);
export const TouchEventType = io.union([
    PassiveTouchEventType,
    io.union([io.literal(TOUCH_CANCEL), io.literal(TOUCH_END)]),
]);
export type PassiveTouchEventType = io.TypeOf<typeof PassiveTouchEventType>;
export type TouchEventType = io.TypeOf<typeof TouchEventType>;
export type GestureObjectEventArg = GestureObject | DelegatedEvent<GestureObject>;
export type GestureHandler = (this: HTMLElement, g: GestureObject) => void;

export const TAP_TIME = 270;
export const LONG_TAP_TIME = 600;
export const SWIPE_LENGTH = 100;
export const SWIPE_VELOCITY = 800;
export const TWO_FINGER_TAP_MINIMUM_DISTANCE = 100;
export const TAP_MAX_MOVEMENT = 24;
export const PINCER_MINIMUM_MOVEMENT = 24;
export const DOUBLE_TAP_MINIMUM_MOVEMENT = 24;
export const TOUCH_EVENTS: TouchEventType[] = [TOUCH_START, TOUCH_MOVE, TOUCH_CANCEL, TOUCH_END];
export const TOUCH_EVENTS_NO_MOVE: Exclude<TouchEventType, `touchmove`>[] = [TOUCH_START, TOUCH_CANCEL, TOUCH_END];
export const PASSIVE_TOUCH_EVENTS: Record<PassiveTouchEventType, PassiveTouchEventType> = {
    [TOUCH_START]: TOUCH_START,
    [TOUCH_MOVE]: TOUCH_MOVE,
};

type Deps = SelectDeps<`env` | `page` | `globalEvents`>;

interface SingleTapTimeout {
    clearHandler: () => void;
    id: number;
}

export default class GestureRecognizerContext {
    env: Env;
    page: Page;
    globalEvents: GlobalEvents;
    modifierTouch: any;
    documentActives: ActiveTouchList;
    singleTapTimeouts: SingleTapTimeout[];

    constructor(deps: Deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.modifierTouch = null;
        this.documentActives = new ActiveTouchList();
        this.singleTapTimeouts = [];
        if (this.isTouchSupported()) {
            this.page.addDocumentListener(TOUCH_START, this.checkTouchPropagation, { capture: true, passive: true });
            this.page.addDocumentListener(TOUCH_END, this.checkTouchPropagation, { capture: true, passive: false });
            this.page.addDocumentListener(TOUCH_CANCEL, this.checkTouchPropagation, { capture: true, passive: true });
        }
    }

    isTouchSupported() {
        return this.env.hasTouch();
    }

    checkTouchPropagation = (e: TouchEvent) => {
        let node: null | HTMLElement = e.target as HTMLElement;
        const activeElement = this.page.activeElement();
        let matchesActive = false;
        while (node !== null && typeof node !== `undefined`) {
            if (!matchesActive) {
                matchesActive = node === activeElement;
            }

            if (isAnyInputElement(node)) {
                return;
            }
            node = node.parentElement;
        }

        if (activeElement && !matchesActive) {
            activeElement.blur();
        }

        if (e.type === TOUCH_END && e.cancelable) {
            e.preventDefault();
        }
    };

    createTapRecognizer(fn: GestureHandler) {
        return new TapRecognizer(this, fn);
    }

    createTouchdownRecognizer(fn: GestureHandler) {
        return new TouchdownRecognizer(this, fn);
    }

    createDragRecognizer(fnMove: GestureHandler, fnEnd: GestureHandler) {
        return new DragRecognizer(this, fnMove, fnEnd);
    }

    createHorizontalSwipeRecognizer(fn: GestureHandler, direction: 1 | -1) {
        return new HorizontalSwipeRecognizer(this, fn, direction);
    }

    createSingleTapTimeout(timeoutHandler: () => void, clearHandler: () => void, timeoutMs: number) {
        for (const s of this.singleTapTimeouts) {
            this.page.clearTimeout(s.id);
            s.clearHandler();
        }
        this.singleTapTimeouts = [];
        const id = this.page.setTimeout(() => {
            this.singleTapTimeouts = [];
            timeoutHandler();
        }, timeoutMs);
        this.singleTapTimeouts.push({
            clearHandler,
            id,
        });
        return { id };
    }
}
