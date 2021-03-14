import HttpStatusError from "errors/HttpStatusError";
import Timers from "platform/Timers";
import TrackView from "tracks/TrackView";
import { AnyFunction, typedKeys } from "types/helpers";
import { CancellationError, CancellationToken } from "utils/CancellationToken";

/* eslint-disable no-invalid-this */

let isDevelopment: boolean = true;
let timers: Timers | null = null;

export const setIsDevelopment = function (isIt: boolean) {
    isDevelopment = isIt;
};

export const setTimers = function (theTimers: Timers) {
    timers = theTimers;
};

export const queryString = function (obj: Record<string, string>) {
    return Object.keys(obj)
        .map(key => `${key}=${obj[key]}`)
        .join(`&`);
};

export const arrayEquals = function (arrayA: any[], arrayB: any[]) {
    if (arrayA === arrayB) return true;
    if (arrayA.length !== arrayB.length) return false;
    for (let i = 0; i < arrayA.length; ++i) {
        if (arrayA[i] !== arrayB[i]) {
            return false;
        }
    }
    return true;
};

export const toFunction = function <T extends AnyFunction | any>(value: T): T extends AnyFunction ? T : () => T {
    if (typeof value === `function`) {
        return value as any;
    } else {
        return function () {
            return value;
        } as any;
    }
};

export const ensureArray = function <T>(val: T | T[]): T[] {
    if (!Array.isArray(val)) {
        val = [val];
    }
    return val;
};

const bits = (function () {
    const masks = new Int32Array([
        0x0,
        0x1,
        0x3,
        0x7,
        0xf,
        0x1f,
        0x3f,
        0x7f,
        0xff,
        0x1ff,
        0x3ff,
        0x7ff,
        0xfff,
        0x1fff,
        0x3fff,
        0x7fff,
        0xffff,
        0x1ffff,
        0x3ffff,
        0x7ffff,
        0xfffff,
        0x1fffff,
        0x3fffff,
        0x7fffff,
        0xffffff,
        0x1ffffff,
        0x3ffffff,
        0x7ffffff,
        0xfffffff,
        0x1fffffff,
        0x3fffffff,
        0x7fffffff,
        0xffffffff,
    ]);

    return function (number: number, offset: number, amount: number) {
        return (number >>> offset) & masks[amount]!;
    };
})();

export const readBit = function (number: number, offset: number) {
    return bits(number, offset, 1) === 1;
};

export const truncateUp = function (num: number) {
    return num < 0 ? Math.floor(num) : Math.ceil(num);
};

export const toTimeString = function (secs?: number | null): string {
    if (secs === null || secs === undefined || !isFinite(secs)) return ``;
    const sign = secs < 0 ? -1 : 1;
    secs = Math.floor(Math.abs(secs));
    let hours: number | string, minutes: number | string, seconds: number | string;

    const days = (secs / 86400) >> 0;
    hours = ((secs % 86400) / 3600) >> 0;
    minutes = ((secs % 3600) / 60) >> 0;
    seconds = secs % 60;
    seconds = seconds < 10 ? `0${seconds}` : seconds;
    minutes = minutes < 10 ? `0${minutes}` : minutes;
    hours = hours && hours < 10 ? `0${hours}` : hours;

    return `${(sign === -1 ? `-` : ``) + (days ? `${days} - ` : ``) + (hours ? `${hours}:` : ``) + minutes}:${seconds}`;
};

export const shortNumber = function (num: number | string): string {
    num = +num;
    const sign = num < 0 ? `-` : ``;
    num = Math.abs(num);
    if (num < 1e3) return `${sign + num}`;
    if (num < 1e6) return `${sign + (Math.round(num / 1e2) / 1e1).toFixed(1)}k`;
    if (num < 1e9) return `${sign + (Math.round(num / 1e5) / 1e1).toFixed(1)}m`;
    if (num < 1e12) return `${sign + (Math.round(num / 1e8) / 1e1).toFixed(1)}g`;
    return sign + num.toExponential(0);
};

export const throttle = function <T extends (...args: any[]) => any>(
    callback: T,
    delay: number,
    ctx: null | any = null
): (...args: Parameters<T>) => void {
    let timerId = -1;
    let callId = 0;

    return function (this: any, ...args: Parameters<T>) {
        if (timerId !== -1) {
            timers!.clearTimeout(timerId);
            timerId = -1;
        }
        const myCallId = ++callId;
        timerId = timers!.setTimeout(() => {
            if (callId !== myCallId) return;
            callId = 0;
            timerId = -1;
            callback.call(ctx || this, ...args);
        }, delay);
    };
};

export const debounce = function <T extends (...args: any[]) => any>(callback: T, delay: number) {
    let lastCall = 0;

    return function (this: any, ...args: Parameters<T>): ReturnType<T> | undefined {
        const now = performance.now();
        const elapsed = now - lastCall;

        if (elapsed >= delay) {
            lastCall = now;
            return callback.call(this, ...args);
        }
        return undefined;
    };
};

export const callableEveryMs = function <T extends (...args: any[]) => any>(callback: T, delay: number) {
    let lastCall = 0;

    return function (this: any, ...args: Parameters<T>) {
        const now = performance.now();

        if (now - lastCall > delay) {
            lastCall = now;
            return callback.call(this, ...args);
        }
        return null;
    };
};

declare global {
    interface Array<T> {
        last(): T | null;
        first(): T | null;
        toKeysObj(): Record<T extends string ? T : string, null>;
    }

    interface MathConstructor {
        log10(v: number): number;
        log2(v: number): number;
    }
}

if (typeof (Array.prototype as any).first !== `function`) {
    (Array.prototype as any).first = function () {
        if (this.length > 0) {
            return this[0];
        }
        return null;
    };
}

if (typeof Array.prototype.last !== `function`) {
    Array.prototype.last = function () {
        const len = this.length;
        if (len > 0) {
            return this[len - 1];
        }
        return null;
    };
}

if (typeof Math.log10 !== `function`) {
    Math.log10 = function (v: number) {
        return Math.log(v) * Math.LOG10E;
    };
}

if (typeof Math.log2 !== `function`) {
    Math.log2 = function (v: number) {
        return Math.log(v) * Math.LOG2E;
    };
}

Array.prototype.toKeysObj = function () {
    let i = 0;
    const l = this.length;
    const ret: Record<any, null> = {};
    for (i = 0; i < l; ++i) {
        ret[this[i]] = null;
    }
    return ret;
};

function identityFunction<T>(a: T): T;
function identityFunction<T, K>(a: T): K;
function identityFunction(v: any): any {
    return v;
}

export const IDENTITY = identityFunction;

export const buildConsecutiveRangesCompressed = function <T>(
    array: T[],
    callback?: (arg: T) => number
): [number, number][] {
    if (typeof callback !== `function`) callback = identityFunction;
    if (!array.length) return [];
    if (array.length === 1) {
        const val = callback(array[0]!);
        return [[val, val]];
    }
    const ranges: [number, number][] = [];
    let lastValue = callback(array[0]!);
    let currentRange: [number, number] = [lastValue, lastValue];
    for (let i = 1; i < array.length; ++i) {
        const currentValue = callback(array[i]!);
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
export const buildConsecutiveRanges = function <T>(array: T[], callback?: (arg: T) => number): T[][] {
    if (typeof callback !== `function`) callback = identityFunction;
    if (!array.length) return [];
    if (array.length === 1) return [[array[0]!]];
    const ranges = [];
    let prev = array[0]!;
    let currentRange = [prev];

    for (let i = 1; i < array.length; ++i) {
        const currentValue = callback(array[i]!);
        const previousValue = callback(prev);
        if (currentValue === previousValue) continue;
        if (currentValue - 1 !== previousValue) {
            ranges.push(currentRange);
            currentRange = [array[i]!];
        } else {
            currentRange.push(array[i]!);
        }
        prev = array[i]!;
    }
    ranges.push(currentRange);
    return ranges;
};

// E.g. Input: [2,3,4], 8
//      Output: [[0, 1], [5, 8]]
//
//      Input: [0, 1, 2, 4, 5, 10], 1000
//      Output: [[3, 3], [6,9], [11, 1000]]
export const buildInverseRanges = function (array: number[], endIndex: number): [number, number][] {
    const inverseRanges: [number, number][] = [];
    const ranges = buildConsecutiveRanges(array);
    if (!ranges.length) {
        return [[0, endIndex]];
    }
    let currentStart = ranges.first()!.first() === 0 ? -1 : 0;
    let currentEnd = -1;

    ranges.forEach(range => {
        const rangeStart = range.first()!;
        const rangeEnd = range.last()!;

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

export const indexMapper = function (track: TrackView): number {
    return track.getIndex();
};

export const TRACK_SORTER = function (a: TrackView | undefined, b: TrackView | undefined) {
    if (!a) {
        return -1;
    }
    if (!b) {
        return 1;
    }
    return a.getIndex() - b.getIndex();
};

export const SORT_NUMBER_ASC = function (a: number, b: number) {
    return a - b;
};

export const onceHandler = <T extends Event>(
    eventTarget: EventTarget,
    handler: (event: T) => void,
    useCapture: boolean = false
) => {
    const ret = (event: T) => {
        try {
            eventTarget.removeEventListener(event.type, ret as EventListener, useCapture);
        } finally {
            handler(event);
        }
    };
    return ret;
};

export const checkSize = function (expectedSize: number, resultSize: number) {
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

export const readAsArrayBuffer = function (file: Blob /* , cancellationToken*/): Promise<ArrayBuffer> {
    const expectedSize = file.size;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener(
            "load",
            onceHandler(reader, (_e: ProgressEvent<FileReader>) => {
                const { result } = reader;
                const error = checkSize(expectedSize, (result as ArrayBuffer).byteLength);
                if (error) {
                    reject(error);
                } else {
                    resolve(result as ArrayBuffer);
                }
            })
        );

        reader.addEventListener(
            "error",
            onceHandler(reader, (_e: ProgressEvent<FileReader>) => {
                const e = new Error(reader.error!.message);
                e.name = reader.error!.name;
                reject(e);
            })
        );
        reader.readAsArrayBuffer(file);
    });
};

export class ExtendableError extends Error {
    get name() {
        return this.constructor.name;
    }
}

export const formatTagString = function (str: string) {
    // eslint-disable-next-line no-control-regex
    const ret = str.replace(/[\u0000-\u001F]+/g, ``).trim();
    if (ret.length > 512) {
        return ret.slice(0, 512);
    }
    return ret;
};

export const indexOfCodePoint = function (string: string, codePoint: number, start?: number) {
    if (start === undefined) start = 0;
    for (let i = start; i < string.length; ++i) {
        if (string.charCodeAt(i) === codePoint) {
            return i;
        }
    }
    return -1;
};

export const capitalize = function (str: string): string {
    if (!str.length) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

const legacyListeners = Object.create(null);
let nextLegacyId = 0;
export const addLegacyListener = function (object: any, eventName: string, handler: EventListener) {
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
        object[`on${eventName}`] = function (e: any) {
            for (let i = 0; i < listeners.length; ++i) {
                listeners[i].call(this, e);
            }
        };
    }

    if (listeners.indexOf(handler) === -1) {
        listeners.push(handler);
    }
};

export const slugTitle = function (val: any): string {
    return `${val}`
        .toLowerCase()
        .replace(/[^a-zA-Z0-9 _$-]/g, ``)
        .replace(/[_ -]/g, `-`)
        .replace(/-+/g, `-`)
        .replace(/^-|-$/g, ``);
};

export const removeLegacyListener = function (object: any, eventName: string, handler: EventListener) {
    const eventCache = legacyListeners[eventName];

    if (!eventCache) return;

    const listeners = eventCache[object.__legacyId];

    if (!listeners) return;

    const index = listeners.indexOf(handler);

    if (index >= 0) {
        listeners.splice(index, 1);
    }
};

export const stripBinaryBom = function (str: string) {
    return str.replace(/^(\xff\xfe|\xfe\xff)/, ``);
};

// Dom errors are not errors :'(
export const asError = function (value: Error | DOMException) {
    if (value instanceof Error) return value;
    const ret = new Error();
    ret.message = `${value ? value.message : value}`;
    return ret;
};

export const animationPromisify = function (animation: Animation): Promise<void> {
    return new Promise(resolve => {
        function finished() {
            animation.oncancel = null;
            animation.onfinish = null;
            resolve(undefined);
        }
        animation.oncancel = finished;
        animation.onfinish = finished;
    });
};

export const reverseString = (function () {
    let utf16decoder: TextDecoder | null = null;
    return function (str: string): string {
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
})();

export const titleCase = function (str: any): string {
    if (typeof str !== `string`) str = `${str}`;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const { assign } = Object;

export const mergeObject = function (base: object, obj: object) {
    const keys = typedKeys(obj);
    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i]!;
        base[key] = obj[key];
    }
};

export const getFirstWord = function (str: string): string {
    for (let i = 0; i < str.length; ++i) {
        if (str.charCodeAt(i) === 0x20) {
            return str.slice(0, i);
        }
    }
    return str;
};

export const getLastWord = function (str: string): string {
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

const textEncoder = new TextEncoder();
const padding = [`00000000`, `0000000`, `000000`, `00000`, `0000`, `000`, `00`, `0`, ``];
export async function sha1HexString(text: string) {
    const hash = await sha1Binary(text);
    return hexString(hash);
}

export function sha1Binary(text: string) {
    const buffer = textEncoder.encode(text);
    return crypto.subtle.digest(`SHA-1`, buffer);
}

export function hexDecode(string: string): ArrayBuffer {
    const ret = new Uint8Array(string.length / 2);
    for (let i = 0; i < string.length; i += 2) {
        let highNibble = string.charCodeAt(i);

        if (highNibble <= 57) {
            highNibble -= 48;
        } else if (highNibble <= 70) {
            highNibble -= 55;
        } else {
            highNibble -= 87;
        }

        let lowNibble = string.charCodeAt(i + 1);
        if (lowNibble <= 57) {
            lowNibble -= 48;
        } else if (lowNibble <= 70) {
            lowNibble -= 55;
        } else {
            lowNibble -= 87;
        }
        ret[i / 2] = (highNibble << 4) | lowNibble;
    }
    return ret.buffer;
}

const bytePadding = [`00`, `0`, ``];
export function hexString(arrayBuffer: ArrayBuffer): string {
    if (arrayBuffer.byteLength === 20) {
        const view = new DataView(arrayBuffer);
        const a = view.getUint32(0, false).toString(16);
        const b = view.getUint32(4, false).toString(16);
        const c = view.getUint32(8, false).toString(16);
        const d = view.getUint32(12, false).toString(16);
        const e = view.getUint32(16, false).toString(16);
        return (
            padding[a.length] +
            a +
            (padding[b.length] + b) +
            (padding[c.length] + c) +
            (padding[d.length] + d) +
            (padding[e.length] + e)
        );
    } else {
        let ret = ``;
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < view.length; ++i) {
            const byte = view[i]!.toString(16);
            ret += bytePadding[byte.length] + byte;
        }
        return ret;
    }
}

const thrower = function () {
    throw new Error(`unsupported operation`);
};

export function getterProxyHandlers<T extends object>(
    getter: ProxyHandler<T>["get"],
    has: ProxyHandler<T>["has"] = thrower
) {
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
        constructr: thrower,
    };
}

export function setterProxyHandlers<T extends object>(setter: ProxyHandler<T>["set"]) {
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
        constructr: thrower,
    };
}

export function ownPropOr<T>(obj: any, prop: string, defaultValue: T) {
    return obj.hasOwnProperty(prop) ? obj[prop] : defaultValue;
}

const isNoUndefinedProxySymbol = Symbol();
const throwsOnUndefinedHandlers = getterProxyHandlers<any>(
    (target, name) => {
        if (name === isNoUndefinedProxySymbol) return true;
        if (typeof target[name] === `undefined` && !target.hasOwnProperty(name)) {
            if (isDevelopment) {
                // eslint-disable-next-line no-console
                console.warn(`property .${String(name)} doesn't exist on object`);
            }
            return undefined;
        }
        return target[name];
    },
    (target, name) => name in target
);

export const noUndefinedGet = function (target: any) {
    if (!isDevelopment) {
        return Object(target);
    }
    if (target && target[isNoUndefinedProxySymbol]) return target;
    return new Proxy(Object(target), throwsOnUndefinedHandlers);
};

export function gcd(a: number, b: number): number {
    if (!b) {
        return a;
    }

    return gcd(b, a % b);
}

export const _: { [index: string]: (v: object) => any } = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            const val = v.${String(name)};
            return typeof val === "function" ? v.${String(name)}() : val;`;
        const ret = new Function(`v`, code);
        cache.set(name, ret);
        return ret;
    },
}) as any;

export const _call: { [index: string]: (...args: any[]) => (v: object) => any } = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
              return v.${String(name)}(...args);
            };
        `;

        const ret = new Function(`...args`, code);
        cache.set(name, ret);
        return ret;
    },
}) as any;

export const _set = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
              v.${String(name)} = value;
            };
        `;

        const ret = new Function(`value`, code);
        cache.set(name, ret);
        return ret;
    },
});

export const _equals = new Proxy(new Map(), {
    get(cache, name) {
        const cached = cache.get(name);
        if (cached) {
            return cached;
        }

        const code = `
            return function(v) {
                const val = v.${String(name)};
                return (typeof val === "function" ? v.${String(name)}() : val) === rhs
            };
        `;

        const ret = new Function(`rhs`, code);
        cache.set(name, ret);
        return ret;
    },
});

export const equals = function <T>(arg: T) {
    return function (v: T) {
        return v === arg;
    };
};

export const delay = function (ms: number): Promise<void> {
    return new Promise(resolve => {
        timers!.setTimeout(resolve, ms);
    });
};

export function roundSampleTime(sample: number, sampleRate: number) {
    while ((sample / sampleRate) * sampleRate !== sample) {
        sample++;
    }
    return sample;
}

export function toCorsUrl(url: string) {
    return `${self.location.origin}/cors?url=${encodeURIComponent(url)}`;
}

export function ajaxGet<T>(
    url: string,
    cancellationToken: CancellationToken<any>,
    { responseType }: { responseType: XMLHttpRequestResponseType } = { responseType: "json" }
): Promise<T> {
    return new Promise((resolve, reject) => {
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
        xhr.addEventListener(
            `load`,
            () => {
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
            },
            false
        );

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
    });
}

const UNKNOWN = `Unknown`;
const separatorPattern = /(.+?)\s*-\s*(.+)/;
export const stripExtensionPattern = new RegExp(`\\.(?:[a-z0-9_\\-]{1,8})$`, `i`);
export const trackInfoFromFileName = function (inputFileName: string) {
    const fileName = inputFileName.replace(stripExtensionPattern, ``);
    const matches = fileName.match(separatorPattern);
    let artist: string, title: string;

    if (!matches) {
        title = capitalize(fileName);
        artist = UNKNOWN;
    } else {
        artist = capitalize(matches[1]!) || UNKNOWN;
        title = capitalize(matches[2]!) || UNKNOWN;
    }

    return {
        artist,
        title,
    };
};
