import {console, Uint8Array} from "platform/platform";

const i8 = 1;
const i16 = 2;
const i32 = 4;
const f64 = 8;
const i64 = 16;

const printFSizeMap = new Uint8Array(128);
printFSizeMap[102] =
printFSizeMap[70] =
printFSizeMap[101] =
printFSizeMap[69] =
printFSizeMap[97] =
printFSizeMap[65] =
printFSizeMap[103] =
printFSizeMap[71] = f64;

printFSizeMap[99] =
printFSizeMap[100] =
printFSizeMap[105] =
printFSizeMap[111] =
printFSizeMap[120] =
printFSizeMap[88] =
printFSizeMap[117] =
printFSizeMap[115] =
printFSizeMap[112] = i32;

printFSizeMap[104] = i16;
printFSizeMap[106] = i32;
printFSizeMap[122] = i32;
printFSizeMap[116] = i32;
printFSizeMap[76] = f64;
printFSizeMap[108] = i32;

const stdio = [null, msg => console.log(msg), msg => console.error(msg)];
const rspecifier = /%([-+#0 ]?[0-9*]?)(\.[0-9*])?(hh|h|j|z|t|L|ll|l)?([%sgGnpaAeEfFuxXodic])/g;

function format(wasm, formatStringPtr, argvPtr) {
    const formatString = wasm.convertCharPToAsciiString(formatStringPtr);
    if (argvPtr) {
        let startIndex = 0;
        let m;
        let ret = ``;
        const view = wasm._view;
        let offset = argvPtr;

        while (m = rspecifier.exec(formatString)) {
            const endIndex = rspecifier.lastIndex - m[0].length;
            const inb = formatString.slice(startIndex, endIndex);
            ret += inb;
            startIndex = rspecifier.lastIndex;

            const specifier = m[4].charCodeAt(0);

            if (specifier === 37) {
                ret += m[4];
            } else if (specifier === 99) {
                ret += String.fromCharCode(wasm.u32(offset));
                offset += 4;
            } else if (specifier === 115) {
                const ptr = wasm.u32(offset);
                offset += 4;
                ret += wasm.convertCharPToAsciiString(ptr);
            } else if (specifier === 112) {
                ret += `b${wasm.u32(offset).toString(16).padStart(8, `0`)}`;
                offset += 4;
            } else if (printFSizeMap[specifier] === i32) {
                const signed = specifier === 100 || specifier === 105;
                const m3 = m[3];
                const m3Length = m3 ? m3.length : 0;
                if (m3Length === 0) {
                    ret += String(signed ? wasm.i32(offset) : wasm.u32(offset));
                    offset += 4;
                } else if (m3Length === 1) {
                    const isShort = m3.charCodeAt(0) === 104;
                    if (isShort) {
                        ret += String(signed ? wasm.i16(offset) : wasm.u16(offset));
                    } else {
                        ret += String(signed ? wasm.i32(offset) : wasm.u32(offset));
                    }
                    offset += 4;
                } else {
                    const cc = m3.charCodeAt(0);
                    if (cc === 104) {
                        ret += String(signed ? wasm.i8(offset) : wasm.u8(offset));
                        offset += 4;
                    } else {
                        const alignedOffset = (offset + 7) & ~7;
                        ret += signed ? `${wasm.i64AsDouble(alignedOffset)}`
                                      : `${wasm.u64AsDouble(alignedOffset)}`;
                        offset = alignedOffset + 8;
                    }
                }
            } else if (printFSizeMap[specifier] === f64) {
                const alignedOffset = (offset + 7) & ~7;
                const value = wasm.f64(alignedOffset);
                const [frac] = wasm.cmath.modf(value);
                if (frac === 0) {
                    ret += value.toFixed(1);
                } else {
                    ret += String(value);
                }
                offset = alignedOffset + 8;
            } else if (specifier === 110) {
                const m3 = m[3];
                const m3Length = m3 ? m3.length : 0;
                const ptr = wasm.u32(offset);
                let size = 4;
                if (m3Length > 0) {
                    const cc = m3.charCodeAt(0);
                    if (m3Length > 1) {
                        size = cc === 104 ? i8 : i64;
                    } else {
                        size = printFSizeMap[cc];
                    }

                    if (size === i8) {
                        view.setUint8(ptr, ret.length, true);
                    } else if (size === i16) {
                        view.setUint16(ptr, ret.length, true);
                    } else if (size === i32) {
                        view.setUint32(ptr, ret.length, true);
                    }
                } else {
                    view.setUint32(ptr, ret.length, true);
                }
                offset += 4;
            }
        }

        if (startIndex > 0) {
            ret += formatString.slice(startIndex);
        }
        return ret;
    } else {
        return formatString;
    }
}

export default function createCStdio(wasm) {

    const fprintf = function(filePtr, formatStringPtr, argvPtr) {
        const out = stdio[filePtr] || stdio[1];
        const str = format(wasm, formatStringPtr, argvPtr);
        out(str);
        return str.length;
    };

    const printf = function(formatStringPtr, argvPtr) {
        const str = format(wasm, formatStringPtr, argvPtr);
        console.log(str);
        return str.length;
    };

    return {
        fprintf,
        printf
    };
}
