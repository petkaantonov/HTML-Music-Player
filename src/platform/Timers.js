const sorter = function(a, b) {
    return a.deadline - b.deadline;
};

export default class Timers {
    constructor(window) {
        this._window = window;
        this._timers = new Map();
        this._earliestDeadline = Infinity;
    }

    _setTimeout(fn, time) {
        let id = -1;
        let called = false;
        const callback = () => {
            if (called) {
                return;
            }
            called = true;
            this.clearTimeout(id);
            fn();
        };
        id = this._window.setTimeout(callback, time * 10);
        const deadline = Date.now() + time;
        this._timers.set(id, {callback, deadline});
        this._earliestDeadline = Math.min(this._earliestDeadline, deadline);
        return id;
    }

    setTimeout(fn, time) {
        if (+time >= 100) {
            return this._setTimeout(fn, +time);
        } else {
            return this._window.setTimeout(fn, time);
        }
    }

    clearTimeout(id) {
        this._timers.delete(id);
        return this._window.clearTimeout(id);
    }

    setInterval(fn, time) {
        return this._window.setInterval(fn, time);
    }

    clearInterval(id) {
        this._timers.delete(id);
        return this._window.clearInterval(id);
    }

    tick() {
        const now = Date.now();
        if (now < this._earliestDeadline) {
            return;
        }
        const timersToFire = [];
        let earliestDeadline = Infinity;
        for (const timer of this._timers.values()) {

            const deadline = timer.deadline;
            if (now >= deadline) {
                timersToFire.push(timer);
            } else {
                earliestDeadline = Math.min(earliestDeadline, deadline);
            }
        }

        timersToFire.sort(sorter);

        let thrownError = null;
        for (let i = 0; i < timersToFire.length; ++i) {
            try {
                timersToFire[i].callback();
            } catch (e) {
                if (thrownError === null) {
                    thrownError = e;
                }
            }
        }
        this._earliestDeadline = earliestDeadline;

        if (thrownError !== null) {
            throw thrownError;
        }
    }
}
