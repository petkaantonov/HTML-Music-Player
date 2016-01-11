"use strict";

const TOUCH_START = "touchstart";
const TOUCH_END = "touchend";
const TOUCH_MOVE = "touchmove";
const TOUCH_CANCEL = "touchcancel";
const TAP_TIME = 350;
const LONG_TAP_TIME = TAP_TIME * 2;
const SWIPE_THRESHOLD = 105;

const jsUtil = require("./util");

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
        var targetTouches = e.targetTouches || e.originalEvent.targetTouches;

        if (touches.length === 1 && targetTouches.length === 1) {
            copyTouchProps(e, touches[0]);
            return fn.apply(this, arguments);
        }

    };
};

const noTouchHandler = function(fn) {
    return function(e) {
        var touches = e.touches || e.originalEvent.touches;

        if (touches.length === 0) {
            touches = e.changedTouches || e.originalEvent.changedTouches;
            copyTouchProps(e, touches[0]);
            return fn.apply(this, arguments);
        }
    };
};

util.touchDownHandler = baseSingleTouchHandler;
util.touchUpHandler = noTouchHandler;
util.touchMoveHandler = baseSingleTouchHandler;

util.touchDownPinchHandler = baseSingleTouchHandler;
util.touchMovePinchHandler = baseSingleTouchHandler;

util.tapHandler = function(fn) {
    var currentTouch = null;
    var started = -1;

    return function(e) {
        var touches = e.targetTouches || e.originalEvent.targetTouches;
        var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        var targetTouches = e.targetTouches || e.originalEvent.targetTouches;

        if (e.type === TOUCH_START) {
            if (currentTouch === null && touches.length === 1 && targetTouches.length === 1) {
                currentTouch = touches[0];
                started = Date.now();
            } else if (currentTouch !== null) {
                currentTouch = null;
            }
        } else if (e.type === TOUCH_END) {
            if (currentTouch === null) return;
            for (var i = 0; i < changedTouches.length; ++i) {
                if (changedTouches[i].identifier === currentTouch.identifier) {
                    var touch = changedTouches[i];
                    var yDelta = Math.abs(touch.clientY - currentTouch.clientY);
                    var xDelta = Math.abs(touch.clientX - currentTouch.clientX);
                    var elapsed = Date.now() - started;
                    currentTouch = null;
                    started = -1;
                    if (elapsed > 30 && elapsed < TAP_TIME && xDelta <= 25 && yDelta <= 25) {
                        copyTouchProps(e, touch);
                        fn.call(this, e);
                    }
                }
            }
        }
    };
};

util.dragHandler = function(fnMove, fnEnd) {
    var currentTouch = null;
    return function(e) {
        var touches = e.targetTouches || e.originalEvent.targetTouches;
        var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        var targetTouches = e.targetTouches || e.originalEvent.targetTouches;

        if (e.type === TOUCH_START) {
            if (touches.length === 1 && targetTouches.length === 1 && currentTouch === null) {
                currentTouch = touches[0];
            } else if (currentTouch !== null) {
                copyTouchProps(e, currentTouch);
                currentTouch = null;
                fnEnd.call(this, e);
            }
        } else if (e.type === TOUCH_END) {
            if (currentTouch !== null) {
                for (var i = 0; i < changedTouches.length; ++i) {
                    if (currentTouch.identifier === changedTouches[i].identifier) {
                        copyTouchProps(e, changedTouches[i]);
                        currentTouch = null;
                        fnEnd.call(this, e);
                        break;
                    }
                }
            }
        } else if (e.type === TOUCH_MOVE) {
            if (currentTouch === null) {
                return;
            }
            var shouldMove = false;
            for (var i = 0; i < changedTouches.length; ++i) {
                if (changedTouches[i].identifier === currentTouch.identifier) {
                    for (var j = 0; j < targetTouches.length; ++j) {
                        if (targetTouches[j].identifier === currentTouch.identifier) {
                            var touch = changedTouches[i];
                            var yDelta = Math.abs(touch.clientY - currentTouch.clientY);
                            var xDelta = Math.abs(touch.clientX - currentTouch.clientX);
                            if (yDelta > 10 || xDelta > 10) {
                                currentTouch = touch;
                                shouldMove = true;
                            }
                            break;
                        }
                    }
                }
            }

            if (shouldMove) {
                copyTouchProps(e, currentTouch);
                fnMove.call(this, e);
            }
        }
    };
};

util.verticalPincerSelectionHandler = function(fn) {
    var currentATouch = null;
    var currentBTouch = null;
    var callback = fn;

    return function(e) {
        var touches = e.targetTouches || e.originalEvent.targetTouches;
        var changedTouches = e.changedTouches || e.originalEvent.changedTouches;
        var targetTouches = e.targetTouches || e.originalEvent.targetTouches;
        var selecting = false;

        if (e.type === TOUCH_START) {
            for (var i = 0; i < targetTouches.length; ++i) {
                var touch = targetTouches[i];
                for (var j = 0; j < changedTouches.length; ++j) {
                    if (touch.identifier === changedTouches[j].identifier) {
                        if (currentATouch === null) {
                            currentATouch = touch;
                        } else if (currentBTouch === null) {
                            currentBTouch = touch;
                        }
                        break;
                    }
                }
            }
            selecting = currentATouch !== null && currentBTouch !== null;
        } else if (e.type === TOUCH_END) {
            for (var i = 0; i < changedTouches.length; ++i) {
                var id = changedTouches[i].identifier;
                if (currentATouch !== null && id === currentATouch.identifier) {
                    currentATouch = null;
                } else if (currentBTouch !== null && id === currentBTouch.identifier) {
                    currentBTouch = null;
                }
            }
        } else if (e.type === TOUCH_MOVE) {
            for (var i = 0; i < targetTouches.length; ++i) {
                var touch = targetTouches[i];
                for (var j = 0; j < changedTouches.length; ++j) {
                    if (touch.identifier === changedTouches[j].identifier) {
                        if (currentATouch !== null && touch.identifier === currentATouch.identifier) {
                            currentATouch = touch;
                            selecting = currentBTouch !== null;
                        } else if (currentBTouch !== null && touch.identifier === currentBTouch.identifier) {
                            currentBTouch = touch;
                            selecting = currentATouch !== null;
                        }
                        break;
                    }
                }
            }
        }

        if (selecting) {
            var start, end;

            if (currentATouch.clientY > currentBTouch.clientY) {
                start = currentBTouch;
                end = currentATouch;
            } else {
                start = currentATouch;
                end = currentBTouch;
            }
            callback(start.clientY, end.clientY);
        }
    };
};

util.horizontalSwipeHandler = function(fn, direction) {
    var startX = -1;
    var startY = -1;
    var lastX = -1;
    var started = false;

    return util.dragHandler(function(e) {
        if (!started) {
            startX = e.clientX;
            startY = e.clientY;
            started = true;
        } else if (startX !== -1) {
            if ((direction < 0 && e.clientX - lastX > 0) ||
                (direction > 0 && e.clientX - lastX < 0)) {
                startX = -1;
            }
        }
        lastX = e.clientX;
    }, function(e) {
        if (startX !== -1 && started) {
            var diff = e.clientX - startX;
            var absDiff = Math.abs(diff);
            var yDiff = Math.abs(e.clientY - startY);
            if (absDiff > yDiff && absDiff > SWIPE_THRESHOLD) {
                if (diff < 0 && direction < 0 ||
                    diff > 0 && direction > 0) {
                    fn.call(this, e);
                }
            }
        }
        started = false;
        startX = -1;
        lastX = -1;
    });
};

util.verticalSwipeHandler = function(fn, direction) {
    var startY = -1;
    var startX = -1;
    var lastY = -1;
    var started = false;

    return util.dragHandler(function(e) {
        if (!started) {
            startY = e.clientY;
            startX = e.clientX;
            started = true;
        } else if (startY !== -1) {
            if ((direction < 0 && e.clientY - lastY > 0) ||
                (direction > 0 && e.clientY - lastY < 0)) {
                startY = -1;
            }
        }
        lastY = e.clientY;
    }, function(e) {
        if (startY !== -1 && started) {
            var diff = e.clientY - startY;
            var absDiff = Math.abs(diff);
            var xDiff = Math.abs(e.clientX - startX);
            if (absDiff > xDiff && absDiff > SWIPE_THRESHOLD) {
                if (diff < 0 && direction < 0 ||
                    diff > 0 && direction > 0) {
                    fn.call(this, e);
                }
            }
        }
        started = false;
        startY = -1;
        lastY = -1;
    });
};

util.longTapHandler = function(fn) {
    var currentTouch = null;
    var movedTouch = null;
    var timeoutId = -1;

    function clear() {
        if (timeoutId !== -1) {
            clearTimeout(timeoutId);
            timeoutId = -1;
        }
        movedTouch = null;
        currentTouch = null;
    }

    return function(e) {
        var touches = e.touches || e.originalEvent.touches;
        var targetTouches = e.targetTouches || e.originalEvent.targetTouches;
        var changedTouches = e.changedTouches || e.originalEvent.changedTouches;

        if (e.type === TOUCH_START) {
            if (touches.length === 1 && targetTouches.length === 1 && currentTouch === null) {
                currentTouch = touches[0];
                movedTouch = null;
                timeoutId = setTimeout(function() {
                    if (movedTouch !== null) {
                        var yDelta = Math.abs(movedTouch.clientY - currentTouch.clientY);
                        var xDelta = Math.abs(movedTouch.clientX - currentTouch.clientX);
                        if (xDelta > 25 || yDelta > 25) {
                            return clear();
                        }
                    }
                    var touch = movedTouch || currentTouch;
                    copyTouchProps(e, touch);
                    clear();
                    fn.call(self, e);
                }, LONG_TAP_TIME);
            } else if (currentTouch !== null) {
                clear();
            }
        } else if (e.type === TOUCH_MOVE) {
            if (currentTouch !== null) {
                for (var i = 0; i < changedTouches.length; ++i) {
                    if (changedTouches[i].identifier === currentTouch.identifier) {
                        for (var j = 0; j < targetTouches.length; ++j) {
                            if (targetTouches[j].identifier === currentTouch.identifier) {
                                movedTouch = targetTouches[j];
                                return;
                            }
                        }
                    }
                }
            }
        } else if (e.type === TOUCH_END) {
            if (currentTouch !== null) {
                for (var i = 0; i < changedTouches.length; ++i) {
                    if (changedTouches[i].identifier === currentTouch.identifier) {
                        return clear();
                    }
                }
            }
        }
    };
};

util.doubleTapHandler = function(fn) {
    var lastTap = -1;
    return util.tapHandler(function(e) {
        var now = Date.now();
        if (lastTap === -1) {
            lastTap = now;
        } else if (now - lastTap < TAP_TIME) {
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
