import EventEmitter from "events";
import * as io from "io-ts";
import { getterProxyHandlers, setterProxyHandlers } from "src/util";
import createCString, { CString } from "wasm/cstring";
import createStdio, { Stdio } from "wasm/stdio";
import createStdlib, { StdLib } from "wasm/stdlib";
import createTime, { Time } from "wasm/time";
import { env } from "WorkerBackend";

interface WasmEnv {
    [index: string]: any;
    time: Time;
    stdio: Stdio;
    cstring: CString;
    stdlib: StdLib;
    initialize: (heapStart: number, debug: boolean) => void;
}

export const WASM_TYPE_INTEGER = "integer";
export const WASM_TYPE_BOOLEAN = "boolean";
export const WASM_TYPE_STRING = "string";
export const WASM_TYPE_STRING_RETVAL = "string-retval";
export const WASM_TYPE_INTEGER_RETVAL = "integer-retval";
export const WASM_TYPE_BOOLEAN_RETVAL = "boolean-retval";
export const WASM_TYPE_I64_AS_DOUBLE_RETVAL = "i64-as-double-retval";
export const WASM_TYPE_I64_AS_STRUCT_RETVAL = "i64-as-struct-retval";
export const WASM_TYPE_DOUBLE_RETVAL = "double-retval";
export const WASM_TYPE_DOUBLE = "double";

const WASM_TYPE_I64_AS_DOUBLE = "i64-as-double";
const WASM_TYPE_I64_AS_STRUCT = "i64-as-struct";

const WasmDirectType = io.union([
    io.literal(WASM_TYPE_INTEGER),
    io.literal(WASM_TYPE_BOOLEAN),
    io.literal(WASM_TYPE_STRING),
    io.literal(WASM_TYPE_DOUBLE),
    io.literal(WASM_TYPE_I64_AS_DOUBLE),
    io.literal(WASM_TYPE_I64_AS_STRUCT),
]);
type WasmDirectType = io.TypeOf<typeof WasmDirectType>;

export const WasmType = io.union([
    io.literal(WASM_TYPE_INTEGER),
    io.literal(WASM_TYPE_BOOLEAN),
    io.literal(WASM_TYPE_STRING),
    io.literal(WASM_TYPE_DOUBLE),
    io.literal(WASM_TYPE_DOUBLE_RETVAL),
    io.literal(WASM_TYPE_INTEGER_RETVAL),
    io.literal(WASM_TYPE_BOOLEAN_RETVAL),
    io.literal(WASM_TYPE_STRING_RETVAL),
    io.literal(WASM_TYPE_I64_AS_DOUBLE_RETVAL),
    io.literal(WASM_TYPE_I64_AS_STRUCT_RETVAL),
]);
export type WasmType = io.TypeOf<typeof WasmType>;

const textDecoder = new TextDecoder(`iso-8859-1`);

export class OutOfMemoryError extends Error {}
export class UnsupportedArgumentTypeError extends Error {
    constructor(theType: any) {
        super(`parameter type ${theType} is unsupported`);
    }
}
export class InvalidModuleError extends Error {}

export class NullPointerError extends Error {
    constructor(name: string) {
        super(`${name} is null pointer`);
    }
}

export class MissingImportError extends Error {
    constructor(module: string, name: string) {
        super(`import ${module}.${name} has not been implemented`);
    }
}

const getSize = function (type: WasmType) {
    switch (type) {
        case `integer`:
        case `boolean`:
        case `string`:
        case `string-retval`:
        case `boolean-retval`:
        case `integer-retval`:
            return 4;
        case `i64-as-double-retval`:
        case `i64-as-struct-retval`:
        case `double-retval`:
        case `double`:
            return 8;
        default:
            throw new Error("unknown type " + type);
    }
};

const createFunctionWrapper = function <T extends WasmType[]>(
    name: string,
    thisObj: string,
    types: T,
    { extraPrologueCode = ``, unsafeJsStack = false } = {}
): string {
    let needsMalloc = false;
    let multiArgs = false;
    let totalStackAllocated = 0;

    const args = types
        .map((type, index) => {
            if (!getSize(type)) {
                throw new UnsupportedArgumentTypeError(type);
            }
            if (type === `string`) {
                unsafeJsStack = false;
            }
            if (type.indexOf(`retval`) >= 0) {
                return ``;
            }
            return `arg${index}`;
        })
        .filter(Boolean)
        .join(`, `);

    const preCall = types
        .map((type, index) => {
            if (type === `string`) {
                needsMalloc = true;
                unsafeJsStack = false;
                return `const convertedArg${index} = ${thisObj}.convertAsciiStringToCharP(arg${index});`;
            } else if (type === `boolean`) {
                return `const convertedArg${index} = +arg${index};`;
            } else if (type.indexOf(`retval`) >= 0) {
                needsMalloc = true;
                multiArgs = true;
                const size = getSize(type);
                if (unsafeJsStack) {
                    const offset = totalStackAllocated;
                    const alignedOffset = (offset + (size - 1)) & ~(size - 1);
                    totalStackAllocated += alignedOffset - offset + size;
                    return `const convertedArg${index} = _stackStart + ${alignedOffset};`;
                } else {
                    return `const convertedArg${index} = ${thisObj}.jsStackAlloc(${size});`;
                }
            } else {
                return ``;
            }
        })
        .filter(Boolean)
        .join(`\n`);

    const convertedArgs = types
        .map((type, index) => {
            if (type === `string` || type === `boolean` || type.indexOf(`retval`) >= 0) {
                return `convertedArg${index}`;
            } else {
                return `arg${index}`;
            }
        })
        .join(`, `);

    const multiArgConversion = types
        .map((type, index) => {
            if (type.indexOf(`retval`) >= 0) {
                const directType: WasmDirectType = type.replace(`-retval`, ``) as WasmDirectType;

                switch (directType) {
                    case "string":
                        return `${thisObj}.convertCharPToAsciiString(${thisObj}.u32(convertedArg${index}))`;

                    case "integer":
                        return `${thisObj}.u32(convertedArg${index})`;

                    case "boolean":
                        return `!!${thisObj}.u32(convertedArg${index})`;

                    case "double":
                        return `${thisObj}.f64(convertedArg${index})`;

                    case "i64-as-double":
                        return `${thisObj}.i64AsDouble(convertedArg${index})`;

                    case "i64-as-struct":
                        return `${thisObj}.i64AsStruct(convertedArg${index})`;
                    default:
                        throw new Error("unknown type" + type);
                }
            } else {
                return null;
            }
        })
        .filter(Boolean)
        .join(`, `);

    let returnCode;

    if (multiArgs) {
        returnCode = `
                const retVal = theFunction(${convertedArgs});
                const result = [retVal, ${multiArgConversion}];
                ${unsafeJsStack ? `${thisObj}._checkUnsafeJsStackEpilogue();` : ``}
                return result;`;
    } else {
        returnCode = `return theFunction(${convertedArgs});`;
    }

    let code = `
            return function wasm_wrapper_${name}(${args}) {
            ${extraPrologueCode}`;

    if (needsMalloc) {
        if (unsafeJsStack) {
            code += `
                ${thisObj}._checkUnsafeJsStackPrologue(${totalStackAllocated});
                const _stackStart = ${thisObj}._jsStackMemoryPtr;
                ${preCall}
                ${returnCode}`;
        } else {
            code += `
                try {
                    ${thisObj}.pushJsStack();
                    ${preCall}
                    ${returnCode}
                } finally {
                    ${thisObj}.popJsStack();
                }`;
        }
    } else {
        code += `
                ${preCall}
                ${returnCode}`;
    }

    code += `};`;

    return code;
};

interface Opts {
    jsMemoryInitialSize?: number;
}

export const moduleEvents = new EventEmitter();
const PAGE_SIZE = 65536;
export default class WebAssemblyWrapper {
    _instance: WebAssembly.Instance | null;
    _exports: null | Record<string, WebAssembly.ExportValue>;
    _exportsProxy: null | Record<string, WebAssembly.ExportValue>;
    _imports: null;
    _mem: WebAssembly.Memory | null;
    _table: WebAssembly.Table | null;
    _view: DataView | null;
    _name: string;
    _jsStackMemorySize: number;
    _jsStackMemoryStart: number;
    _jsStackMemoryEnd: number;
    _jsStackMemoryPtr: number;
    _jsStackMemoryStack: number;
    _heapStart: number;
    _brk: number;
    _debug: boolean;
    _initialized: boolean;
    _files: Map<any, any>;
    _fileHandles: Set<number>;
    _env: Map<string, string | number>;
    _opts: Opts;
    _module: WebAssembly.Module;
    _heap: Uint8Array | null;
    _pageSize: number;
    _ready: null | Promise<void>;
    _malloc: any;
    _free: any;
    _realloc: any;
    _calloc: any;
    __errno_location: (() => number) | null;
    cmath: { modf: (a: number) => [number, number] } | null;
    _main: any;
    constructor(module: WebAssembly.Module, name: string, opts: Opts = {}) {
        this._instance = null;
        this._exports = null;
        this._exportsProxy = null;
        this.cmath = null;
        this._imports = null;
        this._mem = null;
        this._table = null;
        this._view = null;
        this._name = name;
        this._jsStackMemorySize = 0;
        this._jsStackMemoryStart = 0;
        this._jsStackMemoryEnd = 0;
        this._jsStackMemoryPtr = 0;
        this._jsStackMemoryStack = 0;
        this._heapStart = -1;
        this._brk = -1;
        this._debug = false;
        this._initialized = false;
        this._files = new Map();
        this._fileHandles = new Set<number>();
        this._env = new Map();
        this._opts = opts;
        this._module = module;
        this._heap = null;
        this._pageSize = PAGE_SIZE;
        this.__errno_location = null;

        for (let i = 10; i < 256; ++i) {
            this._fileHandles.add(i);
        }
        this._ready = null;
    }

    get exports() {
        if (!this._exportsProxy) {
            throw new Error(`module has not been initialized`);
        }
        return this._exportsProxy;
    }

    start() {
        const module = this._module;
        const requiredImportObj: Record<string, Record<string, WebAssembly.ImportExportKind>> = {};

        for (const requiredImport of WebAssembly.Module.imports(module)) {
            const { module: requiredModule, name, kind } = requiredImport;
            if (!requiredImportObj[requiredModule]) {
                requiredImportObj[requiredModule] = {};
            }
            requiredImportObj[requiredModule]![name] = kind;
        }

        const stdio = createStdio(this);
        const cstring = createCString(this);
        const stdlib = createStdlib(this);
        const time = createTime();

        const stdenv: WasmEnv = Object.assign(
            {
                initialize: (heapStart: number, debug: boolean) => {
                    if (this._initialized) {
                        throw new Error("already initialized");
                    }
                    this._initialized = true;
                    this._heapStart = Math.ceil(heapStart / PAGE_SIZE) * PAGE_SIZE;
                    this._brk = this._heapStart;
                    this._debug = !!debug;
                },
            },
            stdio,
            cstring,
            stdlib,
            time
        );

        const importsObj = {
            env: stdenv,
        };

        const envProxy = new Proxy(
            importsObj.env,
            setterProxyHandlers((target: WasmEnv, name: string, value: any): boolean => {
                if (typeof target[name] !== `undefined`) {
                    throw new Error(`${name} has already been imported`);
                }

                const kind = requiredImportObj.env![name];

                if (kind === "function") {
                    if (typeof value !== "function") {
                        throw new Error(
                            `expected import type to be ${kind} for env:${name} but it was ${typeof value}`
                        );
                    }
                } else {
                    throw new Error("unsupported import type");
                }

                target[name] = value;
                return true;
            })
        );

        const importsProxy = new Proxy(
            importsObj,
            getterProxyHandlers((_target: { env: WasmEnv }, name) => {
                if (name !== `env`) {
                    throw new Error(`only imports in env module are supported`);
                }
                return envProxy;
            })
        );

        moduleEvents.emit(`${this._name}_beforeModuleImport`, this, importsProxy);

        const providedEnvNames = Object.keys(importsObj.env);
        const requiredEnvNames = Object.keys(requiredImportObj.env!);
        const requiredButNotProvided = [];
        const providedButNotRequired = [];

        for (const providedEnvName of providedEnvNames) {
            if (!requiredImportObj.env![providedEnvName]) {
                providedButNotRequired.push(`env:${providedEnvName}`);
            }
        }

        for (const requiredEnvName of requiredEnvNames) {
            if (!importsObj.env[requiredEnvName]) {
                requiredButNotProvided.push(`env:${requiredEnvName}`);
            }
        }

        const err = [];

        if (requiredButNotProvided.length) {
            err.push(
                `The imports ${requiredButNotProvided.join(`, `)} are required by module '${
                    this._name
                }' but were not provided`
            );
        }

        if (providedButNotRequired.length) {
            err.push(
                `The imports ${providedButNotRequired.join(`, `)} were provided but are not required by module '${
                    this._name
                }'`
            );
        }

        if (err.length > 0 && env.isDevelopment()) {
            // eslint-disable-next-line no-console
            console.warn(err.join(`\n`));
        }

        this._ready = this._init(this._module, this._opts, importsObj);
        return this._ready;
    }

    ready() {
        return this._ready;
    }

    getErrNo() {
        return this.u32(this.__errno_location!());
    }

    getEnvPtr(str: string) {
        const value = this._env.get(str);

        if (typeof value === `string`) {
            const ptr = this.malloc(value.length + 1);
            this.convertAsciiStringToCharPAt(value, ptr);
            this._env.set(str, ptr);
            return ptr;
        } else if (typeof value === `number`) {
            return value;
        } else {
            return 0;
        }
    }

    getEnvStr(str: string) {
        const ptr = this.getEnvPtr(str);
        if (ptr !== 0) {
            return this.convertCharPToAsciiString(ptr);
        }
        return null;
    }

    setEnv(keyStr: string, valueStr: string) {
        const ptr = this.getEnvPtr(keyStr);
        if (typeof ptr === `number` && ptr !== 0) {
            this.free(ptr);
        }
        this._env.set(keyStr, valueStr);
    }

    u32field(ptr: number, offset: number) {
        return this._view!.getUint32(ptr + offset, true);
    }

    setF64(ptr: number, value: number) {
        return this._view!.setFloat64(ptr, value, true);
    }

    setU32(ptr: number, value: number) {
        return this._view!.setUint32(ptr, value, true);
    }

    setI32(ptr: number, value: number) {
        return this._view!.setInt32(ptr, value, true);
    }

    u32(ptr: number) {
        return this._view!.getUint32(ptr, true);
    }

    i32(ptr: number) {
        return this._view!.getInt32(ptr, true);
    }

    f64(ptr: number) {
        return this._view!.getFloat64(ptr, true);
    }

    u8(ptr: number) {
        return this._view!.getUint8(ptr);
    }

    i8(ptr: number) {
        return this._view!.getInt8(ptr);
    }

    u16(ptr: number) {
        return this._view!.getUint16(ptr, true);
    }

    i16(ptr: number) {
        return this._view!.getInt16(ptr, true);
    }

    _64AsDouble(offset: number, signed: boolean) {
        const low = this.u32(offset);
        const high = this.u32(offset + 4);
        const resultSigned = signed && (high & 0x80000000) !== 0;

        if (resultSigned) {
            return -1 * (~high * 4294967296 + ~low + (low === 0 ? 4294967297 : 1));
        } else {
            return high * Math.pow(2, 32) + low;
        }
    }

    i64AsStruct(offset: number) {
        const low = this.u32(offset);
        const high = this.u32(offset + 4);
        return { low, high };
    }

    i64AsDouble(offset: number) {
        return this._64AsDouble(offset, true);
    }

    u64AsDouble(offset: number) {
        return this._64AsDouble(offset, false);
    }

    memcpy(dstPtr: number, srcPtr: number, length: number) {
        this._heap!.copyWithin(dstPtr, srcPtr, srcPtr + length);
        return dstPtr;
    }

    memset(dstPtr: number, value: number, length: number) {
        this._heap!.fill(value, dstPtr, dstPtr + length);
        return dstPtr;
    }

    memcmp(ptr1: number, ptr2: number, length: number) {
        return indexedDB.cmp(this.u8view(ptr1, length), this.u8view(ptr2, length));
    }

    createFunctionWrapper<T extends (...args: any[]) => any>(
        { name, unsafeJsStack }: { name: string; unsafeJsStack?: boolean },
        ...types: WasmType[]
    ) {
        const code = createFunctionWrapper(name, `wasm`, types, { unsafeJsStack });
        return this.compileWrapper<T>(code, this.exports![name]! as Function);
    }

    compileWrapper<T extends (...args: any[]) => any>(code: string, theExport: Function) {
        return new Function(`wasm`, `theFunction`, `NullPointerError`, code)(this, theExport, NullPointerError) as T;
    }

    pointsToMemory(bufferOrArray: Uint8Array | ArrayBuffer) {
        const memoryBuffer = this._mem!.buffer;
        if (bufferOrArray instanceof ArrayBuffer) {
            return memoryBuffer === bufferOrArray;
        } else {
            return memoryBuffer === bufferOrArray.buffer;
        }
    }

    isReady() {
        return this._initialized;
    }

    _nextHandle() {
        const result = this._fileHandles[Symbol.iterator]().next();
        if (result.value) {
            const { value } = result;
            this._fileHandles.delete(value);
            return value;
        }
        return -1;
    }

    _freeHandle(handle: number) {
        this._fileHandles.add(handle);
    }

    async _init(
        module: WebAssembly.Module,
        { jsMemoryInitialSize = PAGE_SIZE }: Opts = {},
        importObj: WebAssembly.Imports
    ) {
        const declaredExports: Record<string, WebAssembly.ImportExportKind> = {};
        const usedExports: Record<string, WebAssembly.ImportExportKind> = {};

        for (const declaredExport of WebAssembly.Module.exports(module)) {
            const { name, kind } = declaredExport;
            if (kind === `function`) {
                declaredExports[name] = kind;
            }
        }

        this._instance = await WebAssembly.instantiate(module, importObj);
        this._exports = this._instance.exports;
        this._exportsProxy = new Proxy(
            this._exports,
            getterProxyHandlers((exports: Record<string, WebAssembly.ExportValue>, key: string) => {
                const ret = exports[key];
                if (typeof ret !== `function`) {
                    throw new InvalidModuleError(`${key} has not been exported by module '${this._name}'`);
                }
                usedExports[key] = declaredExports[key]!;
                return ret;
            })
        );
        this._malloc = this._exportsProxy.malloc;
        this._free = this._exportsProxy.free;
        this._realloc = this._exportsProxy.realloc;
        this._calloc = this._exportsProxy.calloc;
        this.cmath = {
            modf: this.createFunctionWrapper<(value: number) => [number, number]>(
                { name: `modf` },
                `double`,
                `double-retval`
            ),
        };

        this._mem = this._getMemory();
        this._table = this._getTable();
        this._refreshMemoryView();
        this.__errno_location = this._exportsProxy.__errno_location as () => number;
        this._main = this._exportsProxy.main;
        this._main();
        this._jsStackMemorySize = jsMemoryInitialSize;
        this._jsStackMemoryStart = this.malloc(((this._jsStackMemorySize + 7) & ~7) + 8);
        this._jsStackMemoryStart = (this._jsStackMemoryStart + 7) & ~7;
        this._jsStackMemoryEnd = this._jsStackMemoryStart + this._jsStackMemorySize;
        this._jsStackMemoryPtr = this._jsStackMemoryStart;
        this._jsStackMemoryStack = 0;
        this._heap = this.u8view(0);

        moduleEvents.emit(`${this._name}_afterInitialized`, this, this.exports);

        const unusedExports = Object.keys(declaredExports).filter(name => usedExports[name] !== declaredExports[name]);

        if (unusedExports.length > 0 && env.isDevelopment()) {
            // eslint-disable-next-line no-console
            console.warn(
                `The functions ${unusedExports.join(`, `)} were exported by module '${this._name}' but are not used`
            );
        }
    }

    getPageSize() {
        return this._pageSize;
    }

    _currentPageCount() {
        return this._mem!.buffer.byteLength / PAGE_SIZE;
    }

    _setErrNo(value: number) {
        const ptr = this.__errno_location!();
        this._view!.setUint32(ptr, value, true);
    }

    _refreshMemoryView() {
        this._view = new DataView(this._mem!.buffer, 0, this._mem!.buffer.byteLength);
        this._heap = this.u8view(0);
    }

    u16calloc(count: number) {
        const ret = this._calloc(count, 2);
        if (ret === 0) {
            throw new OutOfMemoryError(`malloc returned 0`);
        }
        return ret;
    }

    u32calloc(count: number) {
        const ret = this._calloc(count, 4);

        if (ret === 0) {
            throw new OutOfMemoryError(`malloc returned 0`);
        }
        return ret;
    }

    u8calloc(count: number): number {
        const ret = this._calloc(count, 1);
        if (ret === 0) {
            throw new OutOfMemoryError(`malloc returned 0`);
        }
        return ret;
    }

    malloc(size: number): number {
        const ret = this._malloc(size);
        if (ret === 0) {
            throw new OutOfMemoryError(`malloc returned 0`);
        }
        return ret;
    }

    free(ptr: number) {
        return this._free(ptr);
    }

    realloc(ptr: number, newSize: number) {
        const ret = this._realloc(ptr, newSize);
        if (ret === 0) {
            throw new OutOfMemoryError(`realloc returned 0`);
        }
        return ret;
    }

    u8view(ptr: number, length?: number) {
        return new Uint8Array(this._mem!.buffer, ptr, length);
    }

    u32view(ptr: number, length?: number) {
        return new Uint32Array(this._mem!.buffer, ptr, length);
    }

    i32view(ptr: number, length?: number) {
        return new Int32Array(this._mem!.buffer, ptr, length);
    }

    f32view(ptr: number, length?: number) {
        return new Float32Array(this._mem!.buffer, ptr, length);
    }

    f64view(ptr: number, length?: number) {
        return new Float64Array(this._mem!.buffer, ptr, length);
    }

    i16view(ptr: number, length?: number) {
        return new Int16Array(this._mem!.buffer, ptr, length);
    }

    table(index: number) {
        return (this._exports!.table as WebAssembly.Table).get(index);
    }

    _getTable() {
        if (!this._exports!.table) {
            throw new InvalidModuleError(`Expected table to be exported but it wasn't`);
        }
        return this._exports!.table as WebAssembly.Table;
    }

    _getMemory(): WebAssembly.Memory {
        if (!this._exports!.memory) {
            throw new InvalidModuleError(`Expected memory to be exported but it wasn't`);
        }
        return this._exports!.memory as WebAssembly.Memory;
    }

    _getTotalHeapMemory() {
        if (this._heapStart < 0) {
            throw new NullPointerError(`heap start has not been set`);
        }
        return this._getMemory().buffer.byteLength - this._heapStart;
    }

    jsStackAlloc(size: number) {
        size = Math.max(size, 8);
        size = ((size - 1) & ~7) + 8;
        if (this._jsStackMemoryStack === 0) {
            throw new NullPointerError(`js stack wasn't pushed!`);
        }
        const originalSize = size;
        const ret = this._jsStackMemoryPtr;

        if (ret + size > this._jsStackMemoryEnd) {
            const currentlyMalloced = this._jsStackMemoryPtr - this._jsStackMemoryStart;
            const newJsMemorySize = ((currentlyMalloced + size) * 2) | 0;
            const jsMemoryStart = this.realloc(this._jsStackMemoryStart, ((newJsMemorySize + 7) & ~7) + 8);
            this._jsStackMemoryStart = (jsMemoryStart + 7) & ~7;
            this._jsStackMemorySize = newJsMemorySize;
            this._jsStackMemoryPtr = this._jsStackMemoryStart + currentlyMalloced;
            this._jsStackMemoryEnd = this._jsStackMemoryStart + newJsMemorySize;
            const newRet = this._jsStackMemoryPtr;
            this._jsStackMemoryPtr += originalSize;
            return newRet;
        } else {
            this._jsStackMemoryPtr += size;
            return ret;
        }
    }

    _checkUnsafeJsStackPrologue(size: number) {
        if (
            this._jsStackMemoryStack !== 0 ||
            this._jsStackMemoryPtr !== this._jsStackMemoryStart ||
            size > this._jsStackMemorySize
        ) {
            throw new Error(`invalid call, there are other calls on the stack using js stack memory`);
        }
    }

    _checkUnsafeJsStackEpilogue() {
        if (this._jsStackMemoryPtr !== this._jsStackMemoryStart) {
            throw new Error(`invalid call, there are other calls on the stack using js stack memory`);
        }
    }

    popJsStack() {
        if (--this._jsStackMemoryStack === 0) {
            this._jsStackMemoryPtr = this._jsStackMemoryStart;
        }
    }

    pushJsStack() {
        this._jsStackMemoryStack++;
    }

    convertCharPToAsciiString(ptr: number) {
        const buffer = this.u8view(ptr);
        let i = 0;

        while (buffer[i++] !== 0);
        const length = Math.max(0, i - 1);
        return textDecoder.decode(this.u8view(ptr, length));
    }

    convertAsciiStringToCharPAt(string: string, ptr: number, maxSize?: number) {
        const length = typeof maxSize === `number` ? Math.min(maxSize - 1, string.length) : string.length;

        const buffer = this.u8view(ptr, length + 1);
        buffer[length] = 0;
        for (let i = 0; i < length; ++i) {
            buffer[i] = string.charCodeAt(i);
        }
        return length;
    }

    convertAsciiStringToCharP(string: string) {
        const { length } = string;
        const ptr = this.jsStackAlloc(length + 1);

        const buffer = this.u8view(ptr, length + 1);
        buffer[length] = 0;
        for (let i = 0; i < length; ++i) {
            buffer[i] = string.charCodeAt(i);
        }
        return ptr;
    }
}
