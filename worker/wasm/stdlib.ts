import WebAssemblyWrapper from "./WebAssemblyWrapper";

export interface StdLib {
    brk: (addr: number) => number;
    sbrk: (addr: number) => number;
    abort: () => void;
    qsort: (ptr: number, length: number, itemByteLength: number, comparerFuncTableIndex: number) => void;
}

export default function createStdlib(wasm: WebAssemblyWrapper): StdLib {
    const brk = (addr: number) => {
        let ret;
        if (addr < wasm._heapStart) {
            ret = -1;
        } else {
            const neededPageCount = Math.ceil(addr / wasm.getPageSize());
            const diff = neededPageCount - wasm._currentPageCount();
            if (diff > 0) {
                wasm._mem!.grow(Math.ceil((diff + 16) * 1.5) + 32);
                wasm._refreshMemoryView();
            }
            wasm._brk = addr;
            ret = 0;
        }
        return ret;
    };

    return {
        brk,
        sbrk(increment: number) {
            increment |= 0;
            increment = (increment + 15) & -16;
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

        abort() {
            throw new Error(`abort called`);
        },

        qsort(ptr: number, length: number, itemByteLength: number, comparerFuncTableIndex: number) {
            const comparer = wasm.table(comparerFuncTableIndex);

            if (!comparer) {
                throw new Error("no function at func table index " + comparerFuncTableIndex);
            }

            let tmp = 0;
            try {
                tmp = wasm.malloc(length * itemByteLength);
                wasm.memcpy(tmp, ptr, length * itemByteLength);
                const array = new Uint32Array(length);
                for (let i = 0; i < length; ++i) {
                    array[i] = ptr + i * itemByteLength;
                }
                array.sort(comparer as (a: number, b: number) => number);
                for (let i = 0; i < length; ++i) {
                    const offset = array[i]! - ptr;
                    const value = tmp + offset;
                    wasm.memcpy(ptr + i * itemByteLength, value, itemByteLength);
                }
            } finally {
                if (tmp) {
                    wasm.free(tmp);
                }
            }
        },
    };
}
