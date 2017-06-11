

import Line from "ui/animation/Line";
import Move from "ui/animation/Move";
import QuadraticCurve from "ui/animation/QuadraticCurve";
import CubicCurve from "ui/animation/CubicCurve";
import Range from "ui/animation/Range";

export default function AnimationPath(addX, addY) {
    this.addX = addX;
    this.addY = addY;
    this._path = [];
    this._ranges = [];
    this._closed = false;
    this._max = 0;
}

AnimationPath.prototype._getRangeAt = function(progress) {
    const ranges = this._ranges;
    let range;

    for (let i = 0; i < ranges.length; ++i) {
        range = ranges[i];
        if (range.progressStart <= progress && progress <= range.progressEnd) {
            return range;
        }
    }
    return range;
};

AnimationPath.prototype._previous = function() {
    if (!this._path.length) throw new Error(`no reference point`);
    return this._path[this._path.length - 1];
};

AnimationPath.prototype.moveTo = function(x, y) {
    if (this._closed) throw new Error(`path already closed`);
    x = +x;
    y = +y;
    this._path.push(new Move(x, y));
};

AnimationPath.prototype.lineTo = function(x, y, progress) {
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
    this._path.push(new Line(prev.endX(), prev.endY(), x, y, progress));
};

AnimationPath.prototype.quadraticCurveTo = function(cpx, cpy, x, y, progress) {
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
    this._path.push(new QuadraticCurve(prev.endX(), prev.endY(), x, y, cpx, cpy, progress));
};

AnimationPath.prototype.curveTo = function(endX, endY, gap, positionMultiplier, side, progress) {
    if (side === null || typeof side === `undefined`) side = 1;
    if (positionMultiplier === null || typeof positionMultiplier === `undefined`) positionMultiplier = 0.5;
    if (gap === null || typeof positionMultiplier === `undefined`) gap = 5;
    const prev = this._previous();
    const startX = prev.endX();
    const startY = prev.endY();
    const angle = Math.atan2(endY - startY, endX - startX);
    const midX = (endX - startX) * positionMultiplier;
    const midY = (endY - startY) * positionMultiplier;

    let x, y;
    if (side < 0) {
        x = Math.sin(angle) * gap + midX;
        y = -Math.cos(angle) * gap + midY;
    } else {
        x = -Math.sin(angle) * gap + midX;
        y = Math.cos(angle) * gap + midY;
    }

    return this.quadraticCurveTo(x, y, endX, endY, progress);
};

AnimationPath.prototype.cubicCurveTo = function(cpx1, cpy1, cpx2, cpy2, x, y, progress) {
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
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
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
    const startX = prev.endX();
    const startY = prev.endY();

    // CP1(0.4, 0)
    // CP2(1, 1)
    const cpx1 = 0.4 * (x - startX) + startX;
    const cpy1 = startY;
    const cpx2 = x;
    const cpy2 = y;

    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.fastOutSlowInCurveTo = function(x, y, progress) {
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
    const startX = prev.endX();
    const startY = prev.endY();

    // CP1(0.4, 0)
    // CP2(0.2, 1)
    const cpx1 = 0.4 * (x - startX) + startX;
    const cpy1 = startY;
    const cpx2 = 0.2 * (x - startX) + startX;
    const cpy2 = y;

    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.linearOutSlowInCurveTo = function(x, y, progress) {
    if (this._closed) throw new Error(`path already closed`);
    const prev = this._previous();
    const startX = prev.endX();
    const startY = prev.endY();

    // CP1(0, 0)
    // CP2(0.2, 1)
    const cpx1 = startX;
    const cpy1 = startY;
    const cpx2 = 0.2 * (x - startX) + startX;
    const cpy2 = y;

    this._path.push(new CubicCurve(prev.endX(), prev.endY(), x, y, cpx1, cpy1, cpx2, cpy2, progress));
};

AnimationPath.prototype.close = function() {
    if (this._closed) throw new Error(`path already closed`);
    this._closed = true;
    let now = 0;

    for (let i = 0; i < this._path.length; ++i) {
        const item = this._path[i];

        if (!(item instanceof Move)) {
            const {progress} = item;
            const start = now;
            const end = start + progress;

            this._ranges.push(new Range(item, start, end));
            now = end;
        }
    }
    const max = now;
    this._max = max;
    now = 0;
    for (let i = 0; i < this._ranges.length; ++i) {
        const range = this._ranges[i];
        const dist = range.end - range.start;
        range.progressStart = now;
        range.progressEnd = now + dist / max;
        now = range.progressEnd;
    }
};
