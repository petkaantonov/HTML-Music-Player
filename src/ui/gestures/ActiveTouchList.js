

const TOUCH_START = `touchstart`;
const TOUCH_END = `touchend`;
const TOUCH_CANCEL = `touchcancel`;

export default function ActiveTouchList() {
    this.activeTouches = [];
}

ActiveTouchList.prototype.length = function() {
    return this.activeTouches.length;
};

ActiveTouchList.prototype.nth = function(i) {
    return this.activeTouches[i];
};

ActiveTouchList.prototype.first = function() {
    return this.activeTouches[0];
};

ActiveTouchList.prototype.clear = function() {
    this.activeTouches.length = 0;
};

ActiveTouchList.prototype.contains = function(touch) {
    if (!touch) return false;
    for (let i = 0; i < this.activeTouches.length; ++i) {
        if (this.activeTouches[i].identifier === touch.identifier) {
            return true;
        }
    }
    return false;
};

ActiveTouchList.prototype.update = function(e, changedTouches) {
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
};
