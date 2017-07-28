export const {ArrayBuffer,
    Blob,
    File,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    AudioContext,
    URL,
    FileReader,
    DataView,
    MouseEvent,
    EventEmitter,
    Worker,
    indexedDB,
    IDBKeyRange,
    Directory,
    Image,
    codecLoaded,
    XMLHttpRequest,
    performance,
    console,
    MediaError,
    MediaMetadata,
    AudioParam,
    matchMedia,
    Symbol,
    TextDecoder,
    TextEncoder,
    crypto,
    Map,
    FileReaderSync,
    importScripts,
    MessageChannel,
    fetch,
    Request,
    Response,
    Proxy,
    WebAssembly
} = self;

const global = self;

export {global as self};

export const CONSTRAINT_ERROR = `ConstraintError`;
export const QUOTA_EXCEEDED_ERROR = `QuotaExceededError`;
export const UNKNOWN_ERROR = `UnknownError`;

export function isOutOfMemoryError(e) {
    return e.name === UNKNOWN_ERROR || e.name === QUOTA_EXCEEDED_ERROR;
}
