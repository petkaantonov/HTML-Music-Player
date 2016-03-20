"use strict";

export default function PlaythroughTickCounter(threshold) {
    this._threshold = threshold;
    this._ticks = 0;
    this._triggered = false;
    this._lastTick = -1;
}

PlaythroughTickCounter.prototype.reset = function() {
    this._ticks = 0;
    this._triggered = false;
    this._lastTick = -1;
};

PlaythroughTickCounter.prototype.hasTriggered = function() {
    return this._triggered;
};

PlaythroughTickCounter.prototype.pause = function() {
    this._lastTick = -1;
    this._ticks = Math.max(this._ticks - 1, 0);
};

PlaythroughTickCounter.prototype.tick = function() {
    if (this._triggered) {
        throw new Error("already triggered");
    }
    var now = Date.now();
    if (this._lastTick === -1) {
        this._ticks++;
        this._lastTick = now;
    } else {
        var elapsed = now - this._lastTick;
        if (elapsed >= 1000) {
            this._ticks++;
            this._lastTick = now;
        }
    }

    if (this._ticks >= this._threshold) {
        this._triggered = true;
        return true;
    } else {
        return false;
    }
};
