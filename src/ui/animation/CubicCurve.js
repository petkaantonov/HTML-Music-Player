"use strict";

import { inherits } from "util";
import Line from "ui/animation/Line";

export default function CubicCurve(x1, y1, x2, y2, cpx1, cpy1, cpx2, cpy2, progress) {
    Line.call(this, x1, y1, x2, y2, progress);

    this.cX = 3 * (cpx1 - x1);
    this.bX = 3 * (cpx2 - cpx1) - this.cX;
    this.aX = (x2 - x1) - this.cX - this.bX;

    this.cY = 3 * (cpy1 - y1);
    this.bY = 3 * (cpy2 - cpy1) - this.cY;
    this.aY = (y2 - y1) - this.cY - this.bY;
}
inherits(CubicCurve, Line);

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
