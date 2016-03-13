"use strict";

import Promise from "lib/bluebird";
import base64 from "lib/base64";
import $ from "lib/jquery";

export const setFilter = (function() {
   var div = document.createElement("div");

    if ("webkitFilter" in (document.createElement("div").style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.webkitFilter = value;
            } else {
                elem.css("webkitFilter", value);
            }
        };
    }

    if ("mozFilter" in (document.createElement("div").style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.mozFilter = value;
            } else {
                elem.css("mozFilter", value);
            }
        };
    }

    return function(elem, value) {
        if (elem.style) {
            elem.style.filter = value;
        } else {
            elem.css("filter", value);
        }
    };
})();

export const getFilter = (function() {
    var div = document.createElement("div");

    if ("webkitFilter" in (document.createElement("div").style)) {
        return function(elem) {
            return elem.style ? elem.style.webkitFilter : elem.css("webkitFilter");
        };
    }

    if ("mozFilter" in (document.createElement("div").style)) {
        return function(elem) {
            return elem.style ? elem.style.mozFilter : elem.css("mozFilter");
        };
    }

    return function(elem) {
        return elem.style ? elem.style.filter : elem.css("filter");
    };
})();

export const setTransform = (function() {
    var div = document.createElement("div");
    if ("transform" in (document.createElement("div").style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.transform = value;
            } else {
                elem.css("transform", value);
            }
        };
    }
    if ("webkitTransform" in (document.createElement("div").style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.webkitTransform = value;
            } else {
                elem.css("webkitTransform", value);
            }
        };
    }

    return function(elem, value) {
        if (elem.style) {
            elem.style.mozTransform = value;
        } else {
            elem.css("mozTransform", value);
        }
    };
})();

export const getTransform = (function() {
    var div = document.createElement("div");
    if ("transform" in (document.createElement("div").style)) {
        return function(elem) {
            return elem.style ? elem.style.transform : elem.css("transform");
        };
    }
    if ("webkitTransform" in (document.createElement("div").style)) {
        return function(elem) {
            return elem.style ? elem.style.webkitTransform : elem.css("webkitTransform");
        };
    }

    return function(elem) {
        return elem.style ? elem.style.mozTransform : elem.css("mozTransform");
    };
})();

export const originProperty = (function() {
    var div = document.createElement("div");
    var candidates = "webkitTransformOrigin mozTransformOrigin oTransformOrigin msTransformOrigin MSTransformOrigin transformOrigin".split(" ").filter(function(v) {
        return (v in div.style);
    });
    return candidates[candidates.length - 1];
})();

export const canvasToImage = function(canvas) {
    return new Promise(function(resolve) {
        var data = canvas.toDataURL("image/png").split("base64,")[1];
        resolve(new Blob([base64.toByteArray(data)], {type: "image/png"}));
    }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var image = new Image();
        image.src = url;
        image.blob = blob;
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
        }).finally(function() {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {}
        });
    });
};

export const bindScrollerEvents = function(target, scroller, shouldScroll, scrollbar) {
    if (!shouldScroll) shouldScroll = function() {return true; };
    var touchEventNames = "touchstart touchend touchmove touchcancel".split(" ").map(function(v) {
        return v + ".scrollerns";
    }).join(" ");
    var stopTimerId = -1;
    const clearStopTimerId = function() {
        if (stopTimerId !== -1) {
            clearTimeout(stopTimerId);
            stopTimerId = -1;
        }
    };

    const gestureArray = new Array(1);


    target.on(touchEventNames, verticalDragHandler(function onStart(gesture) {
        if (shouldScroll()) {
            clearStopTimerId();
            gestureArray[0] = gesture;
            scroller.doTouchStart(gestureArray, gesture.timeStamp);
            scrollbar.willScroll();
        }
    }, function onMove(gesture) {
        if (shouldScroll()) {
            gestureArray[0] = gesture;
            scroller.doTouchMove(gestureArray, gesture.timeStamp, gesture.originalEvent.scale);
        }
    }, function onEnd(gesture) {
        scroller.doTouchEnd(gesture.timeStamp);
        stopTimerId = setTimeout(function() {
            stopTimerId = -1;
            scrollbar.willStopScrolling();
        }, 500);
    }));

    var wheelEvents = "wheel mousewheel DOMMouseScroll".split(" ").map(function(v) {
        return v + ".scrollerns";
    }).join(" ");

    target.on(wheelEvents, mouseWheelScrollHandler(function(delta, e) {
        delta = scrollbar.determineScrollInversion(delta, e);
        scroller.scrollBy(0, delta, true);
    }));
};

export const unbindScrollerEvents = function(target, scrollbar, scroller) {
    target.off(".scrollerns");
};

export const mouseWheelScrollHandler = function(fn) {
    return function(e) {
        if (e.originalEvent) e = e.originalEvent;
        e.preventDefault();
        e.stopPropagation();

        var delta;
        if (e.deltaY !== undefined) {
            delta = -e.deltaY * (e.deltaMode === 1 ? 20 : 1);
        } else if (e.wheelDeltaY !== undefined) {
            delta = e.wheelDeltaY / 6;
        } else if (e.wheelDelta !== undefined) {
            delta = e.wheelDelta / 6;
        } else {
            delta = -e.detail * 6.67;
        }

        fn(delta * -1, e);
    };
};

var rafCallbacks = [];
var rafId = -1;
var rafCallback = function(now) {
    rafId = -1;
    for (var i = 0; i < rafCallbacks.length; ++i) {
        rafCallbacks[i].call(null, now);
    }
    rafCallbacks.length = 0;
};

export const changeDom = function(callback) {
    if (typeof callback !== "function") throw new Error("callback must be a function");
    for (var i = 0; i < rafCallbacks.length; ++i) {
        if (rafCallbacks[i] === callback) return;
    }
    rafCallbacks.push(callback);
    if (rafId === -1) {
        rafId = requestAnimationFrame(rafCallback);
    }
};

const rTextarea = /^textarea$/i;
const rInput = /^input$/i;
const rKeyboard = /^(?:date|datetime|color|datetime-local|email|month|number|password|search|tel|text|time|url|week)$/i;
export const isTextInputElement = function(elem) {
    return (rInput.test(elem.nodeName) && rKeyboard.test(elem.type)) ||
        rTextarea.test(elem.nodeName);
};

var rtouchevent = /^touch/;
export const isTouchEvent = function(e) {
    return rtouchevent.test(e.type);
};

export const preventDefault = function(e) {
    e.preventDefault();
};
