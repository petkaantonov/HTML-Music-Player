"use strict";

import Promise from "bluebird";
import base64 from "base64-js";
import $ from "jquery";

export const setFilter = (function() {
   var div = document.createElement("div");

    if ("webkitFilter" in (div.style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.webkitFilter = value;
            } else {
                elem.css("webkitFilter", value);
            }
        };
    }

    if ("mozFilter" in (div.style)) {
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

export function reflow(elem) {
    return $(elem).each(function() {
        if (this.offsetWidth < -1000) {
            this.offsetWidth = 0;
        }
    });
}

export const getFilter = (function() {
    var div = document.createElement("div");

    if ("webkitFilter" in (div.style)) {
        return function(elem) {
            return elem.style ? elem.style.webkitFilter : elem.css("webkitFilter");
        };
    }

    if ("mozFilter" in (div.style)) {
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
    if ("transform" in (div.style)) {
        return function(elem, value) {
            if (elem.style) {
                elem.style.transform = value;
            } else {
                elem.css("transform", value);
            }
        };
    }
    if ("webkitTransform" in (div.style)) {
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
    if ("transform" in (div.style)) {
        return function(elem) {
            return elem.style ? elem.style.transform : elem.css("transform");
        };
    }
    if ("webkitTransform" in (div.style)) {
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

export function canvasToImage(canvas) {
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
}

var rafCallbacks = [];
var rafId = -1;
var rafCallback = function(now) {
    rafId = -1;
    for (var i = 0; i < rafCallbacks.length; ++i) {
        rafCallbacks[i].call(null, now);
    }
    rafCallbacks.length = 0;
};

export function changeDom(callback) {
    if (typeof callback !== "function") throw new Error("callback must be a function");
    for (var i = 0; i < rafCallbacks.length; ++i) {
        if (rafCallbacks[i] === callback) return;
    }
    rafCallbacks.push(callback);
    if (rafId === -1) {
        rafId = requestAnimationFrame(rafCallback);
    }
}

const rTextarea = /^textarea$/i;
const rInput = /^input$/i;
const rKeyboard = /^(?:date|datetime|color|datetime-local|email|month|number|password|search|tel|text|time|url|week)$/i;
export function isTextInputElement(elem) {
    return (rInput.test(elem.nodeName) && rKeyboard.test(elem.type)) ||
        rTextarea.test(elem.nodeName);
}

var rtouchevent = /^touch/;
export function isTouchEvent(e) {
    return rtouchevent.test(e.type);
}

export function preventDefault(e) {
    e.preventDefault();
}
