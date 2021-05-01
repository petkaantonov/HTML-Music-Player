import { TOUCH_CANCEL, TOUCH_END, TOUCH_START } from "ui/ui/gestures/GestureRecognizerContext";

import { GestureOrEvent } from "./GestureObject";

export default class ActiveTouchList {
    activeTouches: Touch[];
    constructor() {
        this.activeTouches = [];
    }

    length() {
        return this.activeTouches.length;
    }

    nth(i: number): Touch | undefined {
        return this.activeTouches[i];
    }

    first(): Touch | undefined {
        return this.activeTouches[0];
    }

    clear() {
        this.activeTouches.length = 0;
    }

    contains(touch?: Touch) {
        if (!touch) return false;
        for (const activeTouch of this.activeTouches) {
            if (activeTouch.identifier === touch.identifier) {
                return true;
            }
        }
        return false;
    }

    update(e: GestureOrEvent, changedTouches: TouchList) {
        const { activeTouches } = this;
        const addedTouches = [];

        if (e.type === TOUCH_START) {
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i]!;
                let unique = true;
                for (const activeTouch of this.activeTouches) {
                    if (activeTouch.identifier === touch.identifier) {
                        unique = false;
                    }
                }

                if (unique) {
                    activeTouches.push(touch);
                    addedTouches.push(touch);
                }
            }
        } else if (e.type === TOUCH_END || e.type === TOUCH_CANCEL) {
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i]!;
                const id = touch.identifier;
                let j = 0;
                for (const activeTouch of this.activeTouches) {
                    if (activeTouch.identifier === id) {
                        activeTouches.splice(j, 1);
                        break;
                    }
                    j++;
                }
            }
        }
        return addedTouches;
    }
}
