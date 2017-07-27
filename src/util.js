import {console, Uint8Array, Uint16Array,
         Int32Array, FileReader, DataView, TextDecoder, TextEncoder, crypto,
         performance, Proxy, Symbol, indexedDB, XMLHttpRequest} from "platform/platform";
import HttpStatusError from "errors/HttpStatusError";
import {CancellationError} from "utils/CancellationToken";

/* eslint-disable no-invalid-this */

let isDevelopment = true;
let timers = null;

export const setIsDevelopment = function(isIt) {
    isDevelopment = isIt;
};

export const setTimers = function(theTimers) {
    timers = theTimers;
};

export const queryString = function(obj) {
    return Object.keys(obj).map(key => `${key}=${obj[key]}`).join(`&`);
};

export const combineClasses = function(a, b) {
    if (!a) return b;
    if (Array.isArray(a)) return a.concat(b);
    return [a].concat(b);
};

export const arrayEquals = function(arrayA, arrayB) {
    if (arrayA === arrayB) return true;
    if (arrayA.length !== arrayB.length) return false;
    for (let i = 0; i < arrayA.length; ++i) {
        if (arrayA[i] !== arrayB[i]) {
            return false;
        }
    }
    return true;
};

export const toFunction = function(value) {
    if (typeof value === `function`) return value;
    return function() {
        return value;
    };
};

export const ensureArray = function(val) {
    if (!Array.isArray(val)) {
        val = [val];
    }
    return val;
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
}());

export const readBit = function(number, offset) {
    return bits(number, offset, 1) === 1;
};

export const truncateUp = function(num) {
    return num < 0 ? Math.floor(num) : Math.ceil(num);
};

export const toTimeString = function(secs) {
    if (!isFinite(secs) || secs === null || secs === undefined) return ``;
    const sign = secs < 0 ? -1 : 1;
    secs = Math.floor(Math.abs(secs));
    let hours, minutes, seconds;

    const days = (secs / 86400) >> 0;
    hours = (secs % 86400 / 3600) >> 0;
    minutes = (secs % 3600 / 60) >> 0;
    seconds = (secs % 60);
    seconds = seconds < 10 ? `0${seconds}` : seconds;
    minutes = minutes < 10 ? `0${minutes}` : minutes;
    hours = hours && hours < 10 ? `0${hours}` : hours;

    return `${(sign === -1 ? `-` : ``) + (days ? `${days} - ` : ``) + (hours ? `${hours}:` : ``) +
        minutes}:${seconds}`;
};

export const shortNumber = function(num) {
    num = +num;
    const sign = num < 0 ? `-` : ``;
    num = Math.abs(num);
    if (num < 1e3) return `${sign + num}`;
    if (num < 1e6) return `${sign + (Math.round(num / 1e2) / 1e1).toFixed(1)}k`;
    if (num < 1e9) return `${sign + (Math.round(num / 1e5) / 1e1).toFixed(1)}m`;
    if (num < 1e12) return `${sign + (Math.round(num / 1e8) / 1e1).toFixed(1)}g`;
    return sign + num.toExponential(0);
};

export const inherits = function(Child, Parent) {
    const hasProp = {}.hasOwnProperty;

    function T() {
        this.constructor = Child;
        this.constructor$ = Parent;
        for (const propertyName in Parent.prototype) {
            if (hasProp.call(Parent.prototype, propertyName) &&
                propertyName.charAt(propertyName.length - 1) !== `$`
           ) {
                this[`${propertyName}$`] = Parent.prototype[propertyName];
            }
        }
    }
    T.prototype = Parent.prototype;
    Child.prototype = new T();
    return Child.prototype;
};

export const throttle = function(callback, delay, ctx = null) {
    let timerId = -1;
    let callId = 0;

    return function(...args) {
        if (timerId !== -1) {
            timers.clearTimeout(timerId);
            timerId = -1;
        }
        const myCallId = ++callId;
        timerId = timers.setTimeout(() => {
            if (callId !== myCallId) return;
            callId = 0;
            timerId = -1;
            callback.call(ctx || this, ...args);
        }, delay);
    };
};

export const debounce = function(callback, delay) {
    let lastCall = 0;

    return function(...args) {
        const now = performance.now();
        const elapsed = now - lastCall;

        if (elapsed >= delay) {
            lastCall = now;
            return callback.call(this, ...args);
        }
        return null;
    };
};

export const callableEveryMs = function(callback, delay) {
    let lastCall = 0;

    return function(...args) {
        const now = performance.now();

        if (now - lastCall > delay) {
            lastCall = now;
            return callback.call(this, ...args);
        }
        return null;
    };
};

if (typeof Array.prototype.first !== `function`) {
    Array.prototype.first = function() {
        if (this.length > 0) {
            return this[0];
        }
        return null;
    };
}

if (typeof Array.prototype.last !== `function`) {
    Array.prototype.last = function() {
        const len = this.length;
        if (len > 0) {
            return this[len - 1];
        }
        return null;
    };
}

if (typeof Math.log10 !== `function`) {
    Math.log10 = function(v) {
        return Math.log(v) * Math.LOG10E;
    };
}

if (typeof Math.log2 !== `function`) {
    Math.log2 = function(v) {
        return Math.log(v) * Math.LOG2E;
    };
}

Array.prototype.toKeysObj = function() {
    let i = 0;
    const l = this.length;
    const ret = {};
    for (i = 0; i < l; ++i) {
        ret[this[i]] = null;
    }
    return ret;
};

export const IDENTITY = function(v) {
    return v;
};

export const buildConsecutiveRangesCompressed = function(array, callback) {
    if (typeof callback !== `function`) callback = IDENTITY;
    if (!array.length) return [];
    if (array.length === 1) {
        const val = callback(array[0]);
        return [[val, val]];
    }
    const ranges = [];
    let lastValue = callback(array[0]);
    let currentRange = [lastValue, lastValue];
    for (let i = 1; i < array.length; ++i) {
        const currentValue = callback(array[i]);
        if (currentValue === lastValue) continue;
        if (currentValue - 1 !== lastValue) {
            currentRange[1] = lastValue;
            ranges.push(currentRange);
            currentRange = [currentValue, currentValue];
        }
        lastValue = currentValue;
    }
    currentRange[1] = lastValue;
    ranges.push(currentRange);
    return ranges;
};

// TODO Broken if callback provided
// TODO Bad name, output is not in ranges
export const buildConsecutiveRanges = function(array, callback) {
    if (typeof callback !== `function`) callback = IDENTITY;
    if (!array.length) return [];
    if (array.length === 1) return [[array[0]]];
    const ranges = [];
    let prev = array[0];
    let currentRange = [prev];

    for (let i = 1; i < array.length; ++i) {
        const currentValue = callback(array[i]);
        const previousValue = callback(prev);
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

// E.g. Input: [2,3,4], 8
//      Output: [[0, 1], [5, 8]]
//
//      Input: [0, 1, 2, 4, 5, 10], 1000
//      Output: [[3, 3], [6,9], [11, 1000]]
export const buildInverseRanges = function(array, endIndex) {
    const inverseRanges = [];
    const ranges = buildConsecutiveRanges(array);
    if (!ranges.length) {
        return [[0, endIndex]];
    }
    let currentStart = ranges.first().first() === 0 ? -1 : 0;
    let currentEnd = -1;

    ranges.forEach((range) => {
        const rangeStart = range.first();
        const rangeEnd = range.last();

        if (rangeStart === rangeEnd) {
            if (currentStart === -1) {
                currentStart = rangeEnd + 1;
            } else {
                inverseRanges.push([currentStart, rangeStart === 0 ? currentStart : rangeStart - 1]);
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

export const SORT_NUMBER_ASC = function(a, b) {
    return a - b;
};

export const once = function(eventTarget, eventName, handler) {
    eventTarget.addEventListener(eventName, function handle(...args) {
        try {
            eventTarget.removeEventListener(eventName, handle, false);
        } finally {
            handler.call(this, ...args);
        }


    }, false);
};

export const checkSize = function(expectedSize, resultSize) {
    if (expectedSize !== resultSize) {
        let e;
        if (resultSize === 0) {
            e = new Error(`file not found`);
            e.name = `NotFoundError`;
        } else {
            e = new Error(`read failed`);
            e.name = `NotReadableError`;
        }
        return e;
    }
    return null;
};

export const readAsArrayBuffer = function(file/* , cancellationToken*/) {
    const expectedSize = file.size;

    return new Promise((resolve, reject) => {
        let reader = new FileReader();

        once(reader, `load`, (e) => {
            reader = null;
            file = null;
            const {result} = e.target;
            e = checkSize(expectedSize, result.byteLength);
            if (e) {
                reject(e);
            } else {
                resolve(result);
            }
        });
        once(reader, `error`, function() {
            reader = null;
            file = null;
            const e = new Error(this.error.message);
            e.name = this.error.name;
            reject(e);
        });
        reader.readAsArrayBuffer(file);
    });
};

export class ExtendableError extends Error {
    get name() {
        return this.constructor.name;
    }
}

export const formatTagString = function(str) {
    const ret = str.replace(/[\u0000-\u001F]+/g, ``).trim();
    if (ret.length > 512) {
        return ret.slice(0, 512);
    }
    return ret;
};

export const indexOfCodePoint = function(string, codePoint, start) {
    if (start === undefined) start = 0;
    for (let i = start; i < string.length; ++i) {
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

const legacyListeners = Object.create(null);
let nextLegacyId = 0;
export const addLegacyListener = function(object, eventName, handler) {
    let id = object.__legacyId;
    if (id === undefined) {
        id = object.__legacyId = nextLegacyId++;
    }

    let eventCache = legacyListeners[eventName];

    if (!eventCache) {
        eventCache = legacyListeners[eventName] = Object.create(null);
    }

    let listeners = eventCache[id];

    if (!listeners) {
        listeners = eventCache[id] = [];
        object[`on${eventName}`] = function(e) {
            for (let i = 0; i < listeners.length; ++i) {
                listeners[i].call(this, e);
            }
        };
    }

    if (listeners.indexOf(handler) === -1) {
        listeners.push(handler);
    }
};

export const slugTitle = function(val) {
    return (`${val}`).toLowerCase().replace(/[^a-zA-Z0-9 _$-]/g, ``).
                            replace(/[_ -]/g, `-`).
                            replace(/-+/g, `-`).
                            replace(/^-|-$/g, ``);
};

export const removeLegacyListener = function(object, eventName, handler) {
    const eventCache = legacyListeners[eventName];

    if (!eventCache) return;

    const listeners = eventCache[object.__legacyId];

    if (!listeners) return;

    const index = listeners.indexOf(handler);

    if (index >= 0) {
        listeners.splice(index, 1);
    }
};

export const stripBinaryBom = function(str) {
    return str.replace(/^(\xff\xfe|\xfe\xff)/, ``);
};

// Dom errors are not errors :'(
export const asError = function(value) {
    if (value instanceof Error) return value;
    const ret = new Error();
    ret.message = `${value ? value.message : value}`;
    return ret;
};

export const iDbPromisifyCursor = function(cursor, callback) {
    return new Promise((resolve, reject) => {
        cursor.onerror = function(event) {
            reject(asError(event.target.transaction.error || cursor.error));
        };

        cursor.onsuccess = async function(event) {
            if (!event.target.result) {
              resolve();
            } else {
              try {
                const finished = await callback(event.target.result);
                if (finished === true) {
                  resolve();
                }
              } catch (e) {
                reject(e);
              }
            }
        };
    });
};

const MAX_LIMIT = Math.pow(2, 31);

const _promisifyCursor = function(ee, onlyKeys,
                                                {limit = MAX_LIMIT, includePrimaryKey = false, primaryKeyValue = null, keyValue = null} =
                                                {limit: MAX_LIMIT,
                                                  includePrimaryKey: false,
                                                  primaryKeyValue: null,
                                                  keyValue: null}) {
    const results = [];
    return new Promise((resolve, reject) => {
        ee.onerror = function(event) {
            reject(asError(event.target.transaction.error || ee.error));
        };
        ee.onsuccess = function(event) {
            try {
              const {result} = event.target;
              if (!result || results.length >= limit) {
                resolve(results);
              } else {
                if (onlyKeys) {
                  if (includePrimaryKey) {
                    const {key, primaryKey} = result;
                    results.push({key, primaryKey});
                  } else {
                    results.push(result.key);
                  }
                  result.continue();
                } else {

                  if (primaryKeyValue !== null) {
                    const cmp = indexedDB.cmp(primaryKeyValue, result.primaryKey);
                    if (cmp > 0) {
                      result.continuePrimaryKey(keyValue, primaryKeyValue);
                    } else if (cmp === 0) {
                      result.continue();
                    } else {
                      results.push(result.value);
                      result.continue();
                    }
                  } else {
                    results.push(result.value);
                    result.continue();
                  }
                }
              }
            } catch (e) {
              reject(e);
            }
        };
    });
};

export const promisifyCursorContinuePrimaryKey = function(ee, opts) {
    return _promisifyCursor(ee, false, opts);
};

export const promisifyKeyCursorContinue = function(ee, opts) {
    return _promisifyCursor(ee, true, opts);
};

export const animationPromisify = function(animation) {
  return new Promise((resolve) => {
    function finished() {
      animation.oncancel = null;
      animation.onfinish = null;
      resolve();
    }
    animation.oncancel = finished;
    animation.onfinish = finished;
  });
};

export const reverseString = (function() {
    let utf16decoder = null;
    return function(str) {
        if (utf16decoder === null) utf16decoder = new TextDecoder(`utf-16`);

        const l = str.length;
        if (l <= 1) return str;
        const ret = new Uint8Array(str.length * 2 + 2);
        const view = new Uint16Array(ret.buffer);
        view[0] = 0xfeff;
        const l2 = Math.ceil(l / 2);
        for (let i = 0; i < l2; ++i) {
            const lastIndex = l - 1 - i;
            view[lastIndex + 1] = str.charCodeAt(i);
            view[i + 1] = str.charCodeAt(lastIndex);
        }
        return utf16decoder.decode(view);
    };
}());

export const titleCase = function(str) {
    if (typeof str !== `string`) str = `${str}`;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const {assign} = Object;

export const mergeObject = function(base, obj) {
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        base[key] = obj[key];
    }
};

export const getFirstWord = function(str) {
    for (let i = 0; i < str.length; ++i) {
        if (str.charCodeAt(i) === 0x20) {
            return str.slice(0, i);
        }
    }
    return str;
};

export const getLastWord = function(str) {
    for (let i = str.length - 1; i >= 0; --i) {
        if (str.charCodeAt(i) === 0x20) {
            return str.slice(i + 1);
        }
    }

    return str;
};

export function noop() {
    // NOOP
}

const textEncoder = new TextEncoder(`utf-8`);
const padding = [`00000000`, `0000000`, `000000`, `00000`, `0000`, `000`, `00`, `0`, ``];
export async function sha1HexString(text) {
    const hash = await sha1Binary(text);
    return hexString(hash);
}

export function sha1Binary(text) {
  const buffer = textEncoder.encode(text);
  return crypto.subtle.digest(`SHA-1`, buffer);
}

export function hexString(arrayBuffer) {
    if (arrayBuffer.byteLength === 20) {
        const view = new DataView(arrayBuffer);
        const a = view.getUint32(0, false).toString(16);
        const b = view.getUint32(4, false).toString(16);
        const c = view.getUint32(8, false).toString(16);
        const d = view.getUint32(12, false).toString(16);
        const e = view.getUint32(16, false).toString(16);
        return (padding[a.length] + a) +
              (padding[b.length] + b) +
              (padding[c.length] + c) +
              (padding[d.length] + d) +
              (padding[e.length] + e);
    } else {
        let ret = ``;
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < view.length; ++i) {
            const byte = view[i].toString(16);
            ret += (padding[byte.length] + byte);
        }
        return ret;
    }
}

const thrower = function() {
    throw new Error(`unsupported operation`);
};

export function getterProxyHandlers(getter, has = thrower) {
    return {
        get: getter,
        set: thrower,
        isExtensible: thrower,
        getPrototypeOf: thrower,
        setPrototypeOf: thrower,
        preventExtensions: thrower,
        getOwnPropertyDescriptor: thrower,
        defineProperty: thrower,
        has,
        deleteProperty: thrower,
        ownKeys: thrower,
        apply: thrower,
        constructr: thrower
    };
}

export function setterProxyHandlers(setter) {
    return {
        get: thrower,
        set: setter,
        isExtensible: thrower,
        getPrototypeOf: thrower,
        setPrototypeOf: thrower,
        preventExtensions: thrower,
        getOwnPropertyDescriptor: thrower,
        defineProperty: thrower,
        has: thrower,
        deleteProperty: thrower,
        ownKeys: thrower,
        apply: thrower,
        constructr: thrower
    };
}

export function ownPropOr(obj, prop, defaultValue) {
    return obj.hasOwnProperty(prop) ? obj[prop] : defaultValue;
}

const isNoUndefinedProxySymbol = Symbol();
const throwsOnUndefinedHandlers = getterProxyHandlers((target, name) => {
    if (name === isNoUndefinedProxySymbol) return true;
    if (typeof target[name] === `undefined` &&
        !target.hasOwnProperty(name)) {
        if (isDevelopment) {
            console.warn(`property .${name} doesn't exist on object`);
        }
        return undefined;
    }
    return target[name];
}, (target, name) => name in target);

export const noUndefinedGet = function(target) {
    if (!isDevelopment) {
        return Object(target);
    }
    if (target && target[isNoUndefinedProxySymbol]) return target;
    return new Proxy(Object(target), throwsOnUndefinedHandlers);
};

export function gcd(a, b) {
    if ( ! b) {
        return a;
    }

    return gcd(b, a % b);
}

export const _ = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            const val = v.${name};
            return typeof val === "function" ? v.${name}() : val;`;
        const ret = new Function(`v`, code);
        cache.set(name, ret);
        return ret;
    }
});

export const _call = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
              return v.${name}(...args);
            };
        `;

        const ret = new Function(`...args`, code);
        cache.set(name, ret);
        return ret;
    }
});

export const _set = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
              v.${name} = value;
            };
        `;

        const ret = new Function(`value`, code);
        cache.set(name, ret);
        return ret;
    }
});

export const _equals = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
                const val = v.${name};
                return (typeof val === "function" ? v.${name}() : val) === rhs
            };
        `;

        const ret = new Function(`rhs`, code);
        cache.set(name, ret);
        return ret;
    }
});

export const equals = function(arg) {
    return function(v) {
        return v === arg;
    };
};

export const delay = function(ms) {
    return new Promise((resolve) => {
        timers.setTimeout(resolve, ms);
    });
};

export function roundSampleTime(sample, sampleRate) {
    while ((sample / sampleRate * sampleRate) !== sample) {
        sample++;
    }
    return sample;
}

export function toCorsUrl(url) {
  return `${self.location.origin}/cors?url=${encodeURIComponent(url)}`;
}

export function ajaxGet(url, cancellationToken,
                            {responseType = `json`} = {responseType: `json`}) {
    return new Promise(((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 15000;
        xhr.responseType = responseType;

        function error() {
            if (cancellationToken.isCancelled()) {
              reject(new CancellationError());
              return;
            }
            reject(new HttpStatusError(408, `timeout`));
        }

        xhr.addEventListener(`progress`, () => {
            if (cancellationToken.isCancelled()) {
              xhr.abort();
              reject(new CancellationError());

            }
        });
        xhr.addEventListener(`load`, () => {
            if (cancellationToken.isCancelled()) {
              reject(new CancellationError());
              return;
            }

            if (xhr.status === 0 || xhr.status > 299) {
                reject(new HttpStatusError(xhr.status, xhr.response));
                return;
            }

            if (xhr.response) {
              resolve(xhr.response);
            } else {
              reject(new HttpStatusError(500, `wrong .responseType`));
            }
        }, false);

        xhr.addEventListener(`abort`, () => {
          reject(new CancellationError());
        });
        xhr.addEventListener(`timeout`, error);
        xhr.addEventListener(`error`, () => {
            if (cancellationToken.isCancelled()) {
              reject(new CancellationError());
              return;
            }
            reject(new HttpStatusError(0, `network error`));
        });

        xhr.open(`GET`, url);
        if (responseType === `json`) {
          xhr.setRequestHeader(`Accept`, `application/json`);
        }
        xhr.send(null);
    }));
}

const UNKNOWN = `Unknown`;
const separatorPattern = /(.+?)\s*-\s*(.+)/;
export const stripExtensionPattern = new RegExp(`\\.(?:[a-z0-9_\\-]{1,8})$`, `i`);
export const trackInfoFromFileName = function(inputFileName) {
    const fileName = inputFileName.replace(stripExtensionPattern, ``);
    const matches = fileName.match(separatorPattern);
    let artist, title;

    if (!matches) {
        title = capitalize(fileName);
        artist = UNKNOWN;
    } else {
        artist = capitalize(matches[1]) || UNKNOWN;
        title = capitalize(matches[2]) || UNKNOWN;
    }

    return {
        artist,
        title
    };
};
