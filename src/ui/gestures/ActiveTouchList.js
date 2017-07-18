import {TOUCH_START, TOUCH_END, TOUCH_CANCEL} from "ui/gestures/GestureRecognizerContext";

export default class ActiveTouchList {
    constructor() {
        this.activeTouches = [];
    }

    length() {
        return this.activeTouches.length;
    }

    nth(i) {
        return this.activeTouches[i];
    }

    first() {
        return this.activeTouches[0];
    }

    clear() {
        this.activeTouches.length = 0;
    }

    contains(touch) {
        if (!touch) return false;
        for (let i = 0; i < this.activeTouches.length; ++i) {
            if (this.activeTouches[i].identifier === touch.identifier) {
                return true;
            }
        }
        return false;
    }

    update(e, changedTouches) {
        const {activeTouches} = this;
        const addedTouches = [];

        if (e.type === TOUCH_START) {
            for (let i = 0; i < changedTouches.length; ++i) {
                const touch = changedTouches[i];
                let unique = true;
                for (let j = 0; j < activeTouches.length; ++j) {
                    if (activeTouches[j].identifier === touch.identifier) {
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
                const touch = changedTouches[i];
                const id = touch.identifier;
                for (let j = 0; j < activeTouches.length; ++j) {
                    if (activeTouches[j].identifier === id) {
                        activeTouches.splice(j, 1);
                        break;
                    }
                }
            }
        }
        return addedTouches;
    }
}
