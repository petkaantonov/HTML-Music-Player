(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.TrackAnalyzer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// This file should be ES5 compatible
/* eslint prefer-spread:0, no-var:0, prefer-reflect:0, no-magic-numbers:0 */
'use strict'
module.exports = (function () {
	// Import Events
	var events = require('events')

	// Export Domain
	var domain = {}
	domain.createDomain = domain.create = function () {
		var d = new events.EventEmitter()

		function emitError (e) {
			d.emit('error', e)
		}

		d.add = function (emitter) {
			emitter.on('error', emitError)
		}
		d.remove = function (emitter) {
			emitter.removeListener('error', emitError)
		}
		d.bind = function (fn) {
			return function () {
				var args = Array.prototype.slice.call(arguments)
				try {
					fn.apply(null, args)
				}
				catch (err) {
					emitError(err)
				}
			}
		}
		d.intercept = function (fn) {
			return function (err) {
				if ( err ) {
					emitError(err)
				}
				else {
					var args = Array.prototype.slice.call(arguments, 1)
					try {
						fn.apply(null, args)
					}
					catch (err) {
						emitError(err)
					}
				}
			}
		}
		d.run = function (fn) {
			try {
				fn()
			}
			catch (err) {
				emitError(err)
			}
			return this
		}
		d.dispose = function () {
			this.removeAllListeners()
			return this
		}
		d.enter = d.exit = function () {
			return this
		}
		return d
	}
	return domain
}).call(this)

},{"events":2}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],4:[function(require,module,exports){
"use strict";
const Promise = require("lib/bluebird");
const util = require("lib/util");
const VERSION = 3;
const NAME = "TagDatabase";
const KEY_NAME = "trackUid";
const ALBUM_KEY_NAME = "album";
const TABLE_NAME = "trackInfo";
const COVERART_TABLE_NAME = "coverart";
const READ_WRITE = "readwrite";
const READ_ONLY = "readonly";

const indexedDB = self.indexedDB || self.mozIndexedDB || self.msIndexedDB;

function TagDatabase() {
    var request = indexedDB.open(NAME, VERSION);
    this.db = util.IDBPromisify(request);
    this.db.suppressUnhandledRejections();

    this._onUpgradeNeeded = this._onUpgradeNeeded.bind(this);
    request.onupgradeneeded = this._onUpgradeNeeded;
}

TagDatabase.prototype._onUpgradeNeeded = function(event) {
    var db = event.target.result;
    var objectStore = Promise.resolve();
    var albumStore = Promise.resolve();

    try {
        objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
        objectStore = util.IDBPromisify(objectStore.transaction);
    } catch (e) {}

    try {
        albumStore = db.createObjectStore(COVERART_TABLE_NAME, { keyPath: ALBUM_KEY_NAME});
        albumStore = util.IDBPromisify(albumStore.transaction);
    } catch (e) {}

    this.db = Promise.all([objectStore, albumStore]).thenReturn(db);
};

TagDatabase.prototype.query = function(trackUid) {
    return this.db.then(function(db) {
        return util.IDBPromisify(db.transaction(TABLE_NAME).objectStore(TABLE_NAME).get(trackUid));
    });
};

TagDatabase.prototype.getAlbumImage = function(album) {
    if (!album) return Promise.resolve(null);
    return this.db.then(function(db) {
        return util.IDBPromisify(db.transaction(COVERART_TABLE_NAME).objectStore(COVERART_TABLE_NAME).get(album));
    });
};

TagDatabase.prototype.setAlbumImage = function(album, url) {
    if (!album) return Promise.resolve(null);
    album = album.toLowerCase();
    return this.db.then(function(db) {
        var store = db.transaction(COVERART_TABLE_NAME, READ_WRITE).objectStore(COVERART_TABLE_NAME);
        var obj = {
            album: album,
            url: url
        };
        return util.IDBPromisify(store.put(obj));
    });
};

TagDatabase.prototype.insert = function(trackUid, data) {
    data.trackUid = trackUid;
    var self = this;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return util.IDBPromisify(store.get(trackUid));
    }).then(function(previousData) {
        var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        var newData = util.assign({}, previousData || {}, data);
        return util.IDBPromisify(store.put(newData));
    });
};

const fieldUpdater = function(fieldName) {
    return function(trackUid, value) {
        var self = this;
        return this.db.then(function(db) {
            var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
            return util.IDBPromisify(store.get(trackUid));
        }).then(function(data) {
            var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
            data = Object(data);
            data.trackUid = trackUid;
            data[fieldName] = value;
            return util.IDBPromisify(store.put(data));
        });
    };
};

TagDatabase.prototype.updateAcoustId = fieldUpdater("acoustId");
TagDatabase.prototype.updateRating = fieldUpdater("rating");
TagDatabase.prototype.updateHasCoverArt = fieldUpdater("hasCoverArt");


self.removeTrackInfo = function(trackUid) {
    return ret.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        store.delete(trackUid);
    });
};

var ret = new TagDatabase();
module.exports = ret;

},{"lib/bluebird":17,"lib/util":23}],5:[function(require,module,exports){
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

var realFft = require("lib/realfft");
const Promise = require("lib/bluebird");
const AcoustIdApiError = require("audio/AcoustIdApiError");
const util = require("lib/util");
const tagDatabase = require("TagDatabase");

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

const getBestRecordingGroup = function(recordings) {
    recordings.reverse();
    var groups = [];

    for (var i = 0; i < recordings.length; ++i) {
        var recording = recordings[i];
        if (!recording || !recording.releasegroups) {
            continue;
        }
        var releasegroups = recording.releasegroups;
        if (!releasegroups) {
            continue;
        }
        for (var j = 0; j < releasegroups.length; ++j) {
            var releasegroup = releasegroups[j];
            if (!releasegroup) {
                continue;
            }

            if (!releasegroup.type) {
                releasegroup.type = "crap";
            }

            var secondarytypes = releasegroup.secondarytypes;
            groups.push({
                indexI: i,
                indexJ: j,
                recording: recording,
                type: releasegroup.type.toLowerCase(),
                album: releasegroups[j],
                secondarytypes: secondarytypes ? secondarytypes.map(function(v) {
                    return v.toLowerCase();
                }) : null
            });
        }
    }

    groups.sort(function(a, b) {
        if (a.type === "album" && b.type === "album") {
            var aSec = a.secondarytypes;
            var bSec = b.secondarytypes;

            if (aSec && bSec) {
                var aCompilation = aSec.indexOf("compilation") >= 0;
                var bCompilation = bSec.indexOf("compilation") >= 0;

                if (aCompilation && bCompilation) {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                } else if (aCompilation && !bCompilation) {
                    return 1;
                } else if (!aCompilation && bCompilation) {
                    return -1;
                } else {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                }
            } else if (aSec && !bSec) {
                return 1;
            } else if (!aSec && bSec) {
                return -1;
            } else {
                var diff = a.indexI - b.indexI;
                if (diff !== 0) return diff;
                return a.indexJ - b.indexJ;
            }
        } else if (a.type === "album") {
            return -1;
        } else {
            return 1;
        }
    });

    if (!groups.length) {
        return {
            recording: recordings[0],
            album: null
        };
    }

    return groups[0];
};

const formatArtist = function (artists) {
    if (artists.length === 1) {
        return artists[0].name;
    } else {
        var ret = "";
        for (var i = 0; i < artists.length - 1; ++i) {
            ret += artists[i].name + artists[i].joinphrase;
        }
        ret += artists[i].name;
        return ret;
    }
};

const parseAcoustId = function (data) {
    if (!data) {
        throw new AcoustIdApiError("Invalid JSON response", -1);
    }

    if (data.status === "error") {
        throw new AcoustIdApiError(data.error.message, data.error.code);
    }

    var result = data.results && data.results[0] || null;

    if (!result) return null;
    if (!result.recordings || result.recordings.length === 0) return null;
    var bestRecordingGroup = getBestRecordingGroup(result.recordings);
    if (!bestRecordingGroup) return null;
    var recording = bestRecordingGroup.recording;

    var title = {
        name: recording.title,
        mbid: recording.id,
        type: "release"
    };
    var album = null;

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: "release-group"
        };
    }

    var artist = null;
    if (recording.artists && recording.artists.length) {
        artist = {
            name: formatArtist(recording.artists),
            mbid: recording.artists[0].id,
            type: "artist"
        };
    }

    return {
        title: title,
        album: album,
        artist: artist
    };
};

AcoustId.fetch = function(args, _retries) {
    if (!_retries) _retries = 0;

    return new Promise(function(resolve, reject) {
        var duration = (+args.duration)|0;
        var fingerprint = args.fingerprint;
        var data = util.queryString({
            client: "djbbrJFK",
            format: "json",
            duration: duration,
            meta: "recordings+releasegroups+compress",
            fingerprint: fingerprint
        });
        var xhr = new XMLHttpRequest();
        xhr.timeout = 5000;
        var url = "https://api.acoustId.org/v2/lookup?" + data;

        function error() {
            reject(new Promise.TimeoutError("request timed out"));
        }

        xhr.addEventListener("load", function() {
            try {
              var result = JSON.parse(this.responseText);
              resolve(result);
            } catch (e) {
              reject(e);
            }
        }, false);

        xhr.addEventListener("abort", error);
        xhr.addEventListener("timeout", error);
        xhr.addEventListener("error", error);

        xhr.open("GET", url);
        xhr.send(null);
    }).then(parseAcoustId)
    .catch(AcoustIdApiError, function(e) {
        if (e.isRetryable() && _retries <= 5) {
            return AcoustId.fetch(args, _retries + 1);
        } else {
            throw e;
        }
    }).tap(function(result) {
        if (result) {
            tagDatabase.updateAcoustId(args.uid, result);
        }
    })
};

var imageFetchQueue = [];
var currentImageFetch = false;

const next = function() {
    if (imageFetchQueue.length > 0) {
        var item = imageFetchQueue.shift();
        item.resolve(actualFetchImage(item.args));
    } else {
        currentImageFetch = false;
    }
};
AcoustId.fetchImage = function(args) {
    return new Promise(function(resolve) {
        if (!currentImageFetch) {
            currentImageFetch = true;
            resolve(actualFetchImage(args));
        } else {
            imageFetchQueue.push({
                args: args,
                resolve: resolve
            });
        }
    }).finally(next);

};

const actualFetchImage = function(args) {
    var albumKey = args.albumKey;
    var uid = args.uid;
    var acoustId = args.acoustId;
    return tagDatabase.getAlbumImage(albumKey).then(function(image) {
        if (image) return image;

        if (acoustId && acoustId.album) {
            var type = acoustId.album.type;
            var mbid = acoustId.album.mbid;
            var url = "https://coverartarchive.org/" + type + "/" + mbid + "/front-250";
            var ret = {url: url};
            tagDatabase.setAlbumImage(albumKey, url);
            return ret;
        } else {
            return null;
        }
    });
};


module.exports = AcoustId;

},{"TagDatabase":4,"audio/AcoustIdApiError":6,"lib/bluebird":17,"lib/realfft":21,"lib/util":23}],6:[function(require,module,exports){
"use strict";

const util = require("lib/util");

const codeToString = function(code) {
    return Object.keys(AcoustIdApiError).filter(function(key) {
        var value = AcoustIdApiError[key];
        return typeof value === "number" && code === value;
    })[0] || "ERROR_UNKNOWN";
};

var AcoustIdApiError = util.subClassError("AcoustIdApiError", function(message, code) {
    this.code = code;
    this.message = message || codeToString(code);
});

AcoustIdApiError.ERROR_INVALID_RESPONSE_SYNTAX = -1;
AcoustIdApiError.ERROR_UNKNOWN_FORMAT = 1;
AcoustIdApiError.ERROR_MISSING_PARAMETER = 2;
AcoustIdApiError.ERROR_INVALID_FINGERPRINT = 3;
AcoustIdApiError.ERROR_INVALID_APIKEY = 4;
AcoustIdApiError.ERROR_INTERNAL = 5;
AcoustIdApiError.ERROR_INVALID_USER_APIKEY = 6;
AcoustIdApiError.ERROR_INVALID_UUID = 7;
AcoustIdApiError.ERROR_INVALID_DURATION = 8;
AcoustIdApiError.ERROR_INVALID_BITRATE = 9;
AcoustIdApiError.ERROR_INVALID_FOREIGNID = 10;
AcoustIdApiError.ERROR_INVALID_MAX_DURATION_DIFF = 11;
AcoustIdApiError.ERROR_NOT_ALLOWED = 12;
AcoustIdApiError.ERROR_SERVICE_UNAVAILABLE = 13;
AcoustIdApiError.ERROR_TOO_MANY_REQUESTS = 14;
AcoustIdApiError.ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN = 15;
AcoustIdApiError.ERROR_INSECURE_REQUEST = 14;

AcoustIdApiError.prototype.isFatal = function() {
    switch (this.code) {
        case AcoustIdApiError.ERROR_INVALID_RESPONSE_SYNTAX:
        case AcoustIdApiError.ERROR_UNKNOWN_FORMAT:
        case AcoustIdApiError.ERROR_MISSING_PARAMETER:
        case AcoustIdApiError.ERROR_INVALID_FINGERPRINT:
        case AcoustIdApiError.ERROR_INVALID_APIKEY:
        case AcoustIdApiError.ERROR_INVALID_USER_APIKEY:
        case AcoustIdApiError.ERROR_INVALID_UUID:
        case AcoustIdApiError.ERROR_INVALID_DURATION:
        case AcoustIdApiError.ERROR_INVALID_BITRATE:
        case AcoustIdApiError.ERROR_INVALID_FOREIGNID:
        case AcoustIdApiError.ERROR_INVALID_MAX_DURATION_DIFF:
        case AcoustIdApiError.ERROR_INVALID_MUSICBRAINZ_ACCESS_TOKEN:
        case AcoustIdApiError.ERROR_INSECURE_REQUEST:
            return true;
        default:
            return false;
    }
};

AcoustIdApiError.prototype.isRetryable = function() {
    return !this.isFatal();
};

module.exports = AcoustIdApiError;


},{"lib/util":23}],7:[function(require,module,exports){
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

},{}],8:[function(require,module,exports){
"use strict";

const tagDatabase = require("TagDatabase");
const Promise = require("lib/bluebird");
const sniffer = require("audio/sniffer");
const FileView = require("lib/FileView");
const parseMp3Metadata = require("metadata/mp3_metadata");

const maxActive = 8;
const queue = [];
var active = 0;

const codecNotSupportedError = function() {
    var e = new Error("codec not supported");
    e.name = "CodecNotSupportedError";
    return e;
};

const next = function() {
    active--;
    if (queue.length > 0) {
        var item = queue.shift();
        var parser = new MetadataParser(item.file, item.resolve);
        active++;
        parser.parse();
    }
};

function MetadataParser(file, resolve) {
    this.file = file;
    this.resolve = resolve;
    this.fileView = new FileView(file);
}

MetadataParser.prototype.parse = function() {
    var self = this;
    var data = {
        basicInfo: {
            duration: NaN,
            sampleRate: 44100,
            channels: 2
        }
    };
    var done = sniffer.getCodecName(this.fileView).then(function(codecName) {
        if (!codecName) {
            throw codecNotSupportedError();
        }

        switch(codecName) {
            case "wav":
            case "webm":
            case "aac":
            case "ogg":
                throw codecNotSupportedError();
            case "mp3":
                return parseMp3Metadata(data, self.fileView);
        }
    }).catch(function(e) {
        throw codecNotSupportedError();
    }).tap(function() {
        return data;
    });

    this.resolve(done);
};

MetadataParser.parse = function(args) {
    return new Promise(function(resolve) {
        if (active >= maxActive) {
            queue.push({
                file: args.file,
                resolve: resolve
            });
        } else {
            var parser = new MetadataParser(args.file, resolve);
            active++;
            parser.parse()
        }
    }).finally(next);
};

MetadataParser.fetchAnalysisData = function(args) {
    var data = tagDatabase.query(args.uid);
    var albumImage = tagDatabase.getAlbumImage(args.albumKey);

    return Promise.join(data, albumImage, function(data, albumImage) {
        if (data && albumImage) {
            data.albumImage = albumImage;
        }
        return data;
    });
};

module.exports = MetadataParser;

},{"TagDatabase":4,"audio/sniffer":14,"lib/FileView":15,"lib/bluebird":17,"metadata/mp3_metadata":24}],9:[function(require,module,exports){
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

var id = 0;
function Resampler(nb_channels, in_rate, out_rate, quality) {
    if (quality === undefined) quality = 0;
    this.id = id++;
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

},{}],10:[function(require,module,exports){
"use strict";
self.EventEmitter = require("lib/events");
require("lib/text_codec");

// Utilize 20% of one core.
const MAX_CPU_UTILIZATION = 0.2;

const getDowntime = function(cpuUsedTime) {
    return cpuUsedTime / MAX_CPU_UTILIZATION - cpuUsedTime;
};

const simulateTick = require("lib/patchtimers");
const Promise = require("lib/bluebird");
Promise.setScheduler(function(fn) { fn(); });
Promise.config({
    cancellation: false,
    warnings: false,
    longStackTraces: false
});
const blobPatch = require("lib/blobpatch");
blobPatch();


const util = require("lib/util");
const tagDatabase = require("TagDatabase");
const MetadataParser = require("audio/MetadataParser");
const Resampler = require("audio/Resampler");
const ChannelMixer = require("audio/ChannelMixer");
const FileView = require("lib/FileView");
const demuxer = require("audio/demuxer");
const codec = require("audio/codec");
const sniffer = require("audio/sniffer");
const pool = require("pool");
const AcoustId = require("audio/AcoustId");
const Ebur128 = require("audio/ebur128");

const allocBuffer = pool.allocBuffer;
const freeBuffer = pool.freeBuffer;
const allocResampler = pool.allocResampler;
const allocDecoderContext = pool.allocDecoderContext;
const freeResampler = pool.freeResampler;
const freeDecoderContext = pool.freeDecoderContext;

const BUFFER_DURATION = 30;
const WORST_RESAMPLER_QUALITY = 0;
const FINGERPRINT_SAMPLE_RATE = 11025;
const FINGERPRINT_DURATION = 120;
const FINGERPRINT_CHANNELS = 1;

const fingerprintMixer = new ChannelMixer(FINGERPRINT_CHANNELS);

var queue = [];
var processing = false;
var shouldAbort = false;
var currentJobId = -1;

const promiseMessageSuccessErrorHandler = function(args, p, jobType) {
    return p.then(function(result) {
        postMessage({
            id: args.id,
            result: result,
            jobType: jobType,
            type: "success"
        });
        return result;
    }).catch(function(e) {
        postMessage({
            id: args.id,
            type: "error",
            jobType: jobType,
            error: {
                message: e.message,
                stack: e.stack
            }
        });
    })
};

const apiActions = {
    analyze: function(args) {
        queue.push(args);
        if (!processing) nextJob();
    },
    abort: function(args) {
        var jobId = args.id;
        if (currentJobId === jobId) {
            shouldAbort = true;
        }
    },
    parseMetadata: function(args) {
        promiseMessageSuccessErrorHandler(args, MetadataParser.parse(args), "metadata");
    },

    fetchAnalysisData: function(args) {
        promiseMessageSuccessErrorHandler(args, MetadataParser.fetchAnalysisData(args), "analysisData");
    },

    fetchAcoustId: function(args) {
        promiseMessageSuccessErrorHandler(args, AcoustId.fetch(args), "acoustId");
    },

    fetchAcoustIdImage: function(args) {
        promiseMessageSuccessErrorHandler(args, AcoustId.fetchImage(args), "acoustIdImage");
    },

    rateTrack: function(args) {
        tagDatabase.updateRating(args.uid, args.rating);
    },

    tick: simulateTick
}


function delay(value, ms) {
    return new Promise(function(resolve) {
        setTimeout(function() {
            resolve(value);
        }, ms);
    });
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

    var decoder;
    var resamplerFingerprint;
    var fingerprintBuffers;
    var fingerprintSource;
    var sampleRate;
    var channels;
    var codecName;
    currentJobId = id;

    var view = new FileView(file);

    sniffer.getCodecName(view).then(function(codecName) {
        if (!codecName) {
            reportError(id, new Error("file type not supported"));
            return;
        }
        return codec.getCodec(codecName);
    }).then(function(codec) {
        if (!codec) return;

        return demuxer(codec.name, view).then(function(metadata) {
            if (!metadata) {
                reportError(id, new Error("file type not supported"));
                return;
            }

            var result = {
                loudness: null,
                fingerprint: null,
                duration: metadata.duration
            };

            var tooLongToScan = false;
            if (metadata.duration) {
                tooLongToScan = metadata.duration > 30 * 60;
            } else {
                tooLongToScan = file.size > 100 * 1024 * 1024;
            }

            if (tooLongToScan) {
                return reportSuccess(id, result);
            }

            codecName = codec.name;
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

            var offset = metadata.dataStart;
            var aborted = false;
            var started = Date.now();

            return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2).then(function loop() {
                flushed = false;
                var buffer = view.block();
                var decodeStart = Date.now();
                var srcStart = view.toBufferOffset(offset);
                var srcEnd = decoder.decodeUntilFlush(buffer, srcStart);
                var downtime = getDowntime(Date.now() - decodeStart);
                var bytesRead = (srcEnd - srcStart);
                offset += bytesRead;

                var progress = (offset - metadata.dataStart) / (metadata.dataEnd - metadata.dataStart);

                if (progress > 0.15 && started > 0) {
                    var elapsed = Date.now() - started;
                    var estimate = Math.round(elapsed / progress - elapsed);
                    started = -1;
                    reportEstimate(id, estimate);
                }

                if (!flushed &&
                    (metadata.dataEnd - offset <= metadata.maxByteSizePerSample * metadata.samplesPerFrame * 10)) {
                    return Promise.delay(downtime);
                }

                if (shouldAbort) {
                    aborted = true;
                    reportAbort(id);
                    return Promise.delay(downtime);
                }

                var readStarted = Date.now();
                return view.readBlockOfSizeAt(metadata.maxByteSizePerSample * sampleRate * BUFFER_DURATION, offset, 2)
                        .then(function() {
                            var waitTime = Math.max(0, downtime - (Date.now() - readStarted));
                            return Promise.delay(waitTime).then(loop);
                        });
            }).then(function() {
                if (aborted) {
                    return;
                }

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

                var flattened = util.assign({duration: result.duration},
                                            result.loudness || {},
                                            result.fingerprint || {});
                return tagDatabase.insert(job.uid, flattened)
                    .catch(function(e) {})
                    .then(function() {
                        reportSuccess(id, flattened);
                    });
            });
        });
    }).catch(function(e) {
        reportError(id, e);
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
        type: "abort",
        jobType: "analyze"
    });
}

function reportEstimate(id, value) {
    self.postMessage({
        id: id,
        type: "estimate",
        value: value,
        jobType: "analyze"
    });
}

function reportError(id, e) {
    self.postMessage({
        id: id,
        type: "error",
        jobType: "analyze",
        error: {
            message: e.message,
            stack: e.stack
        }
    });
}

function reportSuccess(id, result) {
    self.postMessage({
        id: id,
        type: "success",
        jobType: "analyze",
        result: result
    });
}

self.onmessage = function(event) {
    var data = event.data;

    var method = apiActions[data.action];

    if (typeof method === "function") {
        method(data.args);
    } else {
        throw new Error("unknown api action: " + data.action);
    }
};

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});

},{"TagDatabase":4,"audio/AcoustId":5,"audio/ChannelMixer":7,"audio/MetadataParser":8,"audio/Resampler":9,"audio/codec":11,"audio/demuxer":12,"audio/ebur128":13,"audio/sniffer":14,"lib/FileView":15,"lib/blobpatch":16,"lib/bluebird":17,"lib/events":18,"lib/patchtimers":20,"lib/text_codec":22,"lib/util":23,"pool":25}],11:[function(require,module,exports){
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
        var url = globalObject.DEBUGGING === false ? "codecs/" + name + ".min.js" : "codecs/" + name + ".js";
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
},{}],12:[function(require,module,exports){
"use strict";

const Promise = require("lib/bluebird");
const FileView = require("lib/FileView");

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

const LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP = 5 * 1024 * 1024;
const NETWORK_FILE_MAX_BYTES_UNTIL_GIVEUP = 50 * 1024;

const BLOCK_SIZE = 16384;

function probablyMp3Header(header) {
    return !(((header & 0xffe00000) !== -2097152)     ||
             ((header & (3 << 17)) !== (1 << 17))     ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
}


function demuxMp3FromWav(offset, fileView) {
    var max = Math.min(offset + 4096, fileView.end);

    var chunkSize = fileView.getInt32(offset + 4, true);
    var dataEnd = offset + chunkSize + 8;
    var subChunkSize = fileView.getInt32(offset + 16, true);
    var fmt = fileView.getInt16(offset + 20, true);
    var channels = fileView.getInt16(offset + 22, true);
    var sampleRate = fileView.getInt32(offset + 24, true);
    var lsf = sampleRate < 32000;
    var samplesPerFrame = lsf ? 576 : 1152;
    var byteRate = fileView.getInt32(offset + 28, true);
    var align = fileView.getInt16(offset + 32, true);
    var bitsPerSample = fileView.getInt16(offset + 34, true);
    var extraParamSize = fileView.getInt16(offset + 36, true);
    var wId = fileView.getInt16(offset + 38, true);
    var flags = fileView.getInt32(offset + 40, true);
    var blockSize = fileView.getInt16(offset + 44, true);
    var framesPerBlock = fileView.getInt16(offset + 46, true);
    var encoderDelay = fileView.getInt16(offset + 48, true);
    var frames = 0;

    offset += subChunkSize + 16 + 4;
    var duration = 0;
    while (offset < max) {
        var nextChunk = fileView.getInt32(offset, false);
        offset += 4;
        if (nextChunk === FACT) {
            var size = fileView.getInt32(offset, true);
            offset += 4;
            var samples = fileView.getInt32(offset, true);
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

            var ret = {
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
                maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
                seekTable: null,
                toc: null
            };
            return ret;
        } else {
            offset += 2;
        }

    }
    return null;
}

function demuxMp3(fileView, noSeekTable, maxSize) {
    var offset = 0;
    var dataStart = 0;
    var dataEnd = fileView.file.size;
    var samplesPerFrame = 1152;
    if (maxSize === undefined) {
        maxSize = LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP;
    }

    return fileView.readBlockOfSizeAt(65536, 0).then(function() {
        if (fileView.end < 65536) return null;
        if ((fileView.getUint32(0, false) >>> 8) === ID3) {
            var footer = ((fileView.getUint8(5) >> 4) & 1) * 10;
            var size = (fileView.getUint8(6) << 21) |
                       (fileView.getUint8(7) << 14) |
                       (fileView.getUint8(8) << 7) |
                       fileView.getUint8(9);
            offset = size + 10 + footer;
            dataStart = offset;
        }

        return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 4).then(function() {
            if (fileView.getInt32(dataStart, false) === RIFF &&
                fileView.getInt32(dataStart + 8, false) === WAVE) {
                return demuxMp3FromWav(dataStart, fileView);
            }

            var max = Math.min(dataEnd, maxSize);
            var metadata = null;
            var headersFound = 0;

            return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 4).then(function loop() {
                var localOffset = offset;
                var localMax = Math.max(0, Math.min(max - offset, BLOCK_SIZE / 2));

                if (localMax === 0) return;

                for (var i = 0; i < localMax; ++i) {
                    var index = localOffset + i;
                    var header = fileView.getInt32(index);

                    if (probablyMp3Header(header)) {
                        if (headersFound > 4) {
                            return;
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
                        var nextHeader = fileView.getInt32(index + 4 + frame_size - 4, false);

                        if (!probablyMp3Header(nextHeader)) {
                            if (fileView.getInt32(index + 4 + 32) === VBRI) {
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
                                dataStart: index,
                                dataEnd: dataEnd,
                                averageFrameSize: ((bitRate / 1000) * 144000) / (sampleRate << lsf),
                                vbr: false,
                                duration: 0,
                                samplesPerFrame: samplesPerFrame,
                                maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
                                seekTable: null,
                                toc: null
                            };
                        }
                        header = 0;
                        // VBRI
                    } else if (header === VBRI) {
                        metadata.vbr = true;
                        localOffset = index + 4 + 10;
                        var frames = fileView.getUint32(localOffset, false);
                        metadata.frames = frames;
                        metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
                        localOffset += 4;
                        var entries = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var entryScale = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var sizePerEntry = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var framesPerEntry = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var entryOffset = localOffset + entries + sizePerEntry;
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
                            case 4: method = fileView.getUint32; break;
                            case 3: method = fileView.getUint32; shift = 8; break;
                            case 2: method = fileView.getUint16; break;
                            case 1: method = fileView.getUint8; break;
                            default: return null;
                        }

                        var j = 0;
                        table[0] = dataStart;
                        for (; j < entries; ++j) {
                            var value = method.call(fileView, localOffset + (j * sizePerEntry)) >>> shift;
                            entryOffset += (value * entryScale);
                            table[j + 1] = entryOffset;
                        }

                        // 1159, 864, or 529
                        // http://mp3decoders.mp3-tech.org/decoders_lame.html
                        metadata.encoderDelay = 1159;
                        metadata.dataStart = dataStart;
                        return;
                    // Xing | Info
                    } else if (header === Xing || header === Info) {
                        if (header === Xing) {
                            metadata.vbr = true;
                        }

                        localOffset = index + 4;
                        var fields = fileView.getUint32(localOffset, false);
                        localOffset += 4;

                        var frames = -1;
                        if ((fields & 0x7) !== 0) {
                            if ((fields & 0x1) !== 0) {
                                var frames = fileView.getUint32(localOffset, false);
                                metadata.frames = frames;
                                metadata.duration = (frames * samplesPerFrame / metadata.sampleRate);
                                localOffset += 4;
                            }
                            if ((fields & 0x2) !== 0) {
                                localOffset += 4;
                            }
                            if ((fields & 0x4) !== 0) {
                                var toc = new Uint8Array(100);
                                for (var j = 0; j < 100; ++j) {
                                    toc[j] = fileView.getUint8(localOffset + j);
                                }
                                metadata.toc = toc;
                                localOffset += 100;
                            }
                            if (fields & 0x8 !== 0) localOffset += 4;
                        }

                        // LAME
                        if (fileView.getInt32(localOffset, false) === LAME) {
                            localOffset += (9 + 1 + 1 + 8 + 1 + 1);
                            var padding = (fileView.getInt32(localOffset, false) >>> 8);
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
                            localOffset += (3 + 1 + 1 + 2 + 4 + 2 + 2);
                        }

                        metadata.dataStart = localOffset;
                        return;
                    }
                }

                localOffset += i;
                offset = localOffset;
                return fileView.readBlockOfSizeAt(BLOCK_SIZE, localOffset, 4).then(loop);
            }).then(function() {
                if (!metadata) {
                    return null;
                }

                if (metadata.duration === 0) {
                    var size = Math.max(0, metadata.dataEnd - metadata.dataStart);
                    if (!metadata.vbr) {
                        metadata.duration = (size * 8) / metadata.bitRate;
                        metadata.frames = ((metadata.sampleRate * metadata.duration) / metadata.samplesPerFrame) | 0;
                    } else if (!noSeekTable) {
                        // VBR without Xing or VBRI header = need to scan the entire file.
                        // What kind of sadist encoder does this?
                        metadata.seekTable = new Mp3SeekTable();
                        metadata.seekTable.fillUntil(30 * 60, metadata, fileView);
                        metadata.frames = metadata.seekTable.frames;
                        metadata.duration = (metadata.frames * metadata.samplesPerFrame) / metadata.sampleRate;
                    }
                }

                if (metadata.duration < MINIMUM_DURATION) {
                    return null;
                }

                return metadata;
            });
        });
    });
}

module.exports = function(codecName, fileView, noSeekTable, maxSize) {
    try {
        if (codecName === "mp3") {
            return demuxMp3(fileView, noSeekTable, maxSize);
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

Mp3SeekTable.prototype.fillUntil = Promise.method(function(time, metadata, fileView) {
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

    var self = this;
    var header = 0;
    return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 10).then(function loop() {
        var localEnd = Math.min(end, offset + BLOCK_SIZE / 2);
        var buffer = fileView.block();

        while (offset < localEnd && frames < maxFrames) {
            var i = offset - fileView.start;
            header = ((header << 8) | buffer[i]) | 0;

            if (!probablyMp3Header(header)) {
                offset++;
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
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) {
                offset++;
                continue;
            }
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) {
                offset++;
                continue;
            }
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            table[frames] = (offset - 3);
            frames++;

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            self.lastFrameSize = frame_size;
            offset += (frame_size - 4);

            if (frames >= maxFrames) {
                return;
            }
        }

        if (localEnd >= fileView.file.size) return;
        return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 10).then(loop);
    }).then(function() {
        self.frames = frames;
        self.tocFilledUntil = (metadata.samplesPerFrame / metadata.sampleRate) * frames;
    });
});

module.exports.Mp3SeekTable = Mp3SeekTable;

},{"lib/FileView":15,"lib/bluebird":17}],13:[function(require,module,exports){
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
const util = require("lib/util");

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

},{"lib/util":23}],14:[function(require,module,exports){
"use strict";

const RIFF = 1380533830|0;
const WAVE = 1463899717|0;
const ID3 = 0x494433|0;
const OGGS = 0x4f676753|0;
const WEBM = 0x1A45DFA3|0;
const AAC_1 = 0xFFF1|0;
const AAC_2 = 0xFFF9|0;

const mimeMap = {
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3"
};
const extMap = {
    "mp3": "mp3"
};

const probablyMp3Header = function(header) {
    return !(((header & 0xffe00000) !== -2097152)     ||
             ((header & (3 << 17)) !== (1 << 17))     ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
};

const rext = /\.([a-z0-9]+)$/i;
const getExtension = function(str) {
    var ret = str.match(rext);
    if (ret) return ret[1].toLowerCase();
    return null;
};

function refine(type, fileView, index) {
    if (type === "wav") {
        if (index >= fileView.end - 22) {
            return "wav";
        }
        var fmt = fileView.getUint16(index + 20, true);
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

exports.getCodecName = function(fileView) {
    return fileView.readBlockOfSizeAt(8192, 0).then(function() {
        const end = fileView.end;
        for (var i = 0; i < end - 4; ++i) {
            var value = fileView.getInt32(i, false);

            if (value === RIFF &&
                i < end - 12 &&
                fileView.getInt32(i + 8) === WAVE) {
                return refine("wav", fileView, i);
            } else if ((value >>> 8) === ID3 || probablyMp3Header(value)) {
                return refine("mp3", fileView, i);
            } else if ((value >>> 16) === AAC_1 || (value >>> 16) === AAC_2) {
                return refine("aac", fileView, i);
            } else if (value === WEBM) {
                return refine("webm", fileView, i);
            } else if (value === OGGS) {
                return refine("ogg", fileView, i);
            }
        }

        var file = fileView.file;

        if (mimeMap[file.type]) {
            return mimeMap[file.type];
        }

        var ext = getExtension(file.name);

        if (ext) return extMap[etx] || null;
        
        return null;
    });
};

},{}],15:[function(require,module,exports){
"use strict";

const Promise = require("lib/bluebird");
const blobPatch = require("lib/blobpatch");
blobPatch();
const util = require("lib/util");

function isRetryable(e) {
    return e && e.name === "NotReadableError";
}

function FileView(file) {
    this.file = file;
    this.dataview = null;
    this.buffer = null;
    this.start = -1;
    this.end = -1;
    this._readInProgress = false;
}

FileView.prototype.toBufferOffset = function(fileOffset) {
    return fileOffset - this.start;
};

FileView.prototype.ensure = function(offset, length) {
    if (!(this.start <= offset && offset + length <= this.end)) {
        throw new Error("read out of bounds");
    }
};

FileView.prototype.getFloat64 = function(offset, le) {
    return this.dataview.getFloat64(offset - this.start, le);
};

FileView.prototype.getFloat32 = function(offset, le) {
    return this.dataview.getFloat32(offset - this.start, le);
};

FileView.prototype.getUint32 = function(offset, le) {
    return this.dataview.getUint32(offset - this.start, le);
};

FileView.prototype.getInt32 = function(offset, le) {
    return this.dataview.getInt32(offset - this.start, le);
};

FileView.prototype.getUint16 = function(offset, le) {
    return this.dataview.getUint16(offset - this.start, le);
};

FileView.prototype.getInt16 = function(offset, le) {
    return this.dataview.getInt16(offset - this.start, le);
};

FileView.prototype.getUint8 = function(offset) {
    return this.dataview.getUint8(offset - this.start);
};

FileView.prototype.getInt8 = function(offset) {
    return this.dataview.getInt8(offset - this.start);
};

FileView.prototype.block = function() {
    if (!this.buffer) throw new Error("no block available");
    return this.buffer;
};

FileView.prototype.modifyBlock = function(callback) {
    if (!this.buffer) throw new Error("no block available");
    var length = this.buffer.length;
    var result = callback(this.buffer);
    var change = result.length - length;
    var start = this.start;
    var end = this.end;
    
    start += change;
    end += change;

    start = Math.max(0, Math.min(this.file.size, start));
    end = Math.max(0, Math.min(this.file.size, end));
    end = Math.max(start, end);

    this.start = start;
    this.end = end;
    this.buffer = new Uint8Array(result);
    this.dataview = new DataView(result);
};

FileView.prototype.readBlockOfSizeAt = function(size, startOffset, paddingFactor) {
    if (this._readInProgress) {
        return Promise.reject(new Error("invalid parallel read"));
    }
    this._readInProgress = true;
    var self = this;
    size = Math.ceil(size);
    startOffset = Math.ceil(startOffset);
    return new Promise(function(resolve, reject) {
        if (!paddingFactor || paddingFactor <= 1 || paddingFactor === undefined) paddingFactor = 1;
        var maxSize = self.file.size;
        var start = Math.min(maxSize - 1, Math.max(0, startOffset));
        var end = Math.min(maxSize, start + size);

        if (self.buffer && 
            (self.start <= start && end <= self.end)) {
            return resolve();
        }

        end = Math.min(maxSize, start + size * paddingFactor);
        self.start = start;
        self.end = end;
        self.buffer = null;
        self.dataview = null;

        resolve(function loop(retries) {
            var blob = self.file.slice(self.start, self.end);
            return util.readAsArrayBuffer(blob).finally(function() {
                blob.close();
            }).then(function(result) {
                self.buffer = new Uint8Array(result);
                self.dataview = new DataView(result);
            }).catch(function(e) {
                if (isRetryable(e) && retries < 5) {
                    return Promise.delay(500).then(function() {
                        return loop(retries + 1);
                    });
                }
                self.start = self.end = -1;
                self.buffer = null;
                self.dataview = null;
                throw e;
            })
        }(0));
    }).finally(function() {
        self._readInProgress = false;
    });
};


module.exports = FileView;

},{"lib/blobpatch":16,"lib/bluebird":17,"lib/util":23}],16:[function(require,module,exports){
"use strict";

function titleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function prefix(Class, methodName) {
    var MethodName = titleCase(methodName);
    return Class.prototype[methodName] ||
           Class.prototype["ms" + MethodName] ||
           Class.prototype["moz" + MethodName] ||
           Class.prototype["webkit" + MethodName];
}

function patch() {
    if (typeof Blob !== "undefined") {
        const BlobClose = prefix(Blob, "close");
        if (typeof BlobClose === "undefined") {
            Blob.prototype.close = function() {};
        } else {
            Blob.prototype.close = function() {
                try {
                    return BlobClose.apply(this, arguments);
                } catch (e) {}
            };
        }

        if (typeof Blob.prototype.slice !== "function") {
            Blob.prototype.slice = prefix(Blob, "slice");
        }
    }

    if (typeof File !== "undefined") {
        const FileClose = prefix(File, "close");
        if (typeof FileClose === "undefined") {
            File.prototype.close = function() {};
        } else if (FileClose !== Blob.prototype.close) {
            FileClose.prototype.close = function() {
                try {
                    return FileClose.apply(this, arguments);
                } catch (e) {}
            };
        }

        if (typeof File.prototype.slice !== "function") {
            File.prototype.slice = prefix(File, "slice");
        }
    }


}

module.exports = patch;

},{}],17:[function(require,module,exports){
(function (process,global){
/* @preserve
 * The MIT License (MIT)
 *
 * Copyright (c) 2013-2015 Petka Antonov
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 */
/**
 * bluebird build version 3.3.1
 * Features enabled: core, race, call_get, generators, map, nodeify, promisify, props, reduce, settle, some, using, timers, filter, any, each
*/
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Promise=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof _dereq_=="function"&&_dereq_;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof _dereq_=="function"&&_dereq_;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var SomePromiseArray = Promise._SomePromiseArray;
function any(promises) {
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(1);
    ret.setUnwrap();
    ret.init();
    return promise;
}

Promise.any = function (promises) {
    return any(promises);
};

Promise.prototype.any = function () {
    return any(this);
};

};

},{}],2:[function(_dereq_,module,exports){
"use strict";
var firstLineError;
try {throw new Error(); } catch (e) {firstLineError = e;}
var schedule = _dereq_("./schedule");
var Queue = _dereq_("./queue");
var util = _dereq_("./util");

function Async() {
    this._isTickUsed = false;
    this._lateQueue = new Queue(16);
    this._normalQueue = new Queue(16);
    this._haveDrainedQueues = false;
    this._trampolineEnabled = true;
    var self = this;
    this.drainQueues = function () {
        self._drainQueues();
    };
    this._schedule = schedule;
}

Async.prototype.enableTrampoline = function() {
    this._trampolineEnabled = true;
};

Async.prototype.disableTrampolineIfNecessary = function() {
    if (util.hasDevTools) {
        this._trampolineEnabled = false;
    }
};

Async.prototype.haveItemsQueued = function () {
    return this._isTickUsed || this._haveDrainedQueues;
};


Async.prototype.fatalError = function(e, isNode) {
    if (isNode) {
        process.stderr.write("Fatal " + (e instanceof Error ? e.stack : e));
        process.exit(2);
    } else {
        this.throwLater(e);
    }
};

Async.prototype.throwLater = function(fn, arg) {
    if (arguments.length === 1) {
        arg = fn;
        fn = function () { throw arg; };
    }
    if (typeof setTimeout !== "undefined") {
        setTimeout(function() {
            fn(arg);
        }, 0);
    } else try {
        this._schedule(function() {
            fn(arg);
        });
    } catch (e) {
        throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
};

function AsyncInvokeLater(fn, receiver, arg) {
    this._lateQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncInvoke(fn, receiver, arg) {
    this._normalQueue.push(fn, receiver, arg);
    this._queueTick();
}

function AsyncSettlePromises(promise) {
    this._normalQueue._pushOne(promise);
    this._queueTick();
}

if (!util.hasDevTools) {
    Async.prototype.invokeLater = AsyncInvokeLater;
    Async.prototype.invoke = AsyncInvoke;
    Async.prototype.settlePromises = AsyncSettlePromises;
} else {
    Async.prototype.invokeLater = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvokeLater.call(this, fn, receiver, arg);
        } else {
            this._schedule(function() {
                setTimeout(function() {
                    fn.call(receiver, arg);
                }, 100);
            });
        }
    };

    Async.prototype.invoke = function (fn, receiver, arg) {
        if (this._trampolineEnabled) {
            AsyncInvoke.call(this, fn, receiver, arg);
        } else {
            this._schedule(function() {
                fn.call(receiver, arg);
            });
        }
    };

    Async.prototype.settlePromises = function(promise) {
        if (this._trampolineEnabled) {
            AsyncSettlePromises.call(this, promise);
        } else {
            this._schedule(function() {
                promise._settlePromises();
            });
        }
    };
}

Async.prototype.invokeFirst = function (fn, receiver, arg) {
    this._normalQueue.unshift(fn, receiver, arg);
    this._queueTick();
};

Async.prototype._drainQueue = function(queue) {
    while (queue.length() > 0) {
        var fn = queue.shift();
        if (typeof fn !== "function") {
            fn._settlePromises();
            continue;
        }
        var receiver = queue.shift();
        var arg = queue.shift();
        fn.call(receiver, arg);
    }
};

Async.prototype._drainQueues = function () {
    this._drainQueue(this._normalQueue);
    this._reset();
    this._haveDrainedQueues = true;
    this._drainQueue(this._lateQueue);
};

Async.prototype._queueTick = function () {
    if (!this._isTickUsed) {
        this._isTickUsed = true;
        this._schedule(this.drainQueues);
    }
};

Async.prototype._reset = function () {
    this._isTickUsed = false;
};

module.exports = Async;
module.exports.firstLineError = firstLineError;

},{"./queue":26,"./schedule":29,"./util":36}],3:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise, debug) {
var calledBind = false;
var rejectThis = function(_, e) {
    this._reject(e);
};

var targetRejected = function(e, context) {
    context.promiseRejectionQueued = true;
    context.bindingPromise._then(rejectThis, rejectThis, null, this, e);
};

var bindingResolved = function(thisArg, context) {
    if (((this._bitField & 50397184) === 0)) {
        this._resolveCallback(context.target);
    }
};

var bindingRejected = function(e, context) {
    if (!context.promiseRejectionQueued) this._reject(e);
};

Promise.prototype.bind = function (thisArg) {
    if (!calledBind) {
        calledBind = true;
        Promise.prototype._propagateFrom = debug.propagateFromFunction();
        Promise.prototype._boundValue = debug.boundValueFunction();
    }
    var maybePromise = tryConvertToPromise(thisArg);
    var ret = new Promise(INTERNAL);
    ret._propagateFrom(this, 1);
    var target = this._target();
    ret._setBoundTo(maybePromise);
    if (maybePromise instanceof Promise) {
        var context = {
            promiseRejectionQueued: false,
            promise: ret,
            target: target,
            bindingPromise: maybePromise
        };
        target._then(INTERNAL, targetRejected, undefined, ret, context);
        maybePromise._then(
            bindingResolved, bindingRejected, undefined, ret, context);
        ret._setOnCancel(maybePromise);
    } else {
        ret._resolveCallback(target);
    }
    return ret;
};

Promise.prototype._setBoundTo = function (obj) {
    if (obj !== undefined) {
        this._bitField = this._bitField | 2097152;
        this._boundTo = obj;
    } else {
        this._bitField = this._bitField & (~2097152);
    }
};

Promise.prototype._isBound = function () {
    return (this._bitField & 2097152) === 2097152;
};

Promise.bind = function (thisArg, value) {
    return Promise.resolve(value).bind(thisArg);
};
};

},{}],4:[function(_dereq_,module,exports){
"use strict";
var old;
if (typeof Promise !== "undefined") old = Promise;
function noConflict() {
    try { if (Promise === bluebird) Promise = old; }
    catch (e) {}
    return bluebird;
}
var bluebird = _dereq_("./promise")();
bluebird.noConflict = noConflict;
module.exports = bluebird;

},{"./promise":22}],5:[function(_dereq_,module,exports){
"use strict";
var cr = Object.create;
if (cr) {
    var callerCache = cr(null);
    var getterCache = cr(null);
    callerCache[" size"] = getterCache[" size"] = 0;
}

module.exports = function(Promise) {
var util = _dereq_("./util");
var canEvaluate = util.canEvaluate;
var isIdentifier = util.isIdentifier;

var getMethodCaller;
var getGetter;
if (!true) {
var makeMethodCaller = function (methodName) {
    return new Function("ensureMethod", "                                    \n\
        return function(obj) {                                               \n\
            'use strict'                                                     \n\
            var len = this.length;                                           \n\
            ensureMethod(obj, 'methodName');                                 \n\
            switch(len) {                                                    \n\
                case 1: return obj.methodName(this[0]);                      \n\
                case 2: return obj.methodName(this[0], this[1]);             \n\
                case 3: return obj.methodName(this[0], this[1], this[2]);    \n\
                case 0: return obj.methodName();                             \n\
                default:                                                     \n\
                    return obj.methodName.apply(obj, this);                  \n\
            }                                                                \n\
        };                                                                   \n\
        ".replace(/methodName/g, methodName))(ensureMethod);
};

var makeGetter = function (propertyName) {
    return new Function("obj", "                                             \n\
        'use strict';                                                        \n\
        return obj.propertyName;                                             \n\
        ".replace("propertyName", propertyName));
};

var getCompiled = function(name, compiler, cache) {
    var ret = cache[name];
    if (typeof ret !== "function") {
        if (!isIdentifier(name)) {
            return null;
        }
        ret = compiler(name);
        cache[name] = ret;
        cache[" size"]++;
        if (cache[" size"] > 512) {
            var keys = Object.keys(cache);
            for (var i = 0; i < 256; ++i) delete cache[keys[i]];
            cache[" size"] = keys.length - 256;
        }
    }
    return ret;
};

getMethodCaller = function(name) {
    return getCompiled(name, makeMethodCaller, callerCache);
};

getGetter = function(name) {
    return getCompiled(name, makeGetter, getterCache);
};
}

function ensureMethod(obj, methodName) {
    var fn;
    if (obj != null) fn = obj[methodName];
    if (typeof fn !== "function") {
        var message = "Object " + util.classString(obj) + " has no method '" +
            util.toString(methodName) + "'";
        throw new Promise.TypeError(message);
    }
    return fn;
}

function caller(obj) {
    var methodName = this.pop();
    var fn = ensureMethod(obj, methodName);
    return fn.apply(obj, this);
}
Promise.prototype.call = function (methodName) {
    var args = [].slice.call(arguments, 1);;
    if (!true) {
        if (canEvaluate) {
            var maybeCaller = getMethodCaller(methodName);
            if (maybeCaller !== null) {
                return this._then(
                    maybeCaller, undefined, undefined, args, undefined);
            }
        }
    }
    args.push(methodName);
    return this._then(caller, undefined, undefined, args, undefined);
};

function namedGetter(obj) {
    return obj[this];
}
function indexedGetter(obj) {
    var index = +this;
    if (index < 0) index = Math.max(0, index + obj.length);
    return obj[index];
}
Promise.prototype.get = function (propertyName) {
    var isIndex = (typeof propertyName === "number");
    var getter;
    if (!isIndex) {
        if (canEvaluate) {
            var maybeGetter = getGetter(propertyName);
            getter = maybeGetter !== null ? maybeGetter : namedGetter;
        } else {
            getter = namedGetter;
        }
    } else {
        getter = indexedGetter;
    }
    return this._then(getter, undefined, undefined, propertyName, undefined);
};
};

},{"./util":36}],6:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, PromiseArray, apiRejection, debug) {
var util = _dereq_("./util");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var async = Promise._async;

Promise.prototype["break"] = Promise.prototype.cancel = function() {
    if (!debug.cancellation()) return this._warn("cancellation is disabled");

    var promise = this;
    var child = promise;
    while (promise.isCancellable()) {
        if (!promise._cancelBy(child)) {
            if (child._isFollowing()) {
                child._followee().cancel();
            } else {
                child._cancelBranched();
            }
            break;
        }

        var parent = promise._cancellationParent;
        if (parent == null || !parent.isCancellable()) {
            if (promise._isFollowing()) {
                promise._followee().cancel();
            } else {
                promise._cancelBranched();
            }
            break;
        } else {
            if (promise._isFollowing()) promise._followee().cancel();
            child = promise;
            promise = parent;
        }
    }
};

Promise.prototype._branchHasCancelled = function() {
    this._branchesRemainingToCancel--;
};

Promise.prototype._enoughBranchesHaveCancelled = function() {
    return this._branchesRemainingToCancel === undefined ||
           this._branchesRemainingToCancel <= 0;
};

Promise.prototype._cancelBy = function(canceller) {
    if (canceller === this) {
        this._branchesRemainingToCancel = 0;
        this._invokeOnCancel();
        return true;
    } else {
        this._branchHasCancelled();
        if (this._enoughBranchesHaveCancelled()) {
            this._invokeOnCancel();
            return true;
        }
    }
    return false;
};

Promise.prototype._cancelBranched = function() {
    if (this._enoughBranchesHaveCancelled()) {
        this._cancel();
    }
};

Promise.prototype._cancel = function() {
    if (!this.isCancellable()) return;

    this._setCancelled();
    async.invoke(this._cancelPromises, this, undefined);
};

Promise.prototype._cancelPromises = function() {
    if (this._length() > 0) this._settlePromises();
};

Promise.prototype._unsetOnCancel = function() {
    this._onCancelField = undefined;
};

Promise.prototype.isCancellable = function() {
    return this.isPending() && !this.isCancelled();
};

Promise.prototype._doInvokeOnCancel = function(onCancelCallback, internalOnly) {
    if (util.isArray(onCancelCallback)) {
        for (var i = 0; i < onCancelCallback.length; ++i) {
            this._doInvokeOnCancel(onCancelCallback[i], internalOnly);
        }
    } else if (onCancelCallback !== undefined) {
        if (typeof onCancelCallback === "function") {
            if (!internalOnly) {
                var e = tryCatch(onCancelCallback).call(this._boundValue());
                if (e === errorObj) {
                    this._attachExtraTrace(e.e);
                    async.throwLater(e.e);
                }
            }
        } else {
            onCancelCallback._resultCancelled(this);
        }
    }
};

Promise.prototype._invokeOnCancel = function() {
    var onCancelCallback = this._onCancel();
    this._unsetOnCancel();
    async.invoke(this._doInvokeOnCancel, this, onCancelCallback);
};

Promise.prototype._invokeInternalOnCancel = function() {
    if (this.isCancellable()) {
        this._doInvokeOnCancel(this._onCancel(), true);
        this._unsetOnCancel();
    }
};

Promise.prototype._resultCancelled = function() {
    this.cancel();
};

};

},{"./util":36}],7:[function(_dereq_,module,exports){
"use strict";
module.exports = function(NEXT_FILTER) {
var util = _dereq_("./util");
var getKeys = _dereq_("./es5").keys;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

function catchFilter(instances, cb, promise) {
    return function(e) {
        var boundTo = promise._boundValue();
        predicateLoop: for (var i = 0; i < instances.length; ++i) {
            var item = instances[i];

            if (item === Error ||
                (item != null && item.prototype instanceof Error)) {
                if (e instanceof item) {
                    return tryCatch(cb).call(boundTo, e);
                }
            } else if (typeof item === "function") {
                var matchesPredicate = tryCatch(item).call(boundTo, e);
                if (matchesPredicate === errorObj) {
                    return matchesPredicate;
                } else if (matchesPredicate) {
                    return tryCatch(cb).call(boundTo, e);
                }
            } else if (util.isObject(e)) {
                var keys = getKeys(item);
                for (var j = 0; j < keys.length; ++j) {
                    var key = keys[j];
                    if (item[key] != e[key]) {
                        continue predicateLoop;
                    }
                }
                return tryCatch(cb).call(boundTo, e);
            }
        }
        return NEXT_FILTER;
    };
}

return catchFilter;
};

},{"./es5":13,"./util":36}],8:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var longStackTraces = false;
var contextStack = [];

Promise.prototype._promiseCreated = function() {};
Promise.prototype._pushContext = function() {};
Promise.prototype._popContext = function() {return null;};
Promise._peekContext = Promise.prototype._peekContext = function() {};

function Context() {
    this._trace = new Context.CapturedTrace(peekContext());
}
Context.prototype._pushContext = function () {
    if (this._trace !== undefined) {
        this._trace._promiseCreated = null;
        contextStack.push(this._trace);
    }
};

Context.prototype._popContext = function () {
    if (this._trace !== undefined) {
        var trace = contextStack.pop();
        var ret = trace._promiseCreated;
        trace._promiseCreated = null;
        return ret;
    }
    return null;
};

function createContext() {
    if (longStackTraces) return new Context();
}

function peekContext() {
    var lastIndex = contextStack.length - 1;
    if (lastIndex >= 0) {
        return contextStack[lastIndex];
    }
    return undefined;
}
Context.CapturedTrace = null;
Context.create = createContext;
Context.deactivateLongStackTraces = function() {};
Context.activateLongStackTraces = function() {
    var Promise_pushContext = Promise.prototype._pushContext;
    var Promise_popContext = Promise.prototype._popContext;
    var Promise_PeekContext = Promise._peekContext;
    var Promise_peekContext = Promise.prototype._peekContext;
    var Promise_promiseCreated = Promise.prototype._promiseCreated;
    Context.deactivateLongStackTraces = function() {
        Promise.prototype._pushContext = Promise_pushContext;
        Promise.prototype._popContext = Promise_popContext;
        Promise._peekContext = Promise_PeekContext;
        Promise.prototype._peekContext = Promise_peekContext;
        Promise.prototype._promiseCreated = Promise_promiseCreated;
        longStackTraces = false;
    };
    longStackTraces = true;
    Promise.prototype._pushContext = Context.prototype._pushContext;
    Promise.prototype._popContext = Context.prototype._popContext;
    Promise._peekContext = Promise.prototype._peekContext = peekContext;
    Promise.prototype._promiseCreated = function() {
        var ctx = this._peekContext();
        if (ctx && ctx._promiseCreated == null) ctx._promiseCreated = this;
    };
};
return Context;
};

},{}],9:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, Context) {
var getDomain = Promise._getDomain;
var async = Promise._async;
var Warning = _dereq_("./errors").Warning;
var util = _dereq_("./util");
var canAttachTrace = util.canAttachTrace;
var unhandledRejectionHandled;
var possiblyUnhandledRejection;
var bluebirdFramePattern =
    /[\\\/]bluebird[\\\/]js[\\\/](release|debug|instrumented)/;
var stackFramePattern = null;
var formatStack = null;
var indentStackFrames = false;
var printWarning;
var debugging = !!(util.env("BLUEBIRD_DEBUG") != 0 &&
                        (true ||
                         util.env("BLUEBIRD_DEBUG") ||
                         util.env("NODE_ENV") === "development"));

var warnings = !!(util.env("BLUEBIRD_WARNINGS") != 0 &&
    (debugging || util.env("BLUEBIRD_WARNINGS")));

var longStackTraces = !!(util.env("BLUEBIRD_LONG_STACK_TRACES") != 0 &&
    (debugging || util.env("BLUEBIRD_LONG_STACK_TRACES")));

var wForgottenReturn = util.env("BLUEBIRD_W_FORGOTTEN_RETURN") != 0 &&
    (warnings || !!util.env("BLUEBIRD_W_FORGOTTEN_RETURN"));

Promise.prototype.suppressUnhandledRejections = function() {
    var target = this._target();
    target._bitField = ((target._bitField & (~1048576)) |
                      524288);
};

Promise.prototype._ensurePossibleRejectionHandled = function () {
    if ((this._bitField & 524288) !== 0) return;
    this._setRejectionIsUnhandled();
    async.invokeLater(this._notifyUnhandledRejection, this, undefined);
};

Promise.prototype._notifyUnhandledRejectionIsHandled = function () {
    fireRejectionEvent("rejectionHandled",
                                  unhandledRejectionHandled, undefined, this);
};

Promise.prototype._setReturnedNonUndefined = function() {
    this._bitField = this._bitField | 268435456;
};

Promise.prototype._returnedNonUndefined = function() {
    return (this._bitField & 268435456) !== 0;
};

Promise.prototype._notifyUnhandledRejection = function () {
    if (this._isRejectionUnhandled()) {
        var reason = this._settledValue();
        this._setUnhandledRejectionIsNotified();
        fireRejectionEvent("unhandledRejection",
                                      possiblyUnhandledRejection, reason, this);
    }
};

Promise.prototype._setUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField | 262144;
};

Promise.prototype._unsetUnhandledRejectionIsNotified = function () {
    this._bitField = this._bitField & (~262144);
};

Promise.prototype._isUnhandledRejectionNotified = function () {
    return (this._bitField & 262144) > 0;
};

Promise.prototype._setRejectionIsUnhandled = function () {
    this._bitField = this._bitField | 1048576;
};

Promise.prototype._unsetRejectionIsUnhandled = function () {
    this._bitField = this._bitField & (~1048576);
    if (this._isUnhandledRejectionNotified()) {
        this._unsetUnhandledRejectionIsNotified();
        this._notifyUnhandledRejectionIsHandled();
    }
};

Promise.prototype._isRejectionUnhandled = function () {
    return (this._bitField & 1048576) > 0;
};

Promise.prototype._warn = function(message, shouldUseOwnTrace, promise) {
    return warn(message, shouldUseOwnTrace, promise || this);
};

Promise.onPossiblyUnhandledRejection = function (fn) {
    var domain = getDomain();
    possiblyUnhandledRejection =
        typeof fn === "function" ? (domain === null ? fn : domain.bind(fn))
                                 : undefined;
};

Promise.onUnhandledRejectionHandled = function (fn) {
    var domain = getDomain();
    unhandledRejectionHandled =
        typeof fn === "function" ? (domain === null ? fn : domain.bind(fn))
                                 : undefined;
};

var disableLongStackTraces = function() {};
Promise.longStackTraces = function () {
    if (async.haveItemsQueued() && !config.longStackTraces) {
        throw new Error("cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    if (!config.longStackTraces && longStackTracesIsSupported()) {
        var Promise_captureStackTrace = Promise.prototype._captureStackTrace;
        var Promise_attachExtraTrace = Promise.prototype._attachExtraTrace;
        config.longStackTraces = true;
        disableLongStackTraces = function() {
            if (async.haveItemsQueued() && !config.longStackTraces) {
                throw new Error("cannot enable long stack traces after promises have been created\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
            }
            Promise.prototype._captureStackTrace = Promise_captureStackTrace;
            Promise.prototype._attachExtraTrace = Promise_attachExtraTrace;
            Context.deactivateLongStackTraces();
            async.enableTrampoline();
            config.longStackTraces = false;
        };
        Promise.prototype._captureStackTrace = longStackTracesCaptureStackTrace;
        Promise.prototype._attachExtraTrace = longStackTracesAttachExtraTrace;
        Context.activateLongStackTraces();
        async.disableTrampolineIfNecessary();
    }
};

Promise.hasLongStackTraces = function () {
    return config.longStackTraces && longStackTracesIsSupported();
};

var fireDomEvent = (function() {
    try {
        var event = document.createEvent("CustomEvent");
        event.initCustomEvent("testingtheevent", false, true, {});
        util.global.dispatchEvent(event);
        return function(name, event) {
            var domEvent = document.createEvent("CustomEvent");
            domEvent.initCustomEvent(name.toLowerCase(), false, true, event);
            return !util.global.dispatchEvent(domEvent);
        };
    } catch (e) {}
    return function() {
        return false;
    };
})();

var fireGlobalEvent = (function() {
    if (util.isNode) {
        return function() {
            return process.emit.apply(process, arguments);
        };
    } else {
        if (!util.global) {
            return function() {
                return false;
            };
        }
        return function(name) {
            var methodName = "on" + name.toLowerCase();
            var method = util.global[methodName];
            if (!method) return false;
            method.apply(util.global, [].slice.call(arguments, 1));
            return true;
        };
    }
})();

function generatePromiseLifecycleEventObject(name, promise) {
    return {promise: promise};
}

var eventToObjectGenerator = {
    promiseCreated: generatePromiseLifecycleEventObject,
    promiseFulfilled: generatePromiseLifecycleEventObject,
    promiseRejected: generatePromiseLifecycleEventObject,
    promiseResolved: generatePromiseLifecycleEventObject,
    promiseCancelled: generatePromiseLifecycleEventObject,
    promiseChained: function(name, promise, child) {
        return {promise: promise, child: child};
    },
    warning: function(name, warning) {
        return {warning: warning};
    },
    unhandledRejection: function (name, reason, promise) {
        return {reason: reason, promise: promise};
    },
    rejectionHandled: generatePromiseLifecycleEventObject
};

var activeFireEvent = function (name) {
    var globalEventFired = false;
    try {
        globalEventFired = fireGlobalEvent.apply(null, arguments);
    } catch (e) {
        async.throwLater(e);
        globalEventFired = true;
    }

    var domEventFired = false;
    try {
        domEventFired = fireDomEvent(name,
                    eventToObjectGenerator[name].apply(null, arguments));
    } catch (e) {
        async.throwLater(e);
        domEventFired = true;
    }

    return domEventFired || globalEventFired;
};

Promise.config = function(opts) {
    opts = Object(opts);
    if ("longStackTraces" in opts) {
        if (opts.longStackTraces) {
            Promise.longStackTraces();
        } else if (!opts.longStackTraces && Promise.hasLongStackTraces()) {
            disableLongStackTraces();
        }
    }
    if ("warnings" in opts) {
        var warningsOption = opts.warnings;
        config.warnings = !!warningsOption;
        wForgottenReturn = config.warnings;

        if (util.isObject(warningsOption)) {
            if ("wForgottenReturn" in warningsOption) {
                wForgottenReturn = !!warningsOption.wForgottenReturn;
            }
        }
    }
    if ("cancellation" in opts && opts.cancellation && !config.cancellation) {
        if (async.haveItemsQueued()) {
            throw new Error(
                "cannot enable cancellation after promises are in use");
        }
        Promise.prototype._clearCancellationData =
            cancellationClearCancellationData;
        Promise.prototype._propagateFrom = cancellationPropagateFrom;
        Promise.prototype._onCancel = cancellationOnCancel;
        Promise.prototype._setOnCancel = cancellationSetOnCancel;
        Promise.prototype._attachCancellationCallback =
            cancellationAttachCancellationCallback;
        Promise.prototype._execute = cancellationExecute;
        propagateFromFunction = cancellationPropagateFrom;
        config.cancellation = true;
    }
    if ("monitoring" in opts) {
        if (opts.monitoring && !config.monitoring) {
            config.monitoring = true;
            Promise.prototype._fireEvent = activeFireEvent;
        } else if (!opts.monitoring && config.monitoring) {
            config.monitoring = false;
            Promise.prototype._fireEvent = defaultFireEvent;
        }
    }
};

function defaultFireEvent() { return false; }

Promise.prototype._fireEvent = defaultFireEvent;
Promise.prototype._execute = function(executor, resolve, reject) {
    try {
        executor(resolve, reject);
    } catch (e) {
        return e;
    }
};
Promise.prototype._onCancel = function () {};
Promise.prototype._setOnCancel = function (handler) { ; };
Promise.prototype._attachCancellationCallback = function(onCancel) {
    ;
};
Promise.prototype._captureStackTrace = function () {};
Promise.prototype._attachExtraTrace = function () {};
Promise.prototype._clearCancellationData = function() {};
Promise.prototype._propagateFrom = function (parent, flags) {
    ;
    ;
};

function cancellationExecute(executor, resolve, reject) {
    var promise = this;
    try {
        executor(resolve, reject, function(onCancel) {
            if (typeof onCancel !== "function") {
                throw new TypeError("onCancel must be a function, got: " +
                                    util.toString(onCancel));
            }
            promise._attachCancellationCallback(onCancel);
        });
    } catch (e) {
        return e;
    }
}

function cancellationAttachCancellationCallback(onCancel) {
    if (!this.isCancellable()) return this;

    var previousOnCancel = this._onCancel();
    if (previousOnCancel !== undefined) {
        if (util.isArray(previousOnCancel)) {
            previousOnCancel.push(onCancel);
        } else {
            this._setOnCancel([previousOnCancel, onCancel]);
        }
    } else {
        this._setOnCancel(onCancel);
    }
}

function cancellationOnCancel() {
    return this._onCancelField;
}

function cancellationSetOnCancel(onCancel) {
    this._onCancelField = onCancel;
}

function cancellationClearCancellationData() {
    this._cancellationParent = undefined;
    this._onCancelField = undefined;
}

function cancellationPropagateFrom(parent, flags) {
    if ((flags & 1) !== 0) {
        this._cancellationParent = parent;
        var branchesRemainingToCancel = parent._branchesRemainingToCancel;
        if (branchesRemainingToCancel === undefined) {
            branchesRemainingToCancel = 0;
        }
        parent._branchesRemainingToCancel = branchesRemainingToCancel + 1;
    }
    if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo);
    }
}

function bindingPropagateFrom(parent, flags) {
    if ((flags & 2) !== 0 && parent._isBound()) {
        this._setBoundTo(parent._boundTo);
    }
}
var propagateFromFunction = bindingPropagateFrom;

function boundValueFunction() {
    var ret = this._boundTo;
    if (ret !== undefined) {
        if (ret instanceof Promise) {
            if (ret.isFulfilled()) {
                return ret.value();
            } else {
                return undefined;
            }
        }
    }
    return ret;
}

function longStackTracesCaptureStackTrace() {
    this._trace = new CapturedTrace(this._peekContext());
}

function longStackTracesAttachExtraTrace(error, ignoreSelf) {
    if (canAttachTrace(error)) {
        var trace = this._trace;
        if (trace !== undefined) {
            if (ignoreSelf) trace = trace._parent;
        }
        if (trace !== undefined) {
            trace.attachExtraTrace(error);
        } else if (!error.__stackCleaned__) {
            var parsed = parseStackAndMessage(error);
            util.notEnumerableProp(error, "stack",
                parsed.message + "\n" + parsed.stack.join("\n"));
            util.notEnumerableProp(error, "__stackCleaned__", true);
        }
    }
}

function checkForgottenReturns(returnValue, promiseCreated, name, promise,
                               parent) {
    if (returnValue === undefined && promiseCreated !== null &&
        wForgottenReturn) {
        if (parent !== undefined && parent._returnedNonUndefined()) return;

        if (name) name = name + " ";
        var msg = "a promise was created in a " + name +
            "handler but was not returned from it";
        promise._warn(msg, true, promiseCreated);
    }
}

function deprecated(name, replacement) {
    var message = name +
        " is deprecated and will be removed in a future version.";
    if (replacement) message += " Use " + replacement + " instead.";
    return warn(message);
}

function warn(message, shouldUseOwnTrace, promise) {
    if (!config.warnings) return;
    var warning = new Warning(message);
    var ctx;
    if (shouldUseOwnTrace) {
        promise._attachExtraTrace(warning);
    } else if (config.longStackTraces && (ctx = Promise._peekContext())) {
        ctx.attachExtraTrace(warning);
    } else {
        var parsed = parseStackAndMessage(warning);
        warning.stack = parsed.message + "\n" + parsed.stack.join("\n");
    }

    if (!activeFireEvent("warning", warning)) {
        formatAndLogError(warning, "", true);
    }
}

function reconstructStack(message, stacks) {
    for (var i = 0; i < stacks.length - 1; ++i) {
        stacks[i].push("From previous event:");
        stacks[i] = stacks[i].join("\n");
    }
    if (i < stacks.length) {
        stacks[i] = stacks[i].join("\n");
    }
    return message + "\n" + stacks.join("\n");
}

function removeDuplicateOrEmptyJumps(stacks) {
    for (var i = 0; i < stacks.length; ++i) {
        if (stacks[i].length === 0 ||
            ((i + 1 < stacks.length) && stacks[i][0] === stacks[i+1][0])) {
            stacks.splice(i, 1);
            i--;
        }
    }
}

function removeCommonRoots(stacks) {
    var current = stacks[0];
    for (var i = 1; i < stacks.length; ++i) {
        var prev = stacks[i];
        var currentLastIndex = current.length - 1;
        var currentLastLine = current[currentLastIndex];
        var commonRootMeetPoint = -1;

        for (var j = prev.length - 1; j >= 0; --j) {
            if (prev[j] === currentLastLine) {
                commonRootMeetPoint = j;
                break;
            }
        }

        for (var j = commonRootMeetPoint; j >= 0; --j) {
            var line = prev[j];
            if (current[currentLastIndex] === line) {
                current.pop();
                currentLastIndex--;
            } else {
                break;
            }
        }
        current = prev;
    }
}

function cleanStack(stack) {
    var ret = [];
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        var isTraceLine = "    (No stack trace)" === line ||
            stackFramePattern.test(line);
        var isInternalFrame = isTraceLine && shouldIgnore(line);
        if (isTraceLine && !isInternalFrame) {
            if (indentStackFrames && line.charAt(0) !== " ") {
                line = "    " + line;
            }
            ret.push(line);
        }
    }
    return ret;
}

function stackFramesAsArray(error) {
    var stack = error.stack.replace(/\s+$/g, "").split("\n");
    for (var i = 0; i < stack.length; ++i) {
        var line = stack[i];
        if ("    (No stack trace)" === line || stackFramePattern.test(line)) {
            break;
        }
    }
    if (i > 0) {
        stack = stack.slice(i);
    }
    return stack;
}

function parseStackAndMessage(error) {
    var stack = error.stack;
    var message = error.toString();
    stack = typeof stack === "string" && stack.length > 0
                ? stackFramesAsArray(error) : ["    (No stack trace)"];
    return {
        message: message,
        stack: cleanStack(stack)
    };
}

function formatAndLogError(error, title, isSoft) {
    if (typeof console !== "undefined") {
        var message;
        if (util.isObject(error)) {
            var stack = error.stack;
            message = title + formatStack(stack, error);
        } else {
            message = title + String(error);
        }
        if (typeof printWarning === "function") {
            printWarning(message, isSoft);
        } else if (typeof console.log === "function" ||
            typeof console.log === "object") {
            console.log(message);
        }
    }
}

function fireRejectionEvent(name, localHandler, reason, promise) {
    var localEventFired = false;
    try {
        if (typeof localHandler === "function") {
            localEventFired = true;
            if (name === "rejectionHandled") {
                localHandler(promise);
            } else {
                localHandler(reason, promise);
            }
        }
    } catch (e) {
        async.throwLater(e);
    }

    if (name === "unhandledRejection") {
        if (!activeFireEvent(name, reason, promise) && !localEventFired) {
            formatAndLogError(reason, "Unhandled rejection ");
        }
    } else {
        activeFireEvent(name, promise);
    }
}

function formatNonError(obj) {
    var str;
    if (typeof obj === "function") {
        str = "[function " +
            (obj.name || "anonymous") +
            "]";
    } else {
        str = obj && typeof obj.toString === "function"
            ? obj.toString() : util.toString(obj);
        var ruselessToString = /\[object [a-zA-Z0-9$_]+\]/;
        if (ruselessToString.test(str)) {
            try {
                var newStr = JSON.stringify(obj);
                str = newStr;
            }
            catch(e) {

            }
        }
        if (str.length === 0) {
            str = "(empty array)";
        }
    }
    return ("(<" + snip(str) + ">, no stack trace)");
}

function snip(str) {
    var maxChars = 41;
    if (str.length < maxChars) {
        return str;
    }
    return str.substr(0, maxChars - 3) + "...";
}

function longStackTracesIsSupported() {
    return typeof captureStackTrace === "function";
}

var shouldIgnore = function() { return false; };
var parseLineInfoRegex = /[\/<\(]([^:\/]+):(\d+):(?:\d+)\)?\s*$/;
function parseLineInfo(line) {
    var matches = line.match(parseLineInfoRegex);
    if (matches) {
        return {
            fileName: matches[1],
            line: parseInt(matches[2], 10)
        };
    }
}

function setBounds(firstLineError, lastLineError) {
    if (!longStackTracesIsSupported()) return;
    var firstStackLines = firstLineError.stack.split("\n");
    var lastStackLines = lastLineError.stack.split("\n");
    var firstIndex = -1;
    var lastIndex = -1;
    var firstFileName;
    var lastFileName;
    for (var i = 0; i < firstStackLines.length; ++i) {
        var result = parseLineInfo(firstStackLines[i]);
        if (result) {
            firstFileName = result.fileName;
            firstIndex = result.line;
            break;
        }
    }
    for (var i = 0; i < lastStackLines.length; ++i) {
        var result = parseLineInfo(lastStackLines[i]);
        if (result) {
            lastFileName = result.fileName;
            lastIndex = result.line;
            break;
        }
    }
    if (firstIndex < 0 || lastIndex < 0 || !firstFileName || !lastFileName ||
        firstFileName !== lastFileName || firstIndex >= lastIndex) {
        return;
    }

    shouldIgnore = function(line) {
        if (bluebirdFramePattern.test(line)) return true;
        var info = parseLineInfo(line);
        if (info) {
            if (info.fileName === firstFileName &&
                (firstIndex <= info.line && info.line <= lastIndex)) {
                return true;
            }
        }
        return false;
    };
}

function CapturedTrace(parent) {
    this._parent = parent;
    this._promisesCreated = 0;
    var length = this._length = 1 + (parent === undefined ? 0 : parent._length);
    captureStackTrace(this, CapturedTrace);
    if (length > 32) this.uncycle();
}
util.inherits(CapturedTrace, Error);
Context.CapturedTrace = CapturedTrace;

CapturedTrace.prototype.uncycle = function() {
    var length = this._length;
    if (length < 2) return;
    var nodes = [];
    var stackToIndex = {};

    for (var i = 0, node = this; node !== undefined; ++i) {
        nodes.push(node);
        node = node._parent;
    }
    length = this._length = i;
    for (var i = length - 1; i >= 0; --i) {
        var stack = nodes[i].stack;
        if (stackToIndex[stack] === undefined) {
            stackToIndex[stack] = i;
        }
    }
    for (var i = 0; i < length; ++i) {
        var currentStack = nodes[i].stack;
        var index = stackToIndex[currentStack];
        if (index !== undefined && index !== i) {
            if (index > 0) {
                nodes[index - 1]._parent = undefined;
                nodes[index - 1]._length = 1;
            }
            nodes[i]._parent = undefined;
            nodes[i]._length = 1;
            var cycleEdgeNode = i > 0 ? nodes[i - 1] : this;

            if (index < length - 1) {
                cycleEdgeNode._parent = nodes[index + 1];
                cycleEdgeNode._parent.uncycle();
                cycleEdgeNode._length =
                    cycleEdgeNode._parent._length + 1;
            } else {
                cycleEdgeNode._parent = undefined;
                cycleEdgeNode._length = 1;
            }
            var currentChildLength = cycleEdgeNode._length + 1;
            for (var j = i - 2; j >= 0; --j) {
                nodes[j]._length = currentChildLength;
                currentChildLength++;
            }
            return;
        }
    }
};

CapturedTrace.prototype.attachExtraTrace = function(error) {
    if (error.__stackCleaned__) return;
    this.uncycle();
    var parsed = parseStackAndMessage(error);
    var message = parsed.message;
    var stacks = [parsed.stack];

    var trace = this;
    while (trace !== undefined) {
        stacks.push(cleanStack(trace.stack.split("\n")));
        trace = trace._parent;
    }
    removeCommonRoots(stacks);
    removeDuplicateOrEmptyJumps(stacks);
    util.notEnumerableProp(error, "stack", reconstructStack(message, stacks));
    util.notEnumerableProp(error, "__stackCleaned__", true);
};

var captureStackTrace = (function stackDetection() {
    var v8stackFramePattern = /^\s*at\s*/;
    var v8stackFormatter = function(stack, error) {
        if (typeof stack === "string") return stack;

        if (error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    if (typeof Error.stackTraceLimit === "number" &&
        typeof Error.captureStackTrace === "function") {
        Error.stackTraceLimit += 6;
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        var captureStackTrace = Error.captureStackTrace;

        shouldIgnore = function(line) {
            return bluebirdFramePattern.test(line);
        };
        return function(receiver, ignoreUntil) {
            Error.stackTraceLimit += 6;
            captureStackTrace(receiver, ignoreUntil);
            Error.stackTraceLimit -= 6;
        };
    }
    var err = new Error();

    if (typeof err.stack === "string" &&
        err.stack.split("\n")[0].indexOf("stackDetection@") >= 0) {
        stackFramePattern = /@/;
        formatStack = v8stackFormatter;
        indentStackFrames = true;
        return function captureStackTrace(o) {
            o.stack = new Error().stack;
        };
    }

    var hasStackAfterThrow;
    try { throw new Error(); }
    catch(e) {
        hasStackAfterThrow = ("stack" in e);
    }
    if (!("stack" in err) && hasStackAfterThrow &&
        typeof Error.stackTraceLimit === "number") {
        stackFramePattern = v8stackFramePattern;
        formatStack = v8stackFormatter;
        return function captureStackTrace(o) {
            Error.stackTraceLimit += 6;
            try { throw new Error(); }
            catch(e) { o.stack = e.stack; }
            Error.stackTraceLimit -= 6;
        };
    }

    formatStack = function(stack, error) {
        if (typeof stack === "string") return stack;

        if ((typeof error === "object" ||
            typeof error === "function") &&
            error.name !== undefined &&
            error.message !== undefined) {
            return error.toString();
        }
        return formatNonError(error);
    };

    return null;

})([]);

if (typeof console !== "undefined" && typeof console.warn !== "undefined") {
    printWarning = function (message) {
        console.warn(message);
    };
    if (util.isNode && process.stderr.isTTY) {
        printWarning = function(message, isSoft) {
            var color = isSoft ? "\u001b[33m" : "\u001b[31m";
            console.warn(color + message + "\u001b[0m\n");
        };
    } else if (!util.isNode && typeof (new Error().stack) === "string") {
        printWarning = function(message, isSoft) {
            console.warn("%c" + message,
                        isSoft ? "color: darkorange" : "color: red");
        };
    }
}

var config = {
    warnings: warnings,
    longStackTraces: false,
    cancellation: false,
    monitoring: false
};

if (longStackTraces) Promise.longStackTraces();

return {
    longStackTraces: function() {
        return config.longStackTraces;
    },
    warnings: function() {
        return config.warnings;
    },
    cancellation: function() {
        return config.cancellation;
    },
    monitoring: function() {
        return config.monitoring;
    },
    propagateFromFunction: function() {
        return propagateFromFunction;
    },
    boundValueFunction: function() {
        return boundValueFunction;
    },
    checkForgottenReturns: checkForgottenReturns,
    setBounds: setBounds,
    warn: warn,
    deprecated: deprecated,
    CapturedTrace: CapturedTrace,
    fireDomEvent: fireDomEvent,
    fireGlobalEvent: fireGlobalEvent
};
};

},{"./errors":12,"./util":36}],10:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
function returner() {
    return this.value;
}
function thrower() {
    throw this.reason;
}

Promise.prototype["return"] =
Promise.prototype.thenReturn = function (value) {
    if (value instanceof Promise) value.suppressUnhandledRejections();
    return this._then(
        returner, undefined, undefined, {value: value}, undefined);
};

Promise.prototype["throw"] =
Promise.prototype.thenThrow = function (reason) {
    return this._then(
        thrower, undefined, undefined, {reason: reason}, undefined);
};

Promise.prototype.catchThrow = function (reason) {
    if (arguments.length <= 1) {
        return this._then(
            undefined, thrower, undefined, {reason: reason}, undefined);
    } else {
        var _reason = arguments[1];
        var handler = function() {throw _reason;};
        return this.caught(reason, handler);
    }
};

Promise.prototype.catchReturn = function (value) {
    if (arguments.length <= 1) {
        if (value instanceof Promise) value.suppressUnhandledRejections();
        return this._then(
            undefined, returner, undefined, {value: value}, undefined);
    } else {
        var _value = arguments[1];
        if (_value instanceof Promise) _value.suppressUnhandledRejections();
        var handler = function() {return _value;};
        return this.caught(value, handler);
    }
};
};

},{}],11:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseReduce = Promise.reduce;
var PromiseAll = Promise.all;

function promiseAllThis() {
    return PromiseAll(this);
}

function PromiseMapSeries(promises, fn) {
    return PromiseReduce(promises, fn, INTERNAL, INTERNAL);
}

Promise.prototype.each = function (fn) {
    return this.mapSeries(fn)
            ._then(promiseAllThis, undefined, undefined, this, undefined);
};

Promise.prototype.mapSeries = function (fn) {
    return PromiseReduce(this, fn, INTERNAL, INTERNAL);
};

Promise.each = function (promises, fn) {
    return PromiseMapSeries(promises, fn)
            ._then(promiseAllThis, undefined, undefined, promises, undefined);
};

Promise.mapSeries = PromiseMapSeries;
};

},{}],12:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5");
var Objectfreeze = es5.freeze;
var util = _dereq_("./util");
var inherits = util.inherits;
var notEnumerableProp = util.notEnumerableProp;

function subError(nameProperty, defaultMessage) {
    function SubError(message) {
        if (!(this instanceof SubError)) return new SubError(message);
        notEnumerableProp(this, "message",
            typeof message === "string" ? message : defaultMessage);
        notEnumerableProp(this, "name", nameProperty);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        } else {
            Error.call(this);
        }
    }
    inherits(SubError, Error);
    return SubError;
}

var _TypeError, _RangeError;
var Warning = subError("Warning", "warning");
var CancellationError = subError("CancellationError", "cancellation error");
var TimeoutError = subError("TimeoutError", "timeout error");
var AggregateError = subError("AggregateError", "aggregate error");
try {
    _TypeError = TypeError;
    _RangeError = RangeError;
} catch(e) {
    _TypeError = subError("TypeError", "type error");
    _RangeError = subError("RangeError", "range error");
}

var methods = ("join pop push shift unshift slice filter forEach some " +
    "every map indexOf lastIndexOf reduce reduceRight sort reverse").split(" ");

for (var i = 0; i < methods.length; ++i) {
    if (typeof Array.prototype[methods[i]] === "function") {
        AggregateError.prototype[methods[i]] = Array.prototype[methods[i]];
    }
}

es5.defineProperty(AggregateError.prototype, "length", {
    value: 0,
    configurable: false,
    writable: true,
    enumerable: true
});
AggregateError.prototype["isOperational"] = true;
var level = 0;
AggregateError.prototype.toString = function() {
    var indent = Array(level * 4 + 1).join(" ");
    var ret = "\n" + indent + "AggregateError of:" + "\n";
    level++;
    indent = Array(level * 4 + 1).join(" ");
    for (var i = 0; i < this.length; ++i) {
        var str = this[i] === this ? "[Circular AggregateError]" : this[i] + "";
        var lines = str.split("\n");
        for (var j = 0; j < lines.length; ++j) {
            lines[j] = indent + lines[j];
        }
        str = lines.join("\n");
        ret += str + "\n";
    }
    level--;
    return ret;
};

function OperationalError(message) {
    if (!(this instanceof OperationalError))
        return new OperationalError(message);
    notEnumerableProp(this, "name", "OperationalError");
    notEnumerableProp(this, "message", message);
    this.cause = message;
    this["isOperational"] = true;

    if (message instanceof Error) {
        notEnumerableProp(this, "message", message.message);
        notEnumerableProp(this, "stack", message.stack);
    } else if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
    }

}
inherits(OperationalError, Error);

var errorTypes = Error["__BluebirdErrorTypes__"];
if (!errorTypes) {
    errorTypes = Objectfreeze({
        CancellationError: CancellationError,
        TimeoutError: TimeoutError,
        OperationalError: OperationalError,
        RejectionError: OperationalError,
        AggregateError: AggregateError
    });
    es5.defineProperty(Error, "__BluebirdErrorTypes__", {
        value: errorTypes,
        writable: false,
        enumerable: false,
        configurable: false
    });
}

module.exports = {
    Error: Error,
    TypeError: _TypeError,
    RangeError: _RangeError,
    CancellationError: errorTypes.CancellationError,
    OperationalError: errorTypes.OperationalError,
    TimeoutError: errorTypes.TimeoutError,
    AggregateError: errorTypes.AggregateError,
    Warning: Warning
};

},{"./es5":13,"./util":36}],13:[function(_dereq_,module,exports){
var isES5 = (function(){
    "use strict";
    return this === undefined;
})();

if (isES5) {
    module.exports = {
        freeze: Object.freeze,
        defineProperty: Object.defineProperty,
        getDescriptor: Object.getOwnPropertyDescriptor,
        keys: Object.keys,
        names: Object.getOwnPropertyNames,
        getPrototypeOf: Object.getPrototypeOf,
        isArray: Array.isArray,
        isES5: isES5,
        propertyIsWritable: function(obj, prop) {
            var descriptor = Object.getOwnPropertyDescriptor(obj, prop);
            return !!(!descriptor || descriptor.writable || descriptor.set);
        }
    };
} else {
    var has = {}.hasOwnProperty;
    var str = {}.toString;
    var proto = {}.constructor.prototype;

    var ObjectKeys = function (o) {
        var ret = [];
        for (var key in o) {
            if (has.call(o, key)) {
                ret.push(key);
            }
        }
        return ret;
    };

    var ObjectGetDescriptor = function(o, key) {
        return {value: o[key]};
    };

    var ObjectDefineProperty = function (o, key, desc) {
        o[key] = desc.value;
        return o;
    };

    var ObjectFreeze = function (obj) {
        return obj;
    };

    var ObjectGetPrototypeOf = function (obj) {
        try {
            return Object(obj).constructor.prototype;
        }
        catch (e) {
            return proto;
        }
    };

    var ArrayIsArray = function (obj) {
        try {
            return str.call(obj) === "[object Array]";
        }
        catch(e) {
            return false;
        }
    };

    module.exports = {
        isArray: ArrayIsArray,
        keys: ObjectKeys,
        names: ObjectKeys,
        defineProperty: ObjectDefineProperty,
        getDescriptor: ObjectGetDescriptor,
        freeze: ObjectFreeze,
        getPrototypeOf: ObjectGetPrototypeOf,
        isES5: isES5,
        propertyIsWritable: function() {
            return true;
        }
    };
}

},{}],14:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var PromiseMap = Promise.map;

Promise.prototype.filter = function (fn, options) {
    return PromiseMap(this, fn, options, INTERNAL);
};

Promise.filter = function (promises, fn, options) {
    return PromiseMap(promises, fn, options, INTERNAL);
};
};

},{}],15:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, tryConvertToPromise) {
var util = _dereq_("./util");
var CancellationError = Promise.CancellationError;
var errorObj = util.errorObj;

function PassThroughHandlerContext(promise, type, handler) {
    this.promise = promise;
    this.type = type;
    this.handler = handler;
    this.called = false;
    this.cancelPromise = null;
}

PassThroughHandlerContext.prototype.isFinallyHandler = function() {
    return this.type === 0;
};

function FinallyHandlerCancelReaction(finallyHandler) {
    this.finallyHandler = finallyHandler;
}

FinallyHandlerCancelReaction.prototype._resultCancelled = function() {
    checkCancel(this.finallyHandler);
};

function checkCancel(ctx, reason) {
    if (ctx.cancelPromise != null) {
        if (arguments.length > 1) {
            ctx.cancelPromise._reject(reason);
        } else {
            ctx.cancelPromise._cancel();
        }
        ctx.cancelPromise = null;
        return true;
    }
    return false;
}

function succeed() {
    return finallyHandler.call(this, this.promise._target()._settledValue());
}
function fail(reason) {
    if (checkCancel(this, reason)) return;
    errorObj.e = reason;
    return errorObj;
}
function finallyHandler(reasonOrValue) {
    var promise = this.promise;
    var handler = this.handler;

    if (!this.called) {
        this.called = true;
        var ret = this.isFinallyHandler()
            ? handler.call(promise._boundValue())
            : handler.call(promise._boundValue(), reasonOrValue);
        if (ret !== undefined) {
            promise._setReturnedNonUndefined();
            var maybePromise = tryConvertToPromise(ret, promise);
            if (maybePromise instanceof Promise) {
                if (this.cancelPromise != null) {
                    if (maybePromise.isCancelled()) {
                        var reason =
                            new CancellationError("late cancellation observer");
                        promise._attachExtraTrace(reason);
                        errorObj.e = reason;
                        return errorObj;
                    } else if (maybePromise.isPending()) {
                        maybePromise._attachCancellationCallback(
                            new FinallyHandlerCancelReaction(this));
                    }
                }
                return maybePromise._then(
                    succeed, fail, undefined, this, undefined);
            }
        }
    }

    if (promise.isRejected()) {
        checkCancel(this);
        errorObj.e = reasonOrValue;
        return errorObj;
    } else {
        checkCancel(this);
        return reasonOrValue;
    }
}

Promise.prototype._passThrough = function(handler, type, success, fail) {
    if (typeof handler !== "function") return this.then();
    return this._then(success,
                      fail,
                      undefined,
                      new PassThroughHandlerContext(this, type, handler),
                      undefined);
};

Promise.prototype.lastly =
Promise.prototype["finally"] = function (handler) {
    return this._passThrough(handler,
                             0,
                             finallyHandler,
                             finallyHandler);
};

Promise.prototype.tap = function (handler) {
    return this._passThrough(handler, 1, finallyHandler);
};

return PassThroughHandlerContext;
};

},{"./util":36}],16:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          apiRejection,
                          INTERNAL,
                          tryConvertToPromise,
                          Proxyable,
                          debug) {
var errors = _dereq_("./errors");
var TypeError = errors.TypeError;
var util = _dereq_("./util");
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
var yieldHandlers = [];

function promiseFromYieldHandler(value, yieldHandlers, traceParent) {
    for (var i = 0; i < yieldHandlers.length; ++i) {
        traceParent._pushContext();
        var result = tryCatch(yieldHandlers[i])(value);
        traceParent._popContext();
        if (result === errorObj) {
            traceParent._pushContext();
            var ret = Promise.reject(errorObj.e);
            traceParent._popContext();
            return ret;
        }
        var maybePromise = tryConvertToPromise(result, traceParent);
        if (maybePromise instanceof Promise) return maybePromise;
    }
    return null;
}

function PromiseSpawn(generatorFunction, receiver, yieldHandler, stack) {
    var promise = this._promise = new Promise(INTERNAL);
    promise._captureStackTrace();
    promise._setOnCancel(this);
    this._stack = stack;
    this._generatorFunction = generatorFunction;
    this._receiver = receiver;
    this._generator = undefined;
    this._yieldHandlers = typeof yieldHandler === "function"
        ? [yieldHandler].concat(yieldHandlers)
        : yieldHandlers;
    this._yieldedPromise = null;
}
util.inherits(PromiseSpawn, Proxyable);

PromiseSpawn.prototype._isResolved = function() {
    return this._promise === null;
};

PromiseSpawn.prototype._cleanup = function() {
    this._promise = this._generator = null;
};

PromiseSpawn.prototype._promiseCancelled = function() {
    if (this._isResolved()) return;
    var implementsReturn = typeof this._generator["return"] !== "undefined";

    var result;
    if (!implementsReturn) {
        var reason = new Promise.CancellationError(
            "generator .return() sentinel");
        Promise.coroutine.returnSentinel = reason;
        this._promise._attachExtraTrace(reason);
        this._promise._pushContext();
        result = tryCatch(this._generator["throw"]).call(this._generator,
                                                         reason);
        this._promise._popContext();
        if (result === errorObj && result.e === reason) {
            result = null;
        }
    } else {
        this._promise._pushContext();
        result = tryCatch(this._generator["return"]).call(this._generator,
                                                          undefined);
        this._promise._popContext();
    }
    var promise = this._promise;
    this._cleanup();
    if (result === errorObj) {
        promise._rejectCallback(result.e, false);
    } else {
        promise.cancel();
    }
};

PromiseSpawn.prototype._promiseFulfilled = function(value) {
    this._yieldedPromise = null;
    this._promise._pushContext();
    var result = tryCatch(this._generator.next).call(this._generator, value);
    this._promise._popContext();
    this._continue(result);
};

PromiseSpawn.prototype._promiseRejected = function(reason) {
    this._yieldedPromise = null;
    this._promise._attachExtraTrace(reason);
    this._promise._pushContext();
    var result = tryCatch(this._generator["throw"])
        .call(this._generator, reason);
    this._promise._popContext();
    this._continue(result);
};

PromiseSpawn.prototype._resultCancelled = function() {
    if (this._yieldedPromise instanceof Promise) {
        var promise = this._yieldedPromise;
        this._yieldedPromise = null;
        promise.cancel();
    }
};

PromiseSpawn.prototype.promise = function () {
    return this._promise;
};

PromiseSpawn.prototype._run = function () {
    this._generator = this._generatorFunction.call(this._receiver);
    this._receiver =
        this._generatorFunction = undefined;
    this._promiseFulfilled(undefined);
};

PromiseSpawn.prototype._continue = function (result) {
    var promise = this._promise;
    if (result === errorObj) {
        this._cleanup();
        return promise._rejectCallback(result.e, false);
    }

    var value = result.value;
    if (result.done === true) {
        this._cleanup();
        return promise._resolveCallback(value);
    } else {
        var maybePromise = tryConvertToPromise(value, this._promise);
        if (!(maybePromise instanceof Promise)) {
            maybePromise =
                promiseFromYieldHandler(maybePromise,
                                        this._yieldHandlers,
                                        this._promise);
            if (maybePromise === null) {
                this._promiseRejected(
                    new TypeError(
                        "A value %s was yielded that could not be treated as a promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a\u000a".replace("%s", value) +
                        "From coroutine:\u000a" +
                        this._stack.split("\n").slice(1, -7).join("\n")
                    )
                );
                return;
            }
        }
        maybePromise = maybePromise._target();
        var bitField = maybePromise._bitField;
        ;
        if (((bitField & 50397184) === 0)) {
            this._yieldedPromise = maybePromise;
            maybePromise._proxy(this, null);
        } else if (((bitField & 33554432) !== 0)) {
            this._promiseFulfilled(maybePromise._value());
        } else if (((bitField & 16777216) !== 0)) {
            this._promiseRejected(maybePromise._reason());
        } else {
            this._promiseCancelled();
        }
    }
};

Promise.coroutine = function (generatorFunction, options) {
    if (typeof generatorFunction !== "function") {
        throw new TypeError("generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var yieldHandler = Object(options).yieldHandler;
    var PromiseSpawn$ = PromiseSpawn;
    var stack = new Error().stack;
    return function () {
        var generator = generatorFunction.apply(this, arguments);
        var spawn = new PromiseSpawn$(undefined, undefined, yieldHandler,
                                      stack);
        var ret = spawn.promise();
        spawn._generator = generator;
        spawn._promiseFulfilled(undefined);
        return ret;
    };
};

Promise.coroutine.addYieldHandler = function(fn) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    yieldHandlers.push(fn);
};

Promise.spawn = function (generatorFunction) {
    debug.deprecated("Promise.spawn()", "Promise.coroutine()");
    if (typeof generatorFunction !== "function") {
        return apiRejection("generatorFunction must be a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var spawn = new PromiseSpawn(generatorFunction, this);
    var ret = spawn.promise();
    spawn._run(Promise.spawn);
    return ret;
};
};

},{"./errors":12,"./util":36}],17:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, tryConvertToPromise, INTERNAL) {
var util = _dereq_("./util");
var canEvaluate = util.canEvaluate;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var reject;

if (!true) {
if (canEvaluate) {
    var thenCallback = function(i) {
        return new Function("value", "holder", "                             \n\
            'use strict';                                                    \n\
            holder.pIndex = value;                                           \n\
            holder.checkFulfillment(this);                                   \n\
            ".replace(/Index/g, i));
    };

    var promiseSetter = function(i) {
        return new Function("promise", "holder", "                           \n\
            'use strict';                                                    \n\
            holder.pIndex = promise;                                         \n\
            ".replace(/Index/g, i));
    };

    var generateHolderClass = function(total) {
        var props = new Array(total);
        for (var i = 0; i < props.length; ++i) {
            props[i] = "this.p" + (i+1);
        }
        var assignment = props.join(" = ") + " = null;";
        var cancellationCode= "var promise;\n" + props.map(function(prop) {
            return "                                                         \n\
                promise = " + prop + ";                                      \n\
                if (promise instanceof Promise) {                            \n\
                    promise.cancel();                                        \n\
                }                                                            \n\
            ";
        }).join("\n");
        var passedArguments = props.join(", ");
        var name = "Holder$" + total;


        var code = "return function(tryCatch, errorObj, Promise) {           \n\
            'use strict';                                                    \n\
            function [TheName](fn) {                                         \n\
                [TheProperties]                                              \n\
                this.fn = fn;                                                \n\
                this.now = 0;                                                \n\
            }                                                                \n\
            [TheName].prototype.checkFulfillment = function(promise) {       \n\
                var now = ++this.now;                                        \n\
                if (now === [TheTotal]) {                                    \n\
                    promise._pushContext();                                  \n\
                    var callback = this.fn;                                  \n\
                    var ret = tryCatch(callback)([ThePassedArguments]);      \n\
                    promise._popContext();                                   \n\
                    if (ret === errorObj) {                                  \n\
                        promise._rejectCallback(ret.e, false);               \n\
                    } else {                                                 \n\
                        promise._resolveCallback(ret);                       \n\
                    }                                                        \n\
                }                                                            \n\
            };                                                               \n\
                                                                             \n\
            [TheName].prototype._resultCancelled = function() {              \n\
                [CancellationCode]                                           \n\
            };                                                               \n\
                                                                             \n\
            return [TheName];                                                \n\
        }(tryCatch, errorObj, Promise);                                      \n\
        ";

        code = code.replace(/\[TheName\]/g, name)
            .replace(/\[TheTotal\]/g, total)
            .replace(/\[ThePassedArguments\]/g, passedArguments)
            .replace(/\[TheProperties\]/g, assignment)
            .replace(/\[CancellationCode\]/g, cancellationCode);

        return new Function("tryCatch", "errorObj", "Promise", code)
                           (tryCatch, errorObj, Promise);
    };

    var holderClasses = [];
    var thenCallbacks = [];
    var promiseSetters = [];

    for (var i = 0; i < 8; ++i) {
        holderClasses.push(generateHolderClass(i + 1));
        thenCallbacks.push(thenCallback(i + 1));
        promiseSetters.push(promiseSetter(i + 1));
    }

    reject = function (reason) {
        this._reject(reason);
    };
}}

Promise.join = function () {
    var last = arguments.length - 1;
    var fn;
    if (last > 0 && typeof arguments[last] === "function") {
        fn = arguments[last];
        if (!true) {
            if (last <= 8 && canEvaluate) {
                var ret = new Promise(INTERNAL);
                ret._captureStackTrace();
                var HolderClass = holderClasses[last - 1];
                var holder = new HolderClass(fn);
                var callbacks = thenCallbacks;

                for (var i = 0; i < last; ++i) {
                    var maybePromise = tryConvertToPromise(arguments[i], ret);
                    if (maybePromise instanceof Promise) {
                        maybePromise = maybePromise._target();
                        var bitField = maybePromise._bitField;
                        ;
                        if (((bitField & 50397184) === 0)) {
                            maybePromise._then(callbacks[i], reject,
                                               undefined, ret, holder);
                            promiseSetters[i](maybePromise, holder);
                        } else if (((bitField & 33554432) !== 0)) {
                            callbacks[i].call(ret,
                                              maybePromise._value(), holder);
                        } else if (((bitField & 16777216) !== 0)) {
                            ret._reject(maybePromise._reason());
                        } else {
                            ret._cancel();
                        }
                    } else {
                        callbacks[i].call(ret, maybePromise, holder);
                    }
                }
                if (!ret._isFateSealed()) {
                    ret._setAsyncGuaranteed();
                    ret._setOnCancel(holder);
                }
                return ret;
            }
        }
    }
    var args = [].slice.call(arguments);;
    if (fn) args.pop();
    var ret = new PromiseArray(args).promise();
    return fn !== undefined ? ret.spread(fn) : ret;
};

};

},{"./util":36}],18:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL,
                          debug) {
var getDomain = Promise._getDomain;
var util = _dereq_("./util");
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;
var EMPTY_ARRAY = [];

function MappingPromiseArray(promises, fn, limit, _filter) {
    this.constructor$(promises);
    this._promise._captureStackTrace();
    var domain = getDomain();
    this._callback = domain === null ? fn : domain.bind(fn);
    this._preservedValues = _filter === INTERNAL
        ? new Array(this.length())
        : null;
    this._limit = limit;
    this._inFlight = 0;
    this._queue = limit >= 1 ? [] : EMPTY_ARRAY;
    this._init$(undefined, -2);
}
util.inherits(MappingPromiseArray, PromiseArray);

MappingPromiseArray.prototype._init = function () {};

MappingPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var values = this._values;
    var length = this.length();
    var preservedValues = this._preservedValues;
    var limit = this._limit;

    if (index < 0) {
        index = (index * -1) - 1;
        values[index] = value;
        if (limit >= 1) {
            this._inFlight--;
            this._drainQueue();
            if (this._isResolved()) return true;
        }
    } else {
        if (limit >= 1 && this._inFlight >= limit) {
            values[index] = value;
            this._queue.push(index);
            return false;
        }
        if (preservedValues !== null) preservedValues[index] = value;

        var promise = this._promise;
        var callback = this._callback;
        var receiver = promise._boundValue();
        promise._pushContext();
        var ret = tryCatch(callback).call(receiver, value, index, length);
        var promiseCreated = promise._popContext();
        debug.checkForgottenReturns(
            ret,
            promiseCreated,
            preservedValues !== null ? "Promise.filter" : "Promise.map",
            promise
        );
        if (ret === errorObj) {
            this._reject(ret.e);
            return true;
        }

        var maybePromise = tryConvertToPromise(ret, this._promise);
        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            var bitField = maybePromise._bitField;
            ;
            if (((bitField & 50397184) === 0)) {
                if (limit >= 1) this._inFlight++;
                values[index] = maybePromise;
                maybePromise._proxy(this, (index + 1) * -1);
                return false;
            } else if (((bitField & 33554432) !== 0)) {
                ret = maybePromise._value();
            } else if (((bitField & 16777216) !== 0)) {
                this._reject(maybePromise._reason());
                return true;
            } else {
                this._cancel();
                return true;
            }
        }
        values[index] = ret;
    }
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= length) {
        if (preservedValues !== null) {
            this._filter(values, preservedValues);
        } else {
            this._resolve(values);
        }
        return true;
    }
    return false;
};

MappingPromiseArray.prototype._drainQueue = function () {
    var queue = this._queue;
    var limit = this._limit;
    var values = this._values;
    while (queue.length > 0 && this._inFlight < limit) {
        if (this._isResolved()) return;
        var index = queue.pop();
        this._promiseFulfilled(values[index], index);
    }
};

MappingPromiseArray.prototype._filter = function (booleans, values) {
    var len = values.length;
    var ret = new Array(len);
    var j = 0;
    for (var i = 0; i < len; ++i) {
        if (booleans[i]) ret[j++] = values[i];
    }
    ret.length = j;
    this._resolve(ret);
};

MappingPromiseArray.prototype.preservedValues = function () {
    return this._preservedValues;
};

function map(promises, fn, options, _filter) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    var limit = typeof options === "object" && options !== null
        ? options.concurrency
        : 0;
    limit = typeof limit === "number" &&
        isFinite(limit) && limit >= 1 ? limit : 0;
    return new MappingPromiseArray(promises, fn, limit, _filter).promise();
}

Promise.prototype.map = function (fn, options) {
    return map(this, fn, options, null);
};

Promise.map = function (promises, fn, options, _filter) {
    return map(promises, fn, options, _filter);
};


};

},{"./util":36}],19:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, INTERNAL, tryConvertToPromise, apiRejection, debug) {
var util = _dereq_("./util");
var tryCatch = util.tryCatch;

Promise.method = function (fn) {
    if (typeof fn !== "function") {
        throw new Promise.TypeError("expecting a function but got " + util.classString(fn));
    }
    return function () {
        var ret = new Promise(INTERNAL);
        ret._captureStackTrace();
        ret._pushContext();
        var value = tryCatch(fn).apply(this, arguments);
        var promiseCreated = ret._popContext();
        debug.checkForgottenReturns(
            value, promiseCreated, "Promise.method", ret);
        ret._resolveFromSyncValue(value);
        return ret;
    };
};

Promise.attempt = Promise["try"] = function (fn) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._pushContext();
    var value;
    if (arguments.length > 1) {
        debug.deprecated("calling Promise.try with more than 1 argument");
        var arg = arguments[1];
        var ctx = arguments[2];
        value = util.isArray(arg) ? tryCatch(fn).apply(ctx, arg)
                                  : tryCatch(fn).call(ctx, arg);
    } else {
        value = tryCatch(fn)();
    }
    var promiseCreated = ret._popContext();
    debug.checkForgottenReturns(
        value, promiseCreated, "Promise.try", ret);
    ret._resolveFromSyncValue(value);
    return ret;
};

Promise.prototype._resolveFromSyncValue = function (value) {
    if (value === util.errorObj) {
        this._rejectCallback(value.e, false);
    } else {
        this._resolveCallback(value, true);
    }
};
};

},{"./util":36}],20:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util");
var maybeWrapAsError = util.maybeWrapAsError;
var errors = _dereq_("./errors");
var OperationalError = errors.OperationalError;
var es5 = _dereq_("./es5");

function isUntypedError(obj) {
    return obj instanceof Error &&
        es5.getPrototypeOf(obj) === Error.prototype;
}

var rErrorKey = /^(?:name|message|stack|cause)$/;
function wrapAsOperationalError(obj) {
    var ret;
    if (isUntypedError(obj)) {
        ret = new OperationalError(obj);
        ret.name = obj.name;
        ret.message = obj.message;
        ret.stack = obj.stack;
        var keys = es5.keys(obj);
        for (var i = 0; i < keys.length; ++i) {
            var key = keys[i];
            if (!rErrorKey.test(key)) {
                ret[key] = obj[key];
            }
        }
        return ret;
    }
    util.markAsOriginatingFromRejection(obj);
    return obj;
}

function nodebackForPromise(promise, multiArgs) {
    return function(err, value) {
        if (promise === null) return;
        if (err) {
            var wrapped = wrapAsOperationalError(maybeWrapAsError(err));
            promise._attachExtraTrace(wrapped);
            promise._reject(wrapped);
        } else if (!multiArgs) {
            promise._fulfill(value);
        } else {
            var args = [].slice.call(arguments, 1);;
            promise._fulfill(args);
        }
        promise = null;
    };
}

module.exports = nodebackForPromise;

},{"./errors":12,"./es5":13,"./util":36}],21:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
var util = _dereq_("./util");
var async = Promise._async;
var tryCatch = util.tryCatch;
var errorObj = util.errorObj;

function spreadAdapter(val, nodeback) {
    var promise = this;
    if (!util.isArray(val)) return successAdapter.call(promise, val, nodeback);
    var ret =
        tryCatch(nodeback).apply(promise._boundValue(), [null].concat(val));
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

function successAdapter(val, nodeback) {
    var promise = this;
    var receiver = promise._boundValue();
    var ret = val === undefined
        ? tryCatch(nodeback).call(receiver, null)
        : tryCatch(nodeback).call(receiver, null, val);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}
function errorAdapter(reason, nodeback) {
    var promise = this;
    if (!reason) {
        var newReason = new Error(reason + "");
        newReason.cause = reason;
        reason = newReason;
    }
    var ret = tryCatch(nodeback).call(promise._boundValue(), reason);
    if (ret === errorObj) {
        async.throwLater(ret.e);
    }
}

Promise.prototype.asCallback = Promise.prototype.nodeify = function (nodeback,
                                                                     options) {
    if (typeof nodeback == "function") {
        var adapter = successAdapter;
        if (options !== undefined && Object(options).spread) {
            adapter = spreadAdapter;
        }
        this._then(
            adapter,
            errorAdapter,
            undefined,
            this,
            nodeback
        );
    }
    return this;
};
};

},{"./util":36}],22:[function(_dereq_,module,exports){
"use strict";
module.exports = function() {
var makeSelfResolutionError = function () {
    return new TypeError("circular promise resolution chain\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
};
var reflectHandler = function() {
    return new Promise.PromiseInspection(this._target());
};
var apiRejection = function(msg) {
    return Promise.reject(new TypeError(msg));
};
function Proxyable() {}
var UNDEFINED_BINDING = {};
var util = _dereq_("./util");

var getDomain;
if (util.isNode) {
    getDomain = function() {
        var ret = process.domain;
        if (ret === undefined) ret = null;
        return ret;
    };
} else {
    getDomain = function() {
        return null;
    };
}
util.notEnumerableProp(Promise, "_getDomain", getDomain);

var es5 = _dereq_("./es5");
var Async = _dereq_("./async");
var async = new Async();
es5.defineProperty(Promise, "_async", {value: async});
var errors = _dereq_("./errors");
var TypeError = Promise.TypeError = errors.TypeError;
Promise.RangeError = errors.RangeError;
var CancellationError = Promise.CancellationError = errors.CancellationError;
Promise.TimeoutError = errors.TimeoutError;
Promise.OperationalError = errors.OperationalError;
Promise.RejectionError = errors.OperationalError;
Promise.AggregateError = errors.AggregateError;
var INTERNAL = function(){};
var APPLY = {};
var NEXT_FILTER = {};
var tryConvertToPromise = _dereq_("./thenables")(Promise, INTERNAL);
var PromiseArray =
    _dereq_("./promise_array")(Promise, INTERNAL,
                               tryConvertToPromise, apiRejection, Proxyable);
var Context = _dereq_("./context")(Promise);
 /*jshint unused:false*/
var createContext = Context.create;
var debug = _dereq_("./debuggability")(Promise, Context);
var CapturedTrace = debug.CapturedTrace;
var PassThroughHandlerContext =
    _dereq_("./finally")(Promise, tryConvertToPromise);
var catchFilter = _dereq_("./catch_filter")(NEXT_FILTER);
var nodebackForPromise = _dereq_("./nodeback");
var errorObj = util.errorObj;
var tryCatch = util.tryCatch;
function check(self, executor) {
    if (typeof executor !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(executor));
    }
    if (self.constructor !== Promise) {
        throw new TypeError("the promise constructor cannot be invoked directly\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
}

function Promise(executor) {
    this._bitField = 0;
    this._fulfillmentHandler0 = undefined;
    this._rejectionHandler0 = undefined;
    this._promise0 = undefined;
    this._receiver0 = undefined;
    if (executor !== INTERNAL) {
        check(this, executor);
        this._resolveFromExecutor(executor);
    }
    this._promiseCreated();
    this._fireEvent("promiseCreated", this);
}

Promise.prototype.toString = function () {
    return "[object Promise]";
};

Promise.prototype.caught = Promise.prototype["catch"] = function (fn) {
    var len = arguments.length;
    if (len > 1) {
        var catchInstances = new Array(len - 1),
            j = 0, i;
        for (i = 0; i < len - 1; ++i) {
            var item = arguments[i];
            if (util.isObject(item)) {
                catchInstances[j++] = item;
            } else {
                return apiRejection("expecting an object but got " + util.classString(item));
            }
        }
        catchInstances.length = j;
        fn = arguments[i];
        return this.then(undefined, catchFilter(catchInstances, fn, this));
    }
    return this.then(undefined, fn);
};

Promise.prototype.reflect = function () {
    return this._then(reflectHandler,
        reflectHandler, undefined, this, undefined);
};

Promise.prototype.then = function (didFulfill, didReject) {
    if (debug.warnings() && arguments.length > 0 &&
        typeof didFulfill !== "function" &&
        typeof didReject !== "function") {
        var msg = ".then() only accepts functions but was passed: " +
                util.classString(didFulfill);
        if (arguments.length > 1) {
            msg += ", " + util.classString(didReject);
        }
        this._warn(msg);
    }
    return this._then(didFulfill, didReject, undefined, undefined, undefined);
};

Promise.prototype.done = function (didFulfill, didReject) {
    var promise =
        this._then(didFulfill, didReject, undefined, undefined, undefined);
    promise._setIsFinal();
};

Promise.prototype.spread = function (fn) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    return this.all()._then(fn, undefined, undefined, APPLY, undefined);
};

Promise.prototype.toJSON = function () {
    var ret = {
        isFulfilled: false,
        isRejected: false,
        fulfillmentValue: undefined,
        rejectionReason: undefined
    };
    if (this.isFulfilled()) {
        ret.fulfillmentValue = this.value();
        ret.isFulfilled = true;
    } else if (this.isRejected()) {
        ret.rejectionReason = this.reason();
        ret.isRejected = true;
    }
    return ret;
};

Promise.prototype.all = function () {
    if (arguments.length > 0) {
        this._warn(".all() was passed arguments but it does not take any");
    }
    return new PromiseArray(this).promise();
};

Promise.prototype.error = function (fn) {
    return this.caught(util.originatesFromRejection, fn);
};

Promise.is = function (val) {
    return val instanceof Promise;
};

Promise.fromNode = Promise.fromCallback = function(fn) {
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    var multiArgs = arguments.length > 1 ? !!Object(arguments[1]).multiArgs
                                         : false;
    var result = tryCatch(fn)(nodebackForPromise(ret, multiArgs));
    if (result === errorObj) {
        ret._rejectCallback(result.e, true);
    }
    if (!ret._isFateSealed()) ret._setAsyncGuaranteed();
    return ret;
};

Promise.all = function (promises) {
    return new PromiseArray(promises).promise();
};

Promise.cast = function (obj) {
    var ret = tryConvertToPromise(obj);
    if (!(ret instanceof Promise)) {
        ret = new Promise(INTERNAL);
        ret._captureStackTrace();
        ret._setFulfilled();
        ret._rejectionHandler0 = obj;
    }
    return ret;
};

Promise.resolve = Promise.fulfilled = Promise.cast;

Promise.reject = Promise.rejected = function (reason) {
    var ret = new Promise(INTERNAL);
    ret._captureStackTrace();
    ret._rejectCallback(reason, true);
    return ret;
};

Promise.setScheduler = function(fn) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    var prev = async._schedule;
    async._schedule = fn;
    return prev;
};

Promise.prototype._then = function (
    didFulfill,
    didReject,
    _,    receiver,
    internalData
) {
    var haveInternalData = internalData !== undefined;
    var promise = haveInternalData ? internalData : new Promise(INTERNAL);
    var target = this._target();
    var bitField = target._bitField;

    if (!haveInternalData) {
        promise._propagateFrom(this, 3);
        promise._captureStackTrace();
        if (receiver === undefined &&
            ((this._bitField & 2097152) !== 0)) {
            if (!((bitField & 50397184) === 0)) {
                receiver = this._boundValue();
            } else {
                receiver = target === this ? undefined : this._boundTo;
            }
        }
        this._fireEvent("promiseChained", this, promise);
    }

    var domain = getDomain();
    if (!((bitField & 50397184) === 0)) {
        var handler, value, settler = target._settlePromiseCtx;
        if (((bitField & 33554432) !== 0)) {
            value = target._rejectionHandler0;
            handler = didFulfill;
        } else if (((bitField & 16777216) !== 0)) {
            value = target._fulfillmentHandler0;
            handler = didReject;
            target._unsetRejectionIsUnhandled();
        } else {
            settler = target._settlePromiseLateCancellationObserver;
            value = new CancellationError("late cancellation observer");
            target._attachExtraTrace(value);
            handler = didReject;
        }

        async.invoke(settler, target, {
            handler: domain === null ? handler
                : (typeof handler === "function" && domain.bind(handler)),
            promise: promise,
            receiver: receiver,
            value: value
        });
    } else {
        target._addCallbacks(didFulfill, didReject, promise, receiver, domain);
    }

    return promise;
};

Promise.prototype._length = function () {
    return this._bitField & 65535;
};

Promise.prototype._isFateSealed = function () {
    return (this._bitField & 117506048) !== 0;
};

Promise.prototype._isFollowing = function () {
    return (this._bitField & 67108864) === 67108864;
};

Promise.prototype._setLength = function (len) {
    this._bitField = (this._bitField & -65536) |
        (len & 65535);
};

Promise.prototype._setFulfilled = function () {
    this._bitField = this._bitField | 33554432;
    this._fireEvent("promiseFulfilled", this);
};

Promise.prototype._setRejected = function () {
    this._bitField = this._bitField | 16777216;
    this._fireEvent("promiseRejected", this);
};

Promise.prototype._setFollowing = function () {
    this._bitField = this._bitField | 67108864;
    this._fireEvent("promiseResolved", this);
};

Promise.prototype._setIsFinal = function () {
    this._bitField = this._bitField | 4194304;
};

Promise.prototype._isFinal = function () {
    return (this._bitField & 4194304) > 0;
};

Promise.prototype._unsetCancelled = function() {
    this._bitField = this._bitField & (~65536);
};

Promise.prototype._setCancelled = function() {
    this._bitField = this._bitField | 65536;
    this._fireEvent("promiseCancelled", this);
};

Promise.prototype._setAsyncGuaranteed = function() {
    this._bitField = this._bitField | 134217728;
};

Promise.prototype._receiverAt = function (index) {
    var ret = index === 0 ? this._receiver0 : this[
            index * 4 - 4 + 3];
    if (ret === UNDEFINED_BINDING) {
        return undefined;
    } else if (ret === undefined && this._isBound()) {
        return this._boundValue();
    }
    return ret;
};

Promise.prototype._promiseAt = function (index) {
    return this[
            index * 4 - 4 + 2];
};

Promise.prototype._fulfillmentHandlerAt = function (index) {
    return this[
            index * 4 - 4 + 0];
};

Promise.prototype._rejectionHandlerAt = function (index) {
    return this[
            index * 4 - 4 + 1];
};

Promise.prototype._boundValue = function() {};

Promise.prototype._migrateCallback0 = function (follower) {
    var bitField = follower._bitField;
    var fulfill = follower._fulfillmentHandler0;
    var reject = follower._rejectionHandler0;
    var promise = follower._promise0;
    var receiver = follower._receiverAt(0);
    if (receiver === undefined) receiver = UNDEFINED_BINDING;
    this._addCallbacks(fulfill, reject, promise, receiver, null);
};

Promise.prototype._migrateCallbackAt = function (follower, index) {
    var fulfill = follower._fulfillmentHandlerAt(index);
    var reject = follower._rejectionHandlerAt(index);
    var promise = follower._promiseAt(index);
    var receiver = follower._receiverAt(index);
    if (receiver === undefined) receiver = UNDEFINED_BINDING;
    this._addCallbacks(fulfill, reject, promise, receiver, null);
};

Promise.prototype._addCallbacks = function (
    fulfill,
    reject,
    promise,
    receiver,
    domain
) {
    var index = this._length();

    if (index >= 65535 - 4) {
        index = 0;
        this._setLength(0);
    }

    if (index === 0) {
        this._promise0 = promise;
        this._receiver0 = receiver;
        if (typeof fulfill === "function") {
            this._fulfillmentHandler0 =
                domain === null ? fulfill : domain.bind(fulfill);
        }
        if (typeof reject === "function") {
            this._rejectionHandler0 =
                domain === null ? reject : domain.bind(reject);
        }
    } else {
        var base = index * 4 - 4;
        this[base + 2] = promise;
        this[base + 3] = receiver;
        if (typeof fulfill === "function") {
            this[base + 0] =
                domain === null ? fulfill : domain.bind(fulfill);
        }
        if (typeof reject === "function") {
            this[base + 1] =
                domain === null ? reject : domain.bind(reject);
        }
    }
    this._setLength(index + 1);
    return index;
};

Promise.prototype._proxy = function (proxyable, arg) {
    this._addCallbacks(undefined, undefined, arg, proxyable, null);
};

Promise.prototype._resolveCallback = function(value, shouldBind) {
    if (((this._bitField & 117506048) !== 0)) return;
    if (value === this)
        return this._rejectCallback(makeSelfResolutionError(), false);
    var maybePromise = tryConvertToPromise(value, this);
    if (!(maybePromise instanceof Promise)) return this._fulfill(value);

    if (shouldBind) this._propagateFrom(maybePromise, 2);

    var promise = maybePromise._target();
    var bitField = promise._bitField;
    if (((bitField & 50397184) === 0)) {
        var len = this._length();
        if (len > 0) promise._migrateCallback0(this);
        for (var i = 1; i < len; ++i) {
            promise._migrateCallbackAt(this, i);
        }
        this._setFollowing();
        this._setLength(0);
        this._setFollowee(promise);
    } else if (((bitField & 33554432) !== 0)) {
        this._fulfill(promise._value());
    } else if (((bitField & 16777216) !== 0)) {
        this._reject(promise._reason());
    } else {
        var reason = new CancellationError("late cancellation observer");
        promise._attachExtraTrace(reason);
        this._reject(reason);
    }
};

Promise.prototype._rejectCallback =
function(reason, synchronous, ignoreNonErrorWarnings) {
    var trace = util.ensureErrorObject(reason);
    var hasStack = trace === reason;
    if (!hasStack && !ignoreNonErrorWarnings && debug.warnings()) {
        var message = "a promise was rejected with a non-error: " +
            util.classString(reason);
        this._warn(message, true);
    }
    this._attachExtraTrace(trace, synchronous ? hasStack : false);
    this._reject(reason);
};

Promise.prototype._resolveFromExecutor = function (executor) {
    var promise = this;
    this._captureStackTrace();
    this._pushContext();
    var synchronous = true;
    var r = this._execute(executor, function(value) {
        promise._resolveCallback(value);
    }, function (reason) {
        promise._rejectCallback(reason, synchronous);
    });
    synchronous = false;
    this._popContext();

    if (r !== undefined) {
        promise._rejectCallback(r, true);
    }
};

Promise.prototype._settlePromiseFromHandler = function (
    handler, receiver, value, promise
) {
    var bitField = promise._bitField;
    if (((bitField & 65536) !== 0)) return;
    promise._pushContext();
    var x;
    if (receiver === APPLY) {
        if (!value || typeof value.length !== "number") {
            x = errorObj;
            x.e = new TypeError("cannot .spread() a non-array: " +
                                    util.classString(value));
        } else {
            x = tryCatch(handler).apply(this._boundValue(), value);
        }
    } else {
        x = tryCatch(handler).call(receiver, value);
    }
    var promiseCreated = promise._popContext();
    bitField = promise._bitField;
    if (((bitField & 65536) !== 0)) return;

    if (x === NEXT_FILTER) {
        promise._reject(value);
    } else if (x === errorObj || x === promise) {
        var err = x === promise ? makeSelfResolutionError() : x.e;
        promise._rejectCallback(err, false);
    } else {
        debug.checkForgottenReturns(x, promiseCreated, "",  promise, this);
        promise._resolveCallback(x);
    }
};

Promise.prototype._target = function() {
    var ret = this;
    while (ret._isFollowing()) ret = ret._followee();
    return ret;
};

Promise.prototype._followee = function() {
    return this._rejectionHandler0;
};

Promise.prototype._setFollowee = function(promise) {
    this._rejectionHandler0 = promise;
};

Promise.prototype._settlePromise = function(promise, handler, receiver, value) {
    var isPromise = promise instanceof Promise;
    var bitField = this._bitField;
    var asyncGuaranteed = ((bitField & 134217728) !== 0);
    if (((bitField & 65536) !== 0)) {
        if (isPromise) promise._invokeInternalOnCancel();

        if (receiver instanceof PassThroughHandlerContext &&
            receiver.isFinallyHandler()) {
            receiver.cancelPromise = promise;
            if (tryCatch(handler).call(receiver, value) === errorObj) {
                promise._reject(errorObj.e);
            }
        } else if (handler === reflectHandler) {
            promise._fulfill(reflectHandler.call(receiver));
        } else if (receiver instanceof Proxyable) {
            receiver._promiseCancelled(promise);
        } else if (isPromise || promise instanceof PromiseArray) {
            promise._cancel();
        } else {
            receiver.cancel();
        }
    } else if (typeof handler === "function") {
        if (!isPromise) {
            handler.call(receiver, value, promise);
        } else {
            if (asyncGuaranteed) promise._setAsyncGuaranteed();
            this._settlePromiseFromHandler(handler, receiver, value, promise);
        }
    } else if (receiver instanceof Proxyable) {
        if (!receiver._isResolved()) {
            if (((bitField & 33554432) !== 0)) {
                receiver._promiseFulfilled(value, promise);
            } else {
                receiver._promiseRejected(value, promise);
            }
        }
    } else if (isPromise) {
        if (asyncGuaranteed) promise._setAsyncGuaranteed();
        if (((bitField & 33554432) !== 0)) {
            promise._fulfill(value);
        } else {
            promise._reject(value);
        }
    }
};

Promise.prototype._settlePromiseLateCancellationObserver = function(ctx) {
    var handler = ctx.handler;
    var promise = ctx.promise;
    var receiver = ctx.receiver;
    var value = ctx.value;
    if (typeof handler === "function") {
        if (!(promise instanceof Promise)) {
            handler.call(receiver, value, promise);
        } else {
            this._settlePromiseFromHandler(handler, receiver, value, promise);
        }
    } else if (promise instanceof Promise) {
        promise._reject(value);
    }
};

Promise.prototype._settlePromiseCtx = function(ctx) {
    this._settlePromise(ctx.promise, ctx.handler, ctx.receiver, ctx.value);
};

Promise.prototype._settlePromise0 = function(handler, value, bitField) {
    var promise = this._promise0;
    var receiver = this._receiverAt(0);
    this._promise0 = undefined;
    this._receiver0 = undefined;
    this._settlePromise(promise, handler, receiver, value);
};

Promise.prototype._clearCallbackDataAtIndex = function(index) {
    var base = index * 4 - 4;
    this[base + 2] =
    this[base + 3] =
    this[base + 0] =
    this[base + 1] = undefined;
};

Promise.prototype._fulfill = function (value) {
    var bitField = this._bitField;
    if (((bitField & 117506048) >>> 16)) return;
    if (value === this) {
        var err = makeSelfResolutionError();
        this._attachExtraTrace(err);
        return this._reject(err);
    }
    this._setFulfilled();
    this._rejectionHandler0 = value;

    if ((bitField & 65535) > 0) {
        if (((bitField & 134217728) !== 0)) {
            this._settlePromises();
        } else {
            async.settlePromises(this);
        }
    }
};

Promise.prototype._reject = function (reason) {
    var bitField = this._bitField;
    if (((bitField & 117506048) >>> 16)) return;
    this._setRejected();
    this._fulfillmentHandler0 = reason;

    if (this._isFinal()) {
        return async.fatalError(reason, util.isNode);
    }

    if ((bitField & 65535) > 0) {
        if (((bitField & 134217728) !== 0)) {
            this._settlePromises();
        } else {
            async.settlePromises(this);
        }
    } else {
        this._ensurePossibleRejectionHandled();
    }
};

Promise.prototype._fulfillPromises = function (len, value) {
    for (var i = 1; i < len; i++) {
        var handler = this._fulfillmentHandlerAt(i);
        var promise = this._promiseAt(i);
        var receiver = this._receiverAt(i);
        this._clearCallbackDataAtIndex(i);
        this._settlePromise(promise, handler, receiver, value);
    }
};

Promise.prototype._rejectPromises = function (len, reason) {
    for (var i = 1; i < len; i++) {
        var handler = this._rejectionHandlerAt(i);
        var promise = this._promiseAt(i);
        var receiver = this._receiverAt(i);
        this._clearCallbackDataAtIndex(i);
        this._settlePromise(promise, handler, receiver, reason);
    }
};

Promise.prototype._settlePromises = function () {
    var bitField = this._bitField;
    var len = (bitField & 65535);

    if (len > 0) {
        if (((bitField & 16842752) !== 0)) {
            var reason = this._fulfillmentHandler0;
            this._settlePromise0(this._rejectionHandler0, reason, bitField);
            this._rejectPromises(len, reason);
        } else {
            var value = this._rejectionHandler0;
            this._settlePromise0(this._fulfillmentHandler0, value, bitField);
            this._fulfillPromises(len, value);
        }
        this._setLength(0);
    }
    this._clearCancellationData();
};

Promise.prototype._settledValue = function() {
    var bitField = this._bitField;
    if (((bitField & 33554432) !== 0)) {
        return this._rejectionHandler0;
    } else if (((bitField & 16777216) !== 0)) {
        return this._fulfillmentHandler0;
    }
};

function deferResolve(v) {this.promise._resolveCallback(v);}
function deferReject(v) {this.promise._rejectCallback(v, false);}

Promise.defer = Promise.pending = function() {
    debug.deprecated("Promise.defer", "new Promise");
    var promise = new Promise(INTERNAL);
    return {
        promise: promise,
        resolve: deferResolve,
        reject: deferReject
    };
};

util.notEnumerableProp(Promise,
                       "_makeSelfResolutionError",
                       makeSelfResolutionError);

_dereq_("./method")(Promise, INTERNAL, tryConvertToPromise, apiRejection,
    debug);
_dereq_("./bind")(Promise, INTERNAL, tryConvertToPromise, debug);
_dereq_("./cancel")(Promise, PromiseArray, apiRejection, debug);
_dereq_("./direct_resolve")(Promise);
_dereq_("./synchronous_inspection")(Promise);
_dereq_("./join")(
    Promise, PromiseArray, tryConvertToPromise, INTERNAL, debug);
Promise.Promise = Promise;
_dereq_('./map.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug);
_dereq_('./using.js')(Promise, apiRejection, tryConvertToPromise, createContext, INTERNAL, debug);
_dereq_('./timers.js')(Promise, INTERNAL, debug);
_dereq_('./generators.js')(Promise, apiRejection, INTERNAL, tryConvertToPromise, Proxyable, debug);
_dereq_('./nodeify.js')(Promise);
_dereq_('./call_get.js')(Promise);
_dereq_('./props.js')(Promise, PromiseArray, tryConvertToPromise, apiRejection);
_dereq_('./race.js')(Promise, INTERNAL, tryConvertToPromise, apiRejection);
_dereq_('./reduce.js')(Promise, PromiseArray, apiRejection, tryConvertToPromise, INTERNAL, debug);
_dereq_('./settle.js')(Promise, PromiseArray, debug);
_dereq_('./some.js')(Promise, PromiseArray, apiRejection);
_dereq_('./promisify.js')(Promise, INTERNAL);
_dereq_('./any.js')(Promise);
_dereq_('./each.js')(Promise, INTERNAL);
_dereq_('./filter.js')(Promise, INTERNAL);

    util.toFastProperties(Promise);
    util.toFastProperties(Promise.prototype);
    function fillTypes(value) {
        var p = new Promise(INTERNAL);
        p._fulfillmentHandler0 = value;
        p._rejectionHandler0 = value;
        p._promise0 = value;
        p._receiver0 = value;
    }
    // Complete slack tracking, opt out of field-type tracking and
    // stabilize map
    fillTypes({a: 1});
    fillTypes({b: 2});
    fillTypes({c: 3});
    fillTypes(1);
    fillTypes(function(){});
    fillTypes(undefined);
    fillTypes(false);
    fillTypes(new Promise(INTERNAL));
    debug.setBounds(Async.firstLineError, util.lastLineError);
    return Promise;

};

},{"./any.js":1,"./async":2,"./bind":3,"./call_get.js":5,"./cancel":6,"./catch_filter":7,"./context":8,"./debuggability":9,"./direct_resolve":10,"./each.js":11,"./errors":12,"./es5":13,"./filter.js":14,"./finally":15,"./generators.js":16,"./join":17,"./map.js":18,"./method":19,"./nodeback":20,"./nodeify.js":21,"./promise_array":23,"./promisify.js":24,"./props.js":25,"./race.js":27,"./reduce.js":28,"./settle.js":30,"./some.js":31,"./synchronous_inspection":32,"./thenables":33,"./timers.js":34,"./using.js":35,"./util":36}],23:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, tryConvertToPromise,
    apiRejection, Proxyable) {
var util = _dereq_("./util");
var isArray = util.isArray;

function toResolutionValue(val) {
    switch(val) {
    case -2: return [];
    case -3: return {};
    }
}

function PromiseArray(values) {
    var promise = this._promise = new Promise(INTERNAL);
    if (values instanceof Promise) {
        promise._propagateFrom(values, 3);
    }
    promise._setOnCancel(this);
    this._values = values;
    this._length = 0;
    this._totalResolved = 0;
    this._init(undefined, -2);
}
util.inherits(PromiseArray, Proxyable);

PromiseArray.prototype.length = function () {
    return this._length;
};

PromiseArray.prototype.promise = function () {
    return this._promise;
};

PromiseArray.prototype._init = function init(_, resolveValueIfEmpty) {
    var values = tryConvertToPromise(this._values, this._promise);
    if (values instanceof Promise) {
        values = values._target();
        var bitField = values._bitField;
        ;
        this._values = values;

        if (((bitField & 50397184) === 0)) {
            this._promise._setAsyncGuaranteed();
            return values._then(
                init,
                this._reject,
                undefined,
                this,
                resolveValueIfEmpty
           );
        } else if (((bitField & 33554432) !== 0)) {
            values = values._value();
        } else if (((bitField & 16777216) !== 0)) {
            return this._reject(values._reason());
        } else {
            return this._cancel();
        }
    }
    values = util.asArray(values);
    if (values === null) {
        var err = apiRejection(
            "expecting an array or an iterable object but got " + util.classString(values)).reason();
        this._promise._rejectCallback(err, false);
        return;
    }

    if (values.length === 0) {
        if (resolveValueIfEmpty === -5) {
            this._resolveEmptyArray();
        }
        else {
            this._resolve(toResolutionValue(resolveValueIfEmpty));
        }
        return;
    }
    this._iterate(values);
};

PromiseArray.prototype._iterate = function(values) {
    var len = this.getActualLength(values.length);
    this._length = len;
    this._values = this.shouldCopyValues() ? new Array(len) : this._values;
    var result = this._promise;
    var isResolved = false;
    var bitField = null;
    for (var i = 0; i < len; ++i) {
        var maybePromise = tryConvertToPromise(values[i], result);

        if (maybePromise instanceof Promise) {
            maybePromise = maybePromise._target();
            bitField = maybePromise._bitField;
        } else {
            bitField = null;
        }

        if (isResolved) {
            if (bitField !== null) {
                maybePromise.suppressUnhandledRejections();
            }
        } else if (bitField !== null) {
            if (((bitField & 50397184) === 0)) {
                maybePromise._proxy(this, i);
                this._values[i] = maybePromise;
            } else if (((bitField & 33554432) !== 0)) {
                isResolved = this._promiseFulfilled(maybePromise._value(), i);
            } else if (((bitField & 16777216) !== 0)) {
                isResolved = this._promiseRejected(maybePromise._reason(), i);
            } else {
                isResolved = this._promiseCancelled(i);
            }
        } else {
            isResolved = this._promiseFulfilled(maybePromise, i);
        }
    }
    if (!isResolved) result._setAsyncGuaranteed();
};

PromiseArray.prototype._isResolved = function () {
    return this._values === null;
};

PromiseArray.prototype._resolve = function (value) {
    this._values = null;
    this._promise._fulfill(value);
};

PromiseArray.prototype._cancel = function() {
    if (this._isResolved() || !this._promise.isCancellable()) return;
    this._values = null;
    this._promise._cancel();
};

PromiseArray.prototype._reject = function (reason) {
    this._values = null;
    this._promise._rejectCallback(reason, false);
};

PromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
        return true;
    }
    return false;
};

PromiseArray.prototype._promiseCancelled = function() {
    this._cancel();
    return true;
};

PromiseArray.prototype._promiseRejected = function (reason) {
    this._totalResolved++;
    this._reject(reason);
    return true;
};

PromiseArray.prototype._resultCancelled = function() {
    if (this._isResolved()) return;
    var values = this._values;
    this._cancel();
    if (values instanceof Promise) {
        values.cancel();
    } else {
        for (var i = 0; i < values.length; ++i) {
            if (values[i] instanceof Promise) {
                values[i].cancel();
            }
        }
    }
};

PromiseArray.prototype.shouldCopyValues = function () {
    return true;
};

PromiseArray.prototype.getActualLength = function (len) {
    return len;
};

return PromiseArray;
};

},{"./util":36}],24:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var THIS = {};
var util = _dereq_("./util");
var nodebackForPromise = _dereq_("./nodeback");
var withAppended = util.withAppended;
var maybeWrapAsError = util.maybeWrapAsError;
var canEvaluate = util.canEvaluate;
var TypeError = _dereq_("./errors").TypeError;
var defaultSuffix = "Async";
var defaultPromisified = {__isPromisified__: true};
var noCopyProps = [
    "arity",    "length",
    "name",
    "arguments",
    "caller",
    "callee",
    "prototype",
    "__isPromisified__"
];
var noCopyPropsPattern = new RegExp("^(?:" + noCopyProps.join("|") + ")$");

var defaultFilter = function(name) {
    return util.isIdentifier(name) &&
        name.charAt(0) !== "_" &&
        name !== "constructor";
};

function propsFilter(key) {
    return !noCopyPropsPattern.test(key);
}

function isPromisified(fn) {
    try {
        return fn.__isPromisified__ === true;
    }
    catch (e) {
        return false;
    }
}

function hasPromisified(obj, key, suffix) {
    var val = util.getDataPropertyOrDefault(obj, key + suffix,
                                            defaultPromisified);
    return val ? isPromisified(val) : false;
}
function checkValid(ret, suffix, suffixRegexp) {
    for (var i = 0; i < ret.length; i += 2) {
        var key = ret[i];
        if (suffixRegexp.test(key)) {
            var keyWithoutAsyncSuffix = key.replace(suffixRegexp, "");
            for (var j = 0; j < ret.length; j += 2) {
                if (ret[j] === keyWithoutAsyncSuffix) {
                    throw new TypeError("Cannot promisify an API that has normal methods with '%s'-suffix\u000a\u000a    See http://goo.gl/MqrFmX\u000a"
                        .replace("%s", suffix));
                }
            }
        }
    }
}

function promisifiableMethods(obj, suffix, suffixRegexp, filter) {
    var keys = util.inheritedDataKeys(obj);
    var ret = [];
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var value = obj[key];
        var passesDefaultFilter = filter === defaultFilter
            ? true : defaultFilter(key, value, obj);
        if (typeof value === "function" &&
            !isPromisified(value) &&
            !hasPromisified(obj, key, suffix) &&
            filter(key, value, obj, passesDefaultFilter)) {
            ret.push(key, value);
        }
    }
    checkValid(ret, suffix, suffixRegexp);
    return ret;
}

var escapeIdentRegex = function(str) {
    return str.replace(/([$])/, "\\$");
};

var makeNodePromisifiedEval;
if (!true) {
var switchCaseArgumentOrder = function(likelyArgumentCount) {
    var ret = [likelyArgumentCount];
    var min = Math.max(0, likelyArgumentCount - 1 - 3);
    for(var i = likelyArgumentCount - 1; i >= min; --i) {
        ret.push(i);
    }
    for(var i = likelyArgumentCount + 1; i <= 3; ++i) {
        ret.push(i);
    }
    return ret;
};

var argumentSequence = function(argumentCount) {
    return util.filledRange(argumentCount, "_arg", "");
};

var parameterDeclaration = function(parameterCount) {
    return util.filledRange(
        Math.max(parameterCount, 3), "_arg", "");
};

var parameterCount = function(fn) {
    if (typeof fn.length === "number") {
        return Math.max(Math.min(fn.length, 1023 + 1), 0);
    }
    return 0;
};

makeNodePromisifiedEval =
function(callback, receiver, originalName, fn, _, multiArgs) {
    var newParameterCount = Math.max(0, parameterCount(fn) - 1);
    var argumentOrder = switchCaseArgumentOrder(newParameterCount);
    var shouldProxyThis = typeof callback === "string" || receiver === THIS;

    function generateCallForArgumentCount(count) {
        var args = argumentSequence(count).join(", ");
        var comma = count > 0 ? ", " : "";
        var ret;
        if (shouldProxyThis) {
            ret = "ret = callback.call(this, {{args}}, nodeback); break;\n";
        } else {
            ret = receiver === undefined
                ? "ret = callback({{args}}, nodeback); break;\n"
                : "ret = callback.call(receiver, {{args}}, nodeback); break;\n";
        }
        return ret.replace("{{args}}", args).replace(", ", comma);
    }

    function generateArgumentSwitchCase() {
        var ret = "";
        for (var i = 0; i < argumentOrder.length; ++i) {
            ret += "case " + argumentOrder[i] +":" +
                generateCallForArgumentCount(argumentOrder[i]);
        }

        ret += "                                                             \n\
        default:                                                             \n\
            var args = new Array(len + 1);                                   \n\
            var i = 0;                                                       \n\
            for (var i = 0; i < len; ++i) {                                  \n\
               args[i] = arguments[i];                                       \n\
            }                                                                \n\
            args[i] = nodeback;                                              \n\
            [CodeForCall]                                                    \n\
            break;                                                           \n\
        ".replace("[CodeForCall]", (shouldProxyThis
                                ? "ret = callback.apply(this, args);\n"
                                : "ret = callback.apply(receiver, args);\n"));
        return ret;
    }

    var getFunctionCode = typeof callback === "string"
                                ? ("this != null ? this['"+callback+"'] : fn")
                                : "fn";
    var body = "'use strict';                                                \n\
        var ret = function (Parameters) {                                    \n\
            'use strict';                                                    \n\
            var len = arguments.length;                                      \n\
            var promise = new Promise(INTERNAL);                             \n\
            promise._captureStackTrace();                                    \n\
            var nodeback = nodebackForPromise(promise, " + multiArgs + ");   \n\
            var ret;                                                         \n\
            var callback = tryCatch([GetFunctionCode]);                      \n\
            switch(len) {                                                    \n\
                [CodeForSwitchCase]                                          \n\
            }                                                                \n\
            if (ret === errorObj) {                                          \n\
                promise._rejectCallback(maybeWrapAsError(ret.e), true, true);\n\
            }                                                                \n\
            if (!promise._isFateSealed()) promise._setAsyncGuaranteed();     \n\
            return promise;                                                  \n\
        };                                                                   \n\
        notEnumerableProp(ret, '__isPromisified__', true);                   \n\
        return ret;                                                          \n\
    ".replace("[CodeForSwitchCase]", generateArgumentSwitchCase())
        .replace("[GetFunctionCode]", getFunctionCode);
    body = body.replace("Parameters", parameterDeclaration(newParameterCount));
    return new Function("Promise",
                        "fn",
                        "receiver",
                        "withAppended",
                        "maybeWrapAsError",
                        "nodebackForPromise",
                        "tryCatch",
                        "errorObj",
                        "notEnumerableProp",
                        "INTERNAL",
                        body)(
                    Promise,
                    fn,
                    receiver,
                    withAppended,
                    maybeWrapAsError,
                    nodebackForPromise,
                    util.tryCatch,
                    util.errorObj,
                    util.notEnumerableProp,
                    INTERNAL);
};
}

function makeNodePromisifiedClosure(callback, receiver, _, fn, __, multiArgs) {
    var defaultThis = (function() {return this;})();
    var method = callback;
    if (typeof method === "string") {
        callback = fn;
    }
    function promisified() {
        var _receiver = receiver;
        if (receiver === THIS) _receiver = this;
        var promise = new Promise(INTERNAL);
        promise._captureStackTrace();
        var cb = typeof method === "string" && this !== defaultThis
            ? this[method] : callback;
        var fn = nodebackForPromise(promise, multiArgs);
        try {
            cb.apply(_receiver, withAppended(arguments, fn));
        } catch(e) {
            promise._rejectCallback(maybeWrapAsError(e), true, true);
        }
        if (!promise._isFateSealed()) promise._setAsyncGuaranteed();
        return promise;
    }
    util.notEnumerableProp(promisified, "__isPromisified__", true);
    return promisified;
}

var makeNodePromisified = canEvaluate
    ? makeNodePromisifiedEval
    : makeNodePromisifiedClosure;

function promisifyAll(obj, suffix, filter, promisifier, multiArgs) {
    var suffixRegexp = new RegExp(escapeIdentRegex(suffix) + "$");
    var methods =
        promisifiableMethods(obj, suffix, suffixRegexp, filter);

    for (var i = 0, len = methods.length; i < len; i+= 2) {
        var key = methods[i];
        var fn = methods[i+1];
        var promisifiedKey = key + suffix;
        if (promisifier === makeNodePromisified) {
            obj[promisifiedKey] =
                makeNodePromisified(key, THIS, key, fn, suffix, multiArgs);
        } else {
            var promisified = promisifier(fn, function() {
                return makeNodePromisified(key, THIS, key,
                                           fn, suffix, multiArgs);
            });
            util.notEnumerableProp(promisified, "__isPromisified__", true);
            obj[promisifiedKey] = promisified;
        }
    }
    util.toFastProperties(obj);
    return obj;
}

function promisify(callback, receiver, multiArgs) {
    return makeNodePromisified(callback, receiver, undefined,
                                callback, null, multiArgs);
}

Promise.promisify = function (fn, options) {
    if (typeof fn !== "function") {
        throw new TypeError("expecting a function but got " + util.classString(fn));
    }
    if (isPromisified(fn)) {
        return fn;
    }
    options = Object(options);
    var receiver = options.context === undefined ? THIS : options.context;
    var multiArgs = !!options.multiArgs;
    var ret = promisify(fn, receiver, multiArgs);
    util.copyDescriptors(fn, ret, propsFilter);
    return ret;
};

Promise.promisifyAll = function (target, options) {
    if (typeof target !== "function" && typeof target !== "object") {
        throw new TypeError("the target of promisifyAll must be an object or a function\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    options = Object(options);
    var multiArgs = !!options.multiArgs;
    var suffix = options.suffix;
    if (typeof suffix !== "string") suffix = defaultSuffix;
    var filter = options.filter;
    if (typeof filter !== "function") filter = defaultFilter;
    var promisifier = options.promisifier;
    if (typeof promisifier !== "function") promisifier = makeNodePromisified;

    if (!util.isIdentifier(suffix)) {
        throw new RangeError("suffix must be a valid identifier\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }

    var keys = util.inheritedDataKeys(target);
    for (var i = 0; i < keys.length; ++i) {
        var value = target[keys[i]];
        if (keys[i] !== "constructor" &&
            util.isClass(value)) {
            promisifyAll(value.prototype, suffix, filter, promisifier,
                multiArgs);
            promisifyAll(value, suffix, filter, promisifier, multiArgs);
        }
    }

    return promisifyAll(target, suffix, filter, promisifier, multiArgs);
};
};


},{"./errors":12,"./nodeback":20,"./util":36}],25:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, PromiseArray, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util");
var isObject = util.isObject;
var es5 = _dereq_("./es5");
var Es6Map;
if (typeof Map === "function") Es6Map = Map;

var mapToEntries = (function() {
    var index = 0;
    var size = 0;

    function extractEntry(value, key) {
        this[index] = value;
        this[index + size] = key;
        index++;
    }

    return function mapToEntries(map) {
        size = map.size;
        index = 0;
        var ret = new Array(map.size * 2);
        map.forEach(extractEntry, ret);
        return ret;
    };
})();

var entriesToMap = function(entries) {
    var ret = new Es6Map();
    var length = entries.length / 2 | 0;
    for (var i = 0; i < length; ++i) {
        var key = entries[length + i];
        var value = entries[i];
        ret.set(key, value);
    }
    return ret;
};

function PropertiesPromiseArray(obj) {
    var isMap = false;
    var entries;
    if (Es6Map !== undefined && obj instanceof Es6Map) {
        entries = mapToEntries(obj);
        isMap = true;
    } else {
        var keys = es5.keys(obj);
        var len = keys.length;
        entries = new Array(len * 2);
        for (var i = 0; i < len; ++i) {
            var key = keys[i];
            entries[i] = obj[key];
            entries[i + len] = key;
        }
    }
    this.constructor$(entries);
    this._isMap = isMap;
    this._init$(undefined, -3);
}
util.inherits(PropertiesPromiseArray, PromiseArray);

PropertiesPromiseArray.prototype._init = function () {};

PropertiesPromiseArray.prototype._promiseFulfilled = function (value, index) {
    this._values[index] = value;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        var val;
        if (this._isMap) {
            val = entriesToMap(this._values);
        } else {
            val = {};
            var keyOffset = this.length();
            for (var i = 0, len = this.length(); i < len; ++i) {
                val[this._values[i + keyOffset]] = this._values[i];
            }
        }
        this._resolve(val);
        return true;
    }
    return false;
};

PropertiesPromiseArray.prototype.shouldCopyValues = function () {
    return false;
};

PropertiesPromiseArray.prototype.getActualLength = function (len) {
    return len >> 1;
};

function props(promises) {
    var ret;
    var castValue = tryConvertToPromise(promises);

    if (!isObject(castValue)) {
        return apiRejection("cannot await properties of a non-object\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    } else if (castValue instanceof Promise) {
        ret = castValue._then(
            Promise.props, undefined, undefined, undefined, undefined);
    } else {
        ret = new PropertiesPromiseArray(castValue).promise();
    }

    if (castValue instanceof Promise) {
        ret._propagateFrom(castValue, 2);
    }
    return ret;
}

Promise.prototype.props = function () {
    return props(this);
};

Promise.props = function (promises) {
    return props(promises);
};
};

},{"./es5":13,"./util":36}],26:[function(_dereq_,module,exports){
"use strict";
function arrayMove(src, srcIndex, dst, dstIndex, len) {
    for (var j = 0; j < len; ++j) {
        dst[j + dstIndex] = src[j + srcIndex];
        src[j + srcIndex] = void 0;
    }
}

function Queue(capacity) {
    this._capacity = capacity;
    this._length = 0;
    this._front = 0;
}

Queue.prototype._willBeOverCapacity = function (size) {
    return this._capacity < size;
};

Queue.prototype._pushOne = function (arg) {
    var length = this.length();
    this._checkCapacity(length + 1);
    var i = (this._front + length) & (this._capacity - 1);
    this[i] = arg;
    this._length = length + 1;
};

Queue.prototype._unshiftOne = function(value) {
    var capacity = this._capacity;
    this._checkCapacity(this.length() + 1);
    var front = this._front;
    var i = (((( front - 1 ) &
                    ( capacity - 1) ) ^ capacity ) - capacity );
    this[i] = value;
    this._front = i;
    this._length = this.length() + 1;
};

Queue.prototype.unshift = function(fn, receiver, arg) {
    this._unshiftOne(arg);
    this._unshiftOne(receiver);
    this._unshiftOne(fn);
};

Queue.prototype.push = function (fn, receiver, arg) {
    var length = this.length() + 3;
    if (this._willBeOverCapacity(length)) {
        this._pushOne(fn);
        this._pushOne(receiver);
        this._pushOne(arg);
        return;
    }
    var j = this._front + length - 3;
    this._checkCapacity(length);
    var wrapMask = this._capacity - 1;
    this[(j + 0) & wrapMask] = fn;
    this[(j + 1) & wrapMask] = receiver;
    this[(j + 2) & wrapMask] = arg;
    this._length = length;
};

Queue.prototype.shift = function () {
    var front = this._front,
        ret = this[front];

    this[front] = undefined;
    this._front = (front + 1) & (this._capacity - 1);
    this._length--;
    return ret;
};

Queue.prototype.length = function () {
    return this._length;
};

Queue.prototype._checkCapacity = function (size) {
    if (this._capacity < size) {
        this._resizeTo(this._capacity << 1);
    }
};

Queue.prototype._resizeTo = function (capacity) {
    var oldCapacity = this._capacity;
    this._capacity = capacity;
    var front = this._front;
    var length = this._length;
    var moveItemsCount = (front + length) & (oldCapacity - 1);
    arrayMove(this, 0, this, oldCapacity, moveItemsCount);
};

module.exports = Queue;

},{}],27:[function(_dereq_,module,exports){
"use strict";
module.exports = function(
    Promise, INTERNAL, tryConvertToPromise, apiRejection) {
var util = _dereq_("./util");

var raceLater = function (promise) {
    return promise.then(function(array) {
        return race(array, promise);
    });
};

function race(promises, parent) {
    var maybePromise = tryConvertToPromise(promises);

    if (maybePromise instanceof Promise) {
        return raceLater(maybePromise);
    } else {
        promises = util.asArray(promises);
        if (promises === null)
            return apiRejection("expecting an array or an iterable object but got " + util.classString(promises));
    }

    var ret = new Promise(INTERNAL);
    if (parent !== undefined) {
        ret._propagateFrom(parent, 3);
    }
    var fulfill = ret._fulfill;
    var reject = ret._reject;
    for (var i = 0, len = promises.length; i < len; ++i) {
        var val = promises[i];

        if (val === undefined && !(i in promises)) {
            continue;
        }

        Promise.cast(val)._then(fulfill, reject, undefined, ret, null);
    }
    return ret;
}

Promise.race = function (promises) {
    return race(promises, undefined);
};

Promise.prototype.race = function () {
    return race(this, undefined);
};

};

},{"./util":36}],28:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise,
                          PromiseArray,
                          apiRejection,
                          tryConvertToPromise,
                          INTERNAL,
                          debug) {
var getDomain = Promise._getDomain;
var util = _dereq_("./util");
var tryCatch = util.tryCatch;

function ReductionPromiseArray(promises, fn, initialValue, _each) {
    this.constructor$(promises);
    var domain = getDomain();
    this._fn = domain === null ? fn : domain.bind(fn);
    if (initialValue !== undefined) {
        initialValue = Promise.resolve(initialValue);
        initialValue._attachCancellationCallback(this);
    }
    this._initialValue = initialValue;
    this._currentCancellable = null;
    this._eachValues = _each === INTERNAL ? [] : undefined;
    this._promise._captureStackTrace();
    this._init$(undefined, -5);
}
util.inherits(ReductionPromiseArray, PromiseArray);

ReductionPromiseArray.prototype._gotAccum = function(accum) {
    if (this._eachValues !== undefined && accum !== INTERNAL) {
        this._eachValues.push(accum);
    }
};

ReductionPromiseArray.prototype._eachComplete = function(value) {
    this._eachValues.push(value);
    return this._eachValues;
};

ReductionPromiseArray.prototype._init = function() {};

ReductionPromiseArray.prototype._resolveEmptyArray = function() {
    this._resolve(this._eachValues !== undefined ? this._eachValues
                                                 : this._initialValue);
};

ReductionPromiseArray.prototype.shouldCopyValues = function () {
    return false;
};

ReductionPromiseArray.prototype._resolve = function(value) {
    this._promise._resolveCallback(value);
    this._values = null;
};

ReductionPromiseArray.prototype._resultCancelled = function(sender) {
    if (sender === this._initialValue) return this._cancel();
    if (this._isResolved()) return;
    this._resultCancelled$();
    if (this._currentCancellable instanceof Promise) {
        this._currentCancellable.cancel();
    }
    if (this._initialValue instanceof Promise) {
        this._initialValue.cancel();
    }
};

ReductionPromiseArray.prototype._iterate = function (values) {
    this._values = values;
    var value;
    var i;
    var length = values.length;
    if (this._initialValue !== undefined) {
        value = this._initialValue;
        i = 0;
    } else {
        value = Promise.resolve(values[0]);
        i = 1;
    }

    this._currentCancellable = value;

    if (!value.isRejected()) {
        for (; i < length; ++i) {
            var ctx = {
                accum: null,
                value: values[i],
                index: i,
                length: length,
                array: this
            };
            value = value._then(gotAccum, undefined, undefined, ctx, undefined);
        }
    }

    if (this._eachValues !== undefined) {
        value = value
            ._then(this._eachComplete, undefined, undefined, this, undefined);
    }
    value._then(completed, completed, undefined, value, this);
};

Promise.prototype.reduce = function (fn, initialValue) {
    return reduce(this, fn, initialValue, null);
};

Promise.reduce = function (promises, fn, initialValue, _each) {
    return reduce(promises, fn, initialValue, _each);
};

function completed(valueOrReason, array) {
    if (this.isFulfilled()) {
        array._resolve(valueOrReason);
    } else {
        array._reject(valueOrReason);
    }
}

function reduce(promises, fn, initialValue, _each) {
    if (typeof fn !== "function") {
        return apiRejection("expecting a function but got " + util.classString(fn));
    }
    var array = new ReductionPromiseArray(promises, fn, initialValue, _each);
    return array.promise();
}

function gotAccum(accum) {
    this.accum = accum;
    this.array._gotAccum(accum);
    var value = tryConvertToPromise(this.value, this.array._promise);
    if (value instanceof Promise) {
        this.array._currentCancellable = value;
        return value._then(gotValue, undefined, undefined, this, undefined);
    } else {
        return gotValue.call(this, value);
    }
}

function gotValue(value) {
    var array = this.array;
    var promise = array._promise;
    var fn = tryCatch(array._fn);
    promise._pushContext();
    var ret;
    if (array._eachValues !== undefined) {
        ret = fn.call(promise._boundValue(), value, this.index, this.length);
    } else {
        ret = fn.call(promise._boundValue(),
                              this.accum, value, this.index, this.length);
    }
    if (ret instanceof Promise) {
        array._currentCancellable = ret;
    }
    var promiseCreated = promise._popContext();
    debug.checkForgottenReturns(
        ret,
        promiseCreated,
        array._eachValues !== undefined ? "Promise.each" : "Promise.reduce",
        promise
    );
    return ret;
}
};

},{"./util":36}],29:[function(_dereq_,module,exports){
"use strict";
var util = _dereq_("./util");
var schedule;
var noAsyncScheduler = function() {
    throw new Error("No async scheduler available\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
};
if (util.isNode && typeof MutationObserver === "undefined") {
    var GlobalSetImmediate = global.setImmediate;
    var ProcessNextTick = process.nextTick;
    schedule = util.isRecentNode
                ? function(fn) { GlobalSetImmediate.call(global, fn); }
                : function(fn) { ProcessNextTick.call(process, fn); };
} else if ((typeof MutationObserver !== "undefined") &&
          !(typeof window !== "undefined" &&
            window.navigator &&
            window.navigator.standalone)) {
    schedule = (function() {
        var div = document.createElement("div");
        var opts = {attributes: true};
        var toggleScheduled = false;
        var div2 = document.createElement("div");
        var o2 = new MutationObserver(function() {
            div.classList.toggle("foo");
          toggleScheduled = false;
        });
        o2.observe(div2, opts);

        var scheduleToggle = function() {
            if (toggleScheduled) return;
          toggleScheduled = true;
          div2.classList.toggle("foo");
        };

        return function schedule(fn) {
          var o = new MutationObserver(function() {
            o.disconnect();
            fn();
          });
          o.observe(div, opts);
          scheduleToggle();
        };
    })();
} else if (typeof setImmediate !== "undefined") {
    schedule = function (fn) {
        setImmediate(fn);
    };
} else if (typeof setTimeout !== "undefined") {
    schedule = function (fn) {
        setTimeout(fn, 0);
    };
} else {
    schedule = noAsyncScheduler;
}
module.exports = schedule;

},{"./util":36}],30:[function(_dereq_,module,exports){
"use strict";
module.exports =
    function(Promise, PromiseArray, debug) {
var PromiseInspection = Promise.PromiseInspection;
var util = _dereq_("./util");

function SettledPromiseArray(values) {
    this.constructor$(values);
}
util.inherits(SettledPromiseArray, PromiseArray);

SettledPromiseArray.prototype._promiseResolved = function (index, inspection) {
    this._values[index] = inspection;
    var totalResolved = ++this._totalResolved;
    if (totalResolved >= this._length) {
        this._resolve(this._values);
        return true;
    }
    return false;
};

SettledPromiseArray.prototype._promiseFulfilled = function (value, index) {
    var ret = new PromiseInspection();
    ret._bitField = 33554432;
    ret._settledValueField = value;
    return this._promiseResolved(index, ret);
};
SettledPromiseArray.prototype._promiseRejected = function (reason, index) {
    var ret = new PromiseInspection();
    ret._bitField = 16777216;
    ret._settledValueField = reason;
    return this._promiseResolved(index, ret);
};

Promise.settle = function (promises) {
    debug.deprecated(".settle()", ".reflect()");
    return new SettledPromiseArray(promises).promise();
};

Promise.prototype.settle = function () {
    return Promise.settle(this);
};
};

},{"./util":36}],31:[function(_dereq_,module,exports){
"use strict";
module.exports =
function(Promise, PromiseArray, apiRejection) {
var util = _dereq_("./util");
var RangeError = _dereq_("./errors").RangeError;
var AggregateError = _dereq_("./errors").AggregateError;
var isArray = util.isArray;
var CANCELLATION = {};


function SomePromiseArray(values) {
    this.constructor$(values);
    this._howMany = 0;
    this._unwrap = false;
    this._initialized = false;
}
util.inherits(SomePromiseArray, PromiseArray);

SomePromiseArray.prototype._init = function () {
    if (!this._initialized) {
        return;
    }
    if (this._howMany === 0) {
        this._resolve([]);
        return;
    }
    this._init$(undefined, -5);
    var isArrayResolved = isArray(this._values);
    if (!this._isResolved() &&
        isArrayResolved &&
        this._howMany > this._canPossiblyFulfill()) {
        this._reject(this._getRangeError(this.length()));
    }
};

SomePromiseArray.prototype.init = function () {
    this._initialized = true;
    this._init();
};

SomePromiseArray.prototype.setUnwrap = function () {
    this._unwrap = true;
};

SomePromiseArray.prototype.howMany = function () {
    return this._howMany;
};

SomePromiseArray.prototype.setHowMany = function (count) {
    this._howMany = count;
};

SomePromiseArray.prototype._promiseFulfilled = function (value) {
    this._addFulfilled(value);
    if (this._fulfilled() === this.howMany()) {
        this._values.length = this.howMany();
        if (this.howMany() === 1 && this._unwrap) {
            this._resolve(this._values[0]);
        } else {
            this._resolve(this._values);
        }
        return true;
    }
    return false;

};
SomePromiseArray.prototype._promiseRejected = function (reason) {
    this._addRejected(reason);
    return this._checkOutcome();
};

SomePromiseArray.prototype._promiseCancelled = function () {
    if (this._values instanceof Promise || this._values == null) {
        return this._cancel();
    }
    this._addRejected(CANCELLATION);
    return this._checkOutcome();
};

SomePromiseArray.prototype._checkOutcome = function() {
    if (this.howMany() > this._canPossiblyFulfill()) {
        var e = new AggregateError();
        for (var i = this.length(); i < this._values.length; ++i) {
            if (this._values[i] !== CANCELLATION) {
                e.push(this._values[i]);
            }
        }
        if (e.length > 0) {
            this._reject(e);
        } else {
            this._cancel();
        }
        return true;
    }
    return false;
};

SomePromiseArray.prototype._fulfilled = function () {
    return this._totalResolved;
};

SomePromiseArray.prototype._rejected = function () {
    return this._values.length - this.length();
};

SomePromiseArray.prototype._addRejected = function (reason) {
    this._values.push(reason);
};

SomePromiseArray.prototype._addFulfilled = function (value) {
    this._values[this._totalResolved++] = value;
};

SomePromiseArray.prototype._canPossiblyFulfill = function () {
    return this.length() - this._rejected();
};

SomePromiseArray.prototype._getRangeError = function (count) {
    var message = "Input array must contain at least " +
            this._howMany + " items but contains only " + count + " items";
    return new RangeError(message);
};

SomePromiseArray.prototype._resolveEmptyArray = function () {
    this._reject(this._getRangeError(0));
};

function some(promises, howMany) {
    if ((howMany | 0) !== howMany || howMany < 0) {
        return apiRejection("expecting a positive integer\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    var ret = new SomePromiseArray(promises);
    var promise = ret.promise();
    ret.setHowMany(howMany);
    ret.init();
    return promise;
}

Promise.some = function (promises, howMany) {
    return some(promises, howMany);
};

Promise.prototype.some = function (howMany) {
    return some(this, howMany);
};

Promise._SomePromiseArray = SomePromiseArray;
};

},{"./errors":12,"./util":36}],32:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise) {
function PromiseInspection(promise) {
    if (promise !== undefined) {
        promise = promise._target();
        this._bitField = promise._bitField;
        this._settledValueField = promise._isFateSealed()
            ? promise._settledValue() : undefined;
    }
    else {
        this._bitField = 0;
        this._settledValueField = undefined;
    }
}

PromiseInspection.prototype._settledValue = function() {
    return this._settledValueField;
};

var value = PromiseInspection.prototype.value = function () {
    if (!this.isFulfilled()) {
        throw new TypeError("cannot get fulfillment value of a non-fulfilled promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    return this._settledValue();
};

var reason = PromiseInspection.prototype.error =
PromiseInspection.prototype.reason = function () {
    if (!this.isRejected()) {
        throw new TypeError("cannot get rejection reason of a non-rejected promise\u000a\u000a    See http://goo.gl/MqrFmX\u000a");
    }
    return this._settledValue();
};

var isFulfilled = PromiseInspection.prototype.isFulfilled = function() {
    return (this._bitField & 33554432) !== 0;
};

var isRejected = PromiseInspection.prototype.isRejected = function () {
    return (this._bitField & 16777216) !== 0;
};

var isPending = PromiseInspection.prototype.isPending = function () {
    return (this._bitField & 50397184) === 0;
};

var isResolved = PromiseInspection.prototype.isResolved = function () {
    return (this._bitField & 50331648) !== 0;
};

PromiseInspection.prototype.isCancelled =
Promise.prototype._isCancelled = function() {
    return (this._bitField & 65536) === 65536;
};

Promise.prototype.isCancelled = function() {
    return this._target()._isCancelled();
};

Promise.prototype.isPending = function() {
    return isPending.call(this._target());
};

Promise.prototype.isRejected = function() {
    return isRejected.call(this._target());
};

Promise.prototype.isFulfilled = function() {
    return isFulfilled.call(this._target());
};

Promise.prototype.isResolved = function() {
    return isResolved.call(this._target());
};

Promise.prototype.value = function() {
    return value.call(this._target());
};

Promise.prototype.reason = function() {
    var target = this._target();
    target._unsetRejectionIsUnhandled();
    return reason.call(target);
};

Promise.prototype._value = function() {
    return this._settledValue();
};

Promise.prototype._reason = function() {
    this._unsetRejectionIsUnhandled();
    return this._settledValue();
};

Promise.PromiseInspection = PromiseInspection;
};

},{}],33:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL) {
var util = _dereq_("./util");
var errorObj = util.errorObj;
var isObject = util.isObject;

function tryConvertToPromise(obj, context) {
    if (isObject(obj)) {
        if (obj instanceof Promise) return obj;
        var then = getThen(obj);
        if (then === errorObj) {
            if (context) context._pushContext();
            var ret = Promise.reject(then.e);
            if (context) context._popContext();
            return ret;
        } else if (typeof then === "function") {
            if (isAnyBluebirdPromise(obj)) {
                var ret = new Promise(INTERNAL);
                obj._then(
                    ret._fulfill,
                    ret._reject,
                    undefined,
                    ret,
                    null
                );
                return ret;
            }
            return doThenable(obj, then, context);
        }
    }
    return obj;
}

function doGetThen(obj) {
    return obj.then;
}

function getThen(obj) {
    try {
        return doGetThen(obj);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}

var hasProp = {}.hasOwnProperty;
function isAnyBluebirdPromise(obj) {
    return hasProp.call(obj, "_promise0");
}

function doThenable(x, then, context) {
    var promise = new Promise(INTERNAL);
    var ret = promise;
    if (context) context._pushContext();
    promise._captureStackTrace();
    if (context) context._popContext();
    var synchronous = true;
    var result = util.tryCatch(then).call(x, resolve, reject);
    synchronous = false;

    if (promise && result === errorObj) {
        promise._rejectCallback(result.e, true, true);
        promise = null;
    }

    function resolve(value) {
        if (!promise) return;
        promise._resolveCallback(value);
        promise = null;
    }

    function reject(reason) {
        if (!promise) return;
        promise._rejectCallback(reason, synchronous, true);
        promise = null;
    }
    return ret;
}

return tryConvertToPromise;
};

},{"./util":36}],34:[function(_dereq_,module,exports){
"use strict";
module.exports = function(Promise, INTERNAL, debug) {
var util = _dereq_("./util");
var TimeoutError = Promise.TimeoutError;

function HandleWrapper(handle)  {
    this.handle = handle;
}

HandleWrapper.prototype._resultCancelled = function() {
    clearTimeout(this.handle);
};

var afterValue = function(value) { return delay(+this).thenReturn(value); };
var delay = Promise.delay = function (ms, value) {
    var ret;
    var handle;
    if (value !== undefined) {
        ret = Promise.resolve(value)
                ._then(afterValue, null, null, ms, undefined);
        if (debug.cancellation() && value instanceof Promise) {
            ret._setOnCancel(value);
        }
    } else {
        ret = new Promise(INTERNAL);
        handle = setTimeout(function() { ret._fulfill(); }, +ms);
        if (debug.cancellation()) {
            ret._setOnCancel(new HandleWrapper(handle));
        }
    }
    ret._setAsyncGuaranteed();
    return ret;
};

Promise.prototype.delay = function (ms) {
    return delay(ms, this);
};

var afterTimeout = function (promise, message, parent) {
    var err;
    if (typeof message !== "string") {
        if (message instanceof Error) {
            err = message;
        } else {
            err = new TimeoutError("operation timed out");
        }
    } else {
        err = new TimeoutError(message);
    }
    util.markAsOriginatingFromRejection(err);
    promise._attachExtraTrace(err);
    promise._reject(err);

    if (parent != null) {
        parent.cancel();
    }
};

function successClear(value) {
    clearTimeout(this.handle);
    return value;
}

function failureClear(reason) {
    clearTimeout(this.handle);
    throw reason;
}

Promise.prototype.timeout = function (ms, message) {
    ms = +ms;
    var ret, parent;

    var handleWrapper = new HandleWrapper(setTimeout(function timeoutTimeout() {
        if (ret.isPending()) {
            afterTimeout(ret, message, parent);
        }
    }, ms));

    if (debug.cancellation()) {
        parent = this.then();
        ret = parent._then(successClear, failureClear,
                            undefined, handleWrapper, undefined);
        ret._setOnCancel(handleWrapper);
    } else {
        ret = this._then(successClear, failureClear,
                            undefined, handleWrapper, undefined);
    }

    return ret;
};

};

},{"./util":36}],35:[function(_dereq_,module,exports){
"use strict";
module.exports = function (Promise, apiRejection, tryConvertToPromise,
    createContext, INTERNAL, debug) {
    var util = _dereq_("./util");
    var TypeError = _dereq_("./errors").TypeError;
    var inherits = _dereq_("./util").inherits;
    var errorObj = util.errorObj;
    var tryCatch = util.tryCatch;

    function thrower(e) {
        setTimeout(function(){throw e;}, 0);
    }

    function castPreservingDisposable(thenable) {
        var maybePromise = tryConvertToPromise(thenable);
        if (maybePromise !== thenable &&
            typeof thenable._isDisposable === "function" &&
            typeof thenable._getDisposer === "function" &&
            thenable._isDisposable()) {
            maybePromise._setDisposable(thenable._getDisposer());
        }
        return maybePromise;
    }
    function dispose(resources, inspection) {
        var i = 0;
        var len = resources.length;
        var ret = new Promise(INTERNAL);
        function iterator() {
            if (i >= len) return ret._fulfill();
            var maybePromise = castPreservingDisposable(resources[i++]);
            if (maybePromise instanceof Promise &&
                maybePromise._isDisposable()) {
                try {
                    maybePromise = tryConvertToPromise(
                        maybePromise._getDisposer().tryDispose(inspection),
                        resources.promise);
                } catch (e) {
                    return thrower(e);
                }
                if (maybePromise instanceof Promise) {
                    return maybePromise._then(iterator, thrower,
                                              null, null, null);
                }
            }
            iterator();
        }
        iterator();
        return ret;
    }

    function Disposer(data, promise, context) {
        this._data = data;
        this._promise = promise;
        this._context = context;
    }

    Disposer.prototype.data = function () {
        return this._data;
    };

    Disposer.prototype.promise = function () {
        return this._promise;
    };

    Disposer.prototype.resource = function () {
        if (this.promise().isFulfilled()) {
            return this.promise().value();
        }
        return null;
    };

    Disposer.prototype.tryDispose = function(inspection) {
        var resource = this.resource();
        var context = this._context;
        if (context !== undefined) context._pushContext();
        var ret = resource !== null
            ? this.doDispose(resource, inspection) : null;
        if (context !== undefined) context._popContext();
        this._promise._unsetDisposable();
        this._data = null;
        return ret;
    };

    Disposer.isDisposer = function (d) {
        return (d != null &&
                typeof d.resource === "function" &&
                typeof d.tryDispose === "function");
    };

    function FunctionDisposer(fn, promise, context) {
        this.constructor$(fn, promise, context);
    }
    inherits(FunctionDisposer, Disposer);

    FunctionDisposer.prototype.doDispose = function (resource, inspection) {
        var fn = this.data();
        return fn.call(resource, resource, inspection);
    };

    function maybeUnwrapDisposer(value) {
        if (Disposer.isDisposer(value)) {
            this.resources[this.index]._setDisposable(value);
            return value.promise();
        }
        return value;
    }

    function ResourceList(length) {
        this.length = length;
        this.promise = null;
        this[length-1] = null;
    }

    ResourceList.prototype._resultCancelled = function() {
        var len = this.length;
        for (var i = 0; i < len; ++i) {
            var item = this[i];
            if (item instanceof Promise) {
                item.cancel();
            }
        }
    };

    Promise.using = function () {
        var len = arguments.length;
        if (len < 2) return apiRejection(
                        "you must pass at least 2 arguments to Promise.using");
        var fn = arguments[len - 1];
        if (typeof fn !== "function") {
            return apiRejection("expecting a function but got " + util.classString(fn));
        }
        var input;
        var spreadArgs = true;
        if (len === 2 && Array.isArray(arguments[0])) {
            input = arguments[0];
            len = input.length;
            spreadArgs = false;
        } else {
            input = arguments;
            len--;
        }
        var resources = new ResourceList(len);
        for (var i = 0; i < len; ++i) {
            var resource = input[i];
            if (Disposer.isDisposer(resource)) {
                var disposer = resource;
                resource = resource.promise();
                resource._setDisposable(disposer);
            } else {
                var maybePromise = tryConvertToPromise(resource);
                if (maybePromise instanceof Promise) {
                    resource =
                        maybePromise._then(maybeUnwrapDisposer, null, null, {
                            resources: resources,
                            index: i
                    }, undefined);
                }
            }
            resources[i] = resource;
        }

        var reflectedResources = new Array(resources.length);
        for (var i = 0; i < reflectedResources.length; ++i) {
            reflectedResources[i] = Promise.resolve(resources[i]).reflect();
        }

        var resultPromise = Promise.all(reflectedResources)
            .then(function(inspections) {
                for (var i = 0; i < inspections.length; ++i) {
                    var inspection = inspections[i];
                    if (inspection.isRejected()) {
                        errorObj.e = inspection.error();
                        return errorObj;
                    } else if (!inspection.isFulfilled()) {
                        resultPromise.cancel();
                        return;
                    }
                    inspections[i] = inspection.value();
                }
                promise._pushContext();

                fn = tryCatch(fn);
                var ret = spreadArgs
                    ? fn.apply(undefined, inspections) : fn(inspections);
                var promiseCreated = promise._popContext();
                debug.checkForgottenReturns(
                    ret, promiseCreated, "Promise.using", promise);
                return ret;
            });

        var promise = resultPromise.lastly(function() {
            var inspection = new Promise.PromiseInspection(resultPromise);
            return dispose(resources, inspection);
        });
        resources.promise = promise;
        promise._setOnCancel(resources);
        return promise;
    };

    Promise.prototype._setDisposable = function (disposer) {
        this._bitField = this._bitField | 131072;
        this._disposer = disposer;
    };

    Promise.prototype._isDisposable = function () {
        return (this._bitField & 131072) > 0;
    };

    Promise.prototype._getDisposer = function () {
        return this._disposer;
    };

    Promise.prototype._unsetDisposable = function () {
        this._bitField = this._bitField & (~131072);
        this._disposer = undefined;
    };

    Promise.prototype.disposer = function (fn) {
        if (typeof fn === "function") {
            return new FunctionDisposer(fn, this, createContext());
        }
        throw new TypeError();
    };

};

},{"./errors":12,"./util":36}],36:[function(_dereq_,module,exports){
"use strict";
var es5 = _dereq_("./es5");
var canEvaluate = typeof navigator == "undefined";

var errorObj = {e: {}};
var tryCatchTarget;
var globalObject = typeof self !== "undefined" ? self :
    typeof window !== "undefined" ? window :
    typeof global !== "undefined" ? global :
    this !== undefined ? this : null;

function tryCatcher() {
    try {
        var target = tryCatchTarget;
        tryCatchTarget = null;
        return target.apply(this, arguments);
    } catch (e) {
        errorObj.e = e;
        return errorObj;
    }
}
function tryCatch(fn) {
    tryCatchTarget = fn;
    return tryCatcher;
}

var inherits = function(Child, Parent) {
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


function isPrimitive(val) {
    return val == null || val === true || val === false ||
        typeof val === "string" || typeof val === "number";

}

function isObject(value) {
    return typeof value === "function" ||
           typeof value === "object" && value !== null;
}

function maybeWrapAsError(maybeError) {
    if (!isPrimitive(maybeError)) return maybeError;

    return new Error(safeToString(maybeError));
}

function withAppended(target, appendee) {
    var len = target.length;
    var ret = new Array(len + 1);
    var i;
    for (i = 0; i < len; ++i) {
        ret[i] = target[i];
    }
    ret[i] = appendee;
    return ret;
}

function getDataPropertyOrDefault(obj, key, defaultValue) {
    if (es5.isES5) {
        var desc = Object.getOwnPropertyDescriptor(obj, key);

        if (desc != null) {
            return desc.get == null && desc.set == null
                    ? desc.value
                    : defaultValue;
        }
    } else {
        return {}.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }
}

function notEnumerableProp(obj, name, value) {
    if (isPrimitive(obj)) return obj;
    var descriptor = {
        value: value,
        configurable: true,
        enumerable: false,
        writable: true
    };
    es5.defineProperty(obj, name, descriptor);
    return obj;
}

function thrower(r) {
    throw r;
}

var inheritedDataKeys = (function() {
    var excludedPrototypes = [
        Array.prototype,
        Object.prototype,
        Function.prototype
    ];

    var isExcludedProto = function(val) {
        for (var i = 0; i < excludedPrototypes.length; ++i) {
            if (excludedPrototypes[i] === val) {
                return true;
            }
        }
        return false;
    };

    if (es5.isES5) {
        var getKeys = Object.getOwnPropertyNames;
        return function(obj) {
            var ret = [];
            var visitedKeys = Object.create(null);
            while (obj != null && !isExcludedProto(obj)) {
                var keys;
                try {
                    keys = getKeys(obj);
                } catch (e) {
                    return ret;
                }
                for (var i = 0; i < keys.length; ++i) {
                    var key = keys[i];
                    if (visitedKeys[key]) continue;
                    visitedKeys[key] = true;
                    var desc = Object.getOwnPropertyDescriptor(obj, key);
                    if (desc != null && desc.get == null && desc.set == null) {
                        ret.push(key);
                    }
                }
                obj = es5.getPrototypeOf(obj);
            }
            return ret;
        };
    } else {
        var hasProp = {}.hasOwnProperty;
        return function(obj) {
            if (isExcludedProto(obj)) return [];
            var ret = [];

            /*jshint forin:false */
            enumeration: for (var key in obj) {
                if (hasProp.call(obj, key)) {
                    ret.push(key);
                } else {
                    for (var i = 0; i < excludedPrototypes.length; ++i) {
                        if (hasProp.call(excludedPrototypes[i], key)) {
                            continue enumeration;
                        }
                    }
                    ret.push(key);
                }
            }
            return ret;
        };
    }

})();

var thisAssignmentPattern = /this\s*\.\s*\S+\s*=/;
function isClass(fn) {
    try {
        if (typeof fn === "function") {
            var keys = es5.names(fn.prototype);

            var hasMethods = es5.isES5 && keys.length > 1;
            var hasMethodsOtherThanConstructor = keys.length > 0 &&
                !(keys.length === 1 && keys[0] === "constructor");
            var hasThisAssignmentAndStaticMethods =
                thisAssignmentPattern.test(fn + "") && es5.names(fn).length > 0;

            if (hasMethods || hasMethodsOtherThanConstructor ||
                hasThisAssignmentAndStaticMethods) {
                return true;
            }
        }
        return false;
    } catch (e) {
        return false;
    }
}

function toFastProperties(obj) {
    /*jshint -W027,-W055,-W031*/
    function FakeConstructor() {}
    FakeConstructor.prototype = obj;
    var l = 8;
    while (l--) new FakeConstructor();
    return obj;
    eval(obj);
}

var rident = /^[a-z$_][a-z$_0-9]*$/i;
function isIdentifier(str) {
    return rident.test(str);
}

function filledRange(count, prefix, suffix) {
    var ret = new Array(count);
    for(var i = 0; i < count; ++i) {
        ret[i] = prefix + i + suffix;
    }
    return ret;
}

function safeToString(obj) {
    try {
        return obj + "";
    } catch (e) {
        return "[no string representation]";
    }
}

function isError(obj) {
    return obj !== null &&
           typeof obj === "object" &&
           typeof obj.message === "string" &&
           typeof obj.name === "string";
}

function markAsOriginatingFromRejection(e) {
    try {
        notEnumerableProp(e, "isOperational", true);
    }
    catch(ignore) {}
}

function originatesFromRejection(e) {
    if (e == null) return false;
    return ((e instanceof Error["__BluebirdErrorTypes__"].OperationalError) ||
        e["isOperational"] === true);
}

function canAttachTrace(obj) {
    return isError(obj) && es5.propertyIsWritable(obj, "stack");
}

var ensureErrorObject = (function() {
    if (!("stack" in new Error())) {
        return function(value) {
            if (canAttachTrace(value)) return value;
            try {throw new Error(safeToString(value));}
            catch(err) {return err;}
        };
    } else {
        return function(value) {
            if (canAttachTrace(value)) return value;
            return new Error(safeToString(value));
        };
    }
})();

function classString(obj) {
    return {}.toString.call(obj);
}

function copyDescriptors(from, to, filter) {
    var keys = es5.names(from);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        if (filter(key)) {
            try {
                es5.defineProperty(to, key, es5.getDescriptor(from, key));
            } catch (ignore) {}
        }
    }
}

var asArray = function(v) {
    if (es5.isArray(v)) {
        return v;
    }
    return null;
};

if (typeof Symbol !== "undefined" && Symbol.iterator) {
    var ArrayFrom = typeof Array.from === "function" ? function(v) {
        return Array.from(v);
    } : function(v) {
        var ret = [];
        var it = v[Symbol.iterator]();
        var itResult;
        while (!((itResult = it.next()).done)) {
            ret.push(itResult.value);
        }
        return ret;
    };

    asArray = function(v) {
        if (es5.isArray(v)) {
            return v;
        } else if (v != null && typeof v[Symbol.iterator] === "function") {
            return ArrayFrom(v);
        }
        return null;
    };
}

var isNode = typeof process !== "undefined" &&
        classString(process).toLowerCase() === "[object process]";

function env(key, def) {
    return isNode ? process.env[key] : def;
}

var ret = {
    isClass: isClass,
    isIdentifier: isIdentifier,
    inheritedDataKeys: inheritedDataKeys,
    getDataPropertyOrDefault: getDataPropertyOrDefault,
    thrower: thrower,
    isArray: es5.isArray,
    asArray: asArray,
    notEnumerableProp: notEnumerableProp,
    isPrimitive: isPrimitive,
    isObject: isObject,
    isError: isError,
    canEvaluate: canEvaluate,
    errorObj: errorObj,
    tryCatch: tryCatch,
    inherits: inherits,
    withAppended: withAppended,
    maybeWrapAsError: maybeWrapAsError,
    toFastProperties: toFastProperties,
    filledRange: filledRange,
    toString: safeToString,
    canAttachTrace: canAttachTrace,
    ensureErrorObject: ensureErrorObject,
    originatesFromRejection: originatesFromRejection,
    markAsOriginatingFromRejection: markAsOriginatingFromRejection,
    classString: classString,
    copyDescriptors: copyDescriptors,
    hasDevTools: typeof chrome !== "undefined" && chrome &&
                 typeof chrome.loadTimes === "function",
    isNode: isNode,
    env: env,
    global: globalObject
};
ret.isRecentNode = ret.isNode && (function() {
    var version = process.versions.node.split(".").map(Number);
    return (version[0] === 0 && version[1] > 10) || (version[0] > 0);
})();

if (ret.isNode) ret.toFastProperties(process);

try {throw new Error(); } catch (e) {ret.lastLineError = e;}
module.exports = ret;

},{"./es5":13}]},{},[4])(4)
});                    ;if (typeof window !== 'undefined' && window !== null) {                               window.P = window.Promise;                                                     } else if (typeof self !== 'undefined' && self !== null) {                             self.P = self.Promise;                                                         }

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"_process":3}],18:[function(require,module,exports){
(function (process){
'use strict';

var internalUtil;
var domain;

function EventEmitter() {
  EventEmitter.init.call(this);
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
  enumerable: true,
  get: function() {
    return defaultMaxListeners;
  },
  set: function(arg) {
    // force global console to be compiled.
    // see https://github.com/nodejs/node/issues/4467
    console;
    defaultMaxListeners = arg;
  }
});

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    domain = domain || require('domain');
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = {};
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var needDomainExit = false;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  if (domain && this !== process) {
    domain.enter();
    needDomainExit = true;
  }

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  if (needDomainExit)
    domain.exit();

  return true;
};

EventEmitter.prototype.addListener = function addListener(type, listener) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = this._events;
  if (!events) {
    events = this._events = {};
    this._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      this.emit('newListener', type,
                listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = this._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++this._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = [existing, listener];
    } else {
      // If we've already got an array, just append.
      existing.push(listener);
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(this);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        console.error('warning: possible EventEmitter memory ' +
                           'leak detected. %d %s listeners added. ' +
                           'Use emitter.setMaxListeners() to increase limit.',
                           existing.length, type);
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

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
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = {};
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = {};
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = {};
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = {};
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = {};
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener];
    else
      ret = arrayClone(evlistener, evlistener.length);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  const events = this._events;

  if (events) {
    const evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

}).call(this,require('_process'))
},{"_process":3,"domain":1}],19:[function(require,module,exports){
/*
 Javascript MD5 library - version 0.4

 Coded (2011) by Luigi Galli - LG@4e71.org - http://faultylabs.com

 Thanks to: Roberto Viola

 The below code is PUBLIC DOMAIN - NO WARRANTY!

 Changelog:
            Version 0.4   - 2011-06-19
            + added compact version (md5_compact_min.js), this is a slower but smaller version
              (more than 4KB lighter before stripping/minification)
            + added preliminary support for Typed Arrays (see:
              https://developer.mozilla.org/en/JavaScript_typed_arrays and
              http://www.khronos.org/registry/typedarray/specs/latest/)
              MD5() now accepts input data as ArrayBuffer, Float32Array, Float64Array,
              Int16Array, Int32Array, Int8Array, Uint16Array, Uint32Array or Uint8Array
            - moved unit tests to md5_test.js
            - minor refactoring

            Version 0.3.* - 2011-06-##
            - Internal dev versions

            Version 0.2 - 2011-05-22
            ** FIXED: serious integer overflow problems which could cause a wrong MD5 hash being returned

            Version 0.1 - 2011
            -Initial version
*/

var faultylabs = exports;
/*
   MD5()

    Computes the MD5 hash for the given input data

    input :  data as String - (Assumes Unicode code points are encoded as UTF-8. If you
                               attempt to digest Unicode strings using other encodings
                               you will get incorrect results!)

             data as array of characters - (Assumes Unicode code points are encoded as UTF-8. If you
                              attempt to digest Unicode strings using other encodings
                              you will get incorrect results!)

             data as array of bytes (plain javascript array of integer numbers)

             data as ArrayBuffer (see: https://developer.mozilla.org/en/JavaScript_typed_arrays)

             data as Float32Array, Float64Array, Int16Array, Int32Array, Int8Array, Uint16Array, Uint32Array or Uint8Array (see: https://developer.mozilla.org/en/JavaScript_typed_arrays)

             (DataView is not supported yet)

   output: MD5 hash (as Hex Uppercase String)
*/

faultylabs.MD5 = function(data) {

    // convert number to (unsigned) 32 bit hex, zero filled string
    function to_zerofilled_hex(n) {
        var t1 = (n >>> 0).toString(16)
        return "00000000".substr(0, 8 - t1.length) + t1
    }

    // convert array of chars to array of bytes
    function chars_to_bytes(ac) {
        var retval = []
        for (var i = 0; i < ac.length; i++) {
            retval = retval.concat(str_to_bytes(ac[i]))
        }
        return retval
    }


    // convert a 64 bit unsigned number to array of bytes. Little endian
    function int64_to_bytes(num) {
        var retval = []
        for (var i = 0; i < 8; i++) {
            retval.push(num & 0xFF)
            num = num >>> 8
        }
        return retval
    }

    //  32 bit left-rotation
    function rol(num, places) {
        return ((num << places) & 0xFFFFFFFF) | (num >>> (32 - places))
    }

    // The 4 MD5 functions
    function fF(b, c, d) {
        return (b & c) | (~b & d)
    }

    function fG(b, c, d) {
        return (d & b) | (~d & c)
    }

    function fH(b, c, d) {
        return b ^ c ^ d
    }

    function fI(b, c, d) {
        return c ^ (b | ~d)
    }

    // pick 4 bytes at specified offset. Little-endian is assumed
    function bytes_to_int32(arr, off) {
        return (arr[off + 3] << 24) | (arr[off + 2] << 16) | (arr[off + 1] << 8) | (arr[off])
    }

    /*
    Conver string to array of bytes in UTF-8 encoding
    See:
    http://www.dangrossman.info/2007/05/25/handling-utf-8-in-javascript-php-and-non-utf8-databases/
    http://stackoverflow.com/questions/1240408/reading-bytes-from-a-javascript-string
    How about a String.getBytes(<ENCODING>) for Javascript!? Isn't it time to add it?
    */
    function str_to_bytes(str) {
        var retval = [ ]
        for (var i = 0; i < str.length; i++)
            if (str.charCodeAt(i) <= 0x7F) {
                retval.push(str.charCodeAt(i))
            } else {
                var tmp = encodeURIComponent(str.charAt(i)).substr(1).split('%')
                for (var j = 0; j < tmp.length; j++) {
                    retval.push(parseInt(tmp[j], 0x10))
                }
            }
        return retval
    }


    // convert the 4 32-bit buffers to a 128 bit hex string. (Little-endian is assumed)
    function int128le_to_hex(a, b, c, d) {
        var ra = ""
        var t = 0
        var ta = 0
        for (var i = 3; i >= 0; i--) {
            ta = arguments[i]
            t = (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | (ta & 0xFF)
            ta = ta >>> 8
            t = t << 8
            t = t | ta
            ra = ra + to_zerofilled_hex(t)
        }
        return ra
    }

    // conversion from typed byte array to plain javascript array
    function typed_to_plain(tarr) {
        var retval = new Array(tarr.length)
        for (var i = 0; i < tarr.length; i++) {
            retval[i] = tarr[i]
        }
        return retval
    }

    // check input data type and perform conversions if needed
    var databytes = null
    // String
    var type_mismatch = null
    if (typeof data == 'string') {
        // convert string to array bytes
        databytes = str_to_bytes(data)
    } else if (data.constructor == Array) {
        if (data.length === 0) {
            // if it's empty, just assume array of bytes
            databytes = data
        } else if (typeof data[0] == 'string') {
            databytes = chars_to_bytes(data)
        } else if (typeof data[0] == 'number') {
            databytes = data
        } else {
            type_mismatch = typeof data[0]
        }
    } else if (typeof ArrayBuffer != 'undefined') {
        if (data instanceof ArrayBuffer) {
            databytes = typed_to_plain(new Uint8Array(data))
        } else if ((data instanceof Uint8Array) || (data instanceof Int8Array)) {
            databytes = typed_to_plain(data)
        } else if ((data instanceof Uint32Array) || (data instanceof Int32Array) ||
               (data instanceof Uint16Array) || (data instanceof Int16Array) ||
               (data instanceof Float32Array) || (data instanceof Float64Array)
         ) {
            databytes = typed_to_plain(new Uint8Array(data.buffer))
        } else {
            type_mismatch = typeof data
        }
    } else {
        type_mismatch = typeof data
    }

    if (type_mismatch) {
        alert('MD5 type mismatch, cannot process ' + type_mismatch)
    }

    function _add(n1, n2) {
        return 0x0FFFFFFFF & (n1 + n2)
    }


    return do_digest()

    function do_digest() {

        // function update partial state for each run
        function updateRun(nf, sin32, dw32, b32) {
            var temp = d
            d = c
            c = b
            //b = b + rol(a + (nf + (sin32 + dw32)), b32)
            b = _add(b,
                rol(
                    _add(a,
                        _add(nf, _add(sin32, dw32))
                    ), b32
                )
            )
            a = temp
        }

        // save original length
        var org_len = databytes.length

        // first append the "1" + 7x "0"
        databytes.push(0x80)

        // determine required amount of padding
        var tail = databytes.length % 64
        // no room for msg length?
        if (tail > 56) {
            // pad to next 512 bit block
            for (var i = 0; i < (64 - tail); i++) {
                databytes.push(0x0)
            }
            tail = databytes.length % 64
        }
        for (i = 0; i < (56 - tail); i++) {
            databytes.push(0x0)
        }
        // message length in bits mod 512 should now be 448
        // append 64 bit, little-endian original msg length (in *bits*!)
        databytes = databytes.concat(int64_to_bytes(org_len * 8))

        // initialize 4x32 bit state
        var h0 = 0x67452301
        var h1 = 0xEFCDAB89
        var h2 = 0x98BADCFE
        var h3 = 0x10325476

        // temp buffers
        var a = 0, b = 0, c = 0, d = 0

        // Digest message
        for (i = 0; i < databytes.length / 64; i++) {
            // initialize run
            a = h0
            b = h1
            c = h2
            d = h3

            var ptr = i * 64

            // do 64 runs
            updateRun(fF(b, c, d), 0xd76aa478, bytes_to_int32(databytes, ptr), 7)
            updateRun(fF(b, c, d), 0xe8c7b756, bytes_to_int32(databytes, ptr + 4), 12)
            updateRun(fF(b, c, d), 0x242070db, bytes_to_int32(databytes, ptr + 8), 17)
            updateRun(fF(b, c, d), 0xc1bdceee, bytes_to_int32(databytes, ptr + 12), 22)
            updateRun(fF(b, c, d), 0xf57c0faf, bytes_to_int32(databytes, ptr + 16), 7)
            updateRun(fF(b, c, d), 0x4787c62a, bytes_to_int32(databytes, ptr + 20), 12)
            updateRun(fF(b, c, d), 0xa8304613, bytes_to_int32(databytes, ptr + 24), 17)
            updateRun(fF(b, c, d), 0xfd469501, bytes_to_int32(databytes, ptr + 28), 22)
            updateRun(fF(b, c, d), 0x698098d8, bytes_to_int32(databytes, ptr + 32), 7)
            updateRun(fF(b, c, d), 0x8b44f7af, bytes_to_int32(databytes, ptr + 36), 12)
            updateRun(fF(b, c, d), 0xffff5bb1, bytes_to_int32(databytes, ptr + 40), 17)
            updateRun(fF(b, c, d), 0x895cd7be, bytes_to_int32(databytes, ptr + 44), 22)
            updateRun(fF(b, c, d), 0x6b901122, bytes_to_int32(databytes, ptr + 48), 7)
            updateRun(fF(b, c, d), 0xfd987193, bytes_to_int32(databytes, ptr + 52), 12)
            updateRun(fF(b, c, d), 0xa679438e, bytes_to_int32(databytes, ptr + 56), 17)
            updateRun(fF(b, c, d), 0x49b40821, bytes_to_int32(databytes, ptr + 60), 22)
            updateRun(fG(b, c, d), 0xf61e2562, bytes_to_int32(databytes, ptr + 4), 5)
            updateRun(fG(b, c, d), 0xc040b340, bytes_to_int32(databytes, ptr + 24), 9)
            updateRun(fG(b, c, d), 0x265e5a51, bytes_to_int32(databytes, ptr + 44), 14)
            updateRun(fG(b, c, d), 0xe9b6c7aa, bytes_to_int32(databytes, ptr), 20)
            updateRun(fG(b, c, d), 0xd62f105d, bytes_to_int32(databytes, ptr + 20), 5)
            updateRun(fG(b, c, d), 0x2441453, bytes_to_int32(databytes, ptr + 40), 9)
            updateRun(fG(b, c, d), 0xd8a1e681, bytes_to_int32(databytes, ptr + 60), 14)
            updateRun(fG(b, c, d), 0xe7d3fbc8, bytes_to_int32(databytes, ptr + 16), 20)
            updateRun(fG(b, c, d), 0x21e1cde6, bytes_to_int32(databytes, ptr + 36), 5)
            updateRun(fG(b, c, d), 0xc33707d6, bytes_to_int32(databytes, ptr + 56), 9)
            updateRun(fG(b, c, d), 0xf4d50d87, bytes_to_int32(databytes, ptr + 12), 14)
            updateRun(fG(b, c, d), 0x455a14ed, bytes_to_int32(databytes, ptr + 32), 20)
            updateRun(fG(b, c, d), 0xa9e3e905, bytes_to_int32(databytes, ptr + 52), 5)
            updateRun(fG(b, c, d), 0xfcefa3f8, bytes_to_int32(databytes, ptr + 8), 9)
            updateRun(fG(b, c, d), 0x676f02d9, bytes_to_int32(databytes, ptr + 28), 14)
            updateRun(fG(b, c, d), 0x8d2a4c8a, bytes_to_int32(databytes, ptr + 48), 20)
            updateRun(fH(b, c, d), 0xfffa3942, bytes_to_int32(databytes, ptr + 20), 4)
            updateRun(fH(b, c, d), 0x8771f681, bytes_to_int32(databytes, ptr + 32), 11)
            updateRun(fH(b, c, d), 0x6d9d6122, bytes_to_int32(databytes, ptr + 44), 16)
            updateRun(fH(b, c, d), 0xfde5380c, bytes_to_int32(databytes, ptr + 56), 23)
            updateRun(fH(b, c, d), 0xa4beea44, bytes_to_int32(databytes, ptr + 4), 4)
            updateRun(fH(b, c, d), 0x4bdecfa9, bytes_to_int32(databytes, ptr + 16), 11)
            updateRun(fH(b, c, d), 0xf6bb4b60, bytes_to_int32(databytes, ptr + 28), 16)
            updateRun(fH(b, c, d), 0xbebfbc70, bytes_to_int32(databytes, ptr + 40), 23)
            updateRun(fH(b, c, d), 0x289b7ec6, bytes_to_int32(databytes, ptr + 52), 4)
            updateRun(fH(b, c, d), 0xeaa127fa, bytes_to_int32(databytes, ptr), 11)
            updateRun(fH(b, c, d), 0xd4ef3085, bytes_to_int32(databytes, ptr + 12), 16)
            updateRun(fH(b, c, d), 0x4881d05, bytes_to_int32(databytes, ptr + 24), 23)
            updateRun(fH(b, c, d), 0xd9d4d039, bytes_to_int32(databytes, ptr + 36), 4)
            updateRun(fH(b, c, d), 0xe6db99e5, bytes_to_int32(databytes, ptr + 48), 11)
            updateRun(fH(b, c, d), 0x1fa27cf8, bytes_to_int32(databytes, ptr + 60), 16)
            updateRun(fH(b, c, d), 0xc4ac5665, bytes_to_int32(databytes, ptr + 8), 23)
            updateRun(fI(b, c, d), 0xf4292244, bytes_to_int32(databytes, ptr), 6)
            updateRun(fI(b, c, d), 0x432aff97, bytes_to_int32(databytes, ptr + 28), 10)
            updateRun(fI(b, c, d), 0xab9423a7, bytes_to_int32(databytes, ptr + 56), 15)
            updateRun(fI(b, c, d), 0xfc93a039, bytes_to_int32(databytes, ptr + 20), 21)
            updateRun(fI(b, c, d), 0x655b59c3, bytes_to_int32(databytes, ptr + 48), 6)
            updateRun(fI(b, c, d), 0x8f0ccc92, bytes_to_int32(databytes, ptr + 12), 10)
            updateRun(fI(b, c, d), 0xffeff47d, bytes_to_int32(databytes, ptr + 40), 15)
            updateRun(fI(b, c, d), 0x85845dd1, bytes_to_int32(databytes, ptr + 4), 21)
            updateRun(fI(b, c, d), 0x6fa87e4f, bytes_to_int32(databytes, ptr + 32), 6)
            updateRun(fI(b, c, d), 0xfe2ce6e0, bytes_to_int32(databytes, ptr + 60), 10)
            updateRun(fI(b, c, d), 0xa3014314, bytes_to_int32(databytes, ptr + 24), 15)
            updateRun(fI(b, c, d), 0x4e0811a1, bytes_to_int32(databytes, ptr + 52), 21)
            updateRun(fI(b, c, d), 0xf7537e82, bytes_to_int32(databytes, ptr + 16), 6)
            updateRun(fI(b, c, d), 0xbd3af235, bytes_to_int32(databytes, ptr + 44), 10)
            updateRun(fI(b, c, d), 0x2ad7d2bb, bytes_to_int32(databytes, ptr + 8), 15)
            updateRun(fI(b, c, d), 0xeb86d391, bytes_to_int32(databytes, ptr + 36), 21)

            // update buffers
            h0 = _add(h0, a)
            h1 = _add(h1, b)
            h2 = _add(h2, c)
            h3 = _add(h3, d)
        }
        // Done! Convert buffers to 128 bit (LE)
        return int128le_to_hex(h3, h2, h1, h0).toLowerCase();
    }


}

},{}],20:[function(require,module,exports){
"use strict";

// Timers are silently dropped on mobile and never called when backgrounded.
// Music is still triggering "ended" events every second, so use those to trigger timers manually.

const timers = {};
timers[500000000] = true;
delete timers[500000000];

const GlobalSetTimeout = setTimeout;
const GlobalClearTimeout = clearTimeout;


self.setTimeout = function(fn, time) {
    time = +time;

    if (time >= 100) {
        var called = false;
        var callback = function() {
            if (called) return;
            called = true;
            delete timers[ret];
            fn();
        };
        var ret = GlobalSetTimeout.call(self, callback, time);
        timers[ret] = {
            callback: callback,
            deadline: Date.now() + time
        };
        return ret;
    } else {
        return GlobalSetTimeout.apply(self, arguments);
    }

};

self.clearTimeout = function(id) {
    delete timers[id];
    return GlobalClearTimeout.apply(self, arguments);
};

module.exports = function simulateTick() {
    var keys = Object.keys(timers);
    var now = Date.now();
    var timersToFire = [];
    for (i = 0; i < keys.length; ++i) {
        var timerToFire = timers[keys[i]];
        if (now >= timerToFire.deadline) {
            timersToFire.push(timerToFire);
        }
    }

    timersToFire.sort(function(a, b) {
        return a.deadline - b.deadline;
    });

    for (var i = 0; i < timersToFire.length; ++i) {
        timersToFire[i].callback();
    }
};

},{}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
// This is free and unencumbered software released into the public domain.
// See LICENSE.md for more information.

(function(global) {
  'use strict';

  global["encoding-indexes"] = {
      "windows-1252":[8364,129,8218,402,8222,8230,8224,8225,710,8240,352,8249,338,141,381,143,144,8216,8217,8220,8221,8226,8211,8212,732,8482,353,8250,339,157,382,376,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253,254,255]
  };


  //
  // Utilities
  //

  /**
   * @param {number} a The number to test.
   * @param {number} min The minimum value in the range, inclusive.
   * @param {number} max The maximum value in the range, inclusive.
   * @return {boolean} True if a >= min and a <= max.
   */
  function inRange(a, min, max) {
    return min <= a && a <= max;
  }

  /**
   * @param {*} item The item to look for in the list.
   * @param {!Array.<*>} list The list to check.
   * @return {boolean} True if the item appears in the list.
   */
  function isOneOf(item, list) {
    return list.indexOf(item) !== -1;
  }

  /**
   * @param {*} item The item to look for in the list.
   * @param {!Array.<*>} list The list to check.
   * @return {boolean} True if the item does not appear in the list.
   */
  function isNoneOf(item, list) {
    return list.indexOf(item) === -1;
  }

  var floor = Math.floor;

  /**
   * @param {*} o
   * @return {Object}
   */
  function ToDictionary(o) {
    if (o === undefined) return {};
    if (o === Object(o)) return o;
    throw TypeError('Could not convert argument to dictionary');
  }

  /**
   * @param {string} string Input string of UTF-16 code units.
   * @return {!Array.<number>} Code points.
   */
  function stringToCodePoints(string) {
    // https://heycam.github.io/webidl/#dfn-obtain-unicode

    // 1. Let S be the DOMString value.
    var s = String(string);

    // 2. Let n be the length of S.
    var n = s.length;

    // 3. Initialize i to 0.
    var i = 0;

    // 4. Initialize U to be an empty sequence of Unicode characters.
    var u = [];

    // 5. While i < n:
    while (i < n) {

      // 1. Let c be the code unit in S at index i.
      var c = s.charCodeAt(i);

      // 2. Depending on the value of c:

      // c < 0xD800 or c > 0xDFFF
      if (c < 0xD800 || c > 0xDFFF) {
        // Append to U the Unicode character with code point c.
        u.push(c);
      }

      // 0xDC00 ≤ c ≤ 0xDFFF
      else if (0xDC00 <= c && c <= 0xDFFF) {
        // Append to U a U+FFFD REPLACEMENT CHARACTER.
        u.push(0xFFFD);
      }

      // 0xD800 ≤ c ≤ 0xDBFF
      else if (0xD800 <= c && c <= 0xDBFF) {
        // 1. If i = n−1, then append to U a U+FFFD REPLACEMENT
        // CHARACTER.
        if (i === n - 1) {
          u.push(0xFFFD);
        }
        // 2. Otherwise, i < n−1:
        else {
          // 1. Let d be the code unit in S at index i+1.
          var d = string.charCodeAt(i + 1);

          // 2. If 0xDC00 ≤ d ≤ 0xDFFF, then:
          if (0xDC00 <= d && d <= 0xDFFF) {
            // 1. Let a be c & 0x3FF.
            var a = c & 0x3FF;

            // 2. Let b be d & 0x3FF.
            var b = d & 0x3FF;

            // 3. Append to U the Unicode character with code point
            // 2^16+2^10*a+b.
            u.push(0x10000 + (a << 10) + b);

            // 4. Set i to i+1.
            i += 1;
          }

          // 3. Otherwise, d < 0xDC00 or d > 0xDFFF. Append to U a
          // U+FFFD REPLACEMENT CHARACTER.
          else  {
            u.push(0xFFFD);
          }
        }
      }

      // 3. Set i to i+1.
      i += 1;
    }

    // 6. Return U.
    return u;
  }

  /**
   * @param {!Array.<number>} code_points Array of code points.
   * @return {string} string String of UTF-16 code units.
   */
  function codePointsToString(code_points) {
    var s = '';
    for (var i = 0; i < code_points.length; ++i) {
      var cp = code_points[i];
      if (cp <= 0xFFFF) {
        s += String.fromCharCode(cp);
      } else {
        cp -= 0x10000;
        s += String.fromCharCode((cp >> 10) + 0xD800,
                                 (cp & 0x3FF) + 0xDC00);
      }
    }
    return s;
  }


  //
  // Implementation of Encoding specification
  // https://encoding.spec.whatwg.org/
  //

  //
  // 4. Terminology
  //

  /**
   * An ASCII byte is a byte in the range 0x00 to 0x7F, inclusive.
   * @param {number} a The number to test.
   * @return {boolean} True if a is in the range 0x00 to 0x7F, inclusive.
   */
  function isASCIIByte(a) {
    return 0x00 <= a && a <= 0x7F;
  }

  /**
   * An ASCII code point is a code point in the range U+0000 to
   * U+007F, inclusive.
   */
  var isASCIICodePoint = isASCIIByte;


  /**
   * End-of-stream is a special token that signifies no more tokens
   * are in the stream.
   * @const
   */ var end_of_stream = -1;

  /**
   * A stream represents an ordered sequence of tokens.
   *
   * @constructor
   * @param {!(Array.<number>|Uint8Array)} tokens Array of tokens that provide
   * the stream.
   */
  function Stream(tokens) {
    /** @type {!Array.<number>} */
    this.tokens = [].slice.call(tokens);
    // Reversed as push/pop is more efficient than shift/unshift.
    this.tokens.reverse();
  }

  Stream.prototype = {
    /**
     * @return {boolean} True if end-of-stream has been hit.
     */
    endOfStream: function() {
      return !this.tokens.length;
    },

    /**
     * When a token is read from a stream, the first token in the
     * stream must be returned and subsequently removed, and
     * end-of-stream must be returned otherwise.
     *
     * @return {number} Get the next token from the stream, or
     * end_of_stream.
     */
     read: function() {
      if (!this.tokens.length)
        return end_of_stream;
       return this.tokens.pop();
     },

    /**
     * When one or more tokens are prepended to a stream, those tokens
     * must be inserted, in given order, before the first token in the
     * stream.
     *
     * @param {(number|!Array.<number>)} token The token(s) to prepend to the
     * stream.
     */
    prepend: function(token) {
      if (Array.isArray(token)) {
        var tokens = /**@type {!Array.<number>}*/(token);
        while (tokens.length)
          this.tokens.push(tokens.pop());
      } else {
        this.tokens.push(token);
      }
    },

    /**
     * When one or more tokens are pushed to a stream, those tokens
     * must be inserted, in given order, after the last token in the
     * stream.
     *
     * @param {(number|!Array.<number>)} token The tokens(s) to push to the
     * stream.
     */
    push: function(token) {
      if (Array.isArray(token)) {
        var tokens = /**@type {!Array.<number>}*/(token);
        while (tokens.length)
          this.tokens.unshift(tokens.shift());
      } else {
        this.tokens.unshift(token);
      }
    }
  };

  //
  // 5. Encodings
  //

  // 5.1 Encoders and decoders

  /** @const */
  var finished = -1;

  /** @const */
  var error_mode_replacement = false;

  /** @const */
  var error_mode_fatal = true;

  /**
   * @param {boolean} fatal If true, decoding errors raise an exception.
   * @param {number=} opt_code_point Override the standard fallback code point.
   * @return {number} The code point to insert on a decoding error.
   */
  function decoderError(fatal, opt_code_point) {
    if (fatal)
      throw TypeError('Decoder error');
    return opt_code_point || 0xFFFD;
  }

  /**
   * @param {number} code_point The code point that could not be encoded.
   * @return {number} Always throws, no value is actually returned.
   */
  function encoderError(code_point) {
    throw TypeError('The code point ' + code_point + ' could not be encoded.');
  }

  /** @interface */
  function Decoder() {}
  Decoder.prototype = {
    /**
     * @param {Stream} stream The stream of bytes being decoded.
     * @param {number} bite The next byte read from the stream.
     * @return {?(number|!Array.<number>)} The next code point(s)
     *     decoded, or null if not enough data exists in the input
     *     stream to decode a complete code point, or |finished|.
     */
    handler: function(stream, bite) {}
  };

  /** @interface */
  function Encoder() {}
  Encoder.prototype = {
    /**
     * @param {Stream} stream The stream of code points being encoded.
     * @param {number} code_point Next code point read from the stream.
     * @return {(number|!Array.<number>)} Byte(s) to emit, or |finished|.
     */
    handler: function(stream, code_point) {}
  };

  // 5.2 Names and labels

  // TODO: Define @typedef for Encoding: {name:string,labels:Array.<string>}
  // https://github.com/google/closure-compiler/issues/247

  /**
   * @param {string} label The encoding label.
   * @return {?{name:string,labels:Array.<string>}}
   */
  function getEncoding(label) {
    // 1. Remove any leading and trailing ASCII whitespace from label.
    label = String(label).trim().toLowerCase();

    // 2. If label is an ASCII case-insensitive match for any of the
    // labels listed in the table below, return the corresponding
    // encoding, and failure otherwise.
    if (Object.prototype.hasOwnProperty.call(label_to_encoding, label)) {
      return label_to_encoding[label];
    }
    return null;
  }

  /**
   * Encodings table: https://encoding.spec.whatwg.org/encodings.json
   * @const
   * @type {!Array.<{
   *          heading: string,
   *          encodings: Array.<{name:string,labels:Array.<string>}>
   *        }>}
   */
  var encodings = [{
      "encodings": [{
          "labels": ["unicode-1-1-utf-8", "utf-8", "utf8"],
          "name": "utf-8"
      }],
      "heading": "The Encoding"
  }, {
      "encodings": [{
          "labels": ["ansi_x3.4-1968", "ascii", "cp1252", "cp819", "csisolatin1", "ibm819", "iso-8859-1", "iso-ir-100", "iso8859-1", "iso88591", "iso_8859-1", "iso_8859-1:1987", "l1", "latin1", "us-ascii", "windows-1252", "x-cp1252"],
          "name": "windows-1252"
      }],
      "heading": "Legacy single-byte encodings"
  }, {
      "encodings": [{
          "labels": ["utf-16be"],
          "name": "utf-16be"
      }, {
          "labels": ["utf-16", "utf-16le"],
          "name": "utf-16le"
      }, {
          "labels": ["x-user-defined"],
          "name": "x-user-defined"
      }],
      "heading": "Legacy miscellaneous encodings"
  }];

  // Label to encoding registry.
  /** @type {Object.<string,{name:string,labels:Array.<string>}>} */
  var label_to_encoding = {};
  encodings.forEach(function(category) {
    category.encodings.forEach(function(encoding) {
      encoding.labels.forEach(function(label) {
        label_to_encoding[label] = encoding;
      });
    });
  });

  // Registry of of encoder/decoder factories, by encoding name.
  /** @type {Object.<string, function({fatal:boolean}): Encoder>} */
  var encoders = {};
  /** @type {Object.<string, function({fatal:boolean}): Decoder>} */
  var decoders = {};

  //
  // 6. Indexes
  //

  /**
   * @param {number} pointer The |pointer| to search for.
   * @param {(!Array.<?number>|undefined)} index The |index| to search within.
   * @return {?number} The code point corresponding to |pointer| in |index|,
   *     or null if |code point| is not in |index|.
   */
  function indexCodePointFor(pointer, index) {
    if (!index) return null;
    return index[pointer] || null;
  }

  /**
   * @param {number} code_point The |code point| to search for.
   * @param {!Array.<?number>} index The |index| to search within.
   * @return {?number} The first pointer corresponding to |code point| in
   *     |index|, or null if |code point| is not in |index|.
   */
  function indexPointerFor(code_point, index) {
    var pointer = index.indexOf(code_point);
    return pointer === -1 ? null : pointer;
  }

  /**
   * @param {string} name Name of the index.
   * @return {(!Array.<number>|!Array.<Array.<number>>)}
   *  */
  function index(name) {
    if (!('encoding-indexes' in global)) {
      throw Error("Indexes missing." +
                  " Did you forget to include encoding-indexes.js?");
    }
    return global['encoding-indexes'][name];
  }

  //
  // 8. API
  //

  /** @const */ var DEFAULT_ENCODING = 'utf-8';

  // 8.1 Interface TextDecoder

  /**
   * @constructor
   * @param {string=} label The label of the encoding;
   *     defaults to 'utf-8'.
   * @param {Object=} options
   */
  function TextDecoder(label, options) {
    // Web IDL conventions
    if (!(this instanceof TextDecoder))
      throw TypeError('Called as a function. Did you forget \'new\'?');
    label = label !== undefined ? String(label) : DEFAULT_ENCODING;
    options = ToDictionary(options);

    // A TextDecoder object has an associated encoding, decoder,
    // stream, ignore BOM flag (initially unset), BOM seen flag
    // (initially unset), error mode (initially replacement), and do
    // not flush flag (initially unset).

    /** @private */
    this._encoding = null;
    /** @private @type {?Decoder} */
    this._decoder = null;
    /** @private @type {boolean} */
    this._ignoreBOM = false;
    /** @private @type {boolean} */
    this._BOMseen = false;
    /** @private @type {boolean} */
    this._error_mode = error_mode_replacement;
    /** @private @type {boolean} */
    this._do_not_flush = false;


    // 1. Let encoding be the result of getting an encoding from
    // label.
    var encoding = getEncoding(label);

    // 2. If encoding is failure or replacement, throw a RangeError.
    if (encoding === null || encoding.name === 'replacement')
      throw RangeError('Unknown encoding: ' + label);
    if (!decoders[encoding.name]) {
      throw Error('Decoder not present.' +
                  ' Did you forget to include encoding-indexes.js?');
    }

    // 3. Let dec be a new TextDecoder object.
    var dec = this;

    // 4. Set dec's encoding to encoding.
    dec._encoding = encoding;

    // 5. If options's fatal member is true, set dec's error mode to
    // fatal.
    if (Boolean(options['fatal']))
      dec._error_mode = error_mode_fatal;

    // 6. If options's ignoreBOM member is true, set dec's ignore BOM
    // flag.
    if (Boolean(options['ignoreBOM']))
      dec._ignoreBOM = true;

    // For pre-ES5 runtimes:
    if (!Object.defineProperty) {
      this.encoding = dec._encoding.name;
      this.fatal = dec._error_mode;
      this.ignoreBOM = dec._ignoreBOM;
    }

    // 7. Return dec.
    return dec;
  }

  if (Object.defineProperty) {
    // The encoding attribute's getter must return encoding's name.
    Object.defineProperty(TextDecoder.prototype, 'encoding', {
      /** @this {TextDecoder} */
      get: function() { return this._encoding.name; }
    });

    // The fatal attribute's getter must return true if error mode
    // is fatal, and false otherwise.
    Object.defineProperty(TextDecoder.prototype, 'fatal', {
      /** @this {TextDecoder} */
      get: function() { return this._error_mode === error_mode_fatal; }
    });

    // The ignoreBOM attribute's getter must return true if ignore
    // BOM flag is set, and false otherwise.
    Object.defineProperty(TextDecoder.prototype, 'ignoreBOM', {
      /** @this {TextDecoder} */
      get: function() { return this._ignoreBOM; }
    });
  }

  /**
   * @param {BufferSource=} input The buffer of bytes to decode.
   * @param {Object=} options
   * @return {string} The decoded string.
   */
  TextDecoder.prototype.decode = function decode(input, options) {
    var bytes;
    if (typeof input === 'object' && input instanceof ArrayBuffer) {
      bytes = new Uint8Array(input);
    } else if (typeof input === 'object' && 'buffer' in input &&
               input.buffer instanceof ArrayBuffer) {
      bytes = new Uint8Array(input.buffer,
                             input.byteOffset,
                             input.byteLength);
    } else {
      bytes = new Uint8Array(0);
    }

    options = ToDictionary(options);

    // 1. If the do not flush flag is unset, set decoder to a new
    // encoding's decoder, set stream to a new stream, and unset the
    // BOM seen flag.
    if (!this._do_not_flush) {
      this._decoder = decoders[this._encoding.name]({fatal: this._error_mode});
      this._BOMseen = false;
    }

    // 2. If options's stream is true, set the do not flush flag, and
    // unset the do not flush flag otherwise.
    this._do_not_flush = Boolean(options['stream']);

    // 3. If input is given, push a copy of input to stream.
    // TODO: Align with spec algorithm - maintain stream on instance.
    var input_stream = new Stream(bytes);

    // 4. Let output be a new stream.
    var output = [];

    /** @type {?(number|!Array.<number>)} */
    var result;

    // 5. While true:
    while (true) {
      // 1. Let token be the result of reading from stream.
      var token = input_stream.read();

      // 2. If token is end-of-stream and the do not flush flag is
      // set, return output, serialized.
      // TODO: Align with spec algorithm.
      if (token === end_of_stream)
        break;

      // 3. Otherwise, run these subsubsteps:

      // 1. Let result be the result of processing token for decoder,
      // stream, output, and error mode.
      result = this._decoder.handler(input_stream, token);

      // 2. If result is finished, return output, serialized.
      if (result === finished)
        break;

      if (result !== null) {
        if (Array.isArray(result))
          output.push.apply(output, /**@type {!Array.<number>}*/(result));
        else
          output.push(result);
      }

      // 3. Otherwise, if result is error, throw a TypeError.
      // (Thrown in handler)

      // 4. Otherwise, do nothing.
    }
    // TODO: Align with spec algorithm.
    if (!this._do_not_flush) {
      do {
        result = this._decoder.handler(input_stream, input_stream.read());
        if (result === finished)
          break;
        if (result === null)
          continue;
        if (Array.isArray(result))
          output.push.apply(output, /**@type {!Array.<number>}*/(result));
        else
          output.push(result);
      } while (!input_stream.endOfStream());
      this._decoder = null;
    }

    // A TextDecoder object also has an associated serialize stream
    // algorithm...
    /**
     * @param {!Array.<number>} stream
     * @return {string}
     * @this {TextDecoder}
     */
    function serializeStream(stream) {
      // 1. Let token be the result of reading from stream.
      // (Done in-place on array, rather than as a stream)

      // 2. If encoding is one of utf-8, utf-16be, and utf-16le, and
      // ignore BOM flag and BOM seen flag are unset, run these
      // subsubsteps:
      if (isOneOf(this.encoding, ['utf-8', 'utf-16le', 'utf-16be']) &&
          !this._ignoreBOM && !this._BOMseen) {
        if (stream.length > 0 && stream[0] === 0xFEFF) {
          // 1. If token is U+FEFF, set BOM seen flag.
          this._BOMseen = true;
          stream.shift();
        } else if (stream.length > 0) {
          // 2. Otherwise, if token is not end-of-stream, set BOM seen
          // flag and append token to stream.
          this._BOMseen = true;
        } else {
          // 3. Otherwise, if token is not end-of-stream, append token
          // to output.
          // (no-op)
        }
      }
      // 4. Otherwise, return output.
      return codePointsToString(stream);
    }

    return serializeStream.call(this, output);
  };

  // 8.2 Interface TextEncoder

  /**
   * @constructor
   * @param {string=} label The label of the encoding;
   *     defaults to 'utf-8'.
   * @param {Object=} options
   */
  function TextEncoder(label, options) {
    // Web IDL conventions
    if (!(this instanceof TextEncoder))
      throw TypeError('Called as a function. Did you forget \'new\'?');
    label = label !== undefined ? String(label) : DEFAULT_ENCODING;
    options = ToDictionary(options);

    // A TextEncoder object has an associated encoding and encoder.

    /** @private */
    this._encoding = null;
    /** @private @type {?Encoder} */
    this._encoder = null;

    // Non-standard
    /** @private @type {boolean} */
    this._do_not_flush = false;
    /** @private @type {boolean} */
    this._fatal = Boolean(options['fatal']);

    // 1. Let encoding be the result of getting an encoding from utfLabel.
    var encoding = getEncoding(label);

    // 2. If encoding is failure, or is none of utf-8, utf-16be, and
    // utf-16le, throw a RangeError.
    if (encoding === null || encoding.name === 'replacement' ||
        (isNoneOf(encoding.name, ['utf-8','utf-16le', 'utf-16be']) &&
         !Boolean(options['NONSTANDARD_allowLegacyEncoding'])))
      throw RangeError('Unknown encoding: ' + label);
    if (!encoders[encoding.name]) {
      throw Error('Encoder not present.' +
                  ' Did you forget to include encoding-indexes.js?');
    }

    // 3. Let enc be a new TextEncoder object.
    var enc = this;

    // 4. Set enc's encoding to encoding.
    enc._encoding = encoding;

    // 5. Set enc's encoder to a new enc's encoding's encoder.
    // (Done during encode itself, due to nonstandard streaming support.)

    // For pre-ES5 runtimes:
    if (!Object.defineProperty)
      this.encoding = enc._encoding.name;

    // 6. Return enc.
    return enc;
  }

  if (Object.defineProperty) {
    // The encoding attribute's getter must return encoding's name.
    Object.defineProperty(TextEncoder.prototype, 'encoding', {
      /** @this {TextEncoder} */
      get: function() { return this._encoding.name; }
    });
  }

  /**
   * @param {string=} opt_string The string to encode.
   * @param {Object=} options
   * @return {!Uint8Array} Encoded bytes, as a Uint8Array.
   */
  TextEncoder.prototype.encode = function encode(opt_string, options) {
    opt_string = opt_string ? String(opt_string) : '';
    options = ToDictionary(options);

    // NOTE: This option is nonstandard. None of the encodings
    // permitted for encoding (i.e. UTF-8, UTF-16) are stateful when
    // the input is a USVString so streaming is not necessary.
    if (!this._do_not_flush)
      this._encoder = encoders[this._encoding.name]({fatal: this._fatal});
    this._do_not_flush = Boolean(options['stream']);

    // 1. Convert input to a stream.
    var input = new Stream(stringToCodePoints(opt_string));

    // 2. Let output be a new stream
    var output = [];

    /** @type {?(number|!Array.<number>)} */
    var result;
    // 3. While true, run these substeps:
    while (true) {
      // 1. Let token be the result of reading from input.
      var token = input.read();
      if (token === end_of_stream)
        break;
      // 2. Let result be the result of processing token for encoder,
      // input, output.
      result = this._encoder.handler(input, token);
      if (result === finished)
        break;
      if (Array.isArray(result))
        output.push.apply(output, /**@type {!Array.<number>}*/(result));
      else
        output.push(result);
    }
    // TODO: Align with spec algorithm.
    if (!this._do_not_flush) {
      while (true) {
        result = this._encoder.handler(input, input.read());
        if (result === finished)
          break;
        if (Array.isArray(result))
          output.push.apply(output, /**@type {!Array.<number>}*/(result));
        else
          output.push(result);
      }
      this._encoder = null;
    }
    // 3. If result is finished, convert output into a byte sequence,
    // and then return a Uint8Array object wrapping an ArrayBuffer
    // containing output.
    return new Uint8Array(output);
  };


  //
  // 9. The encoding
  //

  // 9.1 utf-8

  // 9.1.1 utf-8 decoder
  /**
   * @constructor
   * @implements {Decoder}
   * @param {{fatal: boolean}} options
   */
  function UTF8Decoder(options) {
    var fatal = options.fatal;

    // utf-8's decoder's has an associated utf-8 code point, utf-8
    // bytes seen, and utf-8 bytes needed (all initially 0), a utf-8
    // lower boundary (initially 0x80), and a utf-8 upper boundary
    // (initially 0xBF).
    var /** @type {number} */ utf8_code_point = 0,
        /** @type {number} */ utf8_bytes_seen = 0,
        /** @type {number} */ utf8_bytes_needed = 0,
        /** @type {number} */ utf8_lower_boundary = 0x80,
        /** @type {number} */ utf8_upper_boundary = 0xBF;

    /**
     * @param {Stream} stream The stream of bytes being decoded.
     * @param {number} bite The next byte read from the stream.
     * @return {?(number|!Array.<number>)} The next code point(s)
     *     decoded, or null if not enough data exists in the input
     *     stream to decode a complete code point.
     */
    this.handler = function(stream, bite) {
      // 1. If byte is end-of-stream and utf-8 bytes needed is not 0,
      // set utf-8 bytes needed to 0 and return error.
      if (bite === end_of_stream && utf8_bytes_needed !== 0) {
        utf8_bytes_needed = 0;
        return decoderError(fatal);
      }

      // 2. If byte is end-of-stream, return finished.
      if (bite === end_of_stream)
        return finished;

      // 3. If utf-8 bytes needed is 0, based on byte:
      if (utf8_bytes_needed === 0) {

        // 0x00 to 0x7F
        if (inRange(bite, 0x00, 0x7F)) {
          // Return a code point whose value is byte.
          return bite;
        }

        // 0xC2 to 0xDF
        if (inRange(bite, 0xC2, 0xDF)) {
          // Set utf-8 bytes needed to 1 and utf-8 code point to byte
          // − 0xC0.
          utf8_bytes_needed = 1;
          utf8_code_point = bite - 0xC0;
        }

        // 0xE0 to 0xEF
        else if (inRange(bite, 0xE0, 0xEF)) {
          // 1. If byte is 0xE0, set utf-8 lower boundary to 0xA0.
          if (bite === 0xE0)
            utf8_lower_boundary = 0xA0;
          // 2. If byte is 0xED, set utf-8 upper boundary to 0x9F.
          if (bite === 0xED)
            utf8_upper_boundary = 0x9F;
          // 3. Set utf-8 bytes needed to 2 and utf-8 code point to
          // byte − 0xE0.
          utf8_bytes_needed = 2;
          utf8_code_point = bite - 0xE0;
        }

        // 0xF0 to 0xF4
        else if (inRange(bite, 0xF0, 0xF4)) {
          // 1. If byte is 0xF0, set utf-8 lower boundary to 0x90.
          if (bite === 0xF0)
            utf8_lower_boundary = 0x90;
          // 2. If byte is 0xF4, set utf-8 upper boundary to 0x8F.
          if (bite === 0xF4)
            utf8_upper_boundary = 0x8F;
          // 3. Set utf-8 bytes needed to 3 and utf-8 code point to
          // byte − 0xF0.
          utf8_bytes_needed = 3;
          utf8_code_point = bite - 0xF0;
        }

        // Otherwise
        else {
          // Return error.
          return decoderError(fatal);
        }

        // Then (byte is in the range 0xC2 to 0xF4, inclusive) set
        // utf-8 code point to utf-8 code point << (6 × utf-8 bytes
        // needed) and return continue.
        utf8_code_point = utf8_code_point << (6 * utf8_bytes_needed);
        return null;
      }

      // 4. If byte is not in the range utf-8 lower boundary to utf-8
      // upper boundary, inclusive, run these substeps:
      if (!inRange(bite, utf8_lower_boundary, utf8_upper_boundary)) {

        // 1. Set utf-8 code point, utf-8 bytes needed, and utf-8
        // bytes seen to 0, set utf-8 lower boundary to 0x80, and set
        // utf-8 upper boundary to 0xBF.
        utf8_code_point = utf8_bytes_needed = utf8_bytes_seen = 0;
        utf8_lower_boundary = 0x80;
        utf8_upper_boundary = 0xBF;

        // 2. Prepend byte to stream.
        stream.prepend(bite);

        // 3. Return error.
        return decoderError(fatal);
      }

      // 5. Set utf-8 lower boundary to 0x80 and utf-8 upper boundary
      // to 0xBF.
      utf8_lower_boundary = 0x80;
      utf8_upper_boundary = 0xBF;

      // 6. Increase utf-8 bytes seen by one and set utf-8 code point
      // to utf-8 code point + (byte − 0x80) << (6 × (utf-8 bytes
      // needed − utf-8 bytes seen)).
      utf8_bytes_seen += 1;
      utf8_code_point += (bite - 0x80) << (6 * (utf8_bytes_needed -
                                                utf8_bytes_seen));

      // 7. If utf-8 bytes seen is not equal to utf-8 bytes needed,
      // continue.
      if (utf8_bytes_seen !== utf8_bytes_needed)
        return null;

      // 8. Let code point be utf-8 code point.
      var code_point = utf8_code_point;

      // 9. Set utf-8 code point, utf-8 bytes needed, and utf-8 bytes
      // seen to 0.
      utf8_code_point = utf8_bytes_needed = utf8_bytes_seen = 0;

      // 10. Return a code point whose value is code point.
      return code_point;
    };
  }

  // 9.1.2 utf-8 encoder
  /**
   * @constructor
   * @implements {Encoder}
   * @param {{fatal: boolean}} options
   */
  function UTF8Encoder(options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream Input stream.
     * @param {number} code_point Next code point read from the stream.
     * @return {(number|!Array.<number>)} Byte(s) to emit.
     */
    this.handler = function(stream, code_point) {
      // 1. If code point is end-of-stream, return finished.
      if (code_point === end_of_stream)
        return finished;

      // 2. If code point is in the range U+0000 to U+007F, return a
      // byte whose value is code point.
      if (inRange(code_point, 0x0000, 0x007f))
        return code_point;

      // 3. Set count and offset based on the range code point is in:
      var count, offset;
      // U+0080 to U+07FF, inclusive:
      if (inRange(code_point, 0x0080, 0x07FF)) {
        // 1 and 0xC0
        count = 1;
        offset = 0xC0;
      }
      // U+0800 to U+FFFF, inclusive:
      else if (inRange(code_point, 0x0800, 0xFFFF)) {
        // 2 and 0xE0
        count = 2;
        offset = 0xE0;
      }
      // U+10000 to U+10FFFF, inclusive:
      else if (inRange(code_point, 0x10000, 0x10FFFF)) {
        // 3 and 0xF0
        count = 3;
        offset = 0xF0;
      }

      // 4.Let bytes be a byte sequence whose first byte is (code
      // point >> (6 × count)) + offset.
      var bytes = [(code_point >> (6 * count)) + offset];

      // 5. Run these substeps while count is greater than 0:
      while (count > 0) {

        // 1. Set temp to code point >> (6 × (count − 1)).
        var temp = code_point >> (6 * (count - 1));

        // 2. Append to bytes 0x80 | (temp & 0x3F).
        bytes.push(0x80 | (temp & 0x3F));

        // 3. Decrease count by one.
        count -= 1;
      }

      // 6. Return bytes bytes, in order.
      return bytes;
    };
  }

  /** @param {{fatal: boolean}} options */
  encoders['utf-8'] = function(options) {
    return new UTF8Encoder(options);
  };
  /** @param {{fatal: boolean}} options */
  decoders['utf-8'] = function(options) {
    return new UTF8Decoder(options);
  };

  //
  // 10. Legacy single-byte encodings
  //

  // 10.1 single-byte decoder
  /**
   * @constructor
   * @implements {Decoder}
   * @param {!Array.<number>} index The encoding index.
   * @param {{fatal: boolean}} options
   */
  function SingleByteDecoder(index, options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream The stream of bytes being decoded.
     * @param {number} bite The next byte read from the stream.
     * @return {?(number|!Array.<number>)} The next code point(s)
     *     decoded, or null if not enough data exists in the input
     *     stream to decode a complete code point.
     */
    this.handler = function(stream, bite) {
      // 1. If byte is end-of-stream, return finished.
      if (bite === end_of_stream)
        return finished;

      // 2. If byte is an ASCII byte, return a code point whose value
      // is byte.
      if (isASCIIByte(bite))
        return bite;

      // 3. Let code point be the index code point for byte − 0x80 in
      // index single-byte.
      var code_point = index[bite - 0x80];

      // 4. If code point is null, return error.
      if (code_point === null)
        return decoderError(fatal);

      // 5. Return a code point whose value is code point.
      return code_point;
    };
  }

  // 10.2 single-byte encoder
  /**
   * @constructor
   * @implements {Encoder}
   * @param {!Array.<?number>} index The encoding index.
   * @param {{fatal: boolean}} options
   */
  function SingleByteEncoder(index, options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream Input stream.
     * @param {number} code_point Next code point read from the stream.
     * @return {(number|!Array.<number>)} Byte(s) to emit.
     */
    this.handler = function(stream, code_point) {
      // 1. If code point is end-of-stream, return finished.
      if (code_point === end_of_stream)
        return finished;

      // 2. If code point is an ASCII code point, return a byte whose
      // value is code point.
      if (isASCIICodePoint(code_point))
        return code_point;

      // 3. Let pointer be the index pointer for code point in index
      // single-byte.
      var pointer = indexPointerFor(code_point, index);

      // 4. If pointer is null, return error with code point.
      if (pointer === null)
        encoderError(code_point);

      // 5. Return a byte whose value is pointer + 0x80.
      return pointer + 0x80;
    };
  }

  (function() {
    if (!('encoding-indexes' in global))
      return;
    encodings.forEach(function(category) {
      if (category.heading !== 'Legacy single-byte encodings')
        return;
      category.encodings.forEach(function(encoding) {
        var name = encoding.name;
        var idx = index(name);
        /** @param {{fatal: boolean}} options */
        decoders[name] = function(options) {
          return new SingleByteDecoder(idx, options);
        };
        /** @param {{fatal: boolean}} options */
        encoders[name] = function(options) {
          return new SingleByteEncoder(idx, options);
        };
      });
    });
  }()); 

  //
  // 15. Legacy miscellaneous encodings
  //

  // 15.1 replacement

  // Not needed - API throws RangeError

  // 15.2 Common infrastructure for utf-16be and utf-16le

  /**
   * @param {number} code_unit
   * @param {boolean} utf16be
   * @return {!Array.<number>} bytes
   */
  function convertCodeUnitToBytes(code_unit, utf16be) {
    // 1. Let byte1 be code unit >> 8.
    var byte1 = code_unit >> 8;

    // 2. Let byte2 be code unit & 0x00FF.
    var byte2 = code_unit & 0x00FF;

    // 3. Then return the bytes in order:
        // utf-16be flag is set: byte1, then byte2.
    if (utf16be)
      return [byte1, byte2];
    // utf-16be flag is unset: byte2, then byte1.
    return [byte2, byte1];
  }

  // 15.2.1 shared utf-16 decoder
  /**
   * @constructor
   * @implements {Decoder}
   * @param {boolean} utf16_be True if big-endian, false if little-endian.
   * @param {{fatal: boolean}} options
   */
  function UTF16Decoder(utf16_be, options) {
    var fatal = options.fatal;
    var /** @type {?number} */ utf16_lead_byte = null,
        /** @type {?number} */ utf16_lead_surrogate = null;
    /**
     * @param {Stream} stream The stream of bytes being decoded.
     * @param {number} bite The next byte read from the stream.
     * @return {?(number|!Array.<number>)} The next code point(s)
     *     decoded, or null if not enough data exists in the input
     *     stream to decode a complete code point.
     */
    this.handler = function(stream, bite) {
      // 1. If byte is end-of-stream and either utf-16 lead byte or
      // utf-16 lead surrogate is not null, set utf-16 lead byte and
      // utf-16 lead surrogate to null, and return error.
      if (bite === end_of_stream && (utf16_lead_byte !== null ||
                                utf16_lead_surrogate !== null)) {
        return decoderError(fatal);
      }

      // 2. If byte is end-of-stream and utf-16 lead byte and utf-16
      // lead surrogate are null, return finished.
      if (bite === end_of_stream && utf16_lead_byte === null &&
          utf16_lead_surrogate === null) {
        return finished;
      }

      // 3. If utf-16 lead byte is null, set utf-16 lead byte to byte
      // and return continue.
      if (utf16_lead_byte === null) {
        utf16_lead_byte = bite;
        return null;
      }

      // 4. Let code unit be the result of:
      var code_unit;
      if (utf16_be) {
        // utf-16be decoder flag is set
        //   (utf-16 lead byte << 8) + byte.
        code_unit = (utf16_lead_byte << 8) + bite;
      } else {
        // utf-16be decoder flag is unset
        //   (byte << 8) + utf-16 lead byte.
        code_unit = (bite << 8) + utf16_lead_byte;
      }
      // Then set utf-16 lead byte to null.
      utf16_lead_byte = null;

      // 5. If utf-16 lead surrogate is not null, let lead surrogate
      // be utf-16 lead surrogate, set utf-16 lead surrogate to null,
      // and then run these substeps:
      if (utf16_lead_surrogate !== null) {
        var lead_surrogate = utf16_lead_surrogate;
        utf16_lead_surrogate = null;

        // 1. If code unit is in the range U+DC00 to U+DFFF, return a
        // code point whose value is 0x10000 + ((lead surrogate −
        // 0xD800) << 10) + (code unit − 0xDC00).
        if (inRange(code_unit, 0xDC00, 0xDFFF)) {
          return 0x10000 + (lead_surrogate - 0xD800) * 0x400 +
              (code_unit - 0xDC00);
        }

        // 2. Prepend the sequence resulting of converting code unit
        // to bytes using utf-16be decoder flag to stream and return
        // error.
        stream.prepend(convertCodeUnitToBytes(code_unit, utf16_be));
        return decoderError(fatal);
      }

      // 6. If code unit is in the range U+D800 to U+DBFF, set utf-16
      // lead surrogate to code unit and return continue.
      if (inRange(code_unit, 0xD800, 0xDBFF)) {
        utf16_lead_surrogate = code_unit;
        return null;
      }

      // 7. If code unit is in the range U+DC00 to U+DFFF, return
      // error.
      if (inRange(code_unit, 0xDC00, 0xDFFF))
        return decoderError(fatal);

      // 8. Return code point code unit.
      return code_unit;
    };
  }

  // 15.2.2 shared utf-16 encoder
  /**
   * @constructor
   * @implements {Encoder}
   * @param {boolean} utf16_be True if big-endian, false if little-endian.
   * @param {{fatal: boolean}} options
   */
  function UTF16Encoder(utf16_be, options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream Input stream.
     * @param {number} code_point Next code point read from the stream.
     * @return {(number|!Array.<number>)} Byte(s) to emit.
     */
    this.handler = function(stream, code_point) {
      // 1. If code point is end-of-stream, return finished.
      if (code_point === end_of_stream)
        return finished;

      // 2. If code point is in the range U+0000 to U+FFFF, return the
      // sequence resulting of converting code point to bytes using
      // utf-16be encoder flag.
      if (inRange(code_point, 0x0000, 0xFFFF))
        return convertCodeUnitToBytes(code_point, utf16_be);

      // 3. Let lead be ((code point − 0x10000) >> 10) + 0xD800,
      // converted to bytes using utf-16be encoder flag.
      var lead = convertCodeUnitToBytes(
        ((code_point - 0x10000) >> 10) + 0xD800, utf16_be);

      // 4. Let trail be ((code point − 0x10000) & 0x3FF) + 0xDC00,
      // converted to bytes using utf-16be encoder flag.
      var trail = convertCodeUnitToBytes(
        ((code_point - 0x10000) & 0x3FF) + 0xDC00, utf16_be);

      // 5. Return a byte sequence of lead followed by trail.
      return lead.concat(trail);
    };
  }

  // 15.3 utf-16be
  // 15.3.1 utf-16be decoder
  /** @param {{fatal: boolean}} options */
  encoders['utf-16be'] = function(options) {
    return new UTF16Encoder(true, options);
  };
  // 15.3.2 utf-16be encoder
  /** @param {{fatal: boolean}} options */
  decoders['utf-16be'] = function(options) {
    return new UTF16Decoder(true, options);
  };

  // 15.4 utf-16le
  // 15.4.1 utf-16le decoder
  /** @param {{fatal: boolean}} options */
  encoders['utf-16le'] = function(options) {
    return new UTF16Encoder(false, options);
  };
  // 15.4.2 utf-16le encoder
  /** @param {{fatal: boolean}} options */
  decoders['utf-16le'] = function(options) {
    return new UTF16Decoder(false, options);
  };

  // 15.5 x-user-defined

  // 15.5.1 x-user-defined decoder
  /**
   * @constructor
   * @implements {Decoder}
   * @param {{fatal: boolean}} options
   */
  function XUserDefinedDecoder(options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream The stream of bytes being decoded.
     * @param {number} bite The next byte read from the stream.
     * @return {?(number|!Array.<number>)} The next code point(s)
     *     decoded, or null if not enough data exists in the input
     *     stream to decode a complete code point.
     */
    this.handler = function(stream, bite) {
      // 1. If byte is end-of-stream, return finished.
      if (bite === end_of_stream)
        return finished;

      // 2. If byte is an ASCII byte, return a code point whose value
      // is byte.
      if (isASCIIByte(bite))
        return bite;

      // 3. Return a code point whose value is 0xF780 + byte − 0x80.
      return 0xF780 + bite - 0x80;
    };
  }

  // 15.5.2 x-user-defined encoder
  /**
   * @constructor
   * @implements {Encoder}
   * @param {{fatal: boolean}} options
   */
  function XUserDefinedEncoder(options) {
    var fatal = options.fatal;
    /**
     * @param {Stream} stream Input stream.
     * @param {number} code_point Next code point read from the stream.
     * @return {(number|!Array.<number>)} Byte(s) to emit.
     */
    this.handler = function(stream, code_point) {
      // 1.If code point is end-of-stream, return finished.
      if (code_point === end_of_stream)
        return finished;

      // 2. If code point is an ASCII code point, return a byte whose
      // value is code point.
      if (isASCIICodePoint(code_point))
        return code_point;

      // 3. If code point is in the range U+F780 to U+F7FF, return a
      // byte whose value is code point − 0xF780 + 0x80.
      if (inRange(code_point, 0xF780, 0xF7FF))
        return code_point - 0xF780 + 0x80;

      // 4. Return error with code point.
      return encoderError(code_point);
    };
  }

  /** @param {{fatal: boolean}} options */
  encoders['x-user-defined'] = function(options) {
    return new XUserDefinedEncoder(options);
  };
  /** @param {{fatal: boolean}} options */
  decoders['x-user-defined'] = function(options) {
    return new XUserDefinedDecoder(options);
  };

  if (!global['TextEncoder'])
    global['TextEncoder'] = TextEncoder;
  if (!global['TextDecoder'])
    global['TextDecoder'] = TextDecoder;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      TextEncoder: global['TextEncoder'],
      TextDecoder: global['TextDecoder'],
      EncodingIndexes: global["encoding-indexes"]
    };
  }
}(self));



},{}],23:[function(require,module,exports){
"use strict";

const Promise = require("lib/bluebird");
const EventEmitter = require("lib/events");
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

util.onBubble = function onCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.addEventListener(eventName, handler, false);
    });
};

util.offBubble = function offCapture(dom, eventName, handler) {
    eventName.split(" ").forEach(function(eventName) {
        dom.removeEventListener(eventName, handler, false);
    });
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

const checkSize = function(expectedSize, resultSize) {
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

util.readAsBinaryString = function(file) {
    var expectedSize = file.size;

    if (typeof FileReader !== "function") {
        return new Promise(function(resolve) {
            var reader = new FileReaderSync();
            result = reader.readAsBinaryString(file);
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
        util.once(reader, "load", function(e) {
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
        util.once(reader, "error", function() {
            reader = null;
            file = null;
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
        });
        reader.readAsBinaryString(file);
    });
};

util.readAsArrayBuffer = function(file) {
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
        util.once(reader, "load", function(e) {
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
        util.once(reader, "error", function() {
            reader = null;
            file = null;
            var e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
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

    ret.isBackgrounded = function() {
        return document[prop];
    };

    var changed = util.throttle(function() {
        ret.emit("change");
    }, 10);

    document.addEventListener(eventName, function() {
        if (document[prop]) {
            ret.emit("background");
        } else {
            ret.emit("foreground");
        }
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

util.titleCase = function(str) {
    if (typeof str !== "string") str = "" + str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

util.assign = function(root) {
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

},{"lib/bluebird":17,"lib/events":18}],24:[function(require,module,exports){
"use strict";

const util = require("lib/util");
const jsmd5 = require("lib/jsmd5");
const demux = require("audio/demuxer");
const ID3 = 0x494433|0;
const TAG = 0x544147|0;

const id3v1Genres = [
    "Blues","Classic Rock","Country","Dance","Disco","Funk","Grunge",
    "Hip-Hop","Jazz","Metal","New Age","Oldies","Other","Pop","Rhythm and Blues",
    "Rap","Reggae","Rock","Techno","Industrial","Alternative","Ska","Death Metal",
    "Pranks","Soundtrack","Euro-Techno","Ambient","Trip-Hop","Vocal","Jazz & Funk",
    "Fusion","Trance","Classical","Instrumental","Acid","House","Game","Sound Clip",
    "Gospel","Noise","Alternative Rock","Bass","Soul","Punk","Space","Meditative",
    "Instrumental Pop","Instrumental Rock","Ethnic","Gothic","Darkwave","Techno-Industrial",
    "Electronic","Pop-Folk","Eurodance","Dream","Southern Rock","Comedy","Cult","Gangsta",
    "Top 40","Christian Rap", ["Pop", "Funk"],"Jungle","Native US","Cabaret","New Wave",
    "Psychedelic","Rave","Showtunes","Trailer","Lo-Fi","Tribal","Acid Punk","Acid Jazz",
    "Polka","Retro","Musical","Rock ’n’ Roll","Hard Rock","Folk","Folk-Rock","National Folk",
    "Swing","Fast Fusion","Bebop","Latin","Revival","Celtic","Bluegrass","Avantgarde",
    "Gothic Rock","Progressive Rock","Psychedelic Rock","Symphonic Rock","Slow Rock",
    "Big Band","Chorus","Easy Listening","Acoustic","Humour","Speech","Chanson","Opera",
    "Chamber Music","Sonata","Symphony","Booty Bass","Primus","Porn Groove","Satire",
    "Slow Jam","Club","Tango","Samba","Folklore","Ballad","Power Ballad","Rhythmic Soul",
    "Freestyle","Duet","Punk Rock","Drum Solo","A cappella","Euro-House","Dance Hall","Goa",
    "Drum & Bass","Club-House","Hardcore Techno","Terror","Indie","BritPop","Negerpunk",
    "Polsk Punk","Beat","Christian Gangsta Rap","Heavy Metal","Black Metal","Crossover",
    "Contemporary Christian","Christian Rock","Merengue","Salsa","Thrash Metal","Anime",
    "Jpop","Synthpop","Abstract","Art Rock","Baroque","Bhangra","Big Beat","Breakbeat",
    "Chillout","Downtempo","Dub","EBM","Eclectic","Electro","Electroclash","Emo","Experimental",
    "Garage","Global","IDM","Illbient","Industro-Goth","Jam Band","Krautrock","Leftfield",
    "Lounge","Math Rock","New Romantic","Nu-Breakz","Post-Punk","Post-Rock","Psytrance",
    "Shoegaze","Space Rock","Trop Rock","World Music","Neoclassical","Audiobook","Audio Theatre",
    "Neue Deutsche Welle","Podcast","Indie Rock","G-Funk","Dubstep","Garage Rock","Psybient"
];

const pictureKinds = [
    "Other", "32x32 pixels 'file icon'", "Other file icon",
    "Cover (front)", "Cover (back)", "Leaflet page", "Media (e.g. lable side of CD)",
    "Lead artist/lead performer/soloist", "Artist/performer", "Conductor", "Band/Orchestra",
    "Composer", "Lyricist/text writer", "Recording Location", "During recording",
    "During performance", "Movie/video screen capture", "A bright coloured fish", "Illustration",
    "Band/artist logotype", "Publisher/Studio logotype"
];

const decoders = [
    new TextDecoder("iso-8859-1"),
    new TextDecoder("utf-16"),
    new TextDecoder("utf-16be"),
    new TextDecoder("utf-8")
];

const id3v2String = function(fieldName) {
    return function(offset, fileView, flags, version, size, data) {
        var encoding = fileView.getUint8(offset);
        offset++;
        var buffer = fileView.block();
        var start = fileView.start;
        var nullLength = (encoding === 1 || encoding === 2) ? 2 : 1;
        var length = distanceUntilNull(offset - start, buffer, size - 1, nullLength);

        if (length > 0) {
            var strBytes = new Uint8Array(buffer.buffer, offset - start, length);
            var decoder = decoders[encoding];

            if (decoder) {
                var result = decoder.decode(strBytes).trim();

                if (result.length > 512) {
                    result = result.slice(0, 512);
                }

                if (typeof fieldName === "function") {
                    fieldName(data, result);
                } else {
                    data[fieldName] = result;
                }
            }
        }
    };
};

const distanceUntilNull = function(offset, buffer, maxLength, nullLength) {
    for (var j = 0; j < maxLength; j += nullLength) {
        var i = offset + j;
        if (buffer[i] === 0 && (nullLength === 2 ? buffer[i + 1] === 0 : true)) {
            return j;
        }
    }
    return maxLength;
};

const rnumdenom = /\s*(\d+)\s*\/\s*(\d+)/;
const tagMap = {};


tagMap[0x545031|0] = tagMap[0x54504531|0] = id3v2String("artist");
tagMap[0x545432|0] = tagMap[0x54495432|0] = id3v2String("title");
tagMap[0x54414C|0] = tagMap[0x54414C42|0] = id3v2String("album");
tagMap[0x544d4f4f|0] = id3v2String("mood");
tagMap[0x545332|0] = tagMap[0x54534F32|0] = tagMap[0x545032|0] = tagMap[0x54504532|0] = id3v2String("albumArtist");
tagMap[0x54524B|0] = tagMap[0x5452434B|0] = id3v2String(function(data, result) {
    var m = rnumdenom.exec(result);
    if (m) {
        data.trackNumber = +m[1];
        data.trackCount = +m[2];
    } else {
        data.trackNumber = +result;
        data.trackCount = -1;
    }
});
tagMap[0x545041|0] = tagMap[0x54504F53|0] = id3v2String(function(data, result) {
    var m = rnumdenom.exec(result);
    if (m) {
        data.discNumber = +m[1];
        data.discCount = +m[2];
    } else {
        data.discNumber = +result;
        data.discCount = -1;
    }
});
tagMap[0x544350|0] = tagMap[0x54434D50|0] = id3v2String(function(data, result) {
    data.compilationFlag = result === "1";
});

tagMap[0x544250|0] = tagMap[0x5442504d|0] = id3v2String(function(data, result) {
    data.beatsPerMinute = +result;
});

tagMap[0x545945|0] = tagMap[0x54594552|0] = id3v2String(function(data, result) {
    data.year = +result;
});

const rgenre = /\((\d+)\)/g;
tagMap[0x54434f|0] = tagMap[0x54434f4e|0] = id3v2String(function(data, result) {
    var lastIndex = 0;
    var genres = {};
    var m;
    while (m = rgenre.exec(result)) {
        lastIndex = rgenre.lastIndex;
        var genre = id3v1Genres[+m[1]];

        if (!Array.isArray(genre)) {
            genre = [genre];
        }

        for (var i = 0; i < genre.length; ++i) {
            genres[genre[i].toLowerCase()] = genre[i];
        }
    }

    var rest = result.slice(lastIndex).trim();

    if (rest) {
        var multi = rest.split(/\s*\/\s*/g);
        for (var i = 0; i < multi.length; ++i) {
            var genre = multi[i].trim();
            genres[genre.toLowerCase()] = genre;
        }
    }

    data.genres = Object.keys(genres).map(function(key) {
        return genres[key];
    });
});

tagMap[0x504943|0] = tagMap[0x41504943|0] = function(offset, fileView, flags, version, size, data) {
    var originalOffset = offset;
    var encoding = fileView.getUint8(offset);
    offset++;
    var type;
    var buffer = fileView.block();
    var start = fileView.start;
    var pictureKind = -1;
    var decoder = decoders[encoding];

    if (!decoder) return;

    var nullLength = (encoding === 1 || encoding === 2) ? 2 : 1;

    if (version <= 2) {
        type = "image/" + decoder.decode(new Uint8Array(buffer.buffer, offset - start, 3));
        offset += 3;
    } else {
        var length = distanceUntilNull(offset - start, buffer, size - (offset - originalOffset), 1);
        var typeString = decoder.decode(new Uint8Array(buffer.buffer, offset - start, length)).toLowerCase();
        offset += (length + 1);

        if (typeString.indexOf("/") === -1) {
            if (/jpg|jpeg|png/.test(typeString)) {
                type = "image/" + typeString;
            } else {
                return;
            }
        } else {
            type = typeString.toLowerCase();
        }
    }

    pictureKind = fileView.getUint8(offset);
    offset++;

    var length = distanceUntilNull(offset - start, buffer, size - (offset - originalOffset), nullLength);
    var description = decoder.decode(new Uint8Array(buffer.buffer, offset - start, length));
    offset += (length + nullLength);

    var dataLength = size - (offset - originalOffset);
    var start = fileView.start + offset;

    var pictures = data.pictures;
    if (!pictures) {
        pictures = [];
        data.pictures = pictures;
    }

    var data;
    if (flags.hasBeenUnsynchronized) {
        data = new Uint8Array(dataLength);
        var actualLength = 0;
        for (var j = 0; j < dataLength; ++j) {
            var i = offset - fileView.start + j;
            var value = buffer[i];
            if (value === 0xFF &&
                ((i + 1) < buffer.length) &&
                buffer[i + 1] === 0x00) {
                ++j;
            }
            data[actualLength] = value;
            actualLength++;
        }
        if (actualLength !== dataLength) {
            data = new Uint8Array(data.buffer, offset - fileView.start, actualLength);
        }
    } else {
        data = new Uint8Array(buffer.buffer, offset - fileView.start, dataLength);
    }

    var tag = jsmd5.MD5(data);
    var dataBlob = new Blob([data], {type: type});

    pictures.push({
        tag: tag,
        blob: dataBlob,
        blobUrl: null,
        image: null,
        pictureKind: pictureKinds[pictureKind],
        description: description
    });
};

const hex8 = "[0-9A-F]{8}";
const hex8Capture = "([0-9A-F]{8})";
const hex16 = "[0-9A-F]{16}";
const riTunesGapless = new RegExp([hex8, hex8Capture, hex8Capture, hex16, hex8, hex8, hex8, hex8, hex8, hex8, hex8].join(" "));
tagMap[0x434f4d4d|0] = tagMap[0x434f4d|0] = function(offset, fileView, flags, version, size, data) {
    var originalOffset = offset;
    var encoding = fileView.getUint8(offset);
    var buffer = fileView.block();
    offset++;
    var language = decoders[0].decode(new Uint8Array(buffer.buffer, offset - fileView.start, 3));
    offset += 3;

    var decoder = decoders[encoding];
    if (!decoder) return;

    var nullLength = (encoding === 1 || encoding === 2) ? 2 : 1;
    var length = distanceUntilNull(offset - fileView.start, buffer, size - 4, nullLength);
    var key = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));

    offset += (length + nullLength);
    length = distanceUntilNull(offset - fileView.start, buffer, (size - (offset - originalOffset)), nullLength);
    var value = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));

    if (key === "iTunSMPB" || key === "") {
        var matches = riTunesGapless.exec(value.trim());
        if (matches) {
            data.encoderDelay = parseInt(matches[1], 16);
            data.encoderDelay = Math.min(65536, Math.max(0, data.encoderDelay));
            data.encoderPadding = parseInt(matches[2], 16);
            data.encoderPadding = Math.min(65536, Math.max(0, data.encoderPadding));
        }
    }
};

const synchIntAt = function(fileView, offset) {
    return (fileView.getUint8(offset) << 21) |
          (fileView.getUint8(offset + 1) << 14) |
          (fileView.getUint8(offset + 2) << 7) |
          fileView.getUint8(offset + 3);
};

const getFlags = function(fileView, offset, version) {
    var tagAlterPreservation = false;
    var fileAlterPreservation = false;
    var readOnly = false;
    var containsGroupInfo = false;
    var isCompressed = false;
    var isEncrypted = false;
    var hasBeenUnsynchronized = false;
    var hasDataLengthIndicator = false;

    if (version >= 3) {
        var bits = fileView.getUint16(offset);
        tagAlterPreservation = util.bit(bits, 14);
        fileAlterPreservation = util.bit(bits, 13);
        readOnly = util.bit(bits, 12);
        containsGroupInfo = util.bit(bits, 6);
        isCompressed = util.bit(bits, 3);
        isEncrypted = util.bit(bits, 2);
        hasBeenUnsynchronized = util.bit(bits, 1);
        hasDataLengthIndicator = util.bit(bits, 0);
    }

    return {
        tagAlterPreservation: tagAlterPreservation,
        fileAlterPreservation: fileAlterPreservation,
        readOnly: readOnly,
        containsGroupInfo: containsGroupInfo,
        isCompressed: isCompressed,
        isEncrypted: isEncrypted,
        hasBeenUnsynchronized: hasBeenUnsynchronized,
        hasDataLengthIndicator: hasDataLengthIndicator
    };
};

const getMainFlags = function(fileView, offset, version) {
    var bits = fileView.getUint8(offset + 5);

    var hasBeenUnsynchronized = util.bit(bits, 7);
    var isExtended = util.bit(bits, 6);
    var isExperimental = util.bit(bits, 5);
    var hasFooter = util.bit(bits, 4);

    return {
        hasBeenUnsynchronized: hasBeenUnsynchronized,
        isExtended: isExtended,
        isExperimental: isExperimental,
        hasFooter: hasFooter,
        invalidBits: (bits & 0xF) !== 0
    };
};

const parseBasicInfo = function(fileView) {
    return demux("mp3", fileView, true, 262144).then(function(metadata) {
        if (!metadata) return null;
        return {
            sampleRate: metadata.sampleRate,
            channels: metadata.channels,
            duration: metadata.duration
        };
    });
};

const parseId3v2Data = function(data, fileView, offset) {
    var id3MetadataSize = synchIntAt(fileView, offset + 6);
    var version = fileView.getUint8(offset + 3);
    var mainFlags = getMainFlags(fileView, offset);
    var blockRead = Promise.resolve();
    if (!(2 <= version && version <= 4) || mainFlags.invalidBits) {
        return;
    }

    if (offset + id3MetadataSize + 10 + 3 > fileView.end) {
        blockRead = fileView.readBlockOfSizeAt(id3MetadataSize + 8192 + 3, offset);
    }

    return blockRead.then(function() {
        offset += 10;

        var end = offset + id3MetadataSize;
        var tagShift = version > 2 ? 0 : 8;
        var tagSize = version > 2 ? 4 : 3;
        var headerSize = version > 2 ? 10 : 6;

        if (mainFlags.isExtended) {
            offset += synchIntAt(fileView, offset);
        }

        while (offset + headerSize < end) {
            var tag = (fileView.getUint32(offset) >>> tagShift)|0;
            offset += tagSize;

            if (tag === 0) {
                continue;
            }

            var size = version > 3 ? synchIntAt(fileView, offset) : (fileView.getUint32(offset) >>> tagShift);
            offset += tagSize;
            var flags = getFlags(offset);
            if (version > 2) offset += 2;

            if (flags.hasDataLengthIndicator) {
                size = synchIntAt(fileView, offset);
                offset += 4;
            }

            flags.hasBeenUnsynchronized = flags.hasBeenUnsynchronized || mainFlags.hasBeenUnsynchronized;

            if (flags.hasBeenUnsynchronized && !flags.hasDataLengthIndicator) {
                var buffer = fileView.block();
                var start = fileView.start;
                for (var j = 0; j < size; ++j) {
                    var i = offset + j - start;
                    if (buffer[i] === 0xFF && buffer[i + 1] === 0) {
                        size++;
                    }
                }
            }

            var handler = tagMap[tag];

            if (handler) {
                handler(offset, fileView, flags, version, size, data);
            }

            offset += size;
        }

        if (mainFlags.hasFooter) {
            offset += 10;
        }

        while (offset + headerSize < fileView.end) {
            var tag = fileView.getUint32(offset);
            if ((tag >>> 8) === ID3) {
                return parseId3v2Data(data, fileView, offset);
            } else if (tag !== 0) {
                break;
            }
            offset += 4;
        }
    });
};

const getId3v1String = function(fileView, offset) {
    var buffer = fileView.block();
    var length = 30;
    for (var i = 0; i < 30; ++i) {
        if (buffer[offset + i - fileView.start] === 0) {
            length = i;
            break;
        }
    }
    var decoder = decoders[0];
    return decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));
};

const parseId3v1Data = function(data, fileView) {
    var start = fileView.file.size - 128;
    return fileView.readBlockOfSizeAt(128, start).then(function() {
        var offset = start;
        var decoder = decoders[0];
        var buffer = fileView.block();
        if (((fileView.getUint32(offset) >>> 8)|0) === TAG) {
            offset += 3;
            var title = getId3v1String(fileView, offset);
            offset += 30;
            var artist = getId3v1String(fileView, offset);
            offset += 30;
            var album = getId3v1String(fileView, offset);
            offset += 30;
            var year = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, 4));
            offset += 4;
            var comment = fileView.getUint16(offset + 28);
            var trackIndex = -1;
            if ((comment & 0xFF00) === 0) {
                trackIndex = comment & 0xFF;
            }
            offset += 30;
            var genre = id3v1Genres[fileView.getUint8(offset)];
            data.title = title;
            data.artist = artist;
            data.album = album;
            data.year = +year;

            if (trackIndex !== -1) {
                data.trackIndex = trackIndex;
            }
            data.genres = Array.isArray(genre) ? genre.slice() : [genre];
        }
    });
};

const parseMp3Metadata = function(data, fileView) {
    return parseBasicInfo(fileView).then(function(basicInfo) {
        if (basicInfo) data.basicInfo = basicInfo;
        const length = 16384;
        return fileView.readBlockOfSizeAt(length, 0).then(function() {
            if (fileView.end < length) return null;
            var header = 0;
            var buffer = fileView.block();

            for (var i = 0; i < length; ++i) {
                header = ((header << 8) | buffer[i]) | 0;
                if ((header >>> 8) === ID3) {
                    var maybeId3v2 = parseId3v2Data(data, fileView, i - 3);
                    if (maybeId3v2) {
                        return maybeId3v2;
                    }
                }
            }

            return parseId3v1Data(data, fileView);
        }).return(data);
    });
};

module.exports = parseMp3Metadata;

},{"audio/demuxer":12,"lib/jsmd5":19,"lib/util":23}],25:[function(require,module,exports){
"use strict";

var Resampler = require("audio/Resampler");

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

const allocResampler = function(channels, from, to, quality) {
    quality = quality || 0;
    var key = channels + " " + from + " " + to;
    var entry = resamplers[key];
    if (!entry) {
        entry = resamplers[key] = {
            allocationCount: 2,
            instances: [new Resampler(channels, from, to, quality), new Resampler(channels, from, to, quality)]
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new Resampler(channels, from, to, quality));
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

},{"audio/Resampler":9}]},{},[10])(10)
});