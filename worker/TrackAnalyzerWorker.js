(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.TrackAnalyzer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    args = Array.prototype.slice.call(arguments, 1);
    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.prototype.listenerCount = function(type) {
  if (this._events) {
    var evlistener = this._events[type];

    if (isFunction(evlistener))
      return 1;
    else if (evlistener)
      return evlistener.length;
  }
  return 0;
};

EventEmitter.listenerCount = function(emitter, type) {
  return emitter.listenerCount(type);
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],2:[function(require,module,exports){
"use strict";

const EventEmitter = require("events");
var util = module.exports;

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
        value: function(a, b) {
            if (b === 0) {
                return a;
            }

            return gcd(b, a % b);
        }
    });
}

util.queryString = function(obj) {
    return Object.keys(obj).map(function(key) {
        return key + "=" + obj[key];
    }).join("&");
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

const rInput = /textarea|input|select/i;
const rTextInput = /^(?:text|search|tel|url|email|password|number)$/i;
util.isTextInputNode = function(node) {
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
    };
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
    secs = Math.floor(secs);
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
            dif;

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

util.debounce = function(callback, delay) {
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

util.IDENTITY = function(v) { return v; };

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
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
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
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
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
    var ret = str.replace(/[\u0000-\u001F]+/g, "").trim();
    if (ret.length > 512) {
        return ret.slice(0, 512);
    }
    return ret;
};

util.internString = (function() {
    var o = {"- ": 0};
    delete o["- "];

    return function(str) {
        o[str] = true;
        var ret = Object.keys(o)[0];
        delete o[str];
        return ret;
        try {} catch(e) {} finally {}
        eval(str);
    }
})();

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
            low, high;

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

const legacyListeners = Object.create(null);
var nextLegacyId = 0;
util.addLegacyListener = function(object, eventName, handler) {
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

util.slugTitle = function(val) {
    return (val + "").toLowerCase().replace(/[^a-zA-Z0-9 \-_\$]/g, "")
                            .replace(/[\-_ ]/g, "-")
                            .replace(/\-+/g, "-")
                            .replace(/^\-|\-$/g, "");
};

util.removeLegacyListener = function(object, eventName, handler) {
    var eventCache = legacyListeners[eventName];

    if (!eventCache) return;

    var listeners = eventCache[object.__legacyId];

    if (!listeners) return;

    var index = listeners.indexOf(handler);

    if (index >= 0) {
        listeners.splice(index, 1);
    }
};

util.stripBinaryBom = function(str) {
    return str.replace(/^(\xff\xfe|\xfe\xff)/, "");
};

// Dom errors are not errors :'(
util.asError = function(value) {
    if (value instanceof Error) return value;
    var ret = new Error();
    ret.message = "" + (value ? value.message : value);
    return ret;
};

util.IDBPromisify = function(ee) {
    return new Promise(function(resolve, reject) {
        ee.onerror = function(event) {
            reject(util.asError(event.target.transaction.error || ee.error));
        };
        ee.onsuccess = function(event) {
            resolve(event.target.result);
        };
        ee.oncomplete = resolve;
    });
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
    ret.setMaxListeners(99999999);

    var blurred;

    ret.value = function() {
        if (blurred === undefined) return document[prop];
        if (blurred === true) return true;
        return document[prop];
    };

    var changed = util.throttle(function() {
        ret.emit("change");
    }, 10);

    document.addEventListener(eventName, function() {
        changed();
    }, false);

    window.addEventListener("blur", function() {
        blurred = true;
        changed();
    }, false);

    window.addEventListener("focus", function() {
        blurred = false;
        changed();
    }, false);


    return ret;
})();

},{"events":1}],3:[function(require,module,exports){
"use strict";
var realFft = (function() {
    const MAX_SIZE = 32768;
    const MAX_SIZE_LOG2 = Math.log(MAX_SIZE) * Math.LOG2E|0;
    const tables = new Array(MAX_SIZE_LOG2);
    const aux = new Array(MAX_SIZE_LOG2);

    const getTable = function(N) {
        var index = Math.log(N) * Math.LOG2E|0;

        if (tables[index] === undefined) {
            var sin = new Float64Array(N);
            var cos = new Float64Array(N);

            for (var i = 0; i < N; ++i) {
                sin[i] = Math.sin(Math.PI * 2 * i / N);
                cos[i] = Math.cos(Math.PI * 2 * i / N);
            }
            tables[index] = {cos: cos, sin: sin};
        }

        return tables[index];
    };

    const getAux = function(N) {
        const index = Math.log(N) * Math.LOG2E|0;

        if (aux[index] === undefined) {
            aux[index] = new Float64Array(N << 2);
        }

        return aux[index];
    };

    const reverseBits = function(v, count) {
        v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
        v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
        v = ((v >>> 4) & 0x0F0F0F0F) | ((v & 0x0F0F0F0F) << 4);
        v = ((v >>> 8) & 0x00FF00FF) | ((v & 0x00FF00FF) << 8);
        v = ( v >>> 16             ) | ( v               << 16);
        return v >>> (32 - count);
    };

    const split = function(array) {
        const N2 = array.length;
        const N = N2 >> 1;
        const halfN = N >> 1;
        const imOffset = N;
        const oddOffset = N2;
        const aux = getAux(N);

        aux[0] = array[0];
        aux[imOffset] = 0;
        aux[halfN] = array[halfN << 1];
        aux[imOffset + halfN] = 0;
        aux[oddOffset] = array[1];
        aux[oddOffset + imOffset] = 0;
        aux[oddOffset + halfN] = array[(halfN << 1) + 1];
        aux[oddOffset + imOffset + halfN] = 0;

        for (var k = 1; k < N; ++k) {
            var re = array[k << 1];
            var im = array[(k << 1) + 1];
            var reSym = array[(N - k) << 1];
            var imSym = array[((N - k) << 1) + 1];
            aux[k] = (re + reSym) / 2;
            aux[imOffset + k] = (im - imSym) / 2;
            aux[oddOffset + k] = (im + imSym) / 2;
            aux[oddOffset + imOffset + k] = (reSym - re) / 2;
        }
    };

    const combine = function(array) {
        const N2 = array.length;
        const N = N2 >> 1;
        const imOffset = N;
        const oddOffset = N2;
        const aux = getAux(N);

        var a = 2 * Math.pow(Math.sin(-Math.PI / N2), 2);
        var b = Math.sin(-Math.PI * 2 / N2);
        var cos = 1;
        var sin = 0;

        for (var k = 0; k < N; ++k) {
            var Xere = aux[k];
            var Xeim = aux[imOffset + k];
            var Xore = aux[oddOffset + k];
            var Xoim = aux[oddOffset + imOffset + k];
            var re = Xere + (Xore * cos) - (Xoim * sin);
            var im = Xeim + (Xore * sin) + (Xoim * cos);
            array[k] = re;
            array[imOffset + k] = im;
            var cosTmp = cos - (a * cos + b * sin);
            var sinTmp = sin + (b * cos - a * sin);
            cos = cosTmp;
            sin = sinTmp;
        }
    };

    const reorder = function(array) {
        const N = array.length >> 1;
        const log2N = Math.log(N) * Math.LOG2E|0;

        for (var i = 0; i < N; ++i) {
            var j = reverseBits(i, log2N);

            if (i < j) {
                var ii = i << 1;
                var jj = j << 1;
                var tmpR = array[ii];
                var tmpI = array[ii + 1];
                array[ii] = array[jj];
                array[ii + 1] = array[jj + 1];
                array[jj] = tmpR;
                array[jj + 1] = tmpI;
            }
        }
    };

    const fftHalf = function(array) {
        const pi2 = Math.PI * 2;
        const N = array.length >> 1;
        const table = getTable(N);
        const sinTable = table.sin;
        const cosTable = table.cos;

        for (var n = 2; n <= N; n <<= 1) {
            var halfn = n >> 1;
            var stride = N / n;

            for (var i = 0; i < N; i += n) {
                var plusHalf = i + halfn;
                var k = 0;

                for (var j = i; j < plusHalf; j++) {
                    var cos = cosTable[k];
                    var sin = sinTable[k];
                    var realIndex = j << 1;
                    var realIndexPlusHalf = (j + halfn) << 1;
                    var Tre =  array[realIndexPlusHalf] * cos + array[realIndexPlusHalf + 1] * sin;
                    var Tim = -array[realIndexPlusHalf] * sin + array[realIndexPlusHalf + 1] * cos;
                    array[realIndexPlusHalf] = array[realIndex] - Tre;
                    array[realIndexPlusHalf + 1] = array[realIndex + 1] - Tim;
                    array[realIndex] += Tre;
                    array[realIndex + 1] += Tim;

                    k += stride;
                }
            }
        }
    };

    return function(array) {
        const N2 = array.length;

        if ((N2 & (N2 >>> 1)) !== 0) {
            throw new Error("array size must be a power of two");
        }

        if (N2 > MAX_SIZE) {
            throw new Error("maximum size is: " + MAX_SIZE);
        }

        if (N2 <= 1) {
            return;
        }

        reorder(array);
        fftHalf(array);
        split(array);
        combine(array);
    };

})();

module.exports = realFft;

},{}],4:[function(require,module,exports){
"use strict";
/*
 * Ported from acousticid/chromaprint
 *
 * Chromaprint -- Audio fingerprinting toolkit
 * Copyright (C) 2010  Lukas Lalinsky <lalinsky@gmail.com>,
 * Copyright (C) 2015  Petka Antonov
 * 
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 * 
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301
 * USA
 */

var realFft = require("../lib/realfft");

const DURATION = 120;
const SAMPLE_RATE = 11025;
const MAX_FRAMES = DURATION * SAMPLE_RATE;
const OVERLAP = 1365;
const FRAMES = 4096;
const IM_OFFSET = FRAMES / 2;
const BUFFER = new Float64Array(FRAMES);
const NOTES = 12;
const ROWS = Math.ceil(((DURATION * SAMPLE_RATE) - FRAMES) / OVERLAP);
const COEFFS = new Float64Array([0.25, 0.75, 1.0, 0.75, 0.25]);
const TMP = new Float64Array(NOTES);
const IMAGE = new Float64Array(ROWS * NOTES);
const NOTE_BUFFER = new Float64Array(8 * NOTES);
const pi2 = Math.PI * 2;
const a = 2 * Math.pow(Math.sin(-Math.PI / FRAMES), 2);
const b = Math.sin(-Math.PI * 2 / FRAMES);
const NOTE_FREQUENCY_START = 10;
const NOTE_FREQUENCY_END = 1308;
const REFERENCE_FREQUENCY = 440;
const WIDTH = 16;
const BASE = REFERENCE_FREQUENCY / WIDTH;
const ALGORITHM = 1;
const BITS = new Uint8Array(960 * 33);
const BASE64 = new Uint8Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("").map(function(v) {
    return v.charCodeAt(0);
}));

const cmp = function(a, b) {
    return Math.log(1.0 + a) - Math.log(1.0 + b);
};

const area = function(x1, y1, x2, y2) {
    if (x2 < x1 || y2 < y1) {
        return 0;
    }

    var area = IMAGE[x2 * 12 + y2];
    if (x1 > 0) {
        area -= IMAGE[(x1 - 1) * 12 + y2];
        if (y1 > 0) {
            area += IMAGE[(x1 - 1) * 12 + (y1 - 1)];
        }
    }

    if (y1 > 0) {
        area -= IMAGE[x2 * 12 + (y1 - 1)];
    }

    return area;
};

const quantize = function(value, t0, t1, t2) {
    if (value < t1) {
        if (value < t0) {
            return 0;
        }
        return 1;
    } else if (value < t2) {
        // Grey coded.
        return 3;
    } else {
        // Grey coded.
        return 2;
    }
};

const classify0 = function(x, y, h, w, t0, t1, t2) {
        return quantize(cmp(area(x, y, x + w - 1, y + h - 1), 0), t0, t1, t2);
};

const classify1 = function(x, y, h, w, t0, t1, t2) {
        const h_2 = h/2|0;

        return quantize(cmp(area(x, y + h_2, x + w - 1, y + h - 1),
                   area(x, y, x + w - 1, y + h_2 - 1)), t0, t1, t2);
};

const classify2 = function(x, y, h, w, t0, t1, t2) {
        const w_2 = w/2|0;

        return quantize(cmp(area(x + w_2, y, x + w - 1, y + h - 1),
                   area(x, y, x + w_2 - 1, y + h - 1)), t0, t1, t2);
};

const classify3 = function(x, y, h, w, t0, t1, t2) {
        const h_2 = h/2|0;
        const w_2 = w/2|0;

        const a = area(x, y + h_2, x + w_2 - 1, y + h - 1) +
                area(x + w_2, y, x + w - 1, y + h_2 - 1);

        const b = area(x, y, x + w_2 - 1, y + h_2 - 1) +
                area(x + w_2, y + h_2, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};

const classify4 = function(x, y, h, w, t0, t1, t2) {
        const h_3 = h/3|0
        const w_3 = w/3|0;

        const a = area(x, y + h_3, x + w - 1, y + 2 * h_3 - 1);

        const b = area(x, y, x + w - 1, y + h_3 - 1) +
                area(x, y + 2 * h_3, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};

const classify5 = function(x, y, h, w, t0, t1, t2) {
        const h_3 = h/3|0
        const w_3 = w/3|0;

        const a = area(x + w_3, y, x + 2 * w_3 - 1, y + h - 1);

        const b = area(x, y, x + w_3 - 1, y + h - 1) +
                area(x + 2 * w_3, y, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};


function AcoustId(src, srcLength) {
    this.src = src;
    this.srcLength = srcLength;
    this.offset = OVERLAP;
    this.noteBufferIndex = 0;
    this.coeff = 1;
    this.row = 0;
    this.bitsIndex = 0;

    for (var i = 0; i < FRAMES; ++i) {
        BUFFER[i] = this.src[i];
    }
}

AcoustId.prototype.fill = function() {
    var offset = this.offset;

    if (offset + FRAMES - 1 >= this.srcLength) {
        return false;
    }

    var src = this.src;

    for (var j = 0; j < FRAMES; ++j) {
        BUFFER[j] = src[offset + j];
    }

    this.offset += OVERLAP;
    return true;
};

AcoustId.prototype.hammingWindow = function() {
    var tmp;
    var cos = 1;
    var sin = 0;
    for (var n = 0; n < FRAMES; ++n) {
        BUFFER[n] *= (0.54 - 0.46 * cos);
        tmp = cos - (a * cos + b * sin);
        sin = sin + (b * cos - a * sin);
        cos = tmp;
    }
};

AcoustId.prototype.chroma = function() {
    var noteBufferOffset = this.noteBufferIndex * NOTES;
    for (var i = 0; i < NOTES; ++i) {
        NOTE_BUFFER[noteBufferOffset + i] = 0;
    }

    for (var i = NOTE_FREQUENCY_START; i < NOTE_FREQUENCY_END; ++i) {
        var octave = Math.log((i * SAMPLE_RATE / FRAMES) / BASE) / Math.LN2;
        var note = (NOTES * (octave - Math.floor(octave)))|0;
        var re = BUFFER[i];
        var im = BUFFER[i + IM_OFFSET];
        var energy = re * re + im * im;
        NOTE_BUFFER[noteBufferOffset + note] += energy;
    }

    this.noteBufferIndex = (this.noteBufferIndex + 1) & 7;

    if (this.coeff >= 5) {
        var offset = (this.noteBufferIndex + 3) & 7;

        var sum = 0;
        for (var i = 0; i < NOTES; ++i) {
            TMP[i] = 0;

            for (var j = 0; j < 5; ++j) {
                var noteIndex = (((offset + j) & 7) * NOTES) + i;
                var value = NOTE_BUFFER[noteIndex] * COEFFS[j];
                TMP[i] += value;
            }

            sum += (TMP[i] * TMP[i]);
        }
        sum = Math.sqrt(sum);



        var row = this.row;
        var j = row * NOTES;
        if (sum < 0.01) {
            for (var i = 0; i < NOTES; ++i) {
                IMAGE[j++] = 0;
            }
        } else {
            for (var i = 0; i < NOTES; ++i) {
                IMAGE[j] = TMP[i] / sum;
                j++;
            }
        }

        this.row++;
    } else {
        this.coeff++;
    }
};

AcoustId.prototype.transformImage = function() {
    var rows = this.row;
    var current = 1;
    for (var i = 1; i < 12; ++i) {
        IMAGE[i] = IMAGE[i] + IMAGE[i - 1];
        current++;
    }

    var previous = 0;
    for (var i = 1; i < rows; ++i) {
        IMAGE[current] = IMAGE[current] + IMAGE[previous];
        current++;
        previous++;

        for (var j = 1; j < 12; ++j) {
            IMAGE[current] = IMAGE[current] +
                             IMAGE[current - 1] +
                             IMAGE[previous] -
                             IMAGE[previous - 1];
            current++;
            previous++;
        }
    }
};

AcoustId.prototype.getFingerprint = function() {
    var rows = this.row;
    var length = rows - 16 + 1;
    var fingerprint = new Int32Array(length);
    for (var i = 0; i < length; ++i) {
        var value = 0;
        value = (value << 2) | classify0(i, 4, 3, 15, 1.98215, 2.35817, 2.63523);
        value = (value << 2) | classify4(i, 4, 6, 15, -1.03809, -0.651211, -0.282167);
        value = (value << 2) | classify1(i, 0, 4, 16, -0.298702, 0.119262, 0.558497);
        value = (value << 2) | classify3(i, 8, 2, 12, -0.105439, 0.0153946, 0.135898);
        value = (value << 2) | classify3(i, 4, 4, 8, -0.142891, 0.0258736, 0.200632);
        value = (value << 2) | classify4(i, 0, 3, 5, -0.826319, -0.590612, -0.368214);
        value = (value << 2) | classify1(i, 2, 2, 9, -0.557409, -0.233035, 0.0534525);
        value = (value << 2) | classify2(i, 7, 3, 4, -0.0646826, 0.00620476, 0.0784847);
        value = (value << 2) | classify2(i, 6, 2, 16, -0.192387, -0.029699, 0.215855);
        value = (value << 2) | classify2(i, 1, 3, 2, -0.0397818, -0.00568076, 0.0292026);
        value = (value << 2) | classify5(i, 10, 1, 15, -0.53823, -0.369934, -0.190235);
        value = (value << 2) | classify3(i, 6, 2, 10, -0.124877, 0.0296483, 0.139239);
        value = (value << 2) | classify2(i, 1, 1, 14, -0.101475, 0.0225617, 0.231971);
        value = (value << 2) | classify3(i, 5, 6, 4, -0.0799915, -0.00729616, 0.063262);
        value = (value << 2) | classify1(i, 9, 2, 12, -0.272556, 0.019424, 0.302559);
        value = (value << 2) | classify3(i, 4, 2, 14, -0.164292, -0.0321188, 0.08463);
        fingerprint[i] = value;
    }
    return fingerprint;
};

AcoustId.prototype.compressSubFingerprint = function(x) {
    var bit = 1;
    var last_bit = 0;

    while (x !== 0) {
        if ((x & 1) !== 0) {
            BITS[this.bitsIndex++] = bit - last_bit;
            last_bit = bit;
        }
        x >>>= 1;
        bit++;
    }
    BITS[this.bitsIndex++] = 0;
};

AcoustId.prototype.writeExceptionBits = function(dst, dstIndex) {
    var bitsLength = this.bitsIndex;
    var holder = 0;
    var holderSize = 0;

    for (var i = 0; i < bitsLength; ++i) {
        var value = BITS[i];

        if (value < 7) continue;
        value = value - 7;

        holder |= (value << holderSize);
        holderSize += 5;

        while (holderSize >= 8) {
            dst[dstIndex++] = holder & 0xFF;
            holder >>>= 8;
            holderSize -= 8;
        }
    }

    while (holderSize > 0) {
        dst[dstIndex++] = holder & 0xFF;
        holder >>>= 8;
        holderSize -= 8;
    }
    holderSize = 0;

    return dstIndex;
};

AcoustId.prototype.writeNormalBits = function(dst, dstIndex) {
    var bitsLength = this.bitsIndex;
    var holder = 0;
    var holderSize = 0;

    for (var i = 0; i < bitsLength; ++i) {
        var value = Math.min(BITS[i], 7);

        holder |= (value << holderSize);
        holderSize += 3;

        while (holderSize >= 8) {
            dst[dstIndex++] = holder & 0xFF;
            holder >>>= 8;
            holderSize -= 8;
        }
    }

    while (holderSize > 0) {
        dst[dstIndex++] = holder & 0xFF;
        holder >>>= 8;
        holderSize -= 8;
    }
    holderSize = 0;

    return dstIndex;
};

AcoustId.prototype.base64Encode = function(src, length) {
    var newLength = ((length * 4 + 2) / 3)|0;
    var ret = "";
    var srcIndex = 0;

    while (length > 0) {
        ret += String.fromCharCode(BASE64[(src[srcIndex] >> 2)]);
        ret += String.fromCharCode(BASE64[((src[srcIndex] << 4) |
                                   (((--length) > 0) ? (src[srcIndex + 1] >> 4) : 0)) & 63]);

        if (length > 0) {
            ret += String.fromCharCode(BASE64[((src[srcIndex + 1] << 2) |
                                       (((--length) > 0) ? (src[srcIndex + 2] >> 6) : 0)) & 63]);
            if (length > 0) {
                ret += String.fromCharCode(BASE64[src[srcIndex + 2] & 63]);
                length--;
            }
        }

        srcIndex += 3;
    }

    if (ret.length !== newLength) throw new Error("wrong length");
    return ret;
};

AcoustId.prototype.compressed = function() {
    var fingerprint = this.getFingerprint();
    this.bitsIndex = 0;

    var prev = fingerprint[0];
    this.compressSubFingerprint(prev);
    for (var i = 1; i < fingerprint.length; ++i) {
        var cur = fingerprint[i];
        this.compressSubFingerprint(cur ^ prev);
        prev = cur;
    }

    var length = fingerprint.length;
    var ret = new Uint8Array(fingerprint.buffer);
    ret[0] = ALGORITHM & 0xFF;
    ret[1] = (length >>> 16) & 0xFF;
    ret[2] = (length >>> 8) & 0xFF;
    ret[3] = (length >>> 0) & 0xFF;

    var offset = this.writeNormalBits(ret, 4);
    offset = this.writeExceptionBits(ret, offset);

    return this.base64Encode(ret, offset);
};

AcoustId.prototype.calculate = function(raw) {
    do {
        this.hammingWindow();
        realFft(BUFFER);
        this.chroma();
    } while (this.fill());

    this.transformImage();

    if (!raw) {
        return this.compressed();
    } else {
        return this.getFingerprint();
    }
};

module.exports = AcoustId;

},{"../lib/realfft":3}],5:[function(require,module,exports){
"use strict";
const copy = function(a, b, length) {
    if (a === b) return a;
    for (var i = 0; i < length; ++i) {
        b[i] = a[i];
    }
    return b;
}

const bufferCache = Object.create(null);
const getBuffer = function(samples) {
    var key = samples + " ";
    var result = bufferCache[key];
    if (!result) {
        result = new Float32Array(samples);
        bufferCache[key] = result;
    } else {
        for (var i = 0; i < result.length; ++i) result[i] = 0;
    }
    return result;
}; 

function ChannelMixer(channels) {
    this.channels = channels;
}

ChannelMixer.prototype.setChannels = function(channels) {
    this.channels = channels;
};

ChannelMixer.prototype.getChannels = function() {
    return this.channels;
};

ChannelMixer.prototype.mix = function(input, length, output) {
    if (length === undefined) length = input[0].length;
    if (output === undefined) output = input;

    const inputChannels = input.length;
    if (inputChannels === this.channels) {
        for (var ch = 0; ch < inputChannels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output;
    }

    var outputChannels = this.channels;
    if (outputChannels === 1) {
        if (inputChannels === 2) {
            return this._mix2to1(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to1(input, length, output);
        } else if (inputChannels === 6) {
            return this._mix6to1(input, length, output);
        }
    } else if (outputChannels === 2) {
        if (inputChannels === 1) {
            return this._mix1to2(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to2(input, length, output);
        } else if (inputChannels === 6) {
            return this._mix6to2(input, length, output);            
        }
    } else if (outputChannels === 4) {
        if (inputChannels === 1) {
            return this._mix1to4(input, length, output);
        } else if (inputChannels === 2) {
            return this._mix2to4(input, length, output);
        }   else if (inputChannels === 6) {
            return this._mix6to4(input, length, output);
        }
    } else if (outputChannels === 6) {
        if (inputChannels === 1) {
            return this._mix1to6(input, length, output);
        } else if (inputChannels === 2) {
            return this._mix2to6(input, length, output);
        } else if (inputChannels === 4) {
            return this._mix4to6(input, length, output);
        }
    }

    return this._mixAnyToAny(input, length, output);
};

ChannelMixer.prototype._mix1to2 = function(input) {
    return [input[0], input[0]];
};

ChannelMixer.prototype._mix1to4 = function(input, length, output) {
    var silent = getBuffer(length);
    return [input[0], input[0], silent, silent];
};

ChannelMixer.prototype._mix1to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [
        silent,
        silent,
        input[0],
        silent,
        silent,
        silent
    ];
};

ChannelMixer.prototype._mix2to1 = function(input, length, output) {
    var ret = output[0];
    for (var i = 0; i < length; ++i) {
        ret[i] = Math.fround(Math.fround(input[0][i] + input[1][i]) / 2);
    }
    return [ret];
};

ChannelMixer.prototype._mix2to4 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length), copy(input[1], output[1], length), silent, silent];
};

ChannelMixer.prototype._mix2to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length),
            copy(input[1], output[1], length), silent, silent, silent, silent];
};

ChannelMixer.prototype._mix4to1 = function(input, length, output) {
    var ret = output[0];
    for (var i = 0; i < length; ++i) {
        ret[i] = (input[0][i] + input[1][i] + input[2][i] + input[3][i]) / 4;
    }
    return [ret];
};

ChannelMixer.prototype._mix4to2 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];
    for (var i = 0; i < length; ++i) {
        ret0[i] = (input[0][i] + input[2][i]) / 2;
        ret1[i] = (input[1][i] + input[3][i]) / 2;
    }
    return [ret0, ret1];
};

ChannelMixer.prototype._mix4to6 = function(input, length, output) {
    var silent = getBuffer(length);
    return [copy(input[0], output[0], length),
            copy(input[1], output[1], length),
            silent, silent,
            copy(input[2], output[2], length),
            copy(input[3], output[3], length)];
};


ChannelMixer.prototype._mix6to1 = function(input, length, output) {
    var ret = output[0];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        var SL = input[4][i];
        var SR = input[5][i];
        ret[i] = Math.fround(0.7071067811865476 * (L + R)) + C + Math.fround(0.5 * (SL + SR));
    }
    return [ret];
};

ChannelMixer.prototype._mix6to2 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        var SL = input[4][i];
        var SR = input[5][i];
        ret0[i] = L + Math.fround(0.7071067811865476 * Math.fround(C + SL));
        ret1[i] = R + Math.fround(0.7071067811865476 * Math.fround(C + SR));
    }

    return [ret0, ret1];
};

ChannelMixer.prototype._mix6to4 = function(input, length, output) {
    var ret0 = output[0];
    var ret1 = output[1];
    var ret2 = output[4];
    var ret3 = output[5];

    for (var i = 0; i < length; ++i) {
        var L = input[0][i];
        var R = input[1][i];
        var C = input[2][i];
        ret0[i] = L + Math.fround(0.7071067811865476 * C);
        ret1[i] = R + Math.fround(0.7071067811865476 * C);
    }

    return [ret0, ret1, ret2, ret3];
};

ChannelMixer.prototype._mixAnyToAny = function(input, length, output) {
    var channels = this.channels;

    if (channels < input.length) {
        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output.slice(0, channels);
    } else if (channels > input.length) {

        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        var silent = getBuffer(length);
        for (; ch < input.length; ++ch) {
            output[ch] = silent;
        }
        return output;
    } else {
        for (var ch = 0; ch < channels; ++ch) {
            copy(input[ch], output[ch], length);
        }
        return output;
    }
};
module.exports = ChannelMixer;

},{}],6:[function(require,module,exports){
"use strict";

function FileView(file) {
    this.file = file;
    this.dataview = null;
    this.buffer = null;
    this.start = -1;
    this.end = -1;
}

FileView.prototype.toBufferOffset = function(fileOffset) {
    return fileOffset - this.start;
};

FileView.prototype.ensure = function(offset, length) {
    if (!(this.start <= offset && offset + length <= this.end)) {
        const max = this.file.size;
        if (offset + length > max) {
            throw new Error("EOF");
        }
        this.start = Math.max(Math.min(max - 1, offset), 0);
        var end = (offset + length + 65536)
        this.end = Math.max(Math.min(max, end), 0);
        var reader = new FileReaderSync();
        var result = reader.readAsArrayBuffer(
                this.file.slice(this.start, this.end));
        this.dataview = new DataView(result);
    }
};

FileView.prototype.getFloat64 = function(offset, le) {
    this.ensure(offset, 8);
    return this.dataview.getFloat64(offset - this.start, le);
};

FileView.prototype.getFloat32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getFloat32(offset - this.start, le);
};

FileView.prototype.getUint32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getUint32(offset - this.start, le);
};

FileView.prototype.getInt32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getInt32(offset - this.start, le);
};

FileView.prototype.getUint16 = function(offset, le) {
    this.ensure(offset, 2);
    return this.dataview.getUint16(offset - this.start, le);
};

FileView.prototype.getInt16 = function(offset, le) {
    this.ensure(offset, 2);
    return this.dataview.getInt16(offset - this.start, le);
};

FileView.prototype.getUint8 = function(offset) {
    this.ensure(offset, 1);
    return this.dataview.getUint8(offset - this.start);
};

FileView.prototype.getInt8 = function(offset) {
    this.ensure(offset, 1);
    return this.dataview.getInt8(offset - this.start);
};

FileView.prototype.bufferOfSizeAt = function(size, start) {
    var start = Math.min(this.file.size - 1, Math.max(0, start));
    var end = Math.min(this.file.size, start + size);

    if (this.buffer && 
        (this.start <= start && end <= this.end)) {
        return this.buffer;
    }

    end = Math.min(this.file.size, start + size * 10);
    this.start = start;
    this.end = end;
    var reader = new FileReaderSync();
    var result = reader.readAsArrayBuffer(
            this.file.slice(this.start, this.end));
    this.buffer = new Uint8Array(result);
    return this.buffer;
};


module.exports = FileView;

},{}],7:[function(require,module,exports){
"use strict";
/* Ported from libspeex resampler.c, BSD license follows */
/* 
   Copyright (C) 2015 Petka Antonov
   Copyright (C) 2007-2008 Jean-Marc Valin
   Copyright (C) 2008      Thorvald Natvig

   File: resample.c
   Arbitrary resampling code

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are
   met:

   1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright
   notice, this list of conditions and the following disclaimer in the
   documentation and/or other materials provided with the distribution.

   3. The name of the author may not be used to endorse or promote products
   derived from this software without specific prior written permission.

   THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR
   IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
   OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
   INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
   (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
   HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
   STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
   ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   POSSIBILITY OF SUCH DAMAGE.
*/
const SIZEOF_SPX_WORD = 4;
const STDLIB_MAX_INT = 2147483647;

const kaiser12_table = new Float64Array([
    0.99859849, 1.00000000, 0.99859849, 0.99440475, 0.98745105, 0.97779076,
    0.96549770, 0.95066529, 0.93340547, 0.91384741, 0.89213598, 0.86843014,
    0.84290116, 0.81573067, 0.78710866, 0.75723148, 0.72629970, 0.69451601,
    0.66208321, 0.62920216, 0.59606986, 0.56287762, 0.52980938, 0.49704014,
    0.46473455, 0.43304576, 0.40211431, 0.37206735, 0.34301800, 0.31506490,
    0.28829195, 0.26276832, 0.23854851, 0.21567274, 0.19416736, 0.17404546,
    0.15530766, 0.13794294, 0.12192957, 0.10723616, 0.09382272, 0.08164178,
    0.07063950, 0.06075685, 0.05193064, 0.04409466, 0.03718069, 0.03111947,
    0.02584161, 0.02127838, 0.01736250, 0.01402878, 0.01121463, 0.00886058,
    0.00691064, 0.00531256, 0.00401805, 0.00298291, 0.00216702, 0.00153438,
    0.00105297, 0.00069463, 0.00043489, 0.00025272, 0.00013031, 0.0000527734,
    0.00001000, 0.00000000
]);

const kaiser10_table = new Float64Array([
    0.99537781, 1.00000000, 0.99537781, 0.98162644, 0.95908712, 0.92831446,
    0.89005583, 0.84522401, 0.79486424, 0.74011713, 0.68217934, 0.62226347,
    0.56155915, 0.50119680, 0.44221549, 0.38553619, 0.33194107, 0.28205962,
    0.23636152, 0.19515633, 0.15859932, 0.12670280, 0.09935205, 0.07632451,
    0.05731132, 0.04193980, 0.02979584, 0.02044510, 0.01345224, 0.00839739,
    0.00488951, 0.00257636, 0.00115101, 0.00035515, 0.00000000, 0.00000000
]);

const kaiser8_table = new Float64Array([
    0.99635258, 1.00000000, 0.99635258, 0.98548012, 0.96759014, 0.94302200,
    0.91223751, 0.87580811, 0.83439927, 0.78875245, 0.73966538, 0.68797126,
    0.63451750, 0.58014482, 0.52566725, 0.47185369, 0.41941150, 0.36897272,
    0.32108304, 0.27619388, 0.23465776, 0.19672670, 0.16255380, 0.13219758,
    0.10562887, 0.08273982, 0.06335451, 0.04724088, 0.03412321, 0.02369490,
    0.01563093, 0.00959968, 0.00527363, 0.00233883, 0.00050000, 0.00000000
]);

const kaiser6_table = new Float64Array([
    0.99733006, 1.00000000, 0.99733006, 0.98935595, 0.97618418, 0.95799003,
    0.93501423, 0.90755855, 0.87598009, 0.84068475, 0.80211977, 0.76076565,
    0.71712752, 0.67172623, 0.62508937, 0.57774224, 0.53019925, 0.48295561,
    0.43647969, 0.39120616, 0.34752997, 0.30580127, 0.26632152, 0.22934058,
    0.19505503, 0.16360756, 0.13508755, 0.10953262, 0.08693120, 0.06722600,
    0.05031820, 0.03607231, 0.02432151, 0.01487334, 0.00752000, 0.00000000
]);

const resampler_basic_direct_double_accum = new Float64Array(4);

function QualityMapping(v) {
   this.base_length = v[0] | 0;
   this.oversample = v[1] | 0;
   this.downsample_bandwidth = Math.fround(v[2]);
   this.upsample_bandwidth = Math.fround(v[3]);
   this.table = v[4];
}

const quality_map = [
   [  8,  4, 0.830, 0.860, kaiser6_table], /* Q0 */
   [ 16,  4, 0.850, 0.880, kaiser6_table], /* Q1 */
   [ 32,  4, 0.882, 0.910, kaiser6_table], /* Q2 */  /* 82.3% cutoff ( ~60 dB stop) 6  */
   [ 48,  8, 0.895, 0.917, kaiser8_table], /* Q3 */  /* 84.9% cutoff ( ~80 dB stop) 8  */
   [ 64,  8, 0.921, 0.940, kaiser8_table], /* Q4 */  /* 88.7% cutoff ( ~80 dB stop) 8  */
   [ 80, 16, 0.922, 0.940, kaiser10_table], /* Q5 */  /* 89.1% cutoff (~100 dB stop) 10 */
   [ 96, 16, 0.940, 0.945, kaiser10_table], /* Q6 */  /* 91.5% cutoff (~100 dB stop) 10 */
   [128, 16, 0.950, 0.950, kaiser10_table], /* Q7 */  /* 93.1% cutoff (~100 dB stop) 10 */
   [160, 16, 0.960, 0.960, kaiser10_table], /* Q8 */  /* 94.5% cutoff (~100 dB stop) 10 */
   [192, 32, 0.968, 0.968, kaiser12_table], /* Q9 */  /* 95.5% cutoff (~100 dB stop) 10 */
   [256, 32, 0.975, 0.975, kaiser12_table] /* Q10 */ /* 96.6% cutoff (~100 dB stop) 10 */
].map(function(v) {
    return new QualityMapping(v);
});

/*8,24,40,56,80,104,128,160,200,256,320*/
const computeFunc_interp = new Float64Array(4);
const computeFunc = function(x, table) {
    var y = x * (table.length - 4);
    var ind = Math.floor(y)|0;
    var frac = (y - ind);
    /* CSE with handle the repeated powers */
    computeFunc_interp[3] =  -0.1666666667 * frac + 0.1666666667 * (frac * frac * frac);
    computeFunc_interp[2] = frac + 0.5 * (frac * frac) - 0.5 * (frac * frac * frac);
    /*computeFunc_interp[2] = 1.f - 0.5f*frac - frac*frac + 0.5f*frac*frac*frac;*/
    computeFunc_interp[0] = -0.3333333333 * frac + 0.5 * (frac * frac) - 0.1666666667 *(frac * frac * frac);
    /* Just to make sure we don't have rounding problems */
    computeFunc_interp[1] = 1 - computeFunc_interp[3] - computeFunc_interp[2] - computeFunc_interp[0];

    /*sum = frac*accum[1] + (1-frac)*accum[2];*/
    return computeFunc_interp[0] * table[ind] +
            computeFunc_interp[1] * table[ind + 1] +
            computeFunc_interp[2] * table[ind + 2] +
            computeFunc_interp[3] * table[ind + 3];
};

/* The slow way of computing a sinc for the table. Should improve that some day */
const sinc = function(cutoff, x, N, table) {
    var fabs = Math.fround(Math.abs(x));
    if (fabs < 1e-6) {
        return cutoff;
    } else if (fabs > 0.5 * N) {
        return 0;
    }
    var xx = Math.fround(x * cutoff);
    /*FIXME: Can it really be any slower than this? */
    return cutoff * Math.sin(Math.PI * xx) / (Math.PI * xx) * computeFunc(Math.fround(Math.abs(2*x/N)), table);
};

function Resampler(nb_channels, in_rate, out_rate, quality) {
    if (quality === undefined) quality = 0;
    this.initialised = 0;
    this.started = false;
    this.in_rate = 0;
    this.out_rate = 0;
    this.num_rate = 0;
    this.den_rate = 0;
    this.quality = -1;
    this.sinc_table_length = 0;
    this.mem_alloc_size = 0;
    this.filt_len = 0;
    this.mem = null
    this.cutoff = Math.fround(1);
    this.nb_channels = nb_channels;
    this.in_stride = 1;
    this.out_stride = 1;
    this.buffer_size = 160;
    this.last_sample = new Int32Array(this.nb_channels);
    this.magic_samples = new Uint32Array(this.nb_channels);
    this.samp_frac_num = new Uint32Array(this.nb_channels);
    this.int_advance = 0;
    this.frac_advance = 0;
    this.oversample = 0;
    this.sinc_table = null;
    this.sinc_table_length = 0;

    this.setQuality(quality);
    this.setRateFrac(in_rate, out_rate, in_rate, out_rate);
    this._updateFilter();

    this.initialised = 1;
}

Resampler.prototype.setQuality = function(quality) {
    quality = quality|0;
    if (quality > 10 || quality < 0 || !isFinite(quality)) {
        throw new Error("bad quality value");
    }
    if (this.quality === quality) return;
    this.quality = quality;
    if (this.initialised) this._updateFilter();
};

Resampler.prototype.setRateFrac = function(ratio_num, ratio_den, in_rate, out_rate) {
    if (arguments.length <= 2) {
        in_rate = ratio_num;
        out_rate = ratio_den;
    }
    in_rate = in_rate|0;
    out_rate = out_rate|0;
    ratio_num = ratio_num|0;
    ratio_den = ratio_den|0;

    if (in_rate <= 0 || out_rate <= 0 || ratio_num <= 0 || ratio_den <= 0) {
        throw new Error("invalid params");
    }

    var fact;
    var old_den;
    var i;

    if (this.in_rate === in_rate &&
        this.out_rate === out_rate &&
        this.num_rate === ratio_num &&
        this.den_rate === ratio_den) {
        return;
    }

    old_den = this.den_rate;
    this.in_rate = in_rate;
    this.out_rate = out_rate;
    this.num_rate = ratio_num;
    this.den_rate = ratio_den;

    /* FIXME: This is terribly inefficient, but who cares (at least for now)? */
    for (fact = 2; fact <= Math.min(this.num_rate, this.den_rate); fact++) {
        while ((this.num_rate % fact === 0) && (this.den_rate % fact === 0)) {
            this.num_rate /= fact;
            this.den_rate /= fact;
        }
    }

    if (old_den > 0) {
        for (i = 0; i < this.nb_channels; i++) {
            this.samp_frac_num[i] = this.samp_frac_num[i] * this.den_rate / old_den;
            /* Safety net */
            if (this.samp_frac_num[i] >= this.den_rate) {
                this.samp_frac_num[i] = this.den_rate - 1;
            }
        }
    }

    if (this.initialised) this._updateFilter();
};

Resampler.prototype._updateFilter = function() {
   var old_length = this.filt_len;
   var old_alloc_size = this.mem_alloc_size;
   var min_sinc_table_length;
   var min_alloc_size;

   this.int_advance = (this.num_rate / this.den_rate) | 0;
   this.frac_advance = (this.num_rate % this.den_rate) | 0;
   this.oversample = quality_map[this.quality].oversample;
   this.filt_len = quality_map[this.quality].base_length;

    if (this.num_rate > this.den_rate) {
        /* down-sampling */
        this.cutoff = Math.fround(quality_map[this.quality].downsample_bandwidth * this.den_rate / this.num_rate);
        /* FIXME: divide the numerator and denominator by a certain amount if they're too large */
        this.filt_len = (this.filt_len * this.num_rate / this.den_rate) >>> 0;
        /* Round up to make sure we have a multiple of 8 for SSE */
        this.filt_len = (((this.filt_len - 1) & (~0x7)) + 8) >>> 0;

        if (2 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (4 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (8 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (16 * this.den_rate < this.num_rate) {
            this.oversample >>= 1;
        }

        if (this.oversample < 1) {
            this.oversample = 1;
        }
    } else {
    /* up-sampling */
        this.cutoff = quality_map[this.quality].upsample_bandwidth;
    }

    if (STDLIB_MAX_INT / SIZEOF_SPX_WORD / this.den_rate < this.filt_len) {
        throw new Error("INT_MAX/sizeof(spx_word16_t)/this.den_rate < this.filt_len");
    } 

    var min_sinc_table_length = this.filt_len * this.den_rate;

    if (this.sinc_table_length < min_sinc_table_length) {
        this.sinc_table = new Float32Array(min_sinc_table_length);
        this.sinc_table_length = min_sinc_table_length;
    }

    var table = quality_map[this.quality].table;
    for (var i = 0; i < this.den_rate; ++i) {
        for (var j = 0; j < this.filt_len; ++j) {
            var index = i * this.filt_len + j;
            var x = Math.fround(j - ((this.filt_len / 2)|0) + 1) - Math.fround(i / this.den_rate);
            this.sinc_table[index] = sinc(this.cutoff, x, this.filt_len, table);
        }
    }

    /* Here's the place where we update the filter memory to take into account
      the change in filter length. It's probably the messiest part of the code
      due to handling of lots of corner cases. */

    /* Adding buffer_size to filt_len won't overflow here because filt_len
      could be multiplied by sizeof(spx_word16_t) above. */
    min_alloc_size = this.filt_len - 1 + this.buffer_size;
    if (min_alloc_size > this.mem_alloc_size) {
        if (STDLIB_MAX_INT / SIZEOF_SPX_WORD / this.nb_channels < min_alloc_size) {
            throw new Error("INT_MAX/sizeof(spx_word16_t)/this.nb_channels < min_alloc_size");
        }
        this.mem = new Float32Array(this.nb_channels * min_alloc_size);
        this.mem_alloc_size = min_alloc_size;
    }

    if (this.initialised) {
        if (this.filt_len > old_length) {
            /* Increase the filter length */
            /*speex_warning("increase filter size");*/
            for (var i = this.nb_channels; (i--) !== 0;) {
                var j;
                var olen = old_length;
                if (this.magic_samples[i] !== 0) {
                    /* Try and remove the magic samples as if nothing had happened */
                    /* FIXME: This is wrong but for now we need it to avoid going over the array bounds */
                    olen = old_length + 2 * this.magic_samples[i];
                    for (j = old_length - 1 + this.magic_samples[i]; (j--) !== 0; ) {
                        this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]] = this.mem[i * old_alloc_size+j];
                    }
                    for (j = 0; j < this.magic_samples[i]; j++) {
                        this.mem[i * this.mem_alloc_size + j] = 0;
                    }
                    this.magic_samples[i] = 0;
                }
                
                if (this.filt_len > olen) {
                    /* If the new filter length is still bigger than the "augmented" length */
                    /* Copy data going backward */
                    for (j = 0; j < olen - 1; j++) {
                        this.mem[i * this.mem_alloc_size + (this.filt_len - 2 - j)] =
                                this.mem[i * this.mem_alloc_size + (olen - 2 - j)];
                    }
                    /* Then put zeros for lack of anything better */
                    for (; j < this.filt_len - 1; j++) {
                        this.mem[i * this.mem_alloc_size + (this.filt_len - 2 - j)] = 0;
                    }
                    /* Adjust last_sample */
                    this.last_sample[i] += (((this.filt_len - olen) / 2)|0);
                } else {
                    /* Put back some of the magic! */
                    this.magic_samples[i] = (((olen - this.filt_len) / 2)|0);
                    for (j = 0; j < this.filt_len - 1 + this.magic_samples[i]; j++) {
                        this.mem[i * this.mem_alloc_size + j] =
                            this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]];
                    }
                }
            }
        } else if (this.filt_len < old_length) {
            /* Reduce filter length, this a bit tricky. We need to store some of the memory as "magic"
            samples so they can be used directly as input the next time(s) */
            for (var i = 0; i < this.nb_channels; i++) {
                var old_magic = this.magic_samples[i];
                this.magic_samples[i] = ((old_length - this.filt_len) / 2)|0;
                /* We must copy some of the memory that's no longer used */
                /* Copy data going backward */
                for (var j = 0; j < this.filt_len - 1 + this.magic_samples[i] + old_magic; j++) {
                    this.mem[i * this.mem_alloc_size + j] =
                        this.mem[i * this.mem_alloc_size + j + this.magic_samples[i]];
                }
                this.magic_samples[i] += old_magic;
            }
        }
    }
};

const ALLOCATION_SIZE = 1024 * 1024;
const bufferCache = new Array(6);
const getBuffer = function(index, samples) {
    if (bufferCache[index] === undefined) {
        bufferCache[index] = new ArrayBuffer(ALLOCATION_SIZE);
    }
    return new Float32Array(bufferCache[index], 0, samples);
};

Resampler.prototype.end = function() {
    if (!this.started) throw new Error("not started");
    this.started = false;

    for (var i = 0; i < this.nb_channels; ++i) {
        this.last_sample[i] = 0;
        this.magic_samples[i] = 0;
        this.samp_frac_num[i] = 0;
    }

    if (this.mem) {
        for (var i = 0; i < this.mem.length; ++i) {
            this.mem[i] = 0;
        }
    }
};

Resampler.prototype.start = function() {
    if (this.started) throw new Error("already started");
    this.started = true;
};

Resampler.prototype.getLength = function(length) {
    return Math.ceil((length * this.den_rate) / this.num_rate)|0;
};

Resampler.prototype.resample = function(channels, length, output) {
    if (channels.length !== this.nb_channels) throw new Error("input doesn't have expected channel count");
    if (!this.started) throw new Error("start() not called");
    if (length == undefined) length = channels[0].length;
    
    const outLength = this.getLength(length);

    if (output == undefined) {
        output = new Array(channels.length);
        for (var ch = 0; ch < channels.length; ++ch) {
            output[ch] = getBuffer(ch, outLength);
        }
    }

    for (var ch = 0; ch < channels.length; ++ch) {
        this._processFloat(ch, channels[ch], length, output[ch]);
    }
    return output;
};

const process_ref = {out_ptr: 0, out_len: 0, in_len: 0, in_ptr: 0, out_values: null};
Resampler.prototype._processFloat = function(channel_index, inSamples, inLength, outSamples) {
    var in_ptr = 0;
    var out_ptr = 0;
    var ilen = inLength;
    var olen = outSamples.length;
    var x_ptr = channel_index * this.mem_alloc_size;

    const filt_offs = this.filt_len - 1;
    const xlen = this.mem_alloc_size - filt_offs;
    const istride = this.in_stride;
    const mem_values = this.mem;

    process_ref.out_values = outSamples;
    process_ref.out_ptr = out_ptr;

    if (this.magic_samples[channel_index] !== 0) {
        olen -= this._resamplerMagic(channel_index, olen);
    }
    out_ptr = process_ref.out_ptr;

    if (this.magic_samples[channel_index] === 0) {
        while (ilen > 0 && olen > 0) {
            var ichunk = (ilen > xlen) ? xlen : ilen;
            var ochunk = olen;

            for (var j = 0; j < ichunk; ++j) {
                mem_values[x_ptr + j + filt_offs] = inSamples[in_ptr + j * istride];
            }

            process_ref.in_len = ichunk;
            process_ref.out_ptr = out_ptr;
            process_ref.out_len = ochunk;
            this._processNative(channel_index);
            ichunk = process_ref.in_len;
            ochunk = process_ref.out_len;

            ilen -= ichunk;
            olen -= ochunk;
            out_ptr += ochunk * this.out_stride;
            in_ptr += ichunk * istride;
        }
    }
};

Resampler.prototype._processNative = function(channel_index) {
    const N = this.filt_len;
    const mem_ptr = channel_index * this.mem_alloc_size;
    const mem_values = this.mem;
    var out_sample = this._resamplerBasicDirectSingle(channel_index);
    var in_len = process_ref.in_len;
    var out_len = process_ref.out_len;

    if (this.last_sample[channel_index] < in_len) {
        in_len = this.last_sample[channel_index];
        process_ref.in_len = in_len;
    }
    out_len = out_sample;
    process_ref.out_len = out_len;
    this.last_sample[channel_index] -= in_len;

    const ilen = in_len;
    for (var j = 0; j < N - 1; ++j) {
        mem_values[mem_ptr + j] = mem_values[mem_ptr + j + ilen];
    }
};

Resampler.prototype._resamplerMagic = function(channel_index, out_len) {
    var tmp_in_len = this.magic_samples[channel_index];
    var mem_ptr = this.mem_alloc_size + channel_index;
    const N = this.filt_len;
   
    process_ref.out_len = out_len;
    process_ref.in_len = tmp_in_len;
    this._processNative(channel_index);
    out_len = process_ref.out_len;
    tmp_in_len = process_ref.in_len;

    this.magic_samples[channel_index] -= tmp_in_len;

    const magicSamplesLeft = this.magic_samples[channel_index];

    if (magicSamplesLeft !== 0) {
        var mem = this.mem;
        for (var i = 0; i < magicSamplesLeft; ++i) {
            mem[mem_ptr + N - 1 + i] = mem[mem_ptr + N - 1 + i + tmp_in_len];
        }
    }
    process_ref.out_ptr = process_ref.out_ptr + out_len * this.out_stride;
    return out_len;
};

Resampler.prototype._resamplerBasicDirectSingle = function(channel_index) {
    const N = this.filt_len;
    var out_sample = 0;
    var last_sample = this.last_sample[channel_index];
    var samp_frac_num = this.samp_frac_num[channel_index];
    const sinc_table = this.sinc_table;
    const out_stride = this.out_stride;
    const int_advance = this.int_advance;
    const frac_advance = this.frac_advance;
    const den_rate = this.den_rate;
    const mem_ptr = channel_index * this.mem_alloc_size;
    const mem_values = this.mem;

    var in_len = process_ref.in_len;
    var out_len = process_ref.out_len;

    const out_ptr = process_ref.out_ptr;
    const out_values = process_ref.out_values;

    while (!(last_sample >= in_len || out_sample >= out_len)) {
        var sinct_ptr = samp_frac_num * N;
        var iptr = process_ref.in_ptr + last_sample;

        var a1 = Math.fround(0);
        var a2 = Math.fround(0);
        var a3 = Math.fround(0);
        var a4 = Math.fround(0);

        for (var j = 0; j < N; j += 4) {
            a1 += Math.fround(sinc_table[sinct_ptr + j] * mem_values[mem_ptr + iptr + j]);
            a2 += Math.fround(sinc_table[sinct_ptr + j + 1] * mem_values[mem_ptr + iptr + j + 1]);
            a3 += Math.fround(sinc_table[sinct_ptr + j + 2] * mem_values[mem_ptr + iptr + j + 2]);
            a4 += Math.fround(sinc_table[sinct_ptr + j + 3] * mem_values[mem_ptr + iptr + j + 3]);
        }

        out_values[out_ptr + Math.imul(out_stride, out_sample++)] =
            Math.fround(a1 + Math.fround(a2 + Math.fround(a3 + a4)));
        last_sample += int_advance;
        samp_frac_num += frac_advance;

        if (samp_frac_num >= den_rate) {
            samp_frac_num -= den_rate;
            last_sample++;
        }
    }

    this.last_sample[channel_index] = last_sample;
    this.samp_frac_num[channel_index] = samp_frac_num;
    return out_sample;
};

module.exports = Resampler;

},{}],8:[function(require,module,exports){
"use strict";
self.EventEmitter = require("events");

var Resampler = require("./Resampler");
var ChannelMixer = require("./ChannelMixer");
var FileView = require("./FileView");
var demuxer = require("./demuxer");
var codec = require("./codec");
var sniffer = require("./sniffer");
var pool = require("./pool");
var AcoustId = require("./AcoustId");
var Ebur128 = require("./ebur128");

var allocBuffer = pool.allocBuffer;
var freeBuffer = pool.freeBuffer;
var allocResampler = pool.allocResampler;
var allocDecoderContext = pool.allocDecoderContext;
var freeResampler = pool.freeResampler;
var freeDecoderContext = pool.freeDecoderContext;

const BUFFER_DURATION = 1;
const WORST_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_DURATION = 120;
const FINGERPRINT_CHANNELS = 1;

const fingerprintMixer = new ChannelMixer(FINGERPRINT_CHANNELS);

var queue = [];
var processing = false;
var shouldAbort = false;
var currentJobId = -1;

function delay(value, ms) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(value);
        }, ms);
    });
}

function doAbort(args) {
    var jobId = args.id;
    if (currentJobId === jobId) {
        shouldAbort = true;
    }
}

function nextJob() {
    currentJobId = -1;
    shouldAbort = false;
    processing = true;

    if (queue.length === 0) {
        processing = false;
        return;
    }

    var job = queue.shift();
    var id = job.id;
    var file = job.file;
    var fingerprint = job.fingerprint;
    var loudness = job.loudness;
    var codecName = sniffer.getCodecName(file);
    var decoder;
    var resamplerFingerprint;
    var fingerprintBuffers;
    var fingerprintSource;
    var sampleRate;
    var channels;
    currentJobId = id;

    if (!codecName) {
        return error(id, new Error("file type not supported"));
    }

    var view = new FileView(file);

    codec.getCodec(codecName).then(function(codec) {
        var metadata = demuxer(codec.name, view);

        if (!metadata) {
            return error(id, new Error("file type not supported"));
        }

        decoder = allocDecoderContext(codec.name, codec.Context, {
            seekable: false,
            dataType: codec.Context.FLOAT,
            targetBufferLengthSeconds: BUFFER_DURATION
        });

        sampleRate = metadata.sampleRate;
        channels = metadata.channels;

        var samplesDecoded = 0;
        var fingerprintSamples = sampleRate * FINGERPRINT_DURATION;
        var fingerprintBufferLength = 0;
        fingerprint = fingerprint && metadata.duration >= 7;
        var ebur128;

        if (fingerprint) {
            fingerprintBuffers = allocBuffer(BUFFER_DURATION * sampleRate, channels);
            fingerprintSource = allocBuffer(FINGERPRINT_DURATION * FINGERPRINT_SAMPLE_RATE, 1);

            if (sampleRate !== FINGERPRINT_SAMPLE_RATE) {
                resamplerFingerprint = allocResampler(1, sampleRate, FINGERPRINT_SAMPLE_RATE, WORST_RESAMPLER_QUALITY);    
            }
        }

        if (loudness) {
            ebur128 = new Ebur128(channels, sampleRate, Ebur128.EBUR128_MODE_I | Ebur128.EBUR128_MODE_SAMPLE_PEAK);
        }

        decoder.start(metadata);

        var flushed = false;
        decoder.on("data", function(channels) {
            flushed = true;
            var sampleCount = channels[0].length;
            samplesDecoded += sampleCount;
            fingerprint = fingerprint && samplesDecoded <= fingerprintSamples;

            if (fingerprint) {
                for (var ch = 0; ch < channels.length; ++ch) {
                    var src = channels[ch];
                    var dst = fingerprintBuffers[ch];
                    for (var i = 0; i < src.length; ++i) {
                        dst[i] = src[i];
                    }
                }

                var samples = fingerprintMixer.mix(fingerprintBuffers, sampleCount);
                var len = sampleCount;
                if (resamplerFingerprint) {
                    samples = resamplerFingerprint.resample([samples[0]], sampleCount);
                    len = samples[0].length;
                }

                var src = samples[0];
                var dst = fingerprintSource[0];
                for (var i = 0; i < len; ++i) {
                    dst[i + fingerprintBufferLength] = src[i];
                }
                fingerprintBufferLength += len;
            }

            if (loudness && ebur128) {
                ebur128.add_frames(channels, sampleCount);
            }
        });

        var error;
        decoder.on("error", function(e) {
            error = e;
        });

        var offset = metadata.dataStart;
        var aborted = false;

        return Promise.resolve(offset).then(function loop(offset) {
            if (offset < metadata.dataEnd && error === undefined) {
                flushed = false;
                var buffer = view.bufferOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset);
                var srcStart = view.toBufferOffset(offset);
                var srcEnd = decoder.decodeUntilFlush(buffer, srcStart);
                var bytesRead = (srcEnd - srcStart);
                offset += bytesRead;
                progress(id, (offset - metadata.dataStart) / (metadata.dataEnd - metadata.dataStart));

                if (!flushed) {
                    return;
                }

                if (shouldAbort) {
                    aborted = true;
                    return reportAbort(id);
                }
                return delay(offset, 0).then(loop);
            }
        }).then(function() {
            if (aborted) {
                return;
            }

            if (error === undefined) {
                decoder.end();
            }

            if (error) {
                return error(id, error);
            }
            var result = {
                loudness: null,
                fingerprint: null,
                duration: metadata.duration
            };

            if (fingerprintSource && fingerprintBufferLength > 0) {
                var fpcalc = new AcoustId(fingerprintSource[0], fingerprintBufferLength);
                result.fingerprint = {
                    fingerprint: fpcalc.calculate(false)
                };
            }

            if (loudness && ebur128) {
                var trackGain = Ebur128.REFERENCE_LUFS - ebur128.loudness_global();
                var trackPeak = Math.max.apply(Math, ebur128.getSamplePeak());
                var silence = ebur128.getSilence();
                result.loudness = {
                    trackGain: trackGain,
                    trackPeak: trackPeak,
                    silence: silence
                };
            }
            success(id, result);
        });
    }).catch(function(e) {
        error(id, e);
    }).then(cleanup, cleanup);

    function cleanup() {
        if (decoder) {
            freeDecoderContext(codecName, decoder);
            decoder = null;
        }

        if (resamplerFingerprint) {
            freeResampler(resamplerFingerprint);
            resamplerFingerprint = null;
        }
        if (fingerprintBuffers) {
            freeBuffer(BUFFER_DURATION * sampleRate, channels, fingerprintBuffers);
            fingerprintBuffers = null;
        }
        if (fingerprintSource) {
            freeBuffer(FINGERPRINT_DURATION * FINGERPRINT_SAMPLE_RATE, 1, fingerprintSource);
            fingerprintSource = null;
        }
        nextJob();
    }
}

function reportAbort(id) {
    self.postMessage({
        id: id,
        type: "abort"
    });
}

function progress(id, amount) {
    self.postMessage({
        id: id,
        type: "progress",
        progress: amount
    });
}

function error(id, e) {
    self.postMessage({
        id: id,
        type: "error",
        error: {
            message: e.message,
            stack: e.stack
        }
    });
}

function success(id, result) {
    self.postMessage({
        id: id,
        type: "success",
        result: result
    });
}

self.onmessage = function(event) {
    var data = event.data;

    if (data.action === "analyze") {
        queue.push(data.args);
        if (!processing) nextJob();
    } else if (data.action === "abort") {
        doAbort(data.args);
    }
};

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});

},{"./AcoustId":4,"./ChannelMixer":5,"./FileView":6,"./Resampler":7,"./codec":9,"./demuxer":10,"./ebur128":11,"./pool":12,"./sniffer":13,"events":1}],9:[function(require,module,exports){
(function (global){
"use strict";

const globalObject = typeof self !== "undefined" ? self : global;
const codecs = Object.create(null);

const delay = function(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
};

var expectedCodec = null;
const loadCodec = function(name, retries) {
    if (codecs[name]) return codecs[name];
    if (retries === undefined) retries = 0;
    codecs[name] = new Promise(function(resolve, reject) {
        var url = "codecs/" + name + ".js";
        var xhr = new XMLHttpRequest();
        xhr.addEventListener("load", function() {
            if (xhr.status >= 300) {
                if (xhr.status >= 500 && retries < 5) {
                    return resolve(delay(1000).then(function() {
                        return loadCodec(name, retries + 1);
                    }));
                }
                return reject(new Error("http error when loading codec: " + xhr.status + " " + xhr.statusText))
            } else {
                var code = xhr.responseText;
                expectedCodec = null;
                try {
                    new Function(code)();
                    if (!expectedCodec || expectedCodec.name !== name) {
                        reject(new Error("codec " + name + " did not register properly"));
                    }
                    resolve(expectedCodec);
                } finally {
                    expectedCodec = null;
                }
            }
        }, false);

        xhr.addEventListener("error", function() {
            reject(new Error("error when loading codec"));
        }, false);

        xhr.open("GET", url);
        xhr.send(null);
    });
    return codecs[name];
};

globalObject.codecLoaded = function(name, Context) {
    expectedCodec = {
        name: name,
        Context: Context
    };
};

var codec = {};

codec.getCodec = function(name) {
    return loadCodec(name);
};

module.exports = codec;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(require,module,exports){
"use strict";
var FileView = require("./FileView");

const MINIMUM_DURATION = 3;
const MP3_DECODER_DELAY = 529;
const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

const RIFF = 1380533830|0;
const WAVE = 1463899717|0;
const ID3 = 0x494433|0;
const VBRI = 0x56425249|0;
const Xing = 0x58696e67|0;
const Info = 0x496e666f|0;
const LAME = 0x4c414d45|0;
const TAG = 0x544147|0;
const DATA = 0x64617461|0;
const FACT = 0x66616374|0;


function probablyMp3Header(header) {
    return !(((header & 0xffe00000) !== -2097152)     ||
             ((header & (3 << 17)) !== (1 << 17))     ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
}


function demuxMp3FromWav(offset, view) {
    var max = offset + 4096;

    var chunkSize = view.getInt32(offset + 4, true);
    var dataEnd = offset + chunkSize + 8;
    var subChunkSize = view.getInt32(offset + 16, true);
    var fmt = view.getInt16(offset + 20, true);
    var channels = view.getInt16(offset + 22, true);
    var sampleRate = view.getInt32(offset + 24, true);
    var lsf = sampleRate < 32000;
    var samplesPerFrame = lsf ? 576 : 1152;
    var byteRate = view.getInt32(offset + 28, true);
    var align = view.getInt16(offset + 32, true);
    var bitsPerSample = view.getInt16(offset + 34, true);
    var extraParamSize = view.getInt16(offset + 36, true);
    var wId = view.getInt16(offset + 38, true);
    var flags = view.getInt32(offset + 40, true);
    var blockSize = view.getInt16(offset + 44, true);
    var framesPerBlock = view.getInt16(offset + 46, true);
    var encoderDelay = view.getInt16(offset + 48, true);
    var frames = 0;

    offset += subChunkSize + 16 + 4;
    var duration = 0;
    while (offset < max) {
        var nextChunk = view.getInt32(offset, false);
        offset += 4;
        if (nextChunk === FACT) {
            var size = view.getInt32(offset, true);
            offset += 4;
            var samples = view.getInt32(offset, true);
            duration = samples / sampleRate;
            frames = (samples / samplesPerFrame)|0;
            offset += size;
        } else if (nextChunk === DATA) {
            var dataStart = offset + 4;
            if (duration === 0) {
                duration = Math.max(0, (dataEnd - dataStart)) / byteRate;
                frames = ((duration * sampleRate) / samplesPerFrame)|0;
            }
            if (duration < MINIMUM_DURATION) return null;

            return {
                frames: frames,
                encoderDelay: encoderDelay,
                encoderPadding: 0,
                paddingStartFrame: -1,
                lsf: lsf,
                sampleRate: sampleRate,
                channels: channels,
                bitRate: byteRate * 8,
                dataStart: dataStart,
                dataEnd: dataEnd,
                averageFrameSize: blockSize,
                vbr: false,
                duration: duration,
                samplesPerFrame: samplesPerFrame,
                maxByteSizePerSample: Math.ceil((2881 * (samplesPerFrame / 1152)) / 1152),
                seekTable: null,
                toc: null
            };
        } else {
            offset += 2;
        }

    }
    return null;
}

function demuxMp3(view) {
    var offset = 0;
    var dataStart = 0;
    var dataEnd = view.file.size;
    var samplesPerFrame = 1152;

    if ((view.getUint32(0, false) >>> 8) === ID3) {
        var footer = ((view.getUint8(5) >> 4) & 1) * 10;
        var size = (view.getUint8(6) << 21) | 
                   (view.getUint8(7) << 14) |
                   (view.getUint8(8) << 7) | 
                   view.getUint8(9);
        offset = size + 10 + footer;
        dataStart = offset;
    } 

    if (view.getInt32(dataStart, false) === RIFF &&
        view.getInt32(dataStart + 8, false) === WAVE) {
        return demuxMp3FromWav(dataStart, view);
    }

    var id3v1AtEnd = (view.getUint32(view.file.size - 128) >>> 8) === TAG;

    if (id3v1AtEnd) {
        dataEnd -= 128;
    }

    var max = 2314 * 20;
    var header = 0;
    var metadata = null;
    var headersFound = 0;

    for (var i = 0; i < max; ++i) {
        var index = offset + i;
        header = view.getInt32(index);
            
        if (probablyMp3Header(header)) {
            if (headersFound > 4) {
                break;
            }
            
            var lsf, mpeg25;
            if ((header & (1<<20)) !== 0) {
                lsf = (header & (1<<19)) !== 0 ? 0 : 1;
                mpeg25 = 0;
            } else {
                lsf = 1;
                mpeg25 = 1;
            }

            samplesPerFrame = lsf === 1 ? 576 : 1152;

            var sampleRateIndex = ((header >> 10) & 3);
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) continue;
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) continue;
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            if (!bitRate || !sampleRate) {
                continue;
            }

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            var nextHeader = view.getInt32(index + 4 + frame_size - 4, false);

            if (!probablyMp3Header(nextHeader)) {
                if (view.getInt32(index + 4 + 32) === (0x56425249|0)) {
                    i += (4 + 32 - 1);
                } else {
                    continue;
                }
            }
        
            headersFound++;
            if (metadata) {
                if (metadata.bitRate !== bitRate) {
                    metadata.bitRate = bitRate;
                    metadata.vbr = true;
                }
                i += (frame_size - 4 - 1);
            } else {
                metadata = {
                    frames: 0,
                    encoderDelay: 576,
                    encoderPadding: 0,
                    paddingStartFrame: -1,
                    lsf: !!lsf,
                    sampleRate: sampleRate,
                    channels: ((header >> 6) & 3) === 3 ? 1 : 2,
                    bitRate: bitRate,
                    dataStart: dataStart,
                    dataEnd: dataEnd,
                    averageFrameSize: ((bitRate / 1000) * 144000) / (sampleRate << lsf),
                    vbr: false,
                    duration: 0,
                    samplesPerFrame: samplesPerFrame,
                    maxByteSizePerSample: Math.ceil((2881 * (samplesPerFrame / 1152)) / 1152),
                    seekTable: null,
                    toc: null
                };
            }
            header = 0;
            // VBRI
        } else if (header === VBRI) {
            metadata.vbr = true;
            var offset = index + 4 + 10;
            var frames = view.getUint32(offset, false);
            metadata.frames = frames;
            metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
            offset += 4;
            var entries = view.getUint16(offset, false);
            offset += 2;
            var entryScale = view.getUint16(offset, false);
            offset += 2;
            var sizePerEntry = view.getUint16(offset, false);
            offset += 2;
            var framesPerEntry = view.getUint16(offset, false);
            offset += 2;
            var entryOffset = offset + entries + sizePerEntry;
            var dataStart = entryOffset;

            var seekTable = new Mp3SeekTable();
            var table = seekTable.table;
            table.length = entries + 1;
            seekTable.isFromMetaData = true;
            seekTable.framesPerEntry = framesPerEntry;
            seekTable.tocFilledUntil = metadata.duration;
            seekTable.frames = frames;
            metadata.seekTable = seekTable;
            
            var shift = 0;
            var method;
            switch (sizePerEntry) {
                case 4: method = view.getUint32; break;
                case 3: method = view.getUint32; shift = 8; break;
                case 2: method = view.getUint16; break;
                case 1: method = view.getUint8; break;
                default: return null;
            }

            var j = 0;
            table[0] = dataStart;
            for (; j < entries; ++j) {
                var value = method.call(view, offset + (j * sizePerEntry)) >>> shift;
                entryOffset += (value * entryScale);
                table[j + 1] = entryOffset;
            }

            // 1159, 864, or 529
            // http://mp3decoders.mp3-tech.org/decoders_lame.html
            metadata.encoderDelay = 1159;
            metadata.dataStart = dataStart;
            break;
        // Xing | Info
        } else if (header === Xing || header === Info) {
            if (header === Xing) {
                metadata.vbr = true;
            }

            var offset = index + 4;
            var fields = view.getUint32(offset, false);
            offset += 4;

            var frames = -1;
            if ((fields & 0x7) !== 0) {
                if ((fields & 0x1) !== 0) {
                    var frames = view.getUint32(offset, false);
                    metadata.frames = frames;
                    metadata.duration = (frames * samplesPerFrame / metadata.sampleRate);
                    offset += 4;
                }
                if ((fields & 0x2) !== 0) {
                    offset += 4;
                }
                if ((fields & 0x4) !== 0) {
                    var toc = new Uint8Array(100);
                    for (var j = 0; j < 100; ++j) {
                        toc[j] = view.getUint8(offset + j);
                    }
                    metadata.toc = toc;
                    offset += 100;
                }
                if (fields & 0x8 !== 0) offset += 4;
            }

            // LAME
            if (view.getInt32(offset, false) === LAME) {
                offset += (9 + 1 + 1 + 8 + 1 + 1);
                var padding = (view.getInt32(offset, false) >>> 8);
                var encoderDelay = padding >> 12;
                metadata.encoderDelay = encoderDelay;
                var encoderPadding = padding & 0xFFF;
                if (frames !== -1) {
                    if (encoderPadding > 0) {
                        encoderPadding = Math.max(0, encoderPadding - MP3_DECODER_DELAY);
                        metadata.paddingStartFrame = frames - Math.ceil(encoderPadding / metadata.samplesPerFrame) - 1;
                        metadata.encoderPadding = encoderPadding;
                    }
                }
                offset += (3 + 1 + 1 + 2 + 4 + 2 + 2);
            }

            metadata.dataStart = offset;
            break;
        }
    }

    if (!metadata) {
        return null;
    }
    
    if (metadata.duration === 0) {
        var size = Math.max(0, metadata.dataEnd - metadata.dataStart);
        if (!metadata.vbr) {
            metadata.duration = (size * 8) / metadata.bitRate;
            metadata.frames = ((metadata.sampleRate * metadata.duration) / metadata.samplesPerFrame) | 0;
        } else {
            // VBR without Xing or VBRI header = need to scan the entire file.
            // What kind of sadist encoder does this?
            metadata.seekTable = new Mp3SeekTable();
            metadata.seekTable.fillUntil(2592000, metadata, view);
            metadata.frames = metadata.seekTable.frames;
            metadata.duration = (metadata.frames * metadata.samplesPerFrame) / metadata.sampleRate;
        }
    }

    if (metadata.duration < MINIMUM_DURATION) {
        return null;
    }

    return metadata;
}

module.exports = function(codecName, fileView) {
    try {
        if (codecName === "mp3") {
            return demuxMp3(fileView);
        }
    } catch (e) {
        throw e;
        return null;
    }
    return null;
};

// TODO: code is ruthlessly duplicated from above.
function Mp3SeekTable() {
    this.frames = 0;
    this.tocFilledUntil = 0;
    this.table = new Array(128);
    this.lastFrameSize = 0;
    this.framesPerEntry = 1;
    this.isFromMetaData = false;
}

Mp3SeekTable.prototype.closestFrameOf = function(frame) {
    frame = Math.min(this.frames, frame);
    return Math.round(frame / this.framesPerEntry) * this.framesPerEntry;
};

Mp3SeekTable.prototype.offsetOfFrame = function(frame) {
    frame = this.closestFrameOf(frame);
    var index = frame / this.framesPerEntry;
    return this.table[index];
};

Mp3SeekTable.prototype.fillUntil = function(time, metadata, fileView) {
    if (this.tocFilledUntil >= time) return;
    var offset = metadata.dataStart;
    var end = metadata.dataEnd;

    var bufferSize = metadata.maxByteSizePerSample * metadata.samplesPerFrame | 0;
    var maxFrames = Math.ceil(time * (metadata.sampleRate / (1152 >> metadata.lsf)));
    var lsf = metadata.lsf ? 1 : 0;

    var table = this.table;
    var offset, frames;
    if (this.frames > 0) {
        frames = this.frames;
        offset = table[this.frames - 1] + this.lastFrameSize;
    } else {
        frames = 0;
        offset = metadata.dataStart;
    }

    mainLoop: while (offset < end && frames < maxFrames) {
        var buffer = fileView.bufferOfSizeAt(bufferSize, offset);
        var header = 0;

        do {
            var i = offset - fileView.start;
            header = ((header << 8) | buffer[i]) | 0;

            if ((header & 0xffe00000) !== -2097152) {
                
                continue;
            }

            if ((header & (3 << 17)) !== (1 << 17)) {
                continue;
            }

            if ((header & (0xF << 12)) === (0xF << 12)) {
                continue;
            }

            if ((header & (3 << 10)) === (3 << 10)) {
                continue;
            }

            var lsf, mpeg25;
            if ((header & (1<<20)) !== 0) {
                lsf = (header & (1<<19)) !== 0 ? 0 : 1;
                mpeg25 = 0;
            } else {
                lsf = 1;
                mpeg25 = 1;
            }

            var sampleRateIndex = ((header >> 10) & 3);
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) continue;
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) continue;
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            table[frames] = (offset - 3);
            frames++;

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            this.lastFrameSize = frame_size;
            offset += (frame_size - 4);

            if (frames >= maxFrames) {
                break mainLoop;
            }
            break;
        } while (++offset < end);
    }

    this.frames = frames;
    this.tocFilledUntil = (metadata.samplesPerFrame / metadata.sampleRate) * frames;
};

module.exports.Mp3SeekTable = Mp3SeekTable;

},{"./FileView":6}],11:[function(require,module,exports){
"use strict";
/* Ported to JavaScript from libebur128. */
/*
Copyright (c) 2011 Jan Kokemüller
Copyright (c) 2015 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
const util = require("../js/util");

const SILENCE_THRESHOLD = -63;
const REFERENCE_LUFS = -18;
const INTERPOLATION_PHASE_LENGTH = 12;

const EBUR128_UNUSED = 0;
const EBUR128_LEFT = 1;
const EBUR128_RIGHT = 2;
const EBUR128_CENTER = 3;
const EBUR128_LEFT_SURROUND = 4;
const EBUR128_RIGHT_SURROUND = 5;
const EBUR128_DUAL_MONO = 6;

const EBUR128_MODE_M = (1 << 0);
const EBUR128_MODE_S = (1 << 1) | EBUR128_MODE_M;
const EBUR128_MODE_I = (1 << 2) | EBUR128_MODE_M;
const EBUR128_MODE_LRA = (1 << 3) | EBUR128_MODE_S;
const EBUR128_MODE_SAMPLE_PEAK = (1 << 4) | EBUR128_MODE_M;
const EBUR128_MODE_TRUE_PEAK = (1 << 5) | EBUR128_MODE_M | EBUR128_MODE_SAMPLE_PEAK;
const EBUR128_MODE_HISTOGRAM = (1 << 6);

const relative_gate = -10.0
const relative_gate_factor = Math.pow(10.0, relative_gate / 10.0);
const minus_twenty_decibels = Math.pow(10.0, -20.0 / 10.0);
const histogram_energies = new Float32Array(1000);
const histogram_energy_boundaries = new Float32Array(1001);
histogram_energy_boundaries[0] = Math.pow(10.0, (-70.0 + 0.691) / 10.0);
for (var i = 1; i < 1001; ++i) {
    histogram_energy_boundaries[i] = Math.pow(10.0, (i / 10.0 - 70.0 + 0.691) / 10.0);
}
for (var i = 0; i < 1000; ++i) {
    histogram_energies[i] = Math.pow(10.0, (i / 10.0 - 69.95 + 0.691) / 10.0);
}

function ebur128_energy_to_loudness(energy) {
    return 10 * (Math.log(energy) * Math.LOG10E) - 0.691;
}

function find_histogram_index(energy) {
    var index_min = 0;
    var index_max = 1000;
    var index_mid;

    do {
        index_mid = ((index_min + index_max) / 2) >> 0;
        if (energy >= histogram_energy_boundaries[index_mid]) {
            index_min = index_mid;
        } else {
            index_max = index_mid;
        }
    } while (index_max - index_min != 1);

    return index_min;
}

const audioDataCache = Object.create(null);

function getFloat32ArrayForFrameCount(frameCount, channel) {
    var key = frameCount + " " + channel;
    if (audioDataCache[key]) {
        var ret = audioDataCache[key];
        for (var i = 0; i < ret.length; ++i) {
            ret[i] = 0;
        }
        return ret;
    }
    var ret = new Float32Array(frameCount);
    audioDataCache[key] = ret;
    return ret;
}

function Ebur128(channels, samplerate, mode) {
    this.mode = mode;
    this.samplerate = samplerate;
    this.channels = Math.max(1, Math.min(channels, 5));
    this.channel_map = [];
    this.initChannels();

    this.sample_peak = new Float32Array(channels);
    this.true_peak = new Float32Array(channels);
    this.use_histogram = (mode & EBUR128_MODE_HISTOGRAM) > 0;
    this.samples_in_100ms = ((samplerate + 5) / 10) >>> 0;
    this.needed_frames = this.samples_in_100ms * 4;
    this.audio_data_index = 0;
    this.audio_data_frames = 0;

    if ((mode & EBUR128_MODE_S) == EBUR128_MODE_S) {
        this.audio_data_frames = this.samples_in_100ms * 30;
    } else if ((mode & EBUR128_MODE_M) == EBUR128_MODE_M) {
        this.audio_data_frames = this.samples_in_100ms * 4;
    } else {
        throw new Error("invalid mode");
    }

    this.audio_data = new Array(channels);
    for (var i = 0; i < channels; ++i) {
        this.audio_data[i] = getFloat32ArrayForFrameCount(this.audio_data_frames, i);
    }

    this.a = new Float32Array(5);
    this.b = new Float32Array(5);
    this.filterState = new Array(channels);
    this.filterStateInt32 = new Array(channels);
    for (var c = 0; c < channels; ++c) {
        this.filterState[c] = new Float32Array(5);
        this.filterStateInt32[c] = new Int32Array(this.filterState[c].buffer);
    }
    this.initFilter();

    this.interpolatorState = new Array(channels);
    for (var c = 0; c < channels; ++c) {
        this.interpolatorState[c] =
            getFloat32ArrayForFrameCount(this.needed_frames + INTERPOLATION_PHASE_LENGTH - 1, c);
    }

    this.block_energy_histogram = null;
    this.short_term_block_energy_histogram = null;
    if (this.use_histogram) {
        this.block_energy_histogram = new Uint32Array(1000);
        this.short_term_block_energy_histogram = new Uint32Array(1000);
    }

    this.block_list = [];
    this.short_term_block_list = [];
    this.short_term_frame_counter = 0;
    this.short_term_frame_counter = 0;

    this.lastSilenceStarted = -1;
    this.currentTime = 0;
    this.beginSilenceLength = 0;
    this.endSilenceLength = 0;
}

Ebur128.prototype.initFilter = function() {
    var samplerate = this.samplerate;
    var f0 = 1681.974450955533;
    var G = 3.999843853973347;
    var Q = 0.7071752369554196;

    var K = Math.tan(Math.PI * f0 / samplerate);
    var Vh = Math.pow(10.0, G / 20.0);
    var Vb = Math.pow(Vh, 0.4996667741545416);

    var pb = new Float32Array([0.0,  0.0, 0.0]);
    var pa = new Float32Array([1.0,  0.0, 0.0]);
    var rb = new Float32Array([1.0, -2.0, 1.0]);
    var ra = new Float32Array([1.0,  0.0, 0.0]);

    var a0 = 1.0 + K / Q + K * K;
    pb[0] = (Vh + Vb * K / Q + K * K) / a0;
    pb[1] = 2.0 * (K * K -  Vh) / a0;
    pb[2] = (Vh - Vb * K / Q + K * K) / a0;
    pa[1] = 2.0 * (K * K - 1.0) / a0;
    pa[2] = (1.0 - K / Q + K * K) / a0;

    f0 = 38.13547087602444;
    Q = 0.5003270373238773;
    K = Math.tan(Math.PI * f0 / samplerate);

    ra[1] = 2.0 * (K * K - 1.0) / (1.0 + K / Q + K * K);
    ra[2] = (1.0 - K / Q + K * K) / (1.0 + K / Q + K * K);

    this.b[0] = pb[0] * rb[0];
    this.b[1] = pb[0] * rb[1] + pb[1] * rb[0];
    this.b[2] = pb[0] * rb[2] + pb[1] * rb[1] + pb[2] * rb[0];
    this.b[3] = pb[1] * rb[2] + pb[2] * rb[1];
    this.b[4] = pb[2] * rb[2];
    this.a[0] = pa[0] * ra[0];
    this.a[1] = pa[0] * ra[1] + pa[1] * ra[0];
    this.a[2] = pa[0] * ra[2] + pa[1] * ra[1] + pa[2] * ra[0];
    this.a[3] = pa[1] * ra[2] + pa[2] * ra[1];
    this.a[4] = pa[2] * ra[2];
};

Ebur128.EBUR128_MODE_M = EBUR128_MODE_M;
Ebur128.EBUR128_MODE_S = EBUR128_MODE_S;
Ebur128.EBUR128_MODE_I = EBUR128_MODE_I;
Ebur128.EBUR128_MODE_LRA = EBUR128_MODE_LRA;
Ebur128.EBUR128_MODE_SAMPLE_PEAK = EBUR128_MODE_SAMPLE_PEAK;
Ebur128.EBUR128_MODE_TRUE_PEAK = EBUR128_MODE_TRUE_PEAK;
Ebur128.EBUR128_MODE_HISTOGRAM = EBUR128_MODE_HISTOGRAM;
Ebur128.REFERENCE_LUFS = REFERENCE_LUFS;

Ebur128.prototype.initChannels = function() {
    var channels = this.channels;
    if (channels === 4) {
        this.channel_map[0] = EBUR128_LEFT;
        this.channel_map[1] = EBUR128_RIGHT;
        this.channel_map[2] = EBUR128_LEFT_SURROUND;
        this.channel_map[3] = EBUR128_RIGHT_SURROUND;
    } else if (channels === 5) {
        this.channel_map[0] = EBUR128_LEFT;
        this.channel_map[1] = EBUR128_RIGHT;
        this.channel_map[2] = EBUR128_CENTER;
        this.channel_map[3] = EBUR128_LEFT_SURROUND;
        this.channel_map[4] = EBUR128_RIGHT_SURROUND;
    } else {
        for (i = 0; i < channels; ++i) {
          switch (i) {
            case 0:  this.channel_map[i] = EBUR128_LEFT;           break;
            case 1:  this.channel_map[i] = EBUR128_RIGHT;          break;
            case 2:  this.channel_map[i] = EBUR128_CENTER;         break;
            case 3:  this.channel_map[i] = EBUR128_UNUSED;         break;
            case 4:  this.channel_map[i] = EBUR128_LEFT_SURROUND;  break;
            case 5:  this.channel_map[i] = EBUR128_RIGHT_SURROUND; break;
            default: this.channel_map[i] = EBUR128_UNUSED;         break;
          }
        }
    }
};

Ebur128.prototype.updateSamplePeak = function(src, srcStart, length) {
    for (var c = 0; c < this.channels; ++c) {
        var peak = -Infinity;
        var channelSrc = src[c];
        for (var i = 0; i < length; ++i) {
            peak = Math.max(peak, Math.abs(channelSrc[i + srcStart]));
        }
        this.sample_peak[c] = Math.max(this.sample_peak[c], peak);
    }
};

var interpolationCoeffs = new Float32Array([
    0.0017089843750, -0.0291748046875, -0.0189208984375, -0.0083007812500,
    0.0109863281250, 0.0292968750000, 0.0330810546875, 0.0148925781250,
    -0.0196533203125, -0.0517578125000, -0.0582275390625, -0.0266113281250,
    0.0332031250000, 0.0891113281250, 0.1015625000000, 0.0476074218750,
    -0.0594482421875, -0.1665039062500, -0.2003173828125, -0.1022949218750,
    0.1373291015625, 0.4650878906250, 0.7797851562500, 0.9721679687500,
    0.9721679687500, 0.7797851562500, 0.4650878906250, 0.1373291015625,
    -0.1022949218750, -0.2003173828125, -0.1665039062500, -0.0594482421875,
    0.0476074218750, 0.1015625000000, 0.0891113281250, 0.0332031250000,
    -0.0266113281250, -0.0582275390625, -0.0517578125000, -0.0196533203125,
    0.0148925781250, 0.0330810546875, 0.0292968750000, 0.0109863281250,
    -0.0083007812500, -0.0189208984375, -0.0291748046875, 0.0017089843750
]);

Ebur128.prototype.updateTruePeak = function(src, srcStart, length) {
    var factor = this.samplerate < 96000 ? 4
                                         : (this.samplerate < 96000 * 2 ? 2 : 1)
    if (factor === 1) {
        for (var c = 0; c < this.channels; ++c) {
            this.true_peak[c] = this.sample_peak[c];
        }
        return;
    }

    var coeffs = interpolationCoeffs;
    for (var c = 0; c < this.channels; ++c) {
        var peak = -Infinity;
        var channelSrc = src[c];
        var v = this.interpolatorState[c];

        for (var i = 0; i < length; ++i) {
            v[i + INTERPOLATION_PHASE_LENGTH - 1] = channelSrc[srcStart + i];

            for (var j = factor - 1; j >= 0; --j) {
                var sample = v[i] * coeffs[j] +
                             v[i + 1] * coeffs[j + 4] +
                             v[i + 2] * coeffs[j + 8] +
                             v[i + 3] * coeffs[j + 12] +
                             v[i + 4] * coeffs[j + 16] +
                             v[i + 5] * coeffs[j + 20] +
                             v[i + 6] * coeffs[j + 24] +
                             v[i + 7] * coeffs[j + 28] +
                             v[i + 8] * coeffs[j + 32] +
                             v[i + 9] * coeffs[j + 36] +
                             v[i + 10] * coeffs[j + 40] +
                             v[i + 11] * coeffs[j + 44];
                peak = Math.max(peak, Math.abs(sample));
            }
        }

        for (var i = length - INTERPOLATION_PHASE_LENGTH - 1; i < length; ++i) {
          v[i - (length - INTERPOLATION_PHASE_LENGTH - 1)] = v[i + INTERPOLATION_PHASE_LENGTH - 1];
        }

        this.true_peak[c] = Math.max(this.true_peak[c], peak);
    }
};

Ebur128.prototype.updateAudioData = function(src, srcStart, length) {
    var audioDataIndex = this.audio_data_index;
    var a = this.a;
    var b = this.b;

    for (var c = 0; c < this.channels; ++c) {
        var v = this.filterState[c];
        var channelSrc = src[c];
        var channelAudioData = this.audio_data[c];

        for (var i = 0; i < length; ++i) {
            v[0] = channelSrc[i + srcStart] -
                                a[1] * v[1] -
                                a[2] * v[2] -
                                a[3] * v[3] -
                                a[4] * v[4];

            channelAudioData[i + audioDataIndex] = b[0] * v[0] +
                                                   b[1] * v[1] +
                                                   b[2] * v[2] +
                                                   b[3] * v[3] +
                                                   b[4] * v[4];
            v[4] = v[3];
            v[3] = v[2];
            v[2] = v[1];
            v[1] = v[0];
        }

        var intV = this.filterStateInt32[c];
        // Get rid of subnormal floating points.
        if ((intV[4] & 0x7f800000) === 0) v[4] = 0;
        if ((intV[3] & 0x7f800000) === 0) v[3] = 0;
        if ((intV[2] & 0x7f800000) === 0) v[2] = 0;
        if ((intV[1] & 0x7f800000) === 0) v[1] = 0;
    }
};

Ebur128.prototype.filter = function(src, src_index, frames) {
    if ((this.mode & EBUR128_MODE_SAMPLE_PEAK) === EBUR128_MODE_SAMPLE_PEAK) {
        this.updateSamplePeak(src, src_index, frames);
    }

    if ((this.mode & EBUR128_MODE_TRUE_PEAK) === EBUR128_MODE_TRUE_PEAK) {
        this.updateTruePeak(src, src_index, frames);
    }

    this.updateAudioData(src, src_index, frames);
};

Ebur128.prototype.calc_gating_block = function(frames_per_block, optional_output) {
    var sum = 0;
    var audio_data_index = this.audio_data_index;
    var audio_data_frames = this.audio_data_frames;

    for (var c = 0; c < this.channels; ++c) {
        if (this.channel_map[c] === EBUR128_UNUSED) continue;
        var channel_sum = 0;
        var channelAudio_data = this.audio_data[c];
        if (audio_data_index < frames_per_block) {
            for (var i = 0; i < audio_data_index; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }

            for (var i = audio_data_frames - (frames_per_block - audio_data_index);
                 i < audio_data_frames; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }
        } else {
            for (var i = audio_data_index - frames_per_block; i < audio_data_index; ++i) {
                channel_sum += channelAudio_data[i] * channelAudio_data[i];
            }
        }

        if (this.channel_map[c] === EBUR128_LEFT_SURROUND ||
            this.channel_map[c] === EBUR128_RIGHT_SURROUND) {
            channel_sum *= 1.41;
        } else if (this.channel_map[c] === EBUR128_DUAL_MONO) {
            channel_sum *= 2;
        }
        sum += channel_sum;
    }

    sum /= frames_per_block;

    if (optional_output) {
        optional_output.result = sum;
    } else if (sum >= histogram_energy_boundaries[0]) {
        if (this.use_histogram) {
            var index = find_histogram_index(sum);
            this.block_energy_histogram[index] = this.block_energy_histogram[index] + 1;
        } else {
            this.block_list.unshift(sum);
        }
    }
};


Ebur128.prototype.checkSilence = function() {
    var loudness = this.loudness_momentary();
    if (loudness < SILENCE_THRESHOLD) {
        if (this.lastSilenceStarted === -1) {
            this.lastSilenceStarted = this.currentTime;
        }
    } else if (this.lastSilenceStarted !== -1) {
        if (this.lastSilenceStarted === 0)  {
            this.beginSilenceLength = this.currentTime;
        }
        this.lastSilenceStarted = -1;
    }
};

Ebur128.prototype.checkEndSilence = function() {
    if (this.lastSilenceStarted !== -1) {
        this.endSilenceLength = this.currentTime - this.lastSilenceStarted;
        this.lastSilenceStarted = -1;
    }
};

Ebur128.prototype.energy_shortterm = function () {
    return this.energy_in_interval(this.samples_in_100ms * 30);
};

Ebur128.prototype.add_frames = function(src, frames) {
    var src_index = 0;
    var originalFrames = frames;

    while (frames > 0) {
        if (frames >= this.needed_frames) {
            this.filter(src, src_index, this.needed_frames);
            src_index += this.needed_frames;
            frames -= this.needed_frames;
            this.audio_data_index += this.needed_frames;

            if ((this.mode & EBUR128_MODE_I) === EBUR128_MODE_I) {
                this.calc_gating_block(this.samples_in_100ms * 4, null);
            }

            if ((this.mode & EBUR128_MODE_LRA) === EBUR128_MODE_LRA) {
                this.short_term_frame_counter += this.needed_frames;
                if (this.short_term_frame_counter === this.samples_in_100ms * 30) {
                    var st_energy = this.energy_shortterm();
                    if (st_energy >= histogram_energy_boundaries[0]) {
                        if (this.use_histogram) {
                            var index = find_histogram_index(st_energy);
                            this.block_energy_histogram[index] = this.block_energy_histogram[index] + 1;
                        } else {
                            this.short_term_block_list.unshift(st_energy);
                        }
                    }
                }
                this.short_term_frame_counter = this.samples_in_100ms * 20;
            }

            this.checkSilence();

            this.currentTime += this.needed_frames;
            this.needed_frames = this.samples_in_100ms;

            if (this.audio_data_index === this.audio_data_frames) {
                this.audio_data_index = 0;
            }
        } else {
            this.filter(src, src_index, frames);
            this.audio_data_index += frames;
            if ((this.mode & EBUR128_MODE_LRA) === EBUR128_MODE_LRA) {
                this.short_term_frame_counter += frames;
            }
            this.checkSilence();
            this.currentTime += frames;
            this.needed_frames -= frames;
            frames = 0;
        }
    }
};

Ebur128.gated_loudness = function(ebur128s) {
    var relative_threshold = 0.0;
    var gated_loudness = 0.0;
    var above_thresh_counter = 0;
    var size = ebur128s.length;

    for (var i = 0; i < size; ++i) {
        if (ebur128s[i] && (ebur128s[i].mode & EBUR128_MODE_I) !== EBUR128_MODE_I) {
            throw new Error("invalid mode");
        }
    }

    for (var i = 0; i < size; ++i) {
        if (!ebur128s[i]) continue;
        if (ebur128s[i].use_histogram) {
            for (var j = 0; j < 1000; ++j) {
                relative_threshold += ebur128s[i].block_energy_histogram[j] * histogram_energies[j];
                above_thresh_counter += ebur128s[i].block_energy_histogram[j];
            }
        } else {
            for (var k = 0; k < ebur128s[i].block_list.length; ++k) {
                ++above_thresh_counter;
                relative_threshold += ebur128s[i].block_list[k];
            }
        }
    }

    if (!above_thresh_counter) {
        return -Infinity;
    }
    relative_threshold /= above_thresh_counter;
    relative_threshold *= relative_gate_factor;
    above_thresh_counter = 0;

    var start_index;
    if (relative_threshold < histogram_energy_boundaries[0]) {
        start_index = 0;
    } else {
        start_index = find_histogram_index(relative_threshold);
        if (relative_threshold > histogram_energies[start_index]) {
            ++start_index;
        }
    }

    for (i = 0; i < size; i++) {
        if (!ebur128s[i]) continue;
        if (ebur128s[i].use_histogram) {
            for (var j = start_index; j < 1000; ++j) {
                gated_loudness += ebur128s[i].block_energy_histogram[j] * histogram_energies[j];
                above_thresh_counter += ebur128s[i].block_energy_histogram[j];
            }
        } else {
            for (var k = 0; k < ebur128s[i].block_list.length; ++k) {
                var it = ebur128s[i].block_list[k];
                if (it >= relative_threshold) {
                    ++above_thresh_counter;
                    gated_loudness += it;
                }
            }
        }
    }

    if (!above_thresh_counter) {
        return -Infinity;
    }

    gated_loudness /= above_thresh_counter;
    return ebur128_energy_to_loudness(gated_loudness);
};

Ebur128.loudness_global = function(ebur128) {
    return Ebur128.gated_loudness([ebur128]);
};

Ebur128.loudness_global_multiple = function(ebur128s) {
    return Ebur128.gated_loudness(ebur128s);
};

Ebur128.prototype.energy_in_interval = function(interval_frames) {
    if (interval_frames > this.audio_data_frames) {
        throw new Error("invalid mode");
    }
    var out = {result: 0};
    this.calc_gating_block(interval_frames, out);
    return out.result;
};

Ebur128.prototype.loudness_momentary = function() {
    var energy = this.energy_in_interval(this.samples_in_100ms * 4);
    if (energy <= 0) {
        return -Infinity;
    }
    return ebur128_energy_to_loudness(energy);
};

Ebur128.prototype.loudness_shortterm = function() {
    var energy = this.energy_shortterm();
    if (energy <= 0) {
        return -Infinity;
    }
    return ebur128_energy_to_loudness(energy);
};

Ebur128.prototype.getSamplePeak = function() {
    if ((this.mode & EBUR128_MODE_SAMPLE_PEAK) !== EBUR128_MODE_SAMPLE_PEAK) {
        throw new Error("Wrong mode");
    }
    var ret = new Array(this.channels);
    for (var c = 0; c < ret.length; ++c) {
        ret[c] = this.sample_peak[c];
    }
    return ret;
};

Ebur128.prototype.getTruePeak = function() {
    if ((this.mode & EBUR128_MODE_TRUE_PEAK) !== EBUR128_MODE_TRUE_PEAK) {
        throw new Error("Wrong mode");
    }
    var ret = new Array(this.channels);
    for (var c = 0; c < ret.length; ++c) {
        ret[c] = Math.max(this.true_peak[c], this.sample_peak[c]);
    }
    return ret;
};

Ebur128.prototype.getSilence = function() {
    this.checkEndSilence();
    return {
        beginSilenceLength: this.beginSilenceLength / this.samplerate,
        endSilenceLength: this.endSilenceLength / this.samplerate
    };
};

Ebur128.prototype.loudness_global = function() {
    return Ebur128.loudness_global(this);
};

const SERIALIZATION_VERSION = 1;
Ebur128.prototype.serialize = function() {
    var headerSize = 8 + 4 + 4 + 4 + 4 + 4 + 4 + 4 + 4;
    var totalSize = headerSize + this.block_list.length * 4;

    var truePeak = (this.mode & EBUR128_MODE_TRUE_PEAK) === EBUR128_MODE_TRUE_PEAK ? this.getTruePeak() : NaN;
    var samplePeak = (this.mode & EBUR128_MODE_SAMPLE_PEAK) === EBUR128_MODE_SAMPLE_PEAK ? this.getSamplePeak() : NaN;

    if (truePeak) truePeak = Math.max.apply(Math, truePeak);
    if (samplePeak) samplePeak = Math.max.apply(Math, samplePeak);


    var ret = "EBUR128 " + util.int32BEString(SERIALIZATION_VERSION) +
              util.uint32BEString(totalSize) +
              util.uint32BEString(this.mode) +
              util.uint32BEString(this.channels) +
              util.uint32BEString(this.samplerate) +
              util.float32BEString(truePeak) +
              util.float32BEString(samplePeak) +
              util.uint32BEString(this.block_list.length);

    for (var i = 0; i < this.block_list.length; ++i) {
        ret += util.float32BEString(this.block_list[i]);
    }

    return ret;
};

function DeserializedEbur128(serialization) {
    this.use_histogram = false;
    this.mode = util.int32BE(serialization, 16);
    this.channels = util.int32BE(serialization, 20) >>> 0;
    this.samplerate = util.int32BE(serialization, 24 >>> 0);
    this.true_peak = util.float32BE(serialization, 28);
    this.sample_peak = util.float32BE(serialization, 32);
    this.block_list = new Array(util.int32BE(serialization, 36) >>> 0);

    for (var i = 0; i < this.block_list.length; ++i) {
        this.block_list[i] = util.float32BE(serialization, 40 + i * 4);
    }
}

DeserializedEbur128.prototype.getTruePeak = function() {
    return this.true_peak;
};

DeserializedEbur128.prototype.getSamplePeak = function() {
    return this.sample_peak;
};

DeserializedEbur128.prototype.loudness_global = Ebur128.prototype.loudness_global;

module.exports = Ebur128;

},{"../js/util":2}],12:[function(require,module,exports){
"use strict";

var Resampler = require("./Resampler");

const decoderPool = Object.create(null);
const resamplers = Object.create(null);
const bufferPool = Object.create(null);


const allocBuffer = function(size, channels) {
    var key = size + " " + channels;

    var buffers = bufferPool[key];
    if (!buffers || !buffers.length) {
        buffers = new Array(channels);
        for (var i = 0; i < channels; ++i) {
            buffers[i] = new Float32Array(size);
        }

        bufferPool[key] = [buffers];
    }

    return bufferPool[key].shift();
}

const freeBuffer = function(size, channels, buffer) {
    var key = size + " " + channels;
    bufferPool[key].push(buffer);
}

const allocResampler = function(channels, from, to) {
    var key = channels + " " + from + " " + to;
    var entry = resamplers[key];
    if (!entry) {
        entry = resamplers[key] = {
            allocationCount: 2,
            instances: [new Resampler(channels, from, to), new Resampler(channels, from, to)]
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new Resampler(channels, from, to));
        entry.allocationCount++;
        if (entry.allocationCount > 6) {
            throw new Error("memory leak");
        }
    }
    var ret = entry.instances.shift();
    ret.start();
    return ret;
};

const freeResampler = function(resampler) {
    var key = resampler.nb_channels + " " + resampler.in_rate + " " + resampler.out_rate;
    resamplers[key].instances.push(resampler);
    resampler.end();
};

const allocDecoderContext = function(name, Context, contextOpts) {
    var entry = decoderPool[name];

    if (!entry) {
        entry = decoderPool[name] = {
            allocationCount: 2,
            instances: [new Context(contextOpts), new Context(contextOpts)]
        };
    }

    if (entry.instances.length === 0) {
        entry.instances.push(new Context(contextOpts));
        entry.allocationCount++;
        if (entry.allocationCount > 6) {
            throw new Error("memory leak");
        }
    }

    return entry.instances.shift();
};

const freeDecoderContext = function(name, context) {
    context.removeAllListeners();
    decoderPool[name].instances.push(context);
    context.end();
};

module.exports = {
    allocResampler: allocResampler,
    freeResampler: freeResampler,
    allocDecoderContext: allocDecoderContext,
    freeDecoderContext: freeDecoderContext,
    allocBuffer: allocBuffer,
    freeBuffer: freeBuffer
};

},{"./Resampler":7}],13:[function(require,module,exports){
"use strict";

const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/g;

const indices = ["wav", "mp3", "aac", "webm", "ogg"];
const WAV = 0
const MP3 = 1;
const AAC = 2;
const WEBM = 3;
const OGG = 4;

function refine(type, str, matchIndex) {
    if (type === "wav") { 
        var fmt = (str.charCodeAt(matchIndex + 20 + 0) & 0xFF) |
                  (str.charCodeAt(matchIndex + 20 + 1) << 8);
        switch (fmt) {
            case 0x0055: return "mp3";
            case 0x0001: return "wav";
            case 0x0003: return "wav";
            default: return "unknown";
        }

    } else {
        return type;
    }
}

exports.getCodecName = function(blob) {
    var reader = new FileReaderSync();
    var str = reader.readAsBinaryString(blob.slice(0, 8192));
    rType.lastIndex = 0;

    var match = rType.exec(str);

    if (match) {
        for (var i = 0; i < indices.length; ++i) {
            if (match[i + 1] !== undefined) {
                return refine(indices[i], str, rType.lastIndex - match[0].length);
            }
        }
    }

    return null;
};

},{}]},{},[8])(8)
});