export default function createCString(wasm) {
    const errorStrings = [];

    const memcpy = wasm.memcpy.bind(wasm);
    const memset = wasm.memset.bind(wasm);

    return {
        memcpy,
        memmove: memcpy,
        memset,

        strerror(num) {
            if (errorStrings[num]) return errorStrings[num];
            const str = `${num}`;
            const ptr = wasm._malloc(str.length + 1);
            wasm.convertAsciiStringToCharPAt(str, ptr);
            errorStrings[num] = ptr;
            return ptr;
        }
    };
}
