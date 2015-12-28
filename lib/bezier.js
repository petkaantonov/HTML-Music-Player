/*
 * Copyright (C) 2008 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * JavaScript port of Webkit implementation of CSS cubic-bezier(p1x.p1y,p2x,p2y) by http://mck.me
 * http://svn.webkit.org/repository/webkit/trunk/Source/WebCore/platform/graphics/UnitBezier.h
 */
var unitBezier = (function() {'use strict';
    const solveEpsilon = function(duration) {
        return (1000 / 60 / duration) / 4;
    };

    return function(p1x, p1y, p2x, p2y) {
        const cx = 3.0 * p1x;
        const bx = 3.0 * (p2x - p1x) - cx;
        const ax = 1.0 - cx -bx;
        const cy = 3.0 * p1y;
        const by = 3.0 * (p2y - p1y) - cy;
        const ay = 1.0 - cy - by;

        const sampleCurveX = function(t) {
            // `ax t^3 + bx t^2 + cx t' expanded using Horner's rule.
            return ((ax * t + bx) * t + cx) * t;
        };

        const sampleCurveY = function(t) {
            return ((ay * t + by) * t + cy) * t;
        };

        const sampleCurveDerivativeX = function(t) {
            return (3.0 * ax * t + 2.0 * bx) * t + cx;
        };

        const solveCurveX = function(x, epsilon) {
            var t0;
            var t1;
            var t2;
            var x2;
            var d2;
            var i;

            // First try a few iterations of Newton's method -- normally very fast.
            for (t2 = x, i = 0; i < 8; i++) {
                x2 = sampleCurveX(t2) - x;
                if (Math.abs (x2) < epsilon) {
                    return t2;
                }
                d2 = sampleCurveDerivativeX(t2);
                if (Math.abs(d2) < 1e-6) {
                    break;
                }
                t2 = t2 - x2 / d2;
            }

            // Fall back to the bisection method for reliability.
            t0 = 0.0;
            t1 = 1.0;
            t2 = x;

            if (t2 < t0) {
                return t0;
            }
            if (t2 > t1) {
                return t1;
            }

            while (t0 < t1) {
                x2 = sampleCurveX(t2);
                if (Math.abs(x2 - x) < epsilon) {
                    return t2;
                }
                if (x > x2) {
                    t0 = t2;
                } else {
                    t1 = t2;
                }
                t2 = (t1 - t0) * 0.5 + t0;
            }

            // Failure.
            return t2;
        };

        const solve = function(x, epsilon) {
            return sampleCurveY(solveCurveX(x, epsilon));
        };

        return {
            duration: function(x, duration) {
                return solve(x, solveEpsilon(duration));
            },

            motion: function(x, epsilon) {
                return solve(x, epsilon);
            }
        };
    };
})();

const $ = require("./jquery.js");

var makejQueryEasing = function(x1, y1, x2, y2) {
    const solver = unitBezier(x1, y1, x2, y2).duration;

    return function(_, currentTime, startValue, changeInValue, totalTime) {
        var ret = solver(currentTime / totalTime, totalTime);
        return startValue + ret * changeInValue;
    };
};

$.easing.swiftOut = makejQueryEasing(0.55, 0, 0.1, 1);
$.easing.easeIn = makejQueryEasing(0.42, 0, 1, 1);
$.easing.easeOut = makejQueryEasing(0, 0, 0.58, 1);
$.easing.easeInOut = makejQueryEasing(0.42, 0, 0.58, 1);
$.easing.ease = makejQueryEasing(0.25, 0.1, 0.25, 1);

module.exports = unitBezier;
