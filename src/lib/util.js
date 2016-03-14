"use strict";

import Promise from "bluebird";

var FunctionBind = Function.prototype.bind;
Function.prototype.bind = function(ctx) {
    if (arguments.length > 1) {
        return FunctionBind.apply(this, arguments);
    }
    var fn = this;
    return function() {
        return fn.apply(ctx, arguments);
    };
};

if (typeof Math.denormz !== "function") {
    Object.defineProperty(Math, "denormz", {
        value: (function() {
            const i16 = new Uint16Array(1);
            const i8 = new Uint8Array(i16.buffer);
            i8[0] = 0xFF;
            const HIGH_INDEX = i16[0] === 0xFF ? 1 : 0;

            const f64 = new Float64Array(1);
            const i32 = new Int32Array(f64.buffer);

            return function MathDenormz(x) {
                f64[0] = x;
                return (i32[HIGH_INDEX] & 0x7ff00000) === 0 ? 0 : x;
            };
        })()
    });
}


if (typeof Math.fdzround !== "function") {
    Object.defineProperty(Math, "fdzround", {
        value: (function() {
            const f32 = new Float32Array(1);
            const i32 = new Int32Array(f32.buffer);

            return function MathFdzround(x) {
                x = Math.fround(x);
                f32[0] = x;
                return (i32[0] & 0x7f800000) === 0 ? 0 : x;
            };
        })()
    });
}

if (typeof Math.gcd !== "function") {
    Object.defineProperty(Math, "gcd", {
        value: function gcd(a, b) {
            if (b === 0) {
                return a;
            }

            return gcd(b, a % b);
        }
    });
}

export const queryString = function(obj) {
    return Object.keys(obj).map(function(key) {
        return key + "=" + obj[key];
    }).join("&");
};

export const combineClasses = function(a, b) {
    if (!a) return b;
    return a + " " + b;
};

export const modifierKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'meta' : 'ctrl';

export const modifierKeyProp = modifierKey + "Key";

export const arrayEquals = function(arrayA, arrayB) {
    if (arrayA === arrayB) return true;
    if (arrayA.length !== arrayB.length) return false;
    for (var i = 0; i < arrayA.length; ++i) {
        if (arrayA[i] !== arrayB[i]) {
            return false;
        }
    }
    return true;
};

export const toFunction = function(value) {
    if (typeof value === "function") return value;
    return function() {
        return value;
    };
};

const rInput = /textarea|input|select/i;
const rTextInput = /^(?:text|search|tel|url|email|password|number)$/i;
export const isTextInputNode = function(node) {
    if (rInput.test(node.nodeName)) {
        if (node.nodeName.toLowerCase() !== "input") {
            return true;
        }

        if (rTextInput.test(node.type)) {
            return true;
        }

        return false;
    } else if (node.isContentEditable) {
        return true;
    }
    return false;
};

export const onCapture = function onCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.addEventListener(eventName, handler, true);
    });
};

export const offCapture = function offCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.removeEventListener(eventName, handler, true);
    });
};

export const onBubble = function onCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.addEventListener(eventName, handler, false);
    });
};

export const offBubble = function offCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.removeEventListener(eventName, handler, false);
    });
};

const bits = (function() {
    const masks = new Int32Array([0x0,
                                  0x1, 0x3, 0x7, 0xF,
                                  0x1F, 0x3F, 0x7F, 0xFF,
                                  0x1FF, 0x3FF, 0x7FF, 0xFFF,
                                  0x1FFF, 0x3FFF, 0x7FFF, 0xFFFF,
                                  0x1FFFF, 0x3FFFF, 0x7FFFF, 0xFFFFF,
                                  0x1FFFFF, 0x3FFFFF, 0x7FFFFF, 0xFFFFFF,
                                  0x1FFFFFF, 0x3FFFFFF, 0x7FFFFFF, 0xFFFFFFF,
                                  0x1FFFFFFF, 0x3FFFFFFF, 0x7FFFFFFF, 0xFFFFFFFF]);

    return function(number, offset, amount) {
        return (number >>> offset) & masks[amount];
    };
})();

export const readBit = function(number, offset) {
    return bits(number, offset, 1) === 1;
};

export const truncateUp = function(num) {
    return num < 0 ? Math.floor(num) : Math.ceil(num);
};

export const toTimeString = function(secs) {
    if (!isFinite(secs) || secs == null) return "";
    var sign = secs < 0 ? -1 : 1;
    secs = Math.floor(Math.abs(secs));
    var days, hours, minutes, seconds;

    days = (secs / 86400) >> 0;
    hours = (secs % 86400 / 3600) >> 0;
    minutes = (secs % 3600 / 60) >> 0;
    seconds = (secs % 60);
    seconds = seconds < 10 ? "0" + seconds : seconds;
    minutes = minutes < 10 ? "0" + minutes : minutes;
    hours = hours && hours < 10 ? "0" + hours : hours;

    return (sign === -1 ? "-" : "") + (days ? days + " - " : "") + (hours ? hours + ":" : "") +
        minutes + ":" + seconds;
};

export const shortNumber = function(num) {
    num = +num;
    var sign = num < 0 ? "-" : "";
    num = Math.abs(num);
    if (num < 1e3) return sign + num + "";
    if (num < 1e6) return sign + Math.round(num / 1e3).toFixed(1) + "k";
    if (num < 1e9) return sign + Math.round(num / 1e6).toFixed(1) + "m";
    if (num < 1e12) return sign + Math.round(num / 1e9).toFixed(1) + "g";
    return sign + num.toExponential(0);
};

export const inherits = function(Child, Parent) {
    var hasProp = {}.hasOwnProperty;

    function T() {
        this.constructor = Child;
        this.constructor$ = Parent;
        for (var propertyName in Parent.prototype) {
            if (hasProp.call(Parent.prototype, propertyName) &&
                propertyName.charAt(propertyName.length-1) !== "$"
           ) {
                this[propertyName + "$"] = Parent.prototype[propertyName];
            }
        }
    }
    T.prototype = Parent.prototype;
    Child.prototype = new T();
    return Child.prototype;
};

export const throttle = function(callback, delay) {
    var timerId = -1;
    var callId = 0;

    return function() {
        if (timerId !== -1) {
            clearTimeout(timerId);
            timerId = -1;
        }
        var myCallId = ++callId;
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i) {
            args[i] = arguments[i];
        }
        var self = this;

        timerId = setTimeout(function() {
            if (callId !== myCallId) return;
            callId = 0;
            timerId = -1;
            callback.apply(self, args);
        }, delay);
    };
};

export const debounce = function(callback, delay) {
    var lastCall = 0;

    return function() {
        var now = Date.now();
        var elapsed = now - lastCall;

        if (elapsed >= delay) {
            lastCall = now;
            return callback.apply(this, arguments);
        }
    };
};

export const callableEveryMs = function(callback, delay) {
    var lastCall = 0;

    return function() {
        var now = Date.now();

        if (now - lastCall > delay) {
            lastCall = now;
            return callback.apply(this, arguments);
        }
    };
};

if (typeof String.prototype.htmlEncode !== "function") {
    String.prototype.htmlEncode = (function() {
        var UNESC_DQ = new RegExp('"', "g");
        return function() {
            var div = document.createElement("DIV"),
                ret, str = this.toString();
            div.innerText = div.textContent = str;
            ret = div.innerHTML;
            return ret.replace(UNESC_DQ, "&quot;");
        };
    })();
}

if (typeof Array.prototype.first !== "function") {
    Array.prototype.first = function() {
        if (this.length > 0) {
            return this[0];
        }
    };
}

if (typeof Array.prototype.last !== "function") {
    Array.prototype.last = function() {
        var len = this.length;
        if (len > 0)  {
            return this[len - 1];
        }
    };
}

if (typeof Math.log10 !== "function") {
    Math.log10 = function(v) {
        return Math.log(v) * Math.LOG10E;
    };
}

if (typeof Math.log2 !== "function") {
    Math.log2 = function(v) {
        return Math.log(v) * Math.LOG2E;
    };
}

Array.prototype.toKeysObj = function() {
    var i = 0,
        l = this.length,
        ret = {};
    for (i = 0; i < l; ++i) {
        ret[this[i]] = null;
    }
    return ret;
};

export const IDENTITY = function(v) { return v; };

export const buildConsecutiveRanges = function(array, callback) {
    if (typeof callback !== "function") callback = IDENTITY;
    if (!array.length) return [];
    if (array.length === 1) return [[array[0]]];
    var ranges = [];
    var prev = array[0];
    var currentRange = [prev];

    for (var i = 1; i < array.length; ++i) {
        var currentValue = callback(array[i]);
        var previousValue = callback(prev);
        if (currentValue === previousValue) continue;
        if (currentValue - 1 !== previousValue) {
            ranges.push(currentRange);
            currentRange = [array[i]];
        } else {
            currentRange.push(array[i]);
        }
        prev = array[i];
    }
    ranges.push(currentRange);
    return ranges;
};

// e.g. Input: [2,3,4], 8
//      Output: [[0, 1], [5, 8]]
//
//      Input: [0, 1, 2, 4, 5, 10], 1000
//      Output: [[3, 3], [6,9], [11, 1000]]
export const buildInverseRanges = function(array, endIndex) {
    var inverseRanges = [];
    var ranges = buildConsecutiveRanges(array);
    if (!ranges.length) {
        return [[0, endIndex]];
    }
    var currentStart = ranges.first().first() === 0 ? -1 : 0;
    var currentEnd = -1;

    ranges.forEach(function(range) {
        var rangeStart = range.first();
        var rangeEnd = range.last();

        if (rangeStart === rangeEnd) {
            if (currentStart === -1) {
                currentStart = rangeEnd + 1;
            } else {
                inverseRanges.push([currentStart, rangeStart === 0 ? currentStart : rangeStart -1]);
                currentStart = rangeEnd + 1;
                currentEnd = -1;
            }
        } else if (currentStart === -1) {
            currentStart = rangeStart === 0 ? rangeEnd + 1 : rangeStart - 1;
        } else {
            inverseRanges.push([currentStart, rangeStart - 1]);
            currentStart = rangeEnd + 1;
        }
    });

    if (currentStart !== -1) {
        if (currentStart <= endIndex) {
            inverseRanges.push([currentStart, endIndex]);
        }
    } else if (currentEnd !== -1) {
        if (currentEnd <= endIndex) {
            inverseRanges.push([currentEnd, endIndex]);
        }
    }

    return inverseRanges;
};

export const indexMapper = function(track) {
    return track.getIndex();
};

export const TRACK_SORTER = function(a, b) {
    return a.getIndex() - b.getIndex();
};

export const SORT_NUMBER_ASC = function (a, b) {
    return a - b;
};

export const once = function(eventTarget, eventName, handler) {
    eventTarget.addEventListener(eventName, function handle() {
        try {
            eventTarget.removeEventListener(eventName, handle, false);
        } finally {
            handler.apply(this, arguments);
        }


    }, false);
};

export const checkSize = function(expectedSize, resultSize) {
    if (expectedSize !== resultSize) {
        var e;
        if (resultSize === 0) {
            e = new Error("file not found");
            e.name = "NotFoundError";
        } else {
            e = new Error("read failed");
            e.name = "NotReadableError";
        }
        return e;
    }
    return null;
};

export const readAsBinaryString = function(file) {
    var expectedSize = file.size;

    if (typeof FileReader !== "function") {
        return new Promise(function(resolve) {
            var reader = new FileReaderSync();
            var result = reader.readAsBinaryString(file);
            file = null;
            var e = checkSize(expectedSize, result.length);
            if (e) {
                throw e;
            } else {
                resolve(result);
            }
        });
    }
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        once(reader, "load", function(e) {
            reader = null;
            file = null;
            var result = e.target.result;
            var e = checkSize(expectedSize, result.length);
            if (e) {
                reject(e);
            } else {
                resolve(result);
            }
        });
        once(reader, "error", function() {
            reader = null;
            file = null;
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
        });
        reader.readAsBinaryString(file);
    });
};

export const readAsArrayBuffer = function(file) {
    var expectedSize = file.size;
    if (typeof FileReader !== "function") {
        return new Promise(function(resolve) {
            var reader = new FileReaderSync();
            var result = reader.readAsArrayBuffer(file);
            file = null;
            var e = checkSize(expectedSize, result.byteLength);
            if (e) {
                throw e;
            } else {
                resolve(result);
            }
        });
    }

    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        once(reader, "load", function(e) {
            reader = null;
            file = null;
            var result = e.target.result;
            var e = checkSize(expectedSize, result.byteLength);
            if (e) {
                reject(e);
            } else {
                resolve(result);
            }
        });
        once(reader, "error", function() {
            reader = null;
            file = null;
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
        });
        reader.readAsArrayBuffer(file);
    });
};

export const subClassError = function(name, additional) {
    var ret = new Function("additional", "return function "+name+"(message) {  \
        this.name = '"+name+"';                                                \
        this.message = message;                                                \
        if (Error.captureStackTrace)                                           \
            Error.captureStackTrace(this);                                     \
        else                                                                   \
            Error.call(this, message);                                         \
        if (additional) additional.apply(this, arguments);                     \
    };")(additional);
    ret.prototype = Object.create(Error.prototype);
    ret.prototype.constructor = ret;
    return ret;
};

export const formatTagString = function(str) {
    var ret = str.replace(/[\u0000-\u001F]+/g, "").trim();
    if (ret.length > 512) {
        return ret.slice(0, 512);
    }
    return ret;
};

export const indexOfCodePoint = function(string, codePoint, start) {
    if (start === undefined) start = 0;
    for (var i = start; i < string.length; ++i) {
        if (string.charCodeAt(i) === codePoint) {
            return i;
        }
    }
    return -1;
};

export const capitalize = function(str) {
    if (!str.length) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const unicode = {};

unicode.characterCategories = {
    numbers: "\u0030-\u0039\u00b2\u00b3\u00b9\u00bc-\u00be\u0660-\u0669\u06f0-\u06f9\u07c0-" +
             "\u07c9\u0966-\u096f\u09e6-\u09ef\u09f4-\u09f9\u0a66-\u0a6f\u0ae6-\u0aef\u0b66-" +
             "\u0b6f\u0b72-\u0b77\u0be6-\u0bf2\u0c66-\u0c6f\u0c78-\u0c7e\u0ce6-\u0cef\u0d66-" +
             "\u0d75\u0de6-\u0def\u0e50-\u0e59\u0ed0-\u0ed9\u0f20-\u0f33\u1040-\u1049\u1090-" +
             "\u1099\u1369-\u137c\u16ee-\u16f0\u17e0-\u17e9\u17f0-\u17f9\u1810-\u1819\u1946-" +
             "\u194f\u19d0-\u19da\u1a80-\u1a89\u1a90-\u1a99\u1b50-\u1b59\u1bb0-\u1bb9\u1c40-" +
             "\u1c49\u1c50-\u1c59\u2070\u2074-\u2079\u2080-\u2089\u2150-\u2182\u2185-\u2189" +
             "\u2460-\u249b\u24ea-\u24ff\u2776-\u2793\u2cfd\u3007\u3021-\u3029\u3038-\u303a" +
             "\u3192-\u3195\u3220-\u3229\u3248-\u324f\u3251-\u325f\u3280-\u3289\u32b1-\u32bf" +
             "\ua620-\ua629\ua6e6-\ua6ef\ua830-\ua835\ua8d0-\ua8d9\ua900-\ua909\ua9d0-\ua9d9" +
             "\ua9f0-\ua9f9\uaa50-\uaa59\uabf0-\uabf9\uff10-\uff19",

    letters: "\u0041-\u005a\u0061-\u007a\u00aa\u00b5\u00ba\u00c0-\u00d6\u00d8-\u00f6\u00f8-" +
             "\u02c1\u02c6-\u02d1\u02e0-\u02e4\u02ec\u02ee\u0370-\u0374\u0376\u0377\u037a-" +
             "\u037d\u037f\u0386\u0388-\u038a\u038c\u038e-\u03a1\u03a3-\u03f5\u03f7-\u0481" +
             "\u048a-\u052f\u0531-\u0556\u0559\u0561-\u0587\u05d0-\u05ea\u05f0-\u05f2\u0620-" +
             "\u064a\u066e\u066f\u0671-\u06d3\u06d5\u06e5\u06e6\u06ee\u06ef\u06fa-\u06fc\u06ff" +
             "\u0710\u0712-\u072f\u074d-\u07a5\u07b1\u07ca-\u07ea\u07f4\u07f5\u07fa\u0800-" +
             "\u0815\u081a\u0824\u0828\u0840-\u0858\u08a0-\u08b4\u0904-\u0939\u093d\u0950" +
             "\u0958-\u0961\u0971-\u0980\u0985-\u098c\u098f\u0990\u0993-\u09a8\u09aa-\u09b0" +
             "\u09b2\u09b6-\u09b9\u09bd\u09ce\u09dc\u09dd\u09df-\u09e1\u09f0\u09f1\u0a05-" +
             "\u0a0a\u0a0f\u0a10\u0a13-\u0a28\u0a2a-\u0a30\u0a32\u0a33\u0a35\u0a36\u0a38\u0a39" +
             "\u0a59-\u0a5c\u0a5e\u0a72-\u0a74\u0a85-\u0a8d\u0a8f-\u0a91\u0a93-\u0aa8\u0aaa-" +
             "\u0ab0\u0ab2\u0ab3\u0ab5-\u0ab9\u0abd\u0ad0\u0ae0\u0ae1\u0af9\u0b05-\u0b0c\u0b0f" +
             "\u0b10\u0b13-\u0b28\u0b2a-\u0b30\u0b32\u0b33\u0b35-\u0b39\u0b3d\u0b5c\u0b5d" +
             "\u0b5f-\u0b61\u0b71\u0b83\u0b85-\u0b8a\u0b8e-\u0b90\u0b92-\u0b95\u0b99\u0b9a" +
             "\u0b9c\u0b9e\u0b9f\u0ba3\u0ba4\u0ba8-\u0baa\u0bae-\u0bb9\u0bd0\u0c05-\u0c0c" +
             "\u0c0e-\u0c10\u0c12-\u0c28\u0c2a-\u0c39\u0c3d\u0c58-\u0c5a\u0c60\u0c61\u0c85-" +
             "\u0c8c\u0c8e-\u0c90\u0c92-\u0ca8\u0caa-\u0cb3\u0cb5-\u0cb9\u0cbd\u0cde\u0ce0" +
             "\u0ce1\u0cf1\u0cf2\u0d05-\u0d0c\u0d0e-\u0d10\u0d12-\u0d3a\u0d3d\u0d4e\u0d5f-" +
             "\u0d61\u0d7a-\u0d7f\u0d85-\u0d96\u0d9a-\u0db1\u0db3-\u0dbb\u0dbd\u0dc0-\u0dc6" +
             "\u0e01-\u0e30\u0e32\u0e33\u0e40-\u0e46\u0e81\u0e82\u0e84\u0e87\u0e88\u0e8a\u0e8d" +
             "\u0e94-\u0e97\u0e99-\u0e9f\u0ea1-\u0ea3\u0ea5\u0ea7\u0eaa\u0eab\u0ead-\u0eb0" +
             "\u0eb2\u0eb3\u0ebd\u0ec0-\u0ec4\u0ec6\u0edc-\u0edf\u0f00\u0f40-\u0f47\u0f49-" +
             "\u0f6c\u0f88-\u0f8c\u1000-\u102a\u103f\u1050-\u1055\u105a-\u105d\u1061\u1065" +
             "\u1066\u106e-\u1070\u1075-\u1081\u108e\u10a0-\u10c5\u10c7\u10cd\u10d0-\u10fa" +
             "\u10fc-\u1248\u124a-\u124d\u1250-\u1256\u1258\u125a-\u125d\u1260-\u1288\u128a-" +
             "\u128d\u1290-\u12b0\u12b2-\u12b5\u12b8-\u12be\u12c0\u12c2-\u12c5\u12c8-\u12d6" +
             "\u12d8-\u1310\u1312-\u1315\u1318-\u135a\u1380-\u138f\u13a0-\u13f5\u13f8-\u13fd" +
             "\u1401-\u166c\u166f-\u167f\u1681-\u169a\u16a0-\u16ea\u16f1-\u16f8\u1700-\u170c" +
             "\u170e-\u1711\u1720-\u1731\u1740-\u1751\u1760-\u176c\u176e-\u1770\u1780-\u17b3" +
             "\u17d7\u17dc\u1820-\u1877\u1880-\u18a8\u18aa\u18b0-\u18f5\u1900-\u191e\u1950-" +
             "\u196d\u1970-\u1974\u1980-\u19ab\u19b0-\u19c9\u1a00-\u1a16\u1a20-\u1a54\u1aa7" +
             "\u1b05-\u1b33\u1b45-\u1b4b\u1b83-\u1ba0\u1bae\u1baf\u1bba-\u1be5\u1c00-\u1c23" +
             "\u1c4d-\u1c4f\u1c5a-\u1c7d\u1ce9-\u1cec\u1cee-\u1cf1\u1cf5\u1cf6\u1d00-\u1dbf" +
             "\u1e00-\u1f15\u1f18-\u1f1d\u1f20-\u1f45\u1f48-\u1f4d\u1f50-\u1f57\u1f59\u1f5b" +
             "\u1f5d\u1f5f-\u1f7d\u1f80-\u1fb4\u1fb6-\u1fbc\u1fbe\u1fc2-\u1fc4\u1fc6-\u1fcc" +
             "\u1fd0-\u1fd3\u1fd6-\u1fdb\u1fe0-\u1fec\u1ff2-\u1ff4\u1ff6-\u1ffc\u2071\u207f" +
             "\u2090-\u209c\u2102\u2107\u210a-\u2113\u2115\u2119-\u211d\u2124\u2126\u2128" +
             "\u212a-\u212d\u212f-\u2139\u213c-\u213f\u2145-\u2149\u214e\u2183\u2184\u2c00-" +
             "\u2c2e\u2c30-\u2c5e\u2c60-\u2ce4\u2ceb-\u2cee\u2cf2\u2cf3\u2d00-\u2d25\u2d27" +
             "\u2d2d\u2d30-\u2d67\u2d6f\u2d80-\u2d96\u2da0-\u2da6\u2da8-\u2dae\u2db0-\u2db6" +
             "\u2db8-\u2dbe\u2dc0-\u2dc6\u2dc8-\u2dce\u2dd0-\u2dd6\u2dd8-\u2dde\u2e2f\u3005" +
             "\u3006\u3031-\u3035\u303b\u303c\u3041-\u3096\u309d-\u309f\u30a1-\u30fa\u30fc-" +
             "\u30ff\u3105-\u312d\u3131-\u318e\u31a0-\u31ba\u31f0-\u31ff\u3400-\u4db5\u4e00-" +
             "\u9fd5\ua000-\ua48c\ua4d0-\ua4fd\ua500-\ua60c\ua610-\ua61f\ua62a\ua62b\ua640-" +
             "\ua66e\ua67f-\ua69d\ua6a0-\ua6e5\ua717-\ua71f\ua722-\ua788\ua78b-\ua7ad\ua7b0-" +
             "\ua7b7\ua7f7-\ua801\ua803-\ua805\ua807-\ua80a\ua80c-\ua822\ua840-\ua873\ua882-" +
             "\ua8b3\ua8f2-\ua8f7\ua8fb\ua8fd\ua90a-\ua925\ua930-\ua946\ua960-\ua97c\ua984-" +
             "\ua9b2\ua9cf\ua9e0-\ua9e4\ua9e6-\ua9ef\ua9fa-\ua9fe\uaa00-\uaa28\uaa40-\uaa42" +
             "\uaa44-\uaa4b\uaa60-\uaa76\uaa7a\uaa7e-\uaaaf\uaab1\uaab5\uaab6\uaab9-\uaabd" +
             "\uaac0\uaac2\uaadb-\uaadd\uaae0-\uaaea\uaaf2-\uaaf4\uab01-\uab06\uab09-\uab0e" +
             "\uab11-\uab16\uab20-\uab26\uab28-\uab2e\uab30-\uab5a\uab5c-\uab65\uab70-\uabe2" +
             "\uac00-\ud7a3\ud7b0-\ud7c6\ud7cb-\ud7fb\uf900-\ufa6d\ufa70-\ufad9\ufb00-\ufb06" +
             "\ufb13-\ufb17\ufb1d\ufb1f-\ufb28\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40\ufb41" +
             "\ufb43\ufb44\ufb46-\ufbb1\ufbd3-\ufd3d\ufd50-\ufd8f\ufd92-\ufdc7\ufdf0-\ufdfb" +
             "\ufe70-\ufe74\ufe76-\ufefc\uff21-\uff3a\uff41-\uff5a\uff66-\uffbe\uffc2-\uffc7" +
             "\uffca-\uffcf\uffd2-\uffd7\uffda-\uffdc",

    wordSeparator: "\x20\xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000"
};

unicode.alphaNumericFilteringPattern = new RegExp("[^ " + unicode.characterCategories.numbers +
                                                     unicode.characterCategories.letters + "]+", "g");
unicode.separateWordsPattern = new RegExp("["+unicode.characterCategories.wordSeparator+"]+", "g");

(function() {
var regexp = null;
const diacriticMappingList = [
    " ", "\u00A0",
    "0", "\u07C0",
    "A", "\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F",
    "AA", "\uA732", "AE", "\u00C6\u01FC\u01E2",
    "AO", "\uA734","AU", "\uA736","AV", "\uA738\uA73A",
    "AY", "\uA73C",
    "B", "\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0181",
    "C", "\u24b8\uff23\uA73E\u1E08\u0106\u0043\u0108\u010A\u010C\u00C7\u0187\u023B",
    "D", "\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018A\u0189\u1D05\uA779",
    "Dh", "\u00D0",
    "DZ", "\u01F1\u01C4",
    "Dz", "\u01F2\u01C5",
    "E", "\u025B\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E\u1D07",
    "F", "\uA77C\u24BB\uFF26\u1E1E\u0191\uA77B",
    "G", "\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E\u0262",
    "H", "\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D",
    "I", "\u24BE\uFF29\xCC\xCD\xCE\u0128\u012A\u012C\u0130\xCF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197",
    "J", "\u24BF\uFF2A\u0134\u0248\u0237",
    "K", "\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2",
    "L", "\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780",
    "LJ", "\u01C7",
    "Lj", "\u01C8",
    "M", "\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C\u03FB",
    "N", "\uA7A4\u0220\u24C3\uFF2E\u01F8\u0143\xD1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u019D\uA790\u1D0E",
    "NJ", "\u01CA",
    "Nj", "\u01CB",
    "O", "\u24C4\uFF2F\xD2\xD3\xD4\u1ED2\u1ED0\u1ED6\u1ED4\xD5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\xD6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\xD8\u01FE\u0186\u019F\uA74A\uA74C",
    "OE", "\u0152",
    "OI", "\u01A2",
    "OO", "\uA74E",
    "OU", "\u0222",
    "P", "\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754",
    "Q", "\u24C6\uFF31\uA756\uA758\u024A",
    "R", "\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782",
    "S", "\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784",
    "T", "\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786",
    "Th", "\u00DE",
    "TZ", "\uA728",
    "U", "\u24CA\uFF35\xD9\xDA\xDB\u0168\u1E78\u016A\u1E7A\u016C\xDC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244",
    "V", "\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245",
    "VY", "\uA760",
    "W", "\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72",
    "X", "\u24CD\uFF38\u1E8A\u1E8C",
    "Y", "\u24CE\uFF39\u1EF2\xDD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE",
    "Z", "\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762",
    "a", "\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250\u0251",
    "aa", "\uA733",
    "ae", "\u00E6\u01FD\u01E3",
    "ao", "\uA735",
    "au", "\uA737",
    "av", "\uA739\uA73B",
    "ay", "\uA73D",
    "b", "\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253\u0182",
    "c", "\uFF43\u24D2\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184",
    "d", "\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\u018B\u13E7\u0501\uA7AA",
    "dh", "\u00F0",
    "dz", "\u01F3\u01C6",
    "e", "\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u01DD",
    "f", "\u24D5\uFF46\u1E1F\u0192",
    "ff", "\uFB00",
    "fi", "\uFB01",
    "fl", "\uFB02",
    "ffi", "\uFB03",
    "ffl", "\uFB04",
    "g", "\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\uA77F\u1D79",
    "h", "\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265",
    "hv", "\u0195",
    "i", "\u24D8\uFF49\xEC\xED\xEE\u0129\u012B\u012D\xEF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131",
    "j", "\u24D9\uFF4A\u0135\u01F0\u0249",
    "k", "\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3",
    "l", "\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747\u026D",
    "lj", "\u01C9",
    "m", "\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F",
    "n", "\u24DD\uFF4E\u01F9\u0144\xF1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5\u043B\u0509",
    "nj", "\u01CC",
    "o", "\u24DE\uFF4F\xF2\xF3\xF4\u1ED3\u1ED1\u1ED7\u1ED5\xF5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\xF6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\xF8\u01FF\uA74B\uA74D\u0275\u0254\u1D11",
    "oe", "\u0153",
    "oi", "\u01A3",
    "oo", "\uA74F",
    "ou", "\u0223",
    "p", "\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755\u03C1",
    "q", "\u24E0\uFF51\u024B\uA757\uA759",
    "r", "\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783",
    "s", "\u24E2\uFF53\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B\u0282",
    "ss", "\xDF",
    "t", "\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787",
    "th", "\u00FE",
    "tz", "\uA729",
    "u", "\u24E4\uFF55\xF9\xFA\xFB\u0169\u1E79\u016B\u1E7B\u016D\xFC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289",
    "v", "\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C",
    "vy", "\uA761",
    "w", "\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73",
    "x", "\u24E7\uFF58\u1E8B\u1E8D",
    "y", "\u24E8\uFF59\u1EF3\xFD\u0177\u1EF9\u0233\u1E8F\xFF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF",
    "z", "\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763"
];

const mapping = new Uint32Array(65536);

const initialize = function() {
    if (regexp !== null) return;
    var regexpSource = "";

    for (var i = 0; i < diacriticMappingList.length; i += 2) {
        var base = diacriticMappingList[i];
        var chars = diacriticMappingList[i + 1];

        var encodedBaseValue = 0;

        for (var j = 0; j < base.length; ++j) {
            encodedBaseValue = (encodedBaseValue << 8) | (base.charCodeAt(j) & 0xFF);
        }

        for (var j = 0; j < chars.length; ++j) {
            mapping[chars.charCodeAt(j)] = encodedBaseValue;
        }

        regexpSource += chars;
    }

    regexp = new RegExp("[" + regexpSource + "]", "g");
};

const diacriticReplacer = function(theChar) {
    var encodedBaseValue = mapping[theChar.charCodeAt(0) & 0xFFFF];
    if (encodedBaseValue === 0) return theChar;

    if (encodedBaseValue <= 0xff) {
        return String.fromCharCode(encodedBaseValue);
    } else if (encodedBaseValue <= 0xffff) {
        return String.fromCharCode((encodedBaseValue & 0xFF00) >> 8,
                                   (encodedBaseValue & 0xFF));
    } else {
        return String.fromCharCode(((encodedBaseValue & 0xFF0000) >> 16),
                                  ((encodedBaseValue & 0xFF00) >> 8),
                                  (encodedBaseValue & 0xFF));
    }
};

unicode.removeDiacritics = function(string) {
    initialize();
    return string.replace(regexp, diacriticReplacer);
};
})();

export const joinAbbreviations = function(str) {
    var words = str.split(" ").filter(function(word) {
        return word.length > 0;
    });

    if (words.length > 1) {
        var singleCharWordStart = -1;
        for (var i = 0; i < words.length; ++i) {
            var word = words[i];

            if (word.length === 1) {
                if (singleCharWordStart === -1) {
                    singleCharWordStart = i;
                }
            } else if (singleCharWordStart >= 0) {
                var newWord = words.slice(singleCharWordStart, i).join("");
                words.splice(singleCharWordStart, i - singleCharWordStart, newWord);
                i -= (i - singleCharWordStart);
                singleCharWordStart = -1;

            }
        }

        if (singleCharWordStart >= 0) {
            var newWord = words.slice(singleCharWordStart).join("");
            words.splice(singleCharWordStart, words.length - singleCharWordStart, newWord);
        }
    }

    if (words.length === 1 && words[0].length <= 1) {
        return "";
    }

    return words.join(" ");
};

export const normalizeQuery = function(value) {
    value = "" + value;
    var ret = unicode.removeDiacritics(value
            .replace(unicode.separateWordsPattern, " ")
            .replace(unicode.alphaNumericFilteringPattern, ""))
        .replace(/ {2,/g, " ")
        .toLowerCase()
        .trim();

    return joinAbbreviations(ret);
};

const legacyListeners = Object.create(null);
var nextLegacyId = 0;
export const addLegacyListener = function(object, eventName, handler) {
    var id = object.__legacyId;
    if (id === undefined) {
        id = object.__legacyId = nextLegacyId++;
    }

    var eventCache = legacyListeners[eventName];

    if (!eventCache) {
        eventCache = legacyListeners[eventName] = Object.create(null);
    }

    var listeners = eventCache[id];

    if (!listeners) {
        listeners = eventCache[id] = [];
        object["on" + eventName] = function(e) {
            for (var i = 0; i < listeners.length; ++i) {
                listeners[i].call(this, e);
            }
        };
    }

    if (listeners.indexOf(handler) === -1) {
        listeners.push(handler);
    }
};

export const slugTitle = function(val) {
    return (val + "").toLowerCase().replace(/[^a-zA-Z0-9 \-_\$]/g, "")
                            .replace(/[\-_ ]/g, "-")
                            .replace(/\-+/g, "-")
                            .replace(/^\-|\-$/g, "");
};

export const removeLegacyListener = function(object, eventName, handler) {
    var eventCache = legacyListeners[eventName];

    if (!eventCache) return;

    var listeners = eventCache[object.__legacyId];

    if (!listeners) return;

    var index = listeners.indexOf(handler);

    if (index >= 0) {
        listeners.splice(index, 1);
    }
};

export const stripBinaryBom = function(str) {
    return str.replace(/^(\xff\xfe|\xfe\xff)/, "");
};

// Dom errors are not errors :'(
export const asError = function(value) {
    if (value instanceof Error) return value;
    var ret = new Error();
    ret.message = "" + (value ? value.message : value);
    return ret;
};

export const iDbPromisify = function(ee) {
    return new Promise(function(resolve, reject) {
        ee.onerror = function(event) {
            reject(asError(event.target.transaction.error || ee.error));
        };
        ee.onsuccess = function(event) {
            resolve(event.target.result);
        };
        ee.oncomplete = resolve;
    });
};

export const reverseString = (function() {
    var utf16decoder = null;
    return function (str) {
        if (utf16decoder === null) utf16decoder = new TextDecoder("utf-16");

        const l = str.length;
        if (l <= 1) return str;
        var ret = new Uint8Array(str.length * 2 + 2);
        var view = new Uint16Array(ret.buffer);
        view[0] = 0xfeff;
        const l2 = Math.ceil(l / 2);
        for (var i = 0; i < l2; ++i) {
            var lastIndex = l - 1 - i;
            view[lastIndex + 1] = str.charCodeAt(i);
            view[i + 1] = str.charCodeAt(lastIndex);
        }
        return utf16decoder.decode(view);
    };
})();

export const titleCase = function(str) {
    if (typeof str !== "string") str = "" + str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const assign = function(root) {
    root = Object(root);
    var args = [].slice.call(arguments, 1);

    for (var i = 0; i < args.length; ++i) {
        var obj = args[i];
        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var value = obj[key];
            root[key] = value;
        }
    }

    return root;
};

export const mergeObject = function(base, obj) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        base[key] = obj[key];
    }
};

export const getFirstWord = function(str) {
    for (var i = 0; i < str.length; ++i) {
        if (str.charCodeAt(i) === 0x20) {
            return str.slice(0, i);
        }
    }
    return str;
};

export const getLastWord = function(str) {
    for (var i = str.length - 1; i >= 0; --i) {
        if (str.charCodeAt(i) === 0x20) {
            return str.slice(i + 1);
        }
    }

    return str;
};
