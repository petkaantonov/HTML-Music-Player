"use strict";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";

const Promise = require("../lib/bluebird");
const base64 = require("../lib/base64");

var util = {};

util.canvasToImage = function(canvas) {
    return new Promise(function(resolve) {
        var data = canvas.toDataURL("image/png").split("base64,")[1];
        resolve(new Blob([base64.toByteArray(data)], {type: "image/png"}));
    }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var image = new Image();
        image.src = url;
        return new Promise(function (resolve, reject) {
            if (image.complete) return resolve(image);

            function cleanup() {
                image.onload = image.onerror = null;
            }

            image.onload = function() {
                cleanup();
                resolve(image);
            };
            image.onerror = function() {
                cleanup();
                reject(new Error("cannot load image"));
            };
        });
    });
};

const copyTouchProps = function(e, touch) {
    e.clientX = touch.clientX;
    e.clientY = touch.clientY;
    e.pageX = touch.pageX;
    e.pageY = touch.pageY;
    e.screenX = touch.screenX;
    e.screenY = touch.screenY;
    return e;
};

const baseSingleTouchHandler = function(fn) {
    return function(e) {
        var touches = e.touches || e.originalEvent.touches;

        if (touches.length === 1) {
            e.preventDefault();
            copyTouchProps(e, touches[0]);
            return fn.apply(this, arguments);
        }

    };
};

const noTouchHandler = function(fn) {
    return function(e) {
        var touches = e.touches || e.originalEvent.touches;

        if (touches.length === 0) {
            e.preventDefault();
            touches = e.changedTouches || e.originalEvent.changedTouches;
            copyTouchProps(e, touches[0]);
            return fn.apply(this, arguments);
        }
    };
};

const intersects = function(ax1, ax2, ay1, ay2, bx1, bx2, by1, by2) {
    var xOverlap = !(ax1 > bx2 || ax2 < bx1);
    var yOverlap = !(ay1 > by2 || ay2 < by1);
    return xOverlap && yOverlap;
};

const overlapsWithNode = function(touch, node) {
    if (!node) return false;
    var rect = node.getBoundingClientRect();
    var xRadius = touch.radiusX || touch.webkitRadiusX || touch.mozRadiusX || 11.5;
    var yRadius = touch.radiusY || touch.webkitRadiusY || touch.mozRadiusY || 11.5;
    // TODO: calculate actual ellipsis & rect overlap instead of pretending it's a rect.
    var areaX1 = touch.pageX - xRadius;
    var areaX2 = areaX1 + xRadius * 2;
    var areaY1 = touch.pageY - yRadius;
    var areaY2 = areaY1 + yRadius * 2;
    return intersects(areaX1, areaX2, areaY1, areaY2, rect.left, rect.right, rect.top, rect.bottom);
};

util.touchDownHandler = baseSingleTouchHandler;
util.touchUpHandler = noTouchHandler;
util.touchMoveHandler = baseSingleTouchHandler;

util.touchDownPinchHandler = baseSingleTouchHandler;
util.touchMovePinchHandler = baseSingleTouchHandler;

util.tapHandler = function(fn) {
    var touching = null;
    var target = null;
    var started = 0;

    return function(e) {
        var touches = e.targetTouches || e.originalEvent.targetTouches;
        var changedTouches = e.changedTouches || e.originalEvent.changedTouches;

        if (touches.length === 1) {
            if (e.type === TOUCH_START) {
                e.preventDefault();
                touching = touches[0].identifier;
                target = e.currentTarget;
                started = Date.now();
            }
        }

        if (e.type === TOUCH_END && touching !== null) {
            touches = changedTouches;
            e.preventDefault();
            for (var i = 0; i < touches.length; ++i) {
                if (touches[i].identifier === touching) {
                    touching = null;
                    if (overlapsWithNode(touches[i], target) &&
                        Date.now() - started < 300) {
                        copyTouchProps(e, touches[i]);
                        fn.apply(this, arguments);
                    }
                    return;
                }
            }
        }
    };
};

util.longTapHandler = function(fn) {
    var timeoutId = -1;
    var touchId = null;
    var x1, y1, x2, y2;

    function clear() {
        if (timeoutId !== -1) {
            clearTimeout(timeoutId);
            timeoutId = -1;
            touchId = null;
        }
    }

    return function(e) {
        e.preventDefault();
        var touches = e.touches || e.originalEvent.touches;

        if (e.type === TOUCH_MOVE) {
            var touch;
            for (var i = 0; i < touches.length; ++i) {
                if (touches[i].identifier === touchId) {
                    touch = touches[i];
                    break;
                }
            }
            if (!touch) return;
            var xRadius = touch.radiusX || touch.webkitRadiusX || touch.mozRadiusX || 11.5;
            var yRadius = touch.radiusY || touch.webkitRadiusY || touch.mozRadiusY || 11.5;

            var bx1 = touch.clientX - xRadius;
            var bx2 = bx1 + xRadius * 2;
            var by1 = touch.clientY - yRadius;
            var by2 = by1 + yRadius * 2;
            if (!intersects(x1, x2, y1, y2, bx1, bx2, by1, by2)) {
                clear();
            }
        } else if (e.type === TOUCH_END) {
            clear();
        } else if (e.type === TOUCH_START && touches.length === 1) {
            var self = this;
            var touch = touches[0];
            copyTouchProps(e, touch);

            var xRadius = (touch.radiusX || touch.webkitRadiusX || touch.mozRadiusX || 11.5) * 2;
            var yRadius = (touch.radiusY || touch.webkitRadiusY || touch.mozRadiusY || 11.5) * 2;

            x1 = touch.clientX - xRadius;
            x2 = x1 + xRadius * 2;
            y1 = touch.clientY - yRadius;
            y2 = y1 + yRadius * 2;
            timeoutId = setTimeout(function() {
                timeoutId = -1;
                fn.call(self, e);
            }, 500);
            touchId = touch.identifier;
        }
    };
};

util.doubleTapHandler = function(fn) {
    var lastTap = -1;
    return util.tapHandler(function(e) {
        var now = Date.now();
        if (lastTap === -1) {
            lastTap = now;
        } else if (now - lastTap < 300) {
            lastTap = -1;
            return fn.apply(this, arguments);
        } else {
            lastTap = now;
        }
    });
};

var rtouchevent = /^(?:touchstart|touchend|touchcancel|touchmove)$/;
util.isTouchEvent = function(e) {
    return rtouchevent.test(e.type);
};

module.exports = util;
