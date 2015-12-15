const Animator = (function() { "use strict";

function Line(x1, y1, x2, y2, progress) {
    if (progress === undefined) progress = 1;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    this.progress = progress;
}

Line.prototype.xAt = function(progress) {
    return this.x1 + ((this.x2 - this.x1) * progress);
};

Line.prototype.yAt = function(progress) {
        return this.y1 + ((this.y2 - this.y1) * progress);
};

Line.prototype.startX = function() {
    return this.x1;
};

Line.prototype.startY = function() {
    return this.y1;
};

Line.prototype.endX = function() {
    return this.x2;
};

Line.prototype.endY = function() {
    return this.y2;
};

function Move(x, y) {
    this.x = x;
    this.y = y;
}

Move.prototype.endX = function() {
    return this.x;
};

Move.prototype.endY = function() {
    return this.y;
};


function QuadraticCurve(x1, y1, x2, y2, cpx, cpy, progress) {
    Line.call(this, x1, y1, x2, y2, progress);

    this.aX = (x1 - 2 * cpx + x2);
    this.bX = (2 * cpx - 2 * x1);

    this.aY = (y1 - 2 * cpy + y2);
    this.bY = (2 * cpy - 2 * y1);
}
util.inherits(QuadraticCurve, Line);

QuadraticCurve.prototype.xAt = function(progress) {
    var p2 = progress * progress;
    return p2 * this.aX + progress * this.bX + this.x1;
};

QuadraticCurve.prototype.yAt = function(progress) {
    var p2 = progress * progress;
    return p2 * this.aY + progress * this.bY + this.y1;
};

function CubicCurve(x1, y1, x2, y2, cpx1, cpy1, cpx2, cpy2, progress) {
    Line.call(this, x1, y1, x2, y2, progress);

    this.cX = 3 * (cpx1 - x1);
    this.bX = 3 * (cpx2 - cpx1) - this.cX;
    this.aX = (x2 - x1) - this.cX - this.bX;

    this.cY = 3 * (cpy1 - y1);
    this.bY = 3 * (cpy2 - cpy1) - this.cY;
    this.aY = (y2 - y1) - this.cY - this.bY;
}
util.inherits(CubicCurve, Line);

CubicCurve.prototype.xAt = function(progress) {
    var p3 = progress * progress * progress;
    var p2 = progress * progress;
    return this.aX * p3 + this.bX * p2 + this.cX * progress + this.x1;
};

CubicCurve.prototype.yAt = function(progress) {
    var p3 = progress * progress * progress;
    var p2 = progress * progress;
    return this.aY * p3 + this.bY * p2 + this.cY * progress + this.y1;
};

function Range(item, start, end) {
    this.start = start;
    this.end = end;
    this.item = item;
    this.progressStart = -1;
    this.progressEnd = -1;
}

Range.prototype.getInternalProgress = function(totalProgress) {
    return (totalProgress - this.progressStart) / (this.progressEnd - this.progressStart);
};

function AnimationPath(addX, addY) {
    this.addX = addX;
    this.addY = addY;
    this._path = [];
    this._ranges = [];
    this._closed = false;
    this._max = 0;
}

AnimationPath.prototype._getRangeAt = function(progress) {
    var ranges = this._ranges;
    var range;

    for (var i = 0; i < ranges.length; ++i) {
        range = ranges[i];
        if (range.progressStart <= progress && progress <= range.progressEnd) {
            return range;
        }
    }
    return range;
};

AnimationPath.prototype._previous = function() {
    if (!this._path.length) throw new Error("no reference point");
    return this._path[this._path.length - 1];
};

AnimationPath.prototype.moveTo = function(x, y) {
    if (this._closed) throw new Error("path already closed");
    x = +x;
    y = +y;
    this._path.push(new Move(x, y));
};

AnimationPath.prototype.lineTo = function(x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    this._path.push(new Line(prev.endX(), prev.endY(), x, y, progress));
};

AnimationPath.prototype.quadraticCurveTo = function(cpx, cpy, x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    this._path.push(new QuadraticCurve(prev.endX(), prev.endY(), x, y, cpx, cpy, progress));
};

AnimationPath.prototype.curveTo = function(endX, endY, gap, positionMultiplier, side, progress) {
    if (side == undefined) side = 1;
    if (positionMultiplier == undefined) positionMultiplier = 0.5;
    if (gap == undefined) gap = 5;
    var prev = this._previous();
    var startX = prev.endX();
    var startY = prev.endY();
    var angle = Math.atan2(endY - startY, endX - startX);
    var midX = (endX - startX) * positionMultiplier;
    var midY = (endY - startY) * positionMultiplier;

    var x, y;
    if (side < 0) {
        x = Math.sin(angle) * gap + midX;
        y = -Math.cos(angle) * gap + midY;
    } else {
        x = -Math.sin(angle) * gap + midX;
        y = Math.cos(angle) * gap + midY;
    }

    return this.quadraticCurveTo(x, y, endX, endY, progress);
}

AnimationPath.prototype.cubicCurveTo = function(cpx1, cpy1, cpx2, cpy2, x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

// Material design curves from Android
/*
~ Copyright (C) 2014 The Android Open Source Project
~
~ Licensed under the Apache License, Version 2.0 (the "License");
~ you may not use this file except in compliance with the License.
~ You may obtain a copy of the License at
~
~      http://www.apache.org/licenses/LICENSE-2.0
~
~ Unless required by applicable law or agreed to in writing, software
~ distributed under the License is distributed on an "AS IS" BASIS,
~ WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
~ See the License for the specific language governing permissions and
~ limitations under the License
*/
AnimationPath.prototype.fastOutLinearInCurveTo = function(x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    var startX = prev.endX();
    var startY = prev.endY();
    
    // CP1(0.4, 0)
    // CP2(1, 1)
    var cpx1 = 0.4 * (x - startX) + startX;
    var cpy1 = startY;
    var cpx2 = x;
    var cpy2 = y;
    
    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.fastOutSlowInCurveTo = function(x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    var startX = prev.endX();
    var startY = prev.endY();

    // CP1(0.4, 0)
    // CP2(0.2, 1)
    var cpx1 = 0.4 * (x - startX) + startX;
    var cpy1 = startY;
    var cpx2 = 0.2 * (x - startX) + startX;
    var cpy2 = y;
    
    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.linearOutSlowInCurveTo = function(x, y, progress) {
    if (this._closed) throw new Error("path already closed");
    var prev = this._previous();
    var startX = prev.endX();
    var startY = prev.endY();

    // CP1(0, 0)
    // CP2(0.2, 1)
    var cpx1 = startX;
    var cpy1 = startY;
    var cpx2 = 0.2 * (x - startX) + startX;
    var cpy2 = y;
    
    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.close = function() {
    if (this._closed) throw new Error("path already closed");
    this._closed = true;
    var now = 0;

    for (var i = 0; i < this._path.length; ++i) {
        var item = this._path[i];

        if (!(item instanceof Move)) {
            var progress = item.progress;
            var start = now;
            var end = start + progress;

            this._ranges.push(new Range(item, start, end));
            now = end;
        }
    }
    var max = now;
    this._max = max;
    now = 0;
    for (var i = 0; i < this._ranges.length; ++i) {
        var range = this._ranges[i];
        var dist = range.end - range.start;
        range.progressStart = now;
        range.progressEnd = now + dist / max;
        now = range.progressEnd;
    }    
};

function Animation(animator, path, duration) {
    this.animator = animator;
    this.path = path;
    this.duration = duration;
    this.maxDuration = animator._additionalProperties.reduce(function(max, cur) {
        return Math.max(max, cur.duration);
    }, 0);
    this.started = Date.now();
}

Animation.prototype.animate = function(now) {
    var ret = true;
    var elapsed = now - this.started;
    if (elapsed >= this.maxDuration) ret = false;

    if (this.path) {
        var progress = this.animator._interpolate(elapsed, this.duration);
        var range = this.path._getRangeAt(progress);
        var internalProgress = range.getInternalProgress(progress);
        var x = range.item.xAt(internalProgress);
        var y = range.item.yAt(internalProgress);
        this.animator._progressTo(x + this.path.addX, y + this.path.addY, elapsed, this.duration);
    } else {
        this.animator._progress(elapsed, this.duration);
    }
    return ret;
};

const validProperties = [
    "scale", "scaleX", "scaleY", "rotate", "skew",
    "skewX", "skewY", "rotateX", "rotateY", "opacity"
];

const multiProperties = ["scale", "skew"];
const transformProperties = [
    "scale", "scaleX", "scaleY", "rotate", "skew",
    "skewX", "skewY", "rotateX", "rotateY"
];
function AdditionalAnimationProperty(animator, property) {
    this.name = property.name + "";
    this.isTransform = transformProperties.indexOf(this.name) >= 0;
    this.isMulti = transformProperties.indexOf(this.name) >= 0;

    if (validProperties.indexOf(this.name) === -1) {
        throw new Error(name + " is not an animatable property");
    }

    this.interpolate = property.interpolate || animator._interpolate;
    this.start = property.start;
    this.end = property.end;
    this.unit = property.unit || "";
    this.duration = "duration" in property ? +property.duration : -1;

    if (this.isMulti) {
        if (!Array.isArray(this.start)) {
            this.start = [this.start, this.start];
        }

        if (!Array.isArray(this.end)) {
            this.end = [this.end, this.end];
        }
        
        if (this.start.length !== this.end.length) {
            throw new Error("must be same length");
        }
    } else {
        this.start -= 0;
        this.end -= 0;
    }
};

AdditionalAnimationProperty.prototype.getCssValue = function(current, total) {
    if (this.duration !== -1) total = this.duration;
    var progress = this.interpolate(current, total);
    var result = "";
    if (this.isMulti) {
        for (var i = 0; i < this.start.length; ++i) {
            var startValue = this.start[i];
            var endValue = this.end[i];
            result += ((progress * (endValue - startValue)) + startValue) + this.unit;

            if (i < this.start.length - 1) {
                result += ",";
            }
        }
    } else {
        var startValue = this.start;
        var endValue = this.end;
        result = ((progress * (endValue - startValue)) + startValue) + this.unit;
    }

    if (this.isTransform) {
        return this.name + "(" + result + ")";
    } else {
        return result;
    }
};

function Animator(dom, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._domNode = dom;
    this._prop = opts.positionProperty || Animator.TOP_AND_LEFT;
    this._animations = [];
    this._frameId = -1;
    this._interpolate = opts.interpolate || Animator.SWIFT_OUT;
    this._additionalProperties = (opts.properties || []).map(function(property) {
        return new AdditionalAnimationProperty(this, property);
    }, this);

    this._transforms = this._additionalProperties.filter(function(value) {
        return value.isTransform;
    });

    this._directProperties = this._additionalProperties.filter(function(value) {
        return !value.isTransform;
    });

    this._gotAnimationFrame = this._gotAnimationFrame.bind(this);
}
util.inherits(Animator, EventEmitter);

const makeEasing = function(a, b, c, d) {
    const solver = unitBezier(a, b, c, d).duration;

    return function(cur, total) {
        return solver(cur / total, total);
    };
};

Animator.TOP_AND_LEFT = 1;
Animator.TRANSLATE = 2;
Animator.LINEAR = function(a, b) { return a / b; };
Animator.SWIFT_OUT = makeEasing(0.55, 0, 0.1, 1);
Animator.EASE_IN = makeEasing(0.42, 0, 1, 1);
Animator.EASE_OUT = makeEasing(0, 0, 0.58, 1);
Animator.EASE_IN_OUT = makeEasing(0.42, 0, 0.58, 1);
Animator.EASE = makeEasing(0.25, 0.1, 0.25, 1);

Animator.prototype.isAnimating = function() {
    return this._frameId !== -1;
};

Animator.prototype._getTransforms = function(current, total) {
    return this._transforms.map(function(v) {
        return v.getCssValue(current, total);
    }).join(" ");
};

Animator.prototype._applyDirectProperties = function(node, current, total) {
    this._directProperties.forEach(function(v) {
        node.style[v.name] = v.getCssValue(current, total);
    });
};

Animator.prototype._progress = function(current, total) {
    var node = this._domNode;
    var transforms = this._getTransforms(current, total);

    if (transforms) {
        node.style.transform = transforms;
    }

    this._applyDirectProperties(node, current, total);
};

Animator.prototype._progressTo = function(x, y, current, total) {
    var node = this._domNode;
    var transforms = this._getTransforms(current, total);

    if (this._prop === Animator.TOP_AND_LEFT) {
        node.style.left = x + "px";
        node.style.top = y + "px";
        if (transforms) node.style.transform = transforms;
    } else {
        node.style.transform = "translate("+x+", "+y+") " + transforms + ";";
    }
    this._applyDirectProperties(node, current, total);
};

Animator.prototype._gotAnimationFrame = function() {
    this._frameId = -1;
    var newFrameNeeded = false;
    var now = Date.now();
    for (var i = 0; i < this._animations.length; ++i) {
        if (this._animations[i].animate(now)) {
            newFrameNeeded = true;
        } else {
            this._animations.splice(i, 1);
            i--;
        }
    }

    if (newFrameNeeded) {
        this._scheduleFrame();
    } else {
        this.emit("animationEnd");
    }
};

Animator.prototype._scheduleFrame = function() {
    if (this._frameId === -1) {
        this._frameId = requestAnimationFrame(this._gotAnimationFrame);
    }
};

Animator.prototype.animationEnd = function() {
    var self = this;
    return new Promise(function(resolve) {
        self.on("animationEnd", resolve);
    });
};

Animator.prototype.animate = function(duration, path) {
    if (path && !path._closed) throw new Error("path is not closed");
    if (!(+duration)) duration = 300;
    this._animations.push(new Animation(this, path, duration));
    if (this._frameId === -1) {
        this.emit("animationStart");
    }
    this._scheduleFrame();
    return this.animationEnd();
};

Animator.prototype.createPath = function(addX, addY) {
    return new AnimationPath(addX || 0, addY || 0);
};

return Animator; })();
