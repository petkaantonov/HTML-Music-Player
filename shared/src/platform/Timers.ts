import { AnyFunction } from "shared/types/helpers";

interface Timer {
    deadline: number;
    callback: AnyFunction;
}

const sorter = function (a: Timer, b: Timer) {
    return a.deadline - b.deadline;
};

export default class Timers {
    private _earliestDeadline: number;
    private _timers: Map<number, Timer>;
    constructor() {
        this._timers = new Map<number, Timer>();
        this._earliestDeadline = Infinity;
    }

    _setTimeout(fn: AnyFunction, time: number) {
        let id: any = -1;
        let called = false;
        const callback = () => {
            if (called) {
                return;
            }
            called = true;
            this.clearTimeout(id);
            fn();
        };
        id = setTimeout(callback, time);
        const deadline = Date.now() + time;
        this._timers.set(id, { callback, deadline });
        this._earliestDeadline = Math.min(this._earliestDeadline, deadline);
        return id;
    }

    setTimeout(fn: AnyFunction, time: number) {
        if (+time >= 100) {
            return this._setTimeout(fn, +time);
        } else {
            return setTimeout(fn, time);
        }
    }

    clearTimeout(id: number) {
        this._timers.delete(id);
        return clearTimeout(id);
    }

    setInterval(fn: AnyFunction, time: number) {
        return setInterval(fn, time);
    }

    clearInterval(id: number) {
        this._timers.delete(id);
        return clearInterval(id);
    }

    tick() {
        const now = Date.now();
        if (now < this._earliestDeadline) {
            return;
        }
        const timersToFire = [];
        let earliestDeadline = Infinity;
        for (const timer of this._timers.values()) {
            const { deadline } = timer;
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
                timersToFire[i]!.callback();
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
