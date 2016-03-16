"use strict";

// Timers are silently dropped on mobile and never called when backgrounded.
// Music is still triggering "ended" events every second, so use those to trigger timers manually.

const timers = {};
timers[500000000] = true;
delete timers[500000000];

const GlobalSetTimeout = setTimeout;
const GlobalClearTimeout = clearTimeout;

self.setTimeout = function(fn, time) {
    time = +time;

    if (time >= 100) {
        var called = false;
        var callback = function() {
            if (called) return;
            called = true;
            delete timers[ret];
            fn();
        };
        var ret = GlobalSetTimeout.call(self, callback, time);
        timers[ret] = {
            callback: callback,
            deadline: Date.now() + time
        };
        return ret;
    } else {
        return GlobalSetTimeout.apply(self, arguments);
    }

};

self.clearTimeout = function(id) {
    delete timers[id];
    return GlobalClearTimeout.apply(self, arguments);
};

export default function simulateTick() {
    var keys = Object.keys(timers);
    var now = Date.now();
    var timersToFire = [];
    for (i = 0; i < keys.length; ++i) {
        var timerToFire = timers[keys[i]];
        if (now >= timerToFire.deadline) {
            timersToFire.push(timerToFire);
        }
    }

    timersToFire.sort(function(a, b) {
        return a.deadline - b.deadline;
    });

    for (var i = 0; i < timersToFire.length; ++i) {
        timersToFire[i].callback();
    }
}
