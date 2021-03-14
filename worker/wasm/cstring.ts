import WebAssemblyWrapper from "./WebAssemblyWrapper";

export interface CString {
    memcpy: WebAssemblyWrapper["memcpy"];
    memmove: WebAssemblyWrapper["memcpy"];
    memset: WebAssemblyWrapper["memset"];
    memcmp: WebAssemblyWrapper["memcmp"];
}

export default function createCString(wasm: WebAssemblyWrapper): CString {
    const memcpy = wasm.memcpy.bind(wasm);
    const memset = wasm.memset.bind(wasm);
    const memcmp = wasm.memcmp.bind(wasm);

    return {
        memcpy,
        memmove: memcpy,
        memset,
        memcmp,
    };
}
