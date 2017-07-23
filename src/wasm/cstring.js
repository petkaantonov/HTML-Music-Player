export default function createCString(wasm) {
    const memcpy = wasm.memcpy.bind(wasm);
    const memset = wasm.memset.bind(wasm);

    return {
        memcpy,
        memmove: memcpy,
        memset
    };
}
