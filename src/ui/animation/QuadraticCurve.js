"use strict";

import { inherits } from "util";
import Line from "ui/animation/Line";

export default function QuadraticCurve(x1, y1, x2, y2, cpx, cpy, progress) {
    Line.call(this, x1, y1, x2, y2, progress);

    this.aX = (x1 - 2 * cpx + x2);
    this.bX = (2 * cpx - 2 * x1);

    this.aY = (y1 - 2 * cpy + y2);
    this.bY = (2 * cpy - 2 * y1);
}
inherits(QuadraticCurve, Line);

QuadraticCurve.prototype.xAt = function(progress) {
    var p2 = progress * progress;
    return p2 * this.aX + progress * this.bX + this.x1;
};

QuadraticCurve.prototype.yAt = function(progress) {
    var p2 = progress * progress;
    return p2 * this.aY + progress * this.bY + this.y1;
};
