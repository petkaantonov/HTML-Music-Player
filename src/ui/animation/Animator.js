"use strict";

import { inherits } from "util";
import EventEmitter from "events";
import unitBezier from "bezier";
import { Move, Line, CubicCurve } from "ui/animation/shapes";
import AnimationProperty from "ui/animation/AnimationProperty";

const parsePath = (function() {
    const number = "[01]+(?:\\.\\d+)?";
    const point = number + "[, ]" + number + "";
    const rpath = new RegExp("(?:( ?M ("+point+"))|( ?C ("+point+
                                ") ("+point+") ("+point+"))|( ?L ("+point+"))|\\s+)", "g");
    const rsplit = /[, ]/;

    return function parse(str) {
        str = "" + str;
        var ret = [];
        var m;
        rpath.lastIndex = 0;
        while(m = rpath.exec(str)) {
            if (m[1] !== undefined) {
                var p = m[2].split(rsplit);
                ret.push(new Move(+p[0], +p[1]));
            } else if (m[3] !== undefined) {
                if (!ret.length) ret.push(new Move(0, 0));
                var cp1 = m[4].split(rsplit);
                var cp2 = m[5].split(rsplit);
                var p = m[6].split(rsplit);
                var prev = ret[ret.length - 1];
                ret.push(new CubicCurve(prev.endX(), prev.endY(), +p[0], +p[1], +cp1[0], +cp1[1],  +cp2[0], +cp2[1]));
            } else if (m[7] !== undefined) {
                if (!ret.length) ret.push(new Move(0, 0));
                var p = m[8].split(rsplit);
                var prev = ret[ret.length - 1];
                ret.push(new Line(prev.endX(), prev.endY(), +p[0], +p[1]));
            }
        }

        if (ret.length < 2) throw new Error("too few items");

        if (ret[0].startX() !== 0) throw new Error("path must start at 0");
        if (ret[ret.length - 1].endX() !== 1) throw new Error("path must end at 1");

        var prev = ret[0];
        for (var i = 1; i < ret.length; ++i) {
            if (ret[i].startX() !== prev.endX()) {
                throw new Error("path must not have gaps");
            }
            prev = ret[i];
        }

        return ret;
    };
})();

const makePathEasing = function(path) {
    path = parsePath(path);

    return function(current, total) {
        var progress = Math.min(1, Math.max(0, current / total));

        for (var i = 0; i < path.length; ++i) {
            var start = path[i].startX();
            var end = path[i].endX();

            if (start <= progress && progress <= end) {
                var progressWithin = (progress - start) / (path[i].endX() - start);
                return path[i].yAt(progressWithin);
            }
        }
    };
};

const makeEasing = function(a, b, c, d) {
    const solver = unitBezier(a, b, c, d).duration;

    return function(current, total) {
        var progress = Math.min(1, Math.max(0, current / total));
        return solver(progress, total);
    };
};

const makeDecelator = function(power) {
    return function(current, total) {
        var progress = Math.min(1, Math.max(0, current / total));
        return 1 - Math.pow(1 - progress, power);
    };
};

const makeAccelerator = function(power) {
    return function(current, total) {
        var progress = Math.min(1, Math.max(0, current / total));
        return Math.pow(progress, power);
    };
};

export default function Animator(dom, page, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._page = page;
    this._domNode = this._page.$(dom);
    this._properties = Object.keys(opts).map(function(v) {
        return new AnimationProperty(this, v, Object(opts[v]));
    }, this);

    this._frameId = -1;
    this._startTime = -1;
    this._hasStarted = false;
    this._gotAnimationFrame = this._gotAnimationFrame.bind(this);
}
inherits(Animator, EventEmitter);

Animator.prototype.$ = function() {
    return this._domNode;
};

Animator.prototype._reset = function() {
    this._page.cancelAnimationFrame(this._frameId);
    this._frameId = -1;
    this._startTime = -1;
    this._hasStarted = false;
};

Animator.prototype._elapsedTime = function() {
    return this._startTime === -1 ? 0 : this._currentTime - this._startTime;
};

Animator.prototype._forEachProperty = function(fn) {
    for (var i = 0; i < this._properties.length; ++i) {
        fn.call(this, this._properties[i], i);
    }
};

Animator.prototype._startProperty = function(property) {
    property.start(this.$());
};

Animator.prototype._endProperty = function(property) {
    property.end(this.$());
};

Animator.prototype.stop = function(finishProperties) {
    if (!this._hasStarted) throw new Error("animaton has not started");
    if (finishProperties) {
        this._forEachProperty(this._endProperty);
    }
    this._reset();
    this.emit("animationEnd", this, true);
};

Animator.prototype._gotAnimationFrame = function(now) {
    this._frameId = this._page.requestAnimationFrame(this._gotAnimationFrame);
    if (this._startTime === -1) {
        this._startTime = now - 16;
    }

    var elapsed = now - this._startTime;
    var $elem = this.$();
    var finished = true;

    for (var i = 0; i < this._properties.length; ++i) {
        var property = this._properties[i];
        var propertyIsFinished = property.tween($elem, elapsed);
        if (!propertyIsFinished) {
            finished = false;
        }
    }

    if (finished) {
        this._reset();
        this.emit("animationEnd", this, false);
    }
};

Animator.prototype.start = function() {
    if (this._hasStarted) throw new Error("already started");
    this._frameId = this._page.requestAnimationFrame(this._gotAnimationFrame);
    this._hasStarted = true;
    this._forEachProperty(this._startProperty);
    return this.animationEnd();
};

Animator.prototype.hasStarted = function() {
    return this._hasStarted;
};

Animator.prototype.animationEnd = function() {
    var self = this;
    return new Promise(function(resolve) {
        self.once("animationEnd", function(self, cancelled) {
            resolve(cancelled);
        });
    });
};

Animator.LINEAR = function(a, b) { return Math.min(1, Math.max(0, a / b)); };
Animator.SWIFT_OUT = makeEasing(0.55, 0, 0.1, 1);
Animator.EASE_IN = makeEasing(0.42, 0, 1, 1);
Animator.EASE_OUT = makeEasing(0, 0, 0.58, 1);
Animator.EASE_IN_OUT = makeEasing(0.42, 0, 0.58, 1);
Animator.EASE = makeEasing(0.25, 0.1, 0.25, 1);
Animator.DECELERATE_QUAD = makeDecelator(2);
Animator.DECELERATE_CUBIC = makeDecelator(3);
Animator.DECELERATE_QUART = makeDecelator(4);
Animator.DECELERATE_QUINT = makeDecelator(5);
Animator.ACCELERATE_QUAD = makeAccelerator(2);
Animator.ACCELERATE_CUBIC = makeAccelerator(3);
Animator.ACCELERATE_QUART = makeAccelerator(4);
Animator.ACCELERATE_QUINT = makeDecelator(5);

Animator.RECT1_SCALE_X = makePathEasing("M 0 0 L 0.3665 0 C 0.47252618112021,0.062409910275 " +
                    "0.61541608570164,0.5 0.68325,0.5 C 0.75475061236836,0.5 0.75725829093844,0.814510098964 1.0,1.0");
Animator.RECT1_TRANSLATE_X = makePathEasing("M 0.0,0.0 L 0.2 0 C 0.3958333333336,0.0 " +
                    "0.474845090492,0.206797621729 0.5916666666664,0.417082932942 C " +
                    "0.7151610251224,0.639379624869 0.81625,0.974556908664 1.0,1.0");
Animator.RECT2_SCALE_X = makePathEasing("M 0,0 C 0.06834272400867,0.01992566661414 " +
                    "0.19220331656133,0.15855429260523 0.33333333333333,0.34926160892842 " +
                    "C 0.38410433133433,0.41477913453861 0.54945792615267,0.68136029463551 " +
                    "0.66666666666667,0.68279962777002 C 0.752586273196,0.68179620963216 " +
                    "0.737253971954,0.878896194318 1,1");
Animator.RECT2_TRANSLATE_X = makePathEasing("M 0.0,0.0 C 0.0375,0.0 0.128764607715,0.0895380946618 " +
                    "0.25,0.218553507947 C 0.322410320025,0.295610602487 0.436666666667,0.417591408114 " +
                    "0.483333333333,0.489826169306 C 0.69,0.80972296795 0.793333333333,0.950016125212 " +
                    "1.0,1.0");
