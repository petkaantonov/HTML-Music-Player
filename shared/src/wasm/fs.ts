import * as io from "io-ts";

import WebAssemblyWrapper from "./WebAssemblyWrapper";

export const fs = new Map<string, File>();
export const handles = new Map<number, FHandle>();

const SEEK_SET = 0;
const SEEK_CUR = 1;
const SEEK_END = 2;

export const SeekOrigin = io.union([io.literal(SEEK_CUR), io.literal(SEEK_SET), io.literal(SEEK_END)]);
export type SeekOrigin = io.TypeOf<typeof SeekOrigin>;
// Const EOF = -1;
const EINVAL = 22;

class Mode {
    _binary: boolean;
    _write: boolean;
    _read: boolean;
    _append: boolean;
    _plus: boolean;
    _x: boolean;
    constructor(modeString: string) {
        this._binary = modeString.indexOf(`b`) >= 0;
        this._write = modeString.indexOf(`w`) >= 0;
        this._read = modeString.indexOf(`r`) >= 0;
        this._append = modeString.indexOf(`a`) >= 0;
        this._plus = modeString.indexOf(`+`) >= 0;
        this._x = modeString.indexOf(`x`) >= 0;
    }
}

class FHandle {
    _fileHandle: number;
    _position: number;
    _eof: boolean;
    _error: null | number;
    _mode: Mode;
    _size: number;
    _name: string;
    _type: string;
    _writePtr: number;
    _writeLength: number;
    _needFlush: boolean;
    constructor(fileHandle: number, file: File, mode: Mode, wasm: WebAssemblyWrapper) {
        this._fileHandle = fileHandle;
        this._position = 0;
        this._eof = false;
        this._error = null;
        this._mode = mode;
        this._size = file.size;
        this._name = file.name;
        this._type = file.type;
        this._writePtr = 0;
        this._writeLength = 0;
        this._needFlush = false;

        if (this.append && this._size > 0) {
            this._position = this._size;
            const length = (this._size * 1.5) | 0;
            this._writePtr = wasm.malloc(length);
            this._writeLength = length;
            //@ts-ignore
            const reader = new FileReaderSync();
            const src = reader.readAsArrayBuffer(file);
            const dst = wasm.u8view(this._writePtr, this._size);
            dst.set(new Uint8Array(src));
        }
    }

    get binary() {
        return this._mode._binary;
    }
    get write() {
        return this._mode._write;
    }
    get read() {
        return this._mode._read;
    }
    get append() {
        return this._mode._append;
    }
    get plus() {
        return this._mode._plus;
    }
    get x() {
        return this._mode._x;
    }

    get name() {
        return this._name;
    }

    get file() {
        return fs.get(this.name);
    }

    get type() {
        return this._type;
    }

    _fclose(wasm: WebAssemblyWrapper) {
        this._fflush(wasm);
        if (this._writePtr) {
            wasm.free(this._writePtr);
            this._writePtr = 0;
            this._writeLength = 0;
        }
        return 0;
    }

    _ftell() {
        return this._position;
    }

    _fseek(offset: number, origin: SeekOrigin) {
        if (this.append) return 0;
        if (!this.binary) {
            if (origin === SEEK_SET) {
                this._setValidPosition(offset);
            } else {
                this._error = EINVAL;
                return -1;
            }
        } else {
            if (origin === SEEK_SET) {
                this._setValidPosition(offset);
            } else if (origin === SEEK_CUR) {
                this._setValidPosition(this._position + offset);
            } else if (origin === SEEK_END) {
                this._setValidPosition(this._size + offset);
            } else {
                this._error = EINVAL;
                return -1;
            }
        }
        this._eof = false;
        return 0;
    }

    _setValidPosition(position: number) {
        if (position >= this._size) {
            position = this._size;
            this._eof = true;
        }
        this._position = position;
    }

    _fread(wasm: WebAssemblyWrapper, targetPtr: number, size: number, count: number) {
        if (!this.read && !this.plus) {
            return 0;
        }
        const length = size * count;
        const fileStart = this._position;
        this._setValidPosition(fileStart + length);
        const lengthToRead = this._position - fileStart;
        const { file } = this;
        if (!file) {
            return -1;
        }
        const slicedBlob = file.slice(fileStart, fileStart + lengthToRead, file.type);
        try {
            //@ts-ignore
            const reader = new FileReaderSync();
            const src = reader.readAsArrayBuffer(slicedBlob);
            const dst = wasm.u8view(targetPtr, lengthToRead);
            dst.set(new Uint8Array(src));
            return (lengthToRead / size) >>> 0;
        } catch (e) {
            return 0;
        }
    }

    _fwrite(wasm: WebAssemblyWrapper, sourcePtr: number, size: number, count: number) {
        const length = size * count;
        if (!length || (!this.write && !this.plus && !this.append)) {
            return 0;
        }
        const position = this._position;

        if (position + length >= this._writeLength) {
            const bufferLength = (position + length * 1.5) | 0;
            if (this._writePtr) {
                this._writePtr = wasm.realloc(this._writePtr, bufferLength);
            } else {
                this._writePtr = wasm.malloc(bufferLength);
            }
            this._writeLength = bufferLength;
        }
        this._position += length;
        this._size += length;

        wasm.memcpy(this._writePtr + position, sourcePtr, length);
        this._needFlush = true;
        return length / size;
    }

    _fflush(wasm: WebAssemblyWrapper) {
        if (this._writePtr && this._needFlush) {
            const length = Math.min(this._position, this._writeLength);
            const src = wasm.u8view(this._writePtr, length);
            fs.set(
                this.name,
                new File([src], this.name, {
                    type: this.type,
                    lastModified: Date.now(),
                })
            );
            this._needFlush = false;
        }
        return 0;
    }
}

export function createFs(wasm: WebAssemblyWrapper) {
    let nextHandle = 3;

    function fopen(fileNamePtr: number, flagsStrPtr: number, handle: number) {
        const fileName = wasm.convertCharPToAsciiString(fileNamePtr);
        const mode = new Mode(wasm.convertCharPToAsciiString(flagsStrPtr));

        if (mode._append && mode._plus) {
            return -1;
        }
        let file = fs.get(fileName);
        if (file) {
            if (mode._write) {
                if (mode._x) {
                    return -1;
                }
                file = new File([new ArrayBuffer(0)], fileName, {
                    lastModified: Date.now(),
                });
                fs.set(fileName, file);
            }

            handles.set(handle, new FHandle(handle, file, mode, wasm));
            return handle;
        } else {
            if (mode._read) {
                return -1;
            }
            file = new File([new ArrayBuffer(0)], fileName, {
                lastModified: Date.now(),
            });
            fs.set(fileName, file);
            handles.set(handle, new FHandle(handle, file, mode, wasm));
        }
        return 0;
    }

    function withHandle(handle: number, fn: (handle: FHandle) => number | void): number | void {
        const fhandle = handles.get(handle);
        if (!fhandle) return -1;
        return fn(fhandle);
    }

    return {
        fclose(handle: number) {
            withHandle(handle, fhandle => {
                fhandle._fflush(wasm);
                fhandle._fclose(wasm);
                handles.delete(handle);
            });
            return 0;
        },
        fflush(handle: number) {
            if (!handle) {
                for (const fhandle of handles.values()) {
                    fhandle._fflush(wasm);
                }
                return 0;
            }
            return withHandle(handle, fhandle => fhandle._fflush(wasm));
        },
        fopen(fileNamePtr: number, flagsStrPtr: number) {
            return fopen(fileNamePtr, flagsStrPtr, ++nextHandle);
        },
        fread(ptr: number, size: number, count: number, handle: number) {
            return withHandle(handle, fhandle => fhandle._fread(wasm, ptr, size, count));
        },
        /*freopen(fileNamePtr: number, flagsStrPtr: number, handle: number) {
            return withHandle(handle, () => {
                handles.delete(handle);
                return fopen(fileNamePtr, flagsStrPtr, handle);
            });
        },
        fwrite(ptr: number, size: number, count: number, handle: number) {
            return withHandle(handle, fhandle => fhandle._fwrite(wasm, ptr, size, count));
        },
        remove(fileNamePtr: number) {
            const fileName = wasm.convertCharPToAsciiString(fileNamePtr);
            fs.delete(fileName);
            return 0;
        },
        */
        js_fseek(handle: number, offset: number, whence: SeekOrigin) {
            return withHandle(handle, fhandle => fhandle._fseek(offset, whence));
        },
        js_ftell(handle: number) {
            const ret = withHandle(handle, fhandle => fhandle._ftell());
            return ret;
        },
        js_stat(fileNamePtr: number, mtimeDoublePtr: number) {
            const fileName = wasm.convertCharPToAsciiString(fileNamePtr);
            const file = fs.get(fileName);
            if (file) {
                wasm.setF64(mtimeDoublePtr, Math.floor(file.lastModified / 1000));
                return 0;
            }
            return -1;
        },
        /*
        js_utime() {
            return 0;
        },
        */
    };
}
