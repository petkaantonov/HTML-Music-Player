(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.AudioPlayer = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
self.EventEmitter = require("events");

var ChannelMixer = require("./ChannelMixer");
var sniffer = require("./sniffer");
var codec = require("./codec");
var demuxer = require("./demuxer");
var FileView = require("./FileView");
var seeker = require("./seeker");
var pool = require("./pool");

var allocResampler = pool.allocResampler;
var allocDecoderContext = pool.allocDecoderContext;
var freeResampler = pool.freeResampler;
var freeDecoderContext = pool.freeDecoderContext;


const channelMixer = new ChannelMixer(2);
var hardwareSampleRate = 0;
var bufferTime = 0;
var resamplerQuality = 0;

const audioPlayerMap = Object.create(null);


const message = function(nodeId, methodName, args, transferList) {
    if (transferList === undefined) transferList = [];
    args = Object(args);
    transferList = transferList.map(function(v) {
        if (v.buffer) return v.buffer;
        return v;
    });
    postMessage({
        nodeId: nodeId,
        methodName: methodName,
        args: args,
        transferList: transferList
    }, transferList);
};

self.onmessage = function(event) {
    var data = event.data;
    var receiver = data.nodeId;
    var args = data.args;
    if (receiver === -1) {
        if (data.methodName === "audioConfiguration") {
            resamplerQuality = args.resamplerQuality || 0;
            channelMixer.setChannels(args.channels);
            hardwareSampleRate = args.sampleRate;
            if (args.bufferTime) {
                if (bufferTime) {
                    throw new Error("cannot change buffertime");
                } else {
                    bufferTime = args.bufferTime;
                }
            }
        } else if (data.methodName === "register") {
            audioPlayerMap[args.id] = new AudioPlayer(args.id);
        }
    } else {
        var obj = audioPlayerMap[receiver];
        obj[data.methodName].call(obj, data.args, data.transferList);
    }
};

function AudioPlayer(id, parent) {
    EventEmitter.call(this);
    this.id = id;
    this.ended = false;
    this.decoderContext = null;
    this.blob = null;
    this.offset = 0;
    this.codecName = "";
    this.destroyed = false;
    this.metadata = null;
    this.fileView = null;
    this.resampler = null;
    this.errored = this.errored.bind(this);
    this.replacementPlayer = null;
    this.replacementSpec = null;
    this.parent = parent || null;
}
AudioPlayer.prototype = Object.create(EventEmitter.prototype);
AudioPlayer.prototype.constructor = AudioPlayer;

AudioPlayer.prototype.transfer = function(other) {
    if (this.decoderContext) {
        freeDecoderContext(this.codecName, this.decoderContext);
        this.decoderContext = null;
    }
    if (this.resampler) {
        freeResampler(this.resampler);
        this.resampler = null;
    }
    this.ended = other.ended;
    this.blob = other.blob;
    this.fileView = other.fileView;
    this.metadata = other.metadata;
    this.codecName = other.codecName;
    this.decoderContext = other.decoderContext;
    this.offset = other.offset;
    this.resampler = other.resampler;

    other.decoderContext = null;
    other.resampler = null;
    other.fileView = null;
    other.blob = null;
    other.metadata = null;
    other.destroy();
};

AudioPlayer.prototype.getBlobSize = function() {
    return this.blob.size;
};

AudioPlayer.prototype.sendMessage = function(name, args, transferList) {
    if (this.destroyed) return;
    if (this.parent == null)  {
        message(this.id, name, args, transferList);
    } else {
        this.parent.messageFromReplacement(name, args, transferList, this);
    }
};

AudioPlayer.prototype.messageFromReplacement = function(name, args, transferList, sender) {
    if (args.requestId === undefined) {
        this.destroyReplacement();
        this.passError(args.message, args.stack);
        return;
    } else if (this.replacementSpec.requestId !== args.requestId ||
        this.replacementPlayer !== sender) {
        sender.destroy();
        return message(-1, "_freeTransferList", args, transferList);
    }

    switch (name) {
    case "_error":
        this.destroyReplacement();
        this.passError(args.message, args.stack);
    break;

    case "_blobLoaded":
        this.replacementSpec.metadata = args.metadata;
        this.replacementPlayer.seek({
            requestId: args.requestId,
            count: this.replacementSpec.preloadBufferCount,
            time: this.replacementSpec.seekTime,
            isUserSeek: false
        }, this.replacementSpec.transferList);
    break;

    case "_seeked":
        var spec = this.replacementSpec;
        this.replacementSpec = null;
        this.transfer(this.replacementPlayer);
        this.replacementPlayer.parent = null;
        this.replacementPlayer = null;
        this.sendMessage("_replacementLoaded", {
            metadata: spec.metadata,
            requestId: spec.requestId,
            isUserSeek: args.isUserSeek,
            gaplessPreload: spec.gaplessPreload,
            baseTime: args.baseTime,
            count: args.count,
            channelCount: args.channelCount,
            info: args.info
        }, transferList);
    break;

    default:
        this.passError("unknown message from replacement: " + name, new Error().stack);
    break;
    }
};

AudioPlayer.prototype.destroyReplacement = function() {
    if (this.replacementPlayer) {
        var spec = this.replacementSpec;
        if (spec) {
            message(-1, "_freeTransferList", {}, spec.transferList);
            this.replacementSpec = null;
        }
        this.replacementPlayer.destroy();
        this.replacementPlayer = null;
    }
};

AudioPlayer.prototype.loadReplacement = function(args, transferList) {
    if (this.destroyed) return;
    this.destroyReplacement();
    try {
        this.replacementSpec = {
            requestId: args.requestId,
            blob: args.blob,
            seekTime: args.seekTime,
            transferList: transferList,
            metadata: null,
            preloadBufferCount: args.count,
            gaplessPreload: args.gaplessPreload
        };
        this.replacementPlayer = new AudioPlayer(-1, this);
        this.replacementPlayer.loadBlob(args);
    } catch (e) {
        this.destroyReplacement();
        this.passError(e.message, e.stack);
    }
};

AudioPlayer.prototype.destroy = function() {
    if (this.destroyed) return;
    this.parent = null;
    this.destroyReplacement();
    this.destroyed = true;
    delete audioPlayerMap[this.id];
    if (this.decoderContext) {
        freeDecoderContext(this.codecName, this.decoderContext);
        this.decoderContext = null;
    }
    if (this.resampler) {
        freeResampler(this.resampler);
        this.resampler = null;
    }
    this.fileView = null;
    this.codecName = "";
    this.decoderContext = this.blob = null;
    this.offset = 0;
    this.metadata = null;
    this.ended = false;
    this.removeAllListeners();
};

AudioPlayer.prototype.passError = function(errorMessage, stack, name) {
    this.sendMessage("_error", {
        message: errorMessage,
        stack: stack,
        name: name
    });
}

AudioPlayer.prototype.errored = function(e) {
    this.passError(e.message, e.stack, e.name);
};

AudioPlayer.prototype.gotCodec = function(codec, requestId) {
    try {
        if (this.destroyed) return;
        this.fileView = new FileView(this.blob);
        var metadata = demuxer(codec.name, this.fileView);
        if (!metadata) {
            return this.sendMessage("_error", {message: "Invalid " + codec.name + " file"});
        }
        this.decoderContext = allocDecoderContext(codec.name, codec.Context, {
            seekable: true,
            dataType: codec.Context.FLOAT,
            targetBufferLengthSeconds: bufferTime
        });

        this.metadata = metadata;
        this.decoderContext.start(metadata);
        this.decoderContext.on("error", this.errored);
        if (this.metadata.sampleRate !== hardwareSampleRate) {
            this.resampler = allocResampler(this.metadata.channels,
                                            this.metadata.sampleRate,
                                            hardwareSampleRate,
                                            resamplerQuality);
        } else {
            if (this.resampler) freeResampler(this.resampler);
            this.resampler = null;
        }

        this.offset = this.metadata.dataStart;
        this.sendMessage("_blobLoaded", {
            requestId: requestId,
            metadata: this.metadata
        });
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.loadBlob = function(args) {
    try {
        if (this.destroyed) return;
        if (this.decoderContext) {
            freeDecoderContext(this.codecName, this.decoderContext);
            this.decoderContext = null;
        }
        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
        }
        this.ended = false;
        this.resampler = this.fileView = this.decoderContext = this.blob = this.metadata = null;
        this.offset = 0;
        this.codecName = "";

        var blob = args.blob;
        if (!(blob instanceof Blob) && !(blob instanceof File)) {
            return this.sendMessage("_error", {message: "Blob must be a file or blob"});
        }

        var codecName = sniffer.getCodecName(blob);
        if (!codecName) {
            return this.sendMessage("_error", {message: "Codec not supported"});
        }
        this.codecName = codecName;
        var self = this;
        return codec.getCodec(codecName).then(function(codec) {
            self.blob = blob;
            self.gotCodec(codec, args.requestId);
        }).catch(function(e) {
            self.sendMessage("_error", {message: "Unable to load codec: " + e.message});
        });
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

const EMPTY_F32 = new Float32Array(0);
AudioPlayer.prototype._decodeNextBuffer = function(transferList, transferListIndex) {
    var offset = this.offset;
    var samplesNeeded = bufferTime * this.metadata.sampleRate;
    var bytesNeeded = Math.ceil(this.metadata.maxByteSizePerSample * samplesNeeded);
    var src = this.fileView.bufferOfSizeAt(bytesNeeded, offset);
    var srcStart = offset - this.fileView.start;

    var ret = {
        channels: new Array(channelMixer.getChannels()),
        length: 0,
        startTime: this.decoderContext.getCurrentSample() / this.metadata.sampleRate,
        endTime: 0
    };

    var self = this;
    var gotData = false;
    this.decoderContext.once("data", function(channels) {
        gotData = true;
        ret.length = channels[0].length;
        channels = channelMixer.mix(channels);

        for (var ch = 0; ch < channels.length; ++ch) {
            ret[ch] = new Float32Array(transferList[transferListIndex++]);
        }

        if (self.metadata.sampleRate !== hardwareSampleRate) {
            ret.length = self.resampler.getLength(ret.length);
            self.resampler.resample(channels, undefined, ret);
        } else {
            for (var ch = 0; ch < channels.length; ++ch) {
                var dst = ret[ch];
                var src = channels[ch];
                for (var i = 0; i < src.length; ++i) {
                    dst[i] = src[i];
                }
            }
        }
    });

    var srcEnd = this.decoderContext.decodeUntilFlush(src, srcStart);
    this.offset += (srcEnd - srcStart);

    if (!gotData) {
        this.decoderContext.end();
        this.ended = true;

        if (!gotData) {
            for (var ch = 0; ch < ret.channels.length; ++ch) {
                ret.channels[ch] = EMPTY_F32;
            }
        }
    }
    ret.endTime = ret.startTime + (ret.length / hardwareSampleRate);
    return ret;
};

AudioPlayer.prototype._fillBuffers = function(count, requestId, transferList) {
    if (!this.ended) {
        var result = {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };

        var transferListIndex = 0;
        for (var i = 0; i < count; ++i) {
            var decodeResult = this._decodeNextBuffer(transferList, transferListIndex);
            transferListIndex += decodeResult.channels.length;
            result.info.push({
                length: decodeResult.length,
                startTime: decodeResult.startTime,
                endTime: decodeResult.endTime
            })
            result.count++;

            if (this.ended) {
                result.trackEndingBufferIndex = i;
                break;
            }
        }

        return result;
    } else {
        return {
            requestId: requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };
    }
};

AudioPlayer.prototype.fillBuffers = function(args, transferList) {
    try {
        var requestId = args.requestId;
        var count = args.count;
        if (this.destroyed) {
            return this.sendMessage("_error", {message: "Destroyed"}, transferList);
        }
        if (!this.blob) {
            return this.sendMessage("_error", {message: "No blob loaded"}, transferList);
        }
        var result = this._fillBuffers(count, requestId, transferList);
        this.sendMessage("_buffersFilled", result, transferList);
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.seek = function(args, transferList) {
    try {
        var requestId = args.requestId;
        var count = args.count;
        var time = args.time;
        if (this.destroyed) {
            return this.sendMessage("_error", {message: "Destroyed"}, transferList);
        }
        if (!this.blob) {
            return this.sendMessage("_error", {message: "No blob loaded"}, transferList);
        }
        if (this.resampler) {
            this.resampler.end();
            this.resampler.start();
        }

        this.ended = false;
        var seekerResult = seeker(this.codecName, time, this.metadata, this.decoderContext, this.fileView);
        this.offset = seekerResult.offset;
        this.decoderContext.applySeek(seekerResult);
        var result = this._fillBuffers(count, requestId, transferList);
        result.baseTime = seekerResult.time;
        result.isUserSeek = args.isUserSeek;
        this.sendMessage("_seeked", result, transferList);
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
};

AudioPlayer.prototype.sourceEndedPing = function(args) {
    if (this.destroyed) return;
    try {
        this.sendMessage("_sourceEndedPong", {requestId: args.requestId});
    } catch (e) {
        this.passError(e.message, e.stack, e.name);
    }
}

// Preload mp3.
codec.getCodec("mp3").then(function() {
    self.postMessage({type: "ready"});
});

},{"./ChannelMixer":3,"./FileView":4,"./codec":6,"./demuxer":7,"./pool":8,"./seeker":9,"./sniffer":10,"events":1}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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
    size = Math.ceil(size);
    var start = Math.min(this.file.size - 1, Math.max(0, start));
    var end = Math.min(this.file.size, start + size);

    if (this.buffer && 
        (this.start <= start && end <= this.end)) {
        return this.buffer;
    }

    end = Math.min(this.file.size, start + size * 3);
    this.start = start;
    this.end = end;
    var reader = new FileReaderSync();
    var result = reader.readAsArrayBuffer(
            this.file.slice(this.start, this.end));
    this.buffer = new Uint8Array(result);
    return this.buffer;
};


module.exports = FileView;

},{}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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
},{}],7:[function(require,module,exports){
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
                maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
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

    var id3v1AtEnd = false;
    /* Takes way too long.
    var id3v1AtEnd = (view.getUint32(view.file.size - 128) >>> 8) === TAG;

    if (id3v1AtEnd) {
        dataEnd -= 128;
    }*/

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
                    maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
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

},{"./FileView":4}],8:[function(require,module,exports){
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

},{"./Resampler":5}],9:[function(require,module,exports){
"use strict";
const FileView = require("./FileView");
const Mp3SeekTable = require("./demuxer").Mp3SeekTable;

function seekMp3(time, metadata, context, fileView) {
    time = Math.min(metadata.duration, Math.max(0, time));
    var frames = ((metadata.duration * metadata.sampleRate) / metadata.samplesPerFrame)|0;
    var frame = (time / metadata.duration * frames) | 0;
    var currentTime = frame * (metadata.samplesPerFrame / metadata.sampleRate);
    // Target an earlier frame to build up the bit reservoir for the actual frame.
    var targetFrame = Math.max(0, frame - 9);
    // The frames are only decoded to build up the bit reservoir and should not be actually played back.
    var samplesToSkip = (frame - targetFrame) * metadata.samplesPerFrame;

    var offset;

    if (!metadata.vbr) {
        offset = (metadata.dataStart + targetFrame * metadata.averageFrameSize)|0;
    } else if (metadata.toc) {
        // Xing seek tables.
        frame = ((Math.round(frame / frames * 100) / 100) * frames)|0;
        currentTime = (frame + 1) * (metadata.samplesPerFrame / metadata.sampleRate);
        samplesToSkip = metadata.samplesPerFrame;
        targetFrame = frame;
        var tocIndex = Math.min(99, Math.round(frame / frames * 100)|0);
        var offsetPercentage = metadata.toc[tocIndex] / 256;
        offset = (metadata.dataStart + (offsetPercentage * (metadata.dataEnd - metadata.dataStart)))|0;
    } else {
        var table = metadata.seekTable;
        if (!table) {
            table = metadata.seekTable = new Mp3SeekTable();
        }
        table.fillUntil(time + (metadata.samplesPerFrame / metadata.sampleRate),
                metadata, fileView);

        // Trust that the seek offset given by VBRI metadata will not be to a frame that has bit
        // reservoir. VBR should have little need for bit reservoir anyway.
        if (table.isFromMetaData) {
            frame = table.closestFrameOf(frame);
            currentTime = (frame + 1) * (metadata.samplesPerFrame / metadata.sampleRate);
            samplesToSkip = metadata.samplesPerFrame;
            offset = table.offsetOfFrame(frame);
            targetFrame = frame;
        } else {
            offset = table.offsetOfFrame(targetFrame);
        }
    }

    if (targetFrame === 0) {
        samplesToSkip = metadata.encoderDelay;
    }

    return {
        time: currentTime,
        offset: Math.max(metadata.dataStart, Math.min(offset, metadata.dataEnd)),
        samplesToSkip: samplesToSkip,
        frame: targetFrame
    };
}

function seek(type, time, metadata, context, fileView) {
    if (type === "mp3") {
        return seekMp3(time, metadata, context, fileView);
    }
    throw new Error("unsupported type");
}

module.exports = seek;

},{"./FileView":4,"./demuxer":7}],10:[function(require,module,exports){
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

},{}]},{},[2])(2)
});