var util = util || {};
(function() { "use strict";

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

util.combineClasses = function(a, b) {
    if (!a) return b;
    return a + " " + b;
};

util.modifierKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'meta' : 'ctrl';

util.modifierKeyProp = util.modifierKey + "Key";

util.arrayEquals = function(arrayA, arrayB) {
    if (arrayA === arrayB) return true;
    if (arrayA.length !== arrayB.length) return false;
    for (var i = 0; i < arrayA.length; ++i) {
        if (arrayA[i] !== arrayB[i]) {
            return false;
        }
    }
    return true;
};

util.toFunction = function(value) {
    if (typeof value === "function") return value;
    return function() {
        return value;
    };
};

util.onCapture = function onCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.addEventListener(eventName, handler, true);
    });
};

util.offCapture = function offCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.removeEventListener(eventName, handler, true);
    });
};

util.fastClickEventHandler = function fastClickEventHandler(fn) {
    return function(e) {
        var touched = e.type === "touchstart" && (e.touches ? e.touches.length === 1 : true);
        var clicked = e.type === "mousedown" && e.which === 1;
        if (touched || clicked) {
            return fn.call(this, e, clicked, touched);
        }
    }
};

util.bits = (function() {
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

util.bit = function(number, offset) {
    return util.bits(number, offset, 1) === 1;
};

util.synchInt32 = function(bytes, offset) {
    return (((bytes.charCodeAt(offset + 0) & 0xFF) & 0x7f) << 21) |
           (((bytes.charCodeAt(offset + 1) & 0xFF) & 0x7f) << 14) |
           (((bytes.charCodeAt(offset + 2) & 0xFF) & 0x7f) << 7)  |
            ((bytes.charCodeAt(offset + 3) & 0xFF) & 0x7f);
};

util.int24BE = function(bytes, offset) {
    return ((bytes.charCodeAt(offset + 0) & 0xFF) << 16) |
           ((bytes.charCodeAt(offset + 1) & 0xFF) << 8) |
           (bytes.charCodeAt(offset + 2) & 0xFF);
};

util.int32BE = function(bytes, offset) {
    return ((bytes.charCodeAt(offset + 0) & 0xFF) << 24) |
           ((bytes.charCodeAt(offset + 1) & 0xFF) << 16) |
           ((bytes.charCodeAt(offset + 2) & 0xFF) << 8) |
           (bytes.charCodeAt(offset + 3) & 0xFF);
};

util.int16BE = function(bytes, offset) {
    return ((bytes.charCodeAt(offset + 0) & 0xFF) << 8) |
           (bytes.charCodeAt(offset + 1) & 0xFF);
};

util.int32LE = function(bytes, offset) {
    return ((bytes.charCodeAt(offset + 3) & 0xFF) << 24) |
           ((bytes.charCodeAt(offset + 2) & 0xFF) << 16) |
           ((bytes.charCodeAt(offset + 1) & 0xFF) << 8) |
           (bytes.charCodeAt(offset + 0) & 0xFF);
};

util.int16LE = function(bytes, offset) {
    return ((bytes.charCodeAt(offset + 1) & 0xFF) << 8) |
           (bytes.charCodeAt(offset + 0) & 0xFF);
};

(function() {
    const LITTLE_ENDIAN = 0;
    const BIG_ENDIAN = 1;

    const a = new Uint16Array(1);
    const b = new Uint8Array(a.buffer);
    b[0] = 0xFF;

    const endianess = a[0] === 0xFF ? LITTLE_ENDIAN : BIG_ENDIAN;

    const f32 = new Float32Array(1);
    const b4 = new Uint8Array(f32.buffer);
    const i32 = new Int32Array(f32.buffer);
    const ui32 = new Uint32Array(f32.buffer);
    const f64 = new Float64Array(1);
    const b8 = new Uint8Array(f64.buffer);

    if (endianess === LITTLE_ENDIAN) {
        util.float32BE = function(bytes, offset) {
            b4[0] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b4[1] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b4[2] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b4[3] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f32[0];
        };
    } else {
        util.float32BE = function(bytes, offset) {
            b4[3] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b4[2] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b4[1] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b4[0] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f32[0];
        };
    }

    if (endianess === LITTLE_ENDIAN) {
        util.float32BEString = function(num) {
            f32[0] = num;
            return String.fromCharCode(b4[3]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[0]);
        };
    } else {
        util.float32BEString = function(num) {
            f32[0] = num;
            return String.fromCharCode(b4[0]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[3]);
        };
    }

    if (endianess === LITTLE_ENDIAN) {
        util.int32BEString = function(num) {
            i32[0] = num | 0;
            return String.fromCharCode(b4[3]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[0]);
        };
    } else {
        util.int32BEString = function(num) {
            i32[0] = num | 0;
            return String.fromCharCode(b4[0]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[3]);
        };
    }

    if (endianess === LITTLE_ENDIAN) {
        util.uint32BEString = function(num) {
            ui32[0] = num >>> 0;
            return String.fromCharCode(b4[3]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[0]);
        };
    } else {
        util.uint32BEString = function(num) {
            ui32[0] = num >>> 0;
            return String.fromCharCode(b4[0]) +
                   String.fromCharCode(b4[1]) +
                   String.fromCharCode(b4[2]) +
                   String.fromCharCode(b4[3]);
        };
    }

    if (endianess === LITTLE_ENDIAN) {
        util.float32LE = function(bytes, offset) {
            b4[3] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b4[2] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b4[1] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b4[0] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f32[0];
        };
    } else {
        util.float32LE = function(bytes, offset) {
            b4[0] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b4[1] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b4[2] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b4[3] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f32[0];
        };
    }

    if (endianess === LITTLE_ENDIAN) {
        util.float64BE = function(bytes, offset) {
            b8[0] = (bytes.charCodeAt(offset + 7) & 0xFF);
            b8[1] = (bytes.charCodeAt(offset + 6) & 0xFF);
            b8[2] = (bytes.charCodeAt(offset + 5) & 0xFF);
            b8[3] = (bytes.charCodeAt(offset + 4) & 0xFF);
            b8[4] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b8[5] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b8[6] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b8[7] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f64[0];
        };
    } else {
        util.float64BE = function(bytes, offset) {
            b8[7] = (bytes.charCodeAt(offset + 7) & 0xFF);
            b8[6] = (bytes.charCodeAt(offset + 6) & 0xFF);
            b8[5] = (bytes.charCodeAt(offset + 5) & 0xFF);
            b8[4] = (bytes.charCodeAt(offset + 4) & 0xFF);
            b8[3] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b8[2] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b8[1] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b8[0] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f64[0];
        };
    }
    if (endianess === LITTLE_ENDIAN) {
        util.float64LE = function(bytes, offset) {
            b8[7] = (bytes.charCodeAt(offset + 7) & 0xFF);
            b8[6] = (bytes.charCodeAt(offset + 6) & 0xFF);
            b8[5] = (bytes.charCodeAt(offset + 5) & 0xFF);
            b8[4] = (bytes.charCodeAt(offset + 4) & 0xFF);
            b8[3] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b8[2] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b8[1] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b8[0] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f64[0];
        };
    } else {
        util.float64LE = function(bytes, offset) {
            b8[0] = (bytes.charCodeAt(offset + 7) & 0xFF);
            b8[1] = (bytes.charCodeAt(offset + 6) & 0xFF);
            b8[2] = (bytes.charCodeAt(offset + 5) & 0xFF);
            b8[3] = (bytes.charCodeAt(offset + 4) & 0xFF);
            b8[4] = (bytes.charCodeAt(offset + 3) & 0xFF);
            b8[5] = (bytes.charCodeAt(offset + 2) & 0xFF);
            b8[6] = (bytes.charCodeAt(offset + 1) & 0xFF);
            b8[7] = (bytes.charCodeAt(offset + 0) & 0xFF);
            return f64[0];
        };
    }
})();

util.truncateUp = function(num) {
    return num < 0 ? Math.floor(num) : Math.ceil(num);
};

util.toTimeString = function(secs) {
    if (!isFinite(secs) || secs == null) return "";
    secs = Math.round(secs)
    var days, hours, minutes, seconds;

    days = (secs / 86400) >> 0;
    hours = (secs % 86400 / 3600) >> 0;
    minutes = (secs % 3600 / 60) >> 0;
    seconds = (secs % 60);
    seconds = seconds < 10 ? "0" + seconds : seconds;
    minutes = minutes < 10 ? "0" + minutes : minutes;
    hours = hours && hours < 10 ? "0" + hours : hours;

    return "" + (days ? days + " - " : "") + (hours ? hours + ":" : "") +
        minutes + ":" + seconds;
};

util.shortNumber = function(num) {
    num = +num;
    var sign = num < 0 ? "-" : "";
    num = Math.abs(num);
    if (num < 1e3) return sign + num + "";
    if (num < 1e6) return sign + Math.round(num / 1e3).toFixed(1) + "k";
    if (num < 1e9) return sign + Math.round(num / 1e6).toFixed(1) + "m";
    if (num < 1e12) return sign + Math.round(num / 1e9).toFixed(1) + "g";
    return sign + num.toExponential(0);
};

util.perfectScrollBarPostUpdate = function(node) {
    var st = node.scrollTop;
    var sl = node.scrollLeft;
    node.scrollTop = 0;
    node.scrollLeft = 0;
    var scrollEvent = document.createEvent("Event");
    scrollEvent.initEvent('scroll', true, true);
    node.dispatchEvent(scrollEvent);
    node.scrollTop = st;
    node.scrollLeft = sl;
    var scrollEvent = document.createEvent("Event");
    scrollEvent.initEvent('scroll', true, true);
    node.dispatchEvent(scrollEvent);
};

util.scrollUp = function(node, amount) {
    node.scrollTop = node.scrollTop - amount;
    var scrollEvent = document.createEvent("Event");
    scrollEvent.initEvent('scroll', true, true);
    node.dispatchEvent(scrollEvent);
};

util.scrollDown = function(node, amount) {
    node.scrollTop = node.scrollTop + amount;
    var scrollEvent = document.createEvent("Event");
    scrollEvent.initEvent('scroll', true, true);
    node.dispatchEvent(scrollEvent);
};

util.scrollIntoView = {
    alignMiddle: function(node, parentNode) {
        if (!node || !parentNode) {
            return;
        }
        var nodeOffset = node.offsetTop,
            parentHeight = parentNode.offsetHeight,
            parentScrollTop = parentNode.scrollTop,
            dif, mid;

        dif = nodeOffset - (parentHeight / 2);

        if (dif < 0) {
            dif = 0;
        }
        parentNode.scrollTop = dif;
        var scrollEvent = document.createEvent("Event");
        scrollEvent.initEvent('scroll', true, true);
        parentNode.dispatchEvent(scrollEvent);
    }
};

util.inherits = function(Child, Parent) {
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

util.throttle = function(callback, delay) {
    var timeridto = 0;

    return function() {
        var args = Array.prototype.slice.call(arguments),
            $this = this;
        clearTimeout(timeridto);
        timeridto = setTimeout(function() {
            callback.apply($this, args);
        }, delay);
    };
};

util.callableEveryMs = function(callback, delay) {
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
    }
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

util.IDENTITY = function(v) { return v; }

util.buildConsecutiveRanges = function(array, callback) {
    if (typeof callback !== "function") callback = util.IDENTITY;
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
util.buildInverseRanges = function(array, endIndex) {
    var inverseRanges = [];
    var ranges = util.buildConsecutiveRanges(array);
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

util.indexMapper = function(track) {
    return track.getIndex();
};

util.TRACK_SORTER = function(a, b) {
    return a.getIndex() - b.getIndex();
};

util.SORT_NUMBER_ASC = function (a, b) {
    return a - b;
};

util.once = function(eventTarget, eventName, handler) {
    eventTarget.addEventListener(eventName, function handle() {
        try {
            eventTarget.removeEventListener(eventName, handle, false);
        } finally {
            handler.apply(this, arguments);
        }


    }, false);
};

util.readAsBinaryString = function(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        util.once(reader, "load", function(e) {
            resolve(e.target.result);
            reader = null;
        });
        util.once(reader, "error", function() {
            reject(new FileError(this.error));
            reader = null;
        });
        reader.readAsBinaryString(file);
    });
};

util.readAsArrayBuffer = function(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        util.once(reader, "load", function(e) {
            resolve(e.target.result);
            reader = null;
        });
        util.once(reader, "error", function() {
            reject(new FileError(this.error));
            reader = null;
        });
        reader.readAsArrayBuffer(file);
    });
};

util.subClassError = function(name, additional) {
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

util.formatTagString = function(str) {
    return str.replace(/[\u0000-\u001F]+/g, "").trim();
};

util.indexOfCodePoint = function(string, codePoint, start) {
    if (start === undefined) start = 0;
    for (var i = start; i < string.length; ++i) {
        if (string.charCodeAt(i) === codePoint) {
            return i;
        }
    }
    return -1;
};

util.capitalize = function(str) {
    if (!str.length) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

util.unicode = {};

util.unicode.characterCategories = {
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

util.unicode.alphaNumericFilteringPattern = new RegExp("[^" + util.unicode.characterCategories.numbers +
                                                     util.unicode.characterCategories.letters + "]+", "g");
util.unicode.separateWordsPattern = new RegExp("["+util.unicode.characterCategories.wordSeparator+"]+", "g");

util.unicode.decodeUnicodeEncodedBinaryString = (function() {
    var LITTLE_ENDIAN = 0;
    var BIG_ENDIAN = 1;

    return function(str, bigEndian) {
        var i = 0,
            len = str.length;
        var endianess = LITTLE_ENDIAN;

        if (bigEndian !== true) {
            if (len >= 2) {
                var bom = (str.charCodeAt(0) << 8) |
                    str.charCodeAt(1);
                if (bom === 0xFFFE) {
                    endianess = LITTLE_ENDIAN;
                    i = 2; //Skip bom
                } else if (bom === 0xFEFF) {
                    endianess = BIG_ENDIAN;
                    i = 2; //Skip bom
                } else {
                    endianess = LITTLE_ENDIAN;
                }
            } else {
                endianess = LITTLE_ENDIAN;
            }
        } else {
            endianess = BIG_ENDIAN;
        }
        var codePoints = new Array(Math.ceil(str.length / 2)),
            codePoint,
            low, high,
            byte;
        codePoints.length = 0;
        if (endianess === BIG_ENDIAN) {
            for (; i < len; i += 2) {
                if (i + 1 >= len) {
                    codePoint = 0xFFFD;
                } else {
                    codePoint = (str.charCodeAt(i) << 8) |
                        str.charCodeAt(i + 1);
                    //Lead surrogate 0xD800..0xDBFF
                    if (0xD800 <= codePoint && codePoint <= 0xDBFF) {
                        if (i + 3 >= len) {
                            codePoint = 0xFFFD;
                        } else {
                            high = codePoint;
                            //peek low surrogate
                            low = (str.charCodeAt(i + 2) << 8) |
                                str.charCodeAt(i + 3);
                            //Trail surrogate 0xDC00..0xDFFF
                            if (0xDC00 <= low && low <= 0xDFFF) {
                                i += 2; //Valid surrogate pair so ignore the upcoming low
                                codePoint = ((high - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
                                if (codePoint <= 0x10FFFF) {
                                    codePoints.push(String.fromCharCode(high, low));
                                } else {
                                    continue;
                                }
                            }
                        }
                    }
                }
                if (!(0xD800 <= codePoint && codePoint <= 0xDFFF) && codePoint !== 0xFFFD) {
                    codePoints.push(String.fromCharCode(codePoint));
                }
            }
        } else {
            for (; i < len; i += 2) {
                if (i + 1 >= len) {
                    codePoint = 0xFFFD;
                } else {
                    codePoint = str.charCodeAt(i) |
                        (str.charCodeAt(i + 1) << 8);
                    //Lead surrogate 0xD800..0xDBFF
                    if (0xD800 <= codePoint && codePoint <= 0xDBFF) {
                        if (i + 3 >= len) {
                            codePoint = 0xFFFD;
                        } else {
                            high = codePoint;
                            //peek low surrogate
                            low = str.charCodeAt(i + 2) |
                                (str.charCodeAt(i + 3) << 8);
                            //Trail surrogate 0xDC00..0xDFFF
                            if (0xDC00 <= low && low <= 0xDFFF) {
                                i += 2; //Valid surrogate pair so ignore the upcoming low
                                codePoint = ((high - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
                                if (codePoint <= 0x10FFFF) {
                                    codePoints.push(String.fromCharCode(high, low));
                                } else {
                                    continue;
                                }
                            }
                        }
                    }
                }
                if (!(0xD800 <= codePoint && codePoint <= 0xDFFF) && codePoint !== 0xFFFD) {
                    codePoints.push(String.fromCharCode(codePoint));
                }
            }
        }
        return codePoints.join("");
    };
})();

util.unicode.decodeUtf8EncodedBinaryString = function(str) {
    //Decode unicode code points from utf8 encoded binarystring
    var codePoints = new Array(str.length),
        ch2, ch3, ch4,
        i = 0,
        byte, codePoint;
    codePoints.length = 0;

    while (!isNaN(byte = str.charCodeAt(i++))) {
        if ((byte & 0xF8) === 0xF0) {
            codePoint = ((byte & 0x7) << 18) |
                (((ch2 = str.charCodeAt(i++)) & 0x3F) << 12) |
                (((ch3 = str.charCodeAt(i++)) & 0x3F) << 6) |
                ((ch4 = str.charCodeAt(i++)) & 0x3F);

            if (!(0xFFFF < codePoint && codePoint <= 0x10FFFF)) {
                //Overlong sequence
                codePoint = 0xFFFD;
            } else if (
                (ch2 & 0xC0) !== 0x80 || //must be 10xxxxxx
                (ch3 & 0xC0) !== 0x80 || //must be 10xxxxxx
                (ch4 & 0xC0) !== 0x80 //must be 10xxxxxx
            ) {
                codePoint = 0xFFFD;
            }


            if (codePoint === 0xFFFD) {
                i -= 3; //Backtrack
            }

        } else if ((byte & 0xF0) === 0xE0) {
            codePoint = ((byte & 0xF) << 12) |
                (((ch2 = str.charCodeAt(i++)) & 0x3F) << 6) |
                ((ch3 = str.charCodeAt(i++)) & 0x3F);
            //Check for legit 0xFFFD
            if (codePoint !== 0xFFFD) {
                if (!(0x7FF < codePoint && codePoint <= 0xFFFF)) {
                    //Overlong sequence
                    codePoint = 0xFFFD;
                } else if (
                    (ch2 & 0xC0) !== 0x80 || //must be 10xxxxxx
                    (ch3 & 0xC0) !== 0x80 //must be 10xxxxxx
                ) {
                    codePoint = 0xFFFD;
                }

                if (codePoint === 0xFFFD) {
                    i -= 2; //Backtrack
                }
                //Ignore initial bom
                if (codePoint === 0xFEFF && i === 3) {
                    continue;
                }
            }
        } else if ((byte & 0xE0) === 0xC0) {
            codePoint = ((byte & 0x1F) << 6) |
                (((ch2 = str.charCodeAt(i++)) & 0x3F));
            if (!(0x7F < codePoint && codePoint <= 0x7FF)) {
                //Overlong sequence
                codePoint = 0xFFFD;
            } else if (
                (ch2 & 0xC0) !== 0x80 //must be 10xxxxxx
            ) {
                codePoint = 0xFFFD;
            }

            if (codePoint === 0xFFFD) {
                i--; //Backtrack
            }
        } else if ((byte & 0x80) === 0x00) { //must be 0xxxxxxx
            codePoint = (byte & 0x7F);
        } else {
            codePoint = 0xFFFD;
        }

        if (codePoint !== 0xFFFD) {
            codePoints.push(String.fromCharCode(codePoint));
        }

    }
    return codePoints.join("");
};

util.getLongestTransitionDuration = function(node) {
    var $node = $(node);
    var prop = $node.css("transitionDuration");
    if (+!prop) return 0;
    return prop.split(",").reduce(function(max, cur) {
        return Math.max(max, parseFloat(cur));
    }, 0) * 1000;
};

util.stripBinaryBom = function(str) {
    return str.replace(/^(\xff\xfe|\xfe\xff)/, "");
};

util.IDBPromisify = function(ee) {
    return new Promise(function(resolve, reject) {
        ee.onerror = function(event) {
            reject(event.target.transaction.error);
        };
        ee.onsuccess = function(event) {
            resolve(event.target.result);
        };
        ee.oncomplete = resolve;
    })
};

util.documentHidden = (function() {
    if (typeof document === "undefined") return;

    var prefix = ["h", "mozH", "msH", "webkitH"].reduce(function(prefix, curr) {
        if (prefix) return prefix;
        return (curr + "idden") in document ? curr : prefix;
    }, null);
    var prop = prefix + "idden";
    var eventName = prefix.slice(0, -1) + "visibilitychange";

    var ret = new EventEmitter();
    ret.setMaxListeners(255);
    ret.value = function() {
        return document[prop];
    };

    document.addEventListener(eventName, function() {
        ret.emit("change");
    }, false);

    return ret;
})();

})();
