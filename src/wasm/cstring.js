export default function createCString(wasm) {
    const memcpy = wasm.memcpy.bind(wasm);
    const memset = wasm.memset.bind(wasm);
    const memcmp = wasm.memcmp.bind(wasm);

    return {
        memcpy,
        memmove: memcpy,
        memset,
        memcmp
    };
}
