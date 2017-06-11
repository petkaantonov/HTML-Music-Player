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
    Directory,
    Image,
    codecLoaded,
    XMLHttpRequest,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
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

function titleCase(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function prefix(Class, methodName) {
    const MethodName = titleCase(methodName);
    return Class.prototype[methodName] ||
           Class.prototype[`ms${MethodName}`] ||
           Class.prototype[`moz${MethodName}`] ||
           Class.prototype[`webkit${MethodName}`];
}

if (typeof Blob !== `undefined`) {
    const BlobClose = prefix(Blob, `close`);
    if (typeof BlobClose === `undefined`) {
        Blob.prototype.close = function() {
            // NOOP
        };
    } else {
        Blob.prototype.close = function(...args) {
            try {
                return BlobClose.call(this, ...args);
            } catch (e) {
                return null;
            }
        };
    }

    if (typeof Blob.prototype.slice !== `function`) {
        Blob.prototype.slice = prefix(Blob, `slice`);
    }
}

if (typeof File !== `undefined`) {
    const FileClose = prefix(File, `close`);
    if (typeof FileClose === `undefined`) {
        File.prototype.close = function() {
            // NOOP
        };
    } else if (FileClose !== Blob.prototype.close) {
        FileClose.prototype.close = function(...args) {
            try {
                return FileClose.call(this, ...args);
            } catch (e) {
                return null;
            }
        };
    }

    if (typeof File.prototype.slice !== `function`) {
        File.prototype.slice = prefix(File, `slice`);
    }
}
