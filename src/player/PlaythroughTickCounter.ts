export default class PlaythroughTickCounter {
    private _threshold: number;
    private _ticks: number;
    private _triggered: boolean;
    private _lastTick: number;
    constructor(threshold: number) {
        this._threshold = threshold;
        this._ticks = 0;
        this._triggered = false;
        this._lastTick = -1;
    }

    reset() {
        this._ticks = 0;
        this._triggered = false;
        this._lastTick = -1;
    }

    hasTriggered() {
        return this._triggered;
    }

    pause() {
        this._lastTick = -1;
        this._ticks = Math.max(this._ticks - 1, 0);
    }

    tick() {
        if (this._triggered) {
            throw new Error(`already triggered`);
        }
        const now = Date.now();
        if (this._lastTick === -1) {
            this._ticks++;
            this._lastTick = now;
        } else {
            const elapsed = now - this._lastTick;
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
    }
}
