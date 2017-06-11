export default function createStdlib(wasm) {
    const brk = (addr) => {
        let ret;
        if (addr < wasm._heapStart) {
            ret = -1;
        } else {
            const neededPageCount = Math.ceil(addr / wasm.getPageSize());
            const diff = neededPageCount - wasm._currentPageCount();
            if (diff > 0) {
                wasm._mem.grow(Math.ceil((diff + 16) * 1.5) + 32);
                wasm._refreshMemoryView();
            }
            wasm._brk = addr;
            ret = 0;
        }
        return ret;
    };

    const atoi = ptr => parseInt(wasm.convertCharPToAsciiString(ptr), 10) | 0;

    return {
        brk,
        sbrk(increment) {
            increment |= 0;
            increment = ((increment + 15) & -16);

            const oldbrk = wasm._brk;

            let ret;
            if (increment === 0) {
                ret = oldbrk;
            } else if (brk(oldbrk + increment) === 0) {
                ret = oldbrk;
            } else {
                ret = -1;
            }
            return ret;
        },

        atof(ptr) {
            return parseFloat(wasm.convertCharPToAsciiString(ptr));
        },

        atoi,
        atol: atoi,

        getenv(keyPtr) {
            return wasm.getEnvPtr(wasm.convertCharPToAsciiString(keyPtr));
        },

        abort() {
            throw new Error(`abort called`);
        },

        strtod(ptr, ptr2) {
            const str = wasm.convertCharPToAsciiString(ptr);
            const ret = parseFloat(str);
            if (ptr2) {
                throw new Error(`unsupported`);
            }
            return ret;
        }
    };
}
