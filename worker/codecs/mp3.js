(function () {
"use strict";
/* Ported from minimp3.c, LGPL license follows */
/*
 * MPEG Audio Layer III decoder
 * Copyright (c) 2001, 2002 Fabrice Bellard,
 *           (c) 2007 Martin J. Fiedler,
 *           (c) 2015 Petka Antonov
 *
 * This file is a stripped-down version of the MPEG Audio decoder from
 * the FFmpeg libavcodec library.
 *
 * FFmpeg and minimp3 are free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FFmpeg and minimp3 are distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with FFmpeg; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA
 */
const FLOAT = 0;
const INT16 = 1;

const DEFAULT_BUFFER_LENGTH_SECONDS = 2;
const MAX_BUFFER_LENGTH_SECONDS = 5;
const MIN_BUFFER_LENGTH_SECONDS = 1152 / 8000;

const MAX_INVALID_FRAME_COUNT = 100;
const MAX_MP3_FRAME_BYTE_LENGTH = 2881;
const MAX_MP3_SAMPLE_RATE = 48000;

const NULL = null;
const MP3_FRAME_SIZE = 1152;
const SBLIMIT = 32;

const MP3_MONO = 3;

const FRAC_BITS = 15;
const WFRAC_BITS = 14;
const OUT_SHIFT = (WFRAC_BITS + FRAC_BITS - 15);

const MODE_EXT_MS_STEREO = 2;
const MODE_EXT_I_STEREO = 1;

const FRAC_ONE = (1 << FRAC_BITS);
const FIXR = function(a) {
    return (a * FRAC_ONE + 0.5) | 0;
};
const FIXHR = function(a) {
    return (Math.pow(2, 32) * a + 0.5) | 0;
};

const MULH = function(a, b) {
    var a0 = a & 0xFFFF, a1 = a >> 16;
    var b0 = b & 0xFFFF, b1 = b >> 16;
    var w0 = Math.imul(a0, b0);
    var t = (Math.imul(a1, b0) >>> 0) + (w0 >>> 16);
    var w1 = t & 0xFFFF;
    var w2 = t >> 16;
    w1 = (Math.imul(a0, b1) >>> 0) + w1;
    return (Math.imul(a1, b1) + w2 + (w1 >> 16))|0;
};

const MULL = function(a, b) {
    return (((Math.imul(a, b) >>> 15) | 0) | (MULH(a, b) << 17))|0;
};

const ISQRT2 = FIXR(0.70710678118654752440);
const HEADER_SIZE = 4;
const BACKSTEP_SIZE = 512;
const EXTRABYTES = 24;
const TABLE_4_3_SIZE = (8191 + 16) * 4;

var libc_frexp_result_e = 0;
const libc_frexp = (function() {
    const f64 = new Float64Array(1);
    const i32 = new Uint32Array(f64.buffer);

    // Check machine endianess.
    const i16 = new Uint16Array(1);
    const i8 = new Uint8Array(i16.buffer);
    i8[0] = 0xFF;
    const HIGH_INDEX = i16[0] === 0xFF ? 1 : 0;

    return function(x) {
        f64[0] = x;
        var high = i32[HIGH_INDEX];
    
        if ((high & 0x7F000000) === 0) {
            libc_frexp_result_e = 0;
            return x;
        }

        libc_frexp_result_e = ((high << 1) >>> 21) - 1022;
        high &= 0x800FFFFF;
        high |= 0x3FF00000;
        i32[HIGH_INDEX] = high;
        return f64[0] * 0.5;
   };
})();

const huff_vlc = new Array(16);
const huff_quad_vlc = new Array(2);
const exponents = new Uint16Array(576);
const idxtab = new Int32Array([3,3,2,2,1,1,1,1,0,0,0,0,0,0,0,0]);
const window_values = new Int16Array(512);

// [8][36]
const mdct_win = new Int32Array(8 * 36);

// [9][23]
const band_index_long = new Uint16Array(9 * 23);

// [2][15]
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);

const mp3_enwindow = new Int32Array([
     0,    -1,    -1,    -1,    -1,    -1,    -1,    -2,
    -2,    -2,    -2,    -3,    -3,    -4,    -4,    -5,
    -5,    -6,    -7,    -7,    -8,    -9,   -10,   -11,
   -13,   -14,   -16,   -17,   -19,   -21,   -24,   -26,
   -29,   -31,   -35,   -38,   -41,   -45,   -49,   -53,
   -58,   -63,   -68,   -73,   -79,   -85,   -91,   -97,
  -104,  -111,  -117,  -125,  -132,  -139,  -147,  -154,
  -161,  -169,  -176,  -183,  -190,  -196,  -202,  -208,
   213,   218,   222,   225,   227,   228,   228,   227,
   224,   221,   215,   208,   200,   189,   177,   163,
   146,   127,   106,    83,    57,    29,    -2,   -36,
   -72,  -111,  -153,  -197,  -244,  -294,  -347,  -401,
  -459,  -519,  -581,  -645,  -711,  -779,  -848,  -919,
  -991, -1064, -1137, -1210, -1283, -1356, -1428, -1498,
 -1567, -1634, -1698, -1759, -1817, -1870, -1919, -1962,
 -2001, -2032, -2057, -2075, -2085, -2087, -2080, -2063,
  2037,  2000,  1952,  1893,  1822,  1739,  1644,  1535,
  1414,  1280,  1131,   970,   794,   605,   402,   185,
   -45,  -288,  -545,  -814, -1095, -1388, -1692, -2006,
 -2330, -2663, -3004, -3351, -3705, -4063, -4425, -4788,
 -5153, -5517, -5879, -6237, -6589, -6935, -7271, -7597,
 -7910, -8209, -8491, -8755, -8998, -9219, -9416, -9585,
 -9727, -9838, -9916, -9959, -9966, -9935, -9863, -9750,
 -9592, -9389, -9139, -8840, -8492, -8092, -7640, -7134,
  6574,  5959,  5288,  4561,  3776,  2935,  2037,  1082,
    70,  -998, -2122, -3300, -4533, -5818, -7154, -8540,
 -9975,-11455,-12980,-14548,-16155,-17799,-19478,-21189,
-22929,-24694,-26482,-28289,-30112,-31947,-33791,-35640,
-37489,-39336,-41176,-43006,-44821,-46617,-48390,-50137,
-51853,-53534,-55178,-56778,-58333,-59838,-61289,-62684,
-64019,-65290,-66494,-67629,-68692,-69679,-70590,-71420,
-72169,-72835,-73415,-73908,-74313,-74630,-74856,-74992,
 75038
]);

const table_4_3_exp = new Int8Array(TABLE_4_3_SIZE);
const table_4_3_value = new Uint32Array(TABLE_4_3_SIZE);

const exp_table = new Uint32Array(512);
const expval_table = new Uint32Array(512 * 16);

// [2][16]
const is_table = new Int32Array(2 * 16);
const is_table_lsf = [
    // [2][16]
    new Int32Array(2 * 16),
    // [2][16]
    new Int32Array(2 * 16)
];

// [8][4]
const csa_table = new Int32Array(8 * 4);
// [8][4]
const csa_table_float = new Float32Array(8 * 4);

//[2][16]
const slen_table = new Uint8Array([
   0, 0, 0, 0, 3, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4,
   0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 2, 3
]);

//[6][3][4]
const lsf_nsf_table = new Uint8Array([
   6,  5,  5, 5, 9,  9,  9, 9, 6,  9,  9, 9,
   6,  5,  7, 3, 9,  9, 12, 6, 6,  9, 12, 6,
  11, 10,  0, 0, 18, 18,  0, 0,15, 18,  0, 0,
   7,  7,  7, 0, 12, 12, 12, 0, 6, 15, 12, 0,
   6,  6,  6, 3, 12,  9,  9, 6, 6, 12,  9, 6,
   8,  8,  5, 0, 15, 12,  9, 0, 6, 18,  9, 0
]);

const mp3_quad_codes = [
   new Uint8Array([1,  5,  4,  5,  6,  5,  4,  4, 7,  3,  6,  0,  7,  2,  3,  1]),
   new Uint8Array([15, 14, 13, 12, 11, 10,  9,  8, 7,  6,  5,  4,  3,  2,  1,  0])
];

const mp3_quad_bits = [
   new Uint8Array([1, 4, 4, 5, 4, 6, 5, 6, 4, 5, 5, 6, 5, 6, 6, 6]),
   new Uint8Array([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])
];

// [9][22]
const band_size_long = new Uint8Array([
4, 4, 4, 4, 4, 4, 6, 6, 8, 8, 10,
  12, 16, 20, 24, 28, 34, 42, 50, 54, 76, 158, /* 44100 */
4, 4, 4, 4, 4, 4, 6, 6, 6, 8, 10,
  12, 16, 18, 22, 28, 34, 40, 46, 54, 54, 192, /* 48000 */
4, 4, 4, 4, 4, 4, 6, 6, 8, 10, 12,
  16, 20, 24, 30, 38, 46, 56, 68, 84, 102, 26, /* 32000 */
6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16,
  20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, /* 22050 */
6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16,
  18, 22, 26, 32, 38, 46, 52, 64, 70, 76, 36, /* 24000 */
6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16,
  20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, /* 16000 */
6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16,
  20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, /* 11025 */
6, 6, 6, 6, 6, 6, 8, 10, 12, 14, 16,
  20, 24, 28, 32, 38, 46, 52, 60, 68, 58, 54, /* 12000 */
12, 12, 12, 12, 12, 12, 16, 20, 24, 28, 32,
  40, 48, 56, 64, 76, 90, 2, 2, 2, 2, 2 /* 8000 */
]);

// [9][13]
const band_size_short = new Uint8Array([
4, 4, 4, 4, 6, 8, 10, 12, 14, 18, 22, 30, 56, /* 44100 */
4, 4, 4, 4, 6, 6, 10, 12, 14, 16, 20, 26, 66, /* 48000 */
4, 4, 4, 4, 6, 8, 12, 16, 20, 26, 34, 42, 12, /* 32000 */
4, 4, 4, 6, 6, 8, 10, 14, 18, 26, 32, 42, 18, /* 22050 */
4, 4, 4, 6, 8, 10, 12, 14, 18, 24, 32, 44, 12, /* 24000 */
4, 4, 4, 6, 8, 10, 12, 14, 18, 24, 30, 40, 18, /* 16000 */
4, 4, 4, 6, 8, 10, 12, 14, 18, 24, 30, 40, 18, /* 11025 */
4, 4, 4, 6, 8, 10, 12, 14, 18, 24, 30, 40, 18, /* 12000 */
8, 8, 8, 12, 16, 20, 24, 28, 36, 2, 2, 2, 26 /* 8000 */
]);

// [2][22]
const mp3_pretab_ptr = new Uint8Array([
   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 3, 3, 2, 0
]);

const ci_table = new Float32Array([
    -0.6, -0.535, -0.33, -0.185, -0.095, -0.041, -0.0142, -0.0037
]);

const mp3_huffcodes_1 = new Uint16Array([
 0x0001, 0x0001, 0x0001, 0x0000
]);

const mp3_huffbits_1 = new Uint8Array([
  1,  3,  2,  3
]);

const mp3_huffcodes_2 = new Uint16Array([
 0x0001, 0x0002, 0x0001, 0x0003, 0x0001, 0x0001, 0x0003, 0x0002,
 0x0000
]);

const mp3_huffbits_2 = new Uint8Array([
  1,  3,  6,  3,  3,  5,  5,  5,
  6
]);

const mp3_huffcodes_3 = new Uint16Array([
 0x0003, 0x0002, 0x0001, 0x0001, 0x0001, 0x0001, 0x0003, 0x0002,
 0x0000
]);

const mp3_huffbits_3 = new Uint8Array([
  2,  2,  6,  3,  2,  5,  5,  5,
  6
]);

const mp3_huffcodes_5 = new Uint16Array([
 0x0001, 0x0002, 0x0006, 0x0005, 0x0003, 0x0001, 0x0004, 0x0004,
 0x0007, 0x0005, 0x0007, 0x0001, 0x0006, 0x0001, 0x0001, 0x0000
]);

const mp3_huffbits_5 = new Uint8Array([
  1,  3,  6,  7,  3,  3,  6,  7,
  6,  6,  7,  8,  7,  6,  7,  8
]);

const mp3_huffcodes_6 = new Uint16Array([
 0x0007, 0x0003, 0x0005, 0x0001, 0x0006, 0x0002, 0x0003, 0x0002,
 0x0005, 0x0004, 0x0004, 0x0001, 0x0003, 0x0003, 0x0002, 0x0000
]);

const mp3_huffbits_6 = new Uint8Array([
  3,  3,  5,  7,  3,  2,  4,  5,
  4,  4,  5,  6,  6,  5,  6,  7
]);

const mp3_huffcodes_7 = new Uint16Array([
 0x0001, 0x0002, 0x000a, 0x0013, 0x0010, 0x000a, 0x0003, 0x0003,
 0x0007, 0x000a, 0x0005, 0x0003, 0x000b, 0x0004, 0x000d, 0x0011,
 0x0008, 0x0004, 0x000c, 0x000b, 0x0012, 0x000f, 0x000b, 0x0002,
 0x0007, 0x0006, 0x0009, 0x000e, 0x0003, 0x0001, 0x0006, 0x0004,
 0x0005, 0x0003, 0x0002, 0x0000
]);

const mp3_huffbits_7 = new Uint8Array([
  1,  3,  6,  8,  8,  9,  3,  4,
  6,  7,  7,  8,  6,  5,  7,  8,
  8,  9,  7,  7,  8,  9,  9,  9,
  7,  7,  8,  9,  9, 10,  8,  8,
  9, 10, 10, 10
]);

const mp3_huffcodes_8 = new Uint16Array([
 0x0003, 0x0004, 0x0006, 0x0012, 0x000c, 0x0005, 0x0005, 0x0001,
 0x0002, 0x0010, 0x0009, 0x0003, 0x0007, 0x0003, 0x0005, 0x000e,
 0x0007, 0x0003, 0x0013, 0x0011, 0x000f, 0x000d, 0x000a, 0x0004,
 0x000d, 0x0005, 0x0008, 0x000b, 0x0005, 0x0001, 0x000c, 0x0004,
 0x0004, 0x0001, 0x0001, 0x0000
]);

const mp3_huffbits_8 = new Uint8Array([
  2,  3,  6,  8,  8,  9,  3,  2,
  4,  8,  8,  8,  6,  4,  6,  8,
  8,  9,  8,  8,  8,  9,  9, 10,
  8,  7,  8,  9, 10, 10,  9,  8,
  9,  9, 11, 11
]);

const mp3_huffcodes_9 = new Uint16Array([
 0x0007, 0x0005, 0x0009, 0x000e, 0x000f, 0x0007, 0x0006, 0x0004,
 0x0005, 0x0005, 0x0006, 0x0007, 0x0007, 0x0006, 0x0008, 0x0008,
 0x0008, 0x0005, 0x000f, 0x0006, 0x0009, 0x000a, 0x0005, 0x0001,
 0x000b, 0x0007, 0x0009, 0x0006, 0x0004, 0x0001, 0x000e, 0x0004,
 0x0006, 0x0002, 0x0006, 0x0000
]);

const mp3_huffbits_9 = new Uint8Array([
  3,  3,  5,  6,  8,  9,  3,  3,
  4,  5,  6,  8,  4,  4,  5,  6,
  7,  8,  6,  5,  6,  7,  7,  8,
  7,  6,  7,  7,  8,  9,  8,  7,
  8,  8,  9,  9
]);

const mp3_huffcodes_10 = new Uint16Array([
 0x0001, 0x0002, 0x000a, 0x0017, 0x0023, 0x001e, 0x000c, 0x0011,
 0x0003, 0x0003, 0x0008, 0x000c, 0x0012, 0x0015, 0x000c, 0x0007,
 0x000b, 0x0009, 0x000f, 0x0015, 0x0020, 0x0028, 0x0013, 0x0006,
 0x000e, 0x000d, 0x0016, 0x0022, 0x002e, 0x0017, 0x0012, 0x0007,
 0x0014, 0x0013, 0x0021, 0x002f, 0x001b, 0x0016, 0x0009, 0x0003,
 0x001f, 0x0016, 0x0029, 0x001a, 0x0015, 0x0014, 0x0005, 0x0003,
 0x000e, 0x000d, 0x000a, 0x000b, 0x0010, 0x0006, 0x0005, 0x0001,
 0x0009, 0x0008, 0x0007, 0x0008, 0x0004, 0x0004, 0x0002, 0x0000
]);

const mp3_huffbits_10 = new Uint8Array([
  1,  3,  6,  8,  9,  9,  9, 10,
  3,  4,  6,  7,  8,  9,  8,  8,
  6,  6,  7,  8,  9, 10,  9,  9,
  7,  7,  8,  9, 10, 10,  9, 10,
  8,  8,  9, 10, 10, 10, 10, 10,
  9,  9, 10, 10, 11, 11, 10, 11,
  8,  8,  9, 10, 10, 10, 11, 11,
  9,  8,  9, 10, 10, 11, 11, 11
]);

const mp3_huffcodes_11 = new Uint16Array([
 0x0003, 0x0004, 0x000a, 0x0018, 0x0022, 0x0021, 0x0015, 0x000f,
 0x0005, 0x0003, 0x0004, 0x000a, 0x0020, 0x0011, 0x000b, 0x000a,
 0x000b, 0x0007, 0x000d, 0x0012, 0x001e, 0x001f, 0x0014, 0x0005,
 0x0019, 0x000b, 0x0013, 0x003b, 0x001b, 0x0012, 0x000c, 0x0005,
 0x0023, 0x0021, 0x001f, 0x003a, 0x001e, 0x0010, 0x0007, 0x0005,
 0x001c, 0x001a, 0x0020, 0x0013, 0x0011, 0x000f, 0x0008, 0x000e,
 0x000e, 0x000c, 0x0009, 0x000d, 0x000e, 0x0009, 0x0004, 0x0001,
 0x000b, 0x0004, 0x0006, 0x0006, 0x0006, 0x0003, 0x0002, 0x0000
]);

const mp3_huffbits_11 = new Uint8Array([
  2,  3,  5,  7,  8,  9,  8,  9,
  3,  3,  4,  6,  8,  8,  7,  8,
  5,  5,  6,  7,  8,  9,  8,  8,
  7,  6,  7,  9,  8, 10,  8,  9,
  8,  8,  8,  9,  9, 10,  9, 10,
  8,  8,  9, 10, 10, 11, 10, 11,
  8,  7,  7,  8,  9, 10, 10, 10,
  8,  7,  8,  9, 10, 10, 10, 10
]);

const mp3_huffcodes_12 = new Uint16Array([
 0x0009, 0x0006, 0x0010, 0x0021, 0x0029, 0x0027, 0x0026, 0x001a,
 0x0007, 0x0005, 0x0006, 0x0009, 0x0017, 0x0010, 0x001a, 0x000b,
 0x0011, 0x0007, 0x000b, 0x000e, 0x0015, 0x001e, 0x000a, 0x0007,
 0x0011, 0x000a, 0x000f, 0x000c, 0x0012, 0x001c, 0x000e, 0x0005,
 0x0020, 0x000d, 0x0016, 0x0013, 0x0012, 0x0010, 0x0009, 0x0005,
 0x0028, 0x0011, 0x001f, 0x001d, 0x0011, 0x000d, 0x0004, 0x0002,
 0x001b, 0x000c, 0x000b, 0x000f, 0x000a, 0x0007, 0x0004, 0x0001,
 0x001b, 0x000c, 0x0008, 0x000c, 0x0006, 0x0003, 0x0001, 0x0000
]);

const mp3_huffbits_12 = new Uint8Array([
  4,  3,  5,  7,  8,  9,  9,  9,
  3,  3,  4,  5,  7,  7,  8,  8,
  5,  4,  5,  6,  7,  8,  7,  8,
  6,  5,  6,  6,  7,  8,  8,  8,
  7,  6,  7,  7,  8,  8,  8,  9,
  8,  7,  8,  8,  8,  9,  8,  9,
  8,  7,  7,  8,  8,  9,  9, 10,
  9,  8,  8,  9,  9,  9,  9, 10
]);

const mp3_huffcodes_13 = new Uint16Array([
 0x0001, 0x0005, 0x000e, 0x0015, 0x0022, 0x0033, 0x002e, 0x0047,
 0x002a, 0x0034, 0x0044, 0x0034, 0x0043, 0x002c, 0x002b, 0x0013,
 0x0003, 0x0004, 0x000c, 0x0013, 0x001f, 0x001a, 0x002c, 0x0021,
 0x001f, 0x0018, 0x0020, 0x0018, 0x001f, 0x0023, 0x0016, 0x000e,
 0x000f, 0x000d, 0x0017, 0x0024, 0x003b, 0x0031, 0x004d, 0x0041,
 0x001d, 0x0028, 0x001e, 0x0028, 0x001b, 0x0021, 0x002a, 0x0010,
 0x0016, 0x0014, 0x0025, 0x003d, 0x0038, 0x004f, 0x0049, 0x0040,
 0x002b, 0x004c, 0x0038, 0x0025, 0x001a, 0x001f, 0x0019, 0x000e,
 0x0023, 0x0010, 0x003c, 0x0039, 0x0061, 0x004b, 0x0072, 0x005b,
 0x0036, 0x0049, 0x0037, 0x0029, 0x0030, 0x0035, 0x0017, 0x0018,
 0x003a, 0x001b, 0x0032, 0x0060, 0x004c, 0x0046, 0x005d, 0x0054,
 0x004d, 0x003a, 0x004f, 0x001d, 0x004a, 0x0031, 0x0029, 0x0011,
 0x002f, 0x002d, 0x004e, 0x004a, 0x0073, 0x005e, 0x005a, 0x004f,
 0x0045, 0x0053, 0x0047, 0x0032, 0x003b, 0x0026, 0x0024, 0x000f,
 0x0048, 0x0022, 0x0038, 0x005f, 0x005c, 0x0055, 0x005b, 0x005a,
 0x0056, 0x0049, 0x004d, 0x0041, 0x0033, 0x002c, 0x002b, 0x002a,
 0x002b, 0x0014, 0x001e, 0x002c, 0x0037, 0x004e, 0x0048, 0x0057,
 0x004e, 0x003d, 0x002e, 0x0036, 0x0025, 0x001e, 0x0014, 0x0010,
 0x0035, 0x0019, 0x0029, 0x0025, 0x002c, 0x003b, 0x0036, 0x0051,
 0x0042, 0x004c, 0x0039, 0x0036, 0x0025, 0x0012, 0x0027, 0x000b,
 0x0023, 0x0021, 0x001f, 0x0039, 0x002a, 0x0052, 0x0048, 0x0050,
 0x002f, 0x003a, 0x0037, 0x0015, 0x0016, 0x001a, 0x0026, 0x0016,
 0x0035, 0x0019, 0x0017, 0x0026, 0x0046, 0x003c, 0x0033, 0x0024,
 0x0037, 0x001a, 0x0022, 0x0017, 0x001b, 0x000e, 0x0009, 0x0007,
 0x0022, 0x0020, 0x001c, 0x0027, 0x0031, 0x004b, 0x001e, 0x0034,
 0x0030, 0x0028, 0x0034, 0x001c, 0x0012, 0x0011, 0x0009, 0x0005,
 0x002d, 0x0015, 0x0022, 0x0040, 0x0038, 0x0032, 0x0031, 0x002d,
 0x001f, 0x0013, 0x000c, 0x000f, 0x000a, 0x0007, 0x0006, 0x0003,
 0x0030, 0x0017, 0x0014, 0x0027, 0x0024, 0x0023, 0x0035, 0x0015,
 0x0010, 0x0017, 0x000d, 0x000a, 0x0006, 0x0001, 0x0004, 0x0002,
 0x0010, 0x000f, 0x0011, 0x001b, 0x0019, 0x0014, 0x001d, 0x000b,
 0x0011, 0x000c, 0x0010, 0x0008, 0x0001, 0x0001, 0x0000, 0x0001
]);

const mp3_huffbits_13 = new Uint8Array([
  1,  4,  6,  7,  8,  9,  9, 10,
  9, 10, 11, 11, 12, 12, 13, 13,
  3,  4,  6,  7,  8,  8,  9,  9,
  9,  9, 10, 10, 11, 12, 12, 12,
  6,  6,  7,  8,  9,  9, 10, 10,
  9, 10, 10, 11, 11, 12, 13, 13,
  7,  7,  8,  9,  9, 10, 10, 10,
 10, 11, 11, 11, 11, 12, 13, 13,
  8,  7,  9,  9, 10, 10, 11, 11,
 10, 11, 11, 12, 12, 13, 13, 14,
  9,  8,  9, 10, 10, 10, 11, 11,
 11, 11, 12, 11, 13, 13, 14, 14,
  9,  9, 10, 10, 11, 11, 11, 11,
 11, 12, 12, 12, 13, 13, 14, 14,
 10,  9, 10, 11, 11, 11, 12, 12,
 12, 12, 13, 13, 13, 14, 16, 16,
  9,  8,  9, 10, 10, 11, 11, 12,
 12, 12, 12, 13, 13, 14, 15, 15,
 10,  9, 10, 10, 11, 11, 11, 13,
 12, 13, 13, 14, 14, 14, 16, 15,
 10, 10, 10, 11, 11, 12, 12, 13,
 12, 13, 14, 13, 14, 15, 16, 17,
 11, 10, 10, 11, 12, 12, 12, 12,
 13, 13, 13, 14, 15, 15, 15, 16,
 11, 11, 11, 12, 12, 13, 12, 13,
 14, 14, 15, 15, 15, 16, 16, 16,
 12, 11, 12, 13, 13, 13, 14, 14,
 14, 14, 14, 15, 16, 15, 16, 16,
 13, 12, 12, 13, 13, 13, 15, 14,
 14, 17, 15, 15, 15, 17, 16, 16,
 12, 12, 13, 14, 14, 14, 15, 14,
 15, 15, 16, 16, 19, 18, 19, 16
]);

const mp3_huffcodes_15 = new Uint16Array([
 0x0007, 0x000c, 0x0012, 0x0035, 0x002f, 0x004c, 0x007c, 0x006c,
 0x0059, 0x007b, 0x006c, 0x0077, 0x006b, 0x0051, 0x007a, 0x003f,
 0x000d, 0x0005, 0x0010, 0x001b, 0x002e, 0x0024, 0x003d, 0x0033,
 0x002a, 0x0046, 0x0034, 0x0053, 0x0041, 0x0029, 0x003b, 0x0024,
 0x0013, 0x0011, 0x000f, 0x0018, 0x0029, 0x0022, 0x003b, 0x0030,
 0x0028, 0x0040, 0x0032, 0x004e, 0x003e, 0x0050, 0x0038, 0x0021,
 0x001d, 0x001c, 0x0019, 0x002b, 0x0027, 0x003f, 0x0037, 0x005d,
 0x004c, 0x003b, 0x005d, 0x0048, 0x0036, 0x004b, 0x0032, 0x001d,
 0x0034, 0x0016, 0x002a, 0x0028, 0x0043, 0x0039, 0x005f, 0x004f,
 0x0048, 0x0039, 0x0059, 0x0045, 0x0031, 0x0042, 0x002e, 0x001b,
 0x004d, 0x0025, 0x0023, 0x0042, 0x003a, 0x0034, 0x005b, 0x004a,
 0x003e, 0x0030, 0x004f, 0x003f, 0x005a, 0x003e, 0x0028, 0x0026,
 0x007d, 0x0020, 0x003c, 0x0038, 0x0032, 0x005c, 0x004e, 0x0041,
 0x0037, 0x0057, 0x0047, 0x0033, 0x0049, 0x0033, 0x0046, 0x001e,
 0x006d, 0x0035, 0x0031, 0x005e, 0x0058, 0x004b, 0x0042, 0x007a,
 0x005b, 0x0049, 0x0038, 0x002a, 0x0040, 0x002c, 0x0015, 0x0019,
 0x005a, 0x002b, 0x0029, 0x004d, 0x0049, 0x003f, 0x0038, 0x005c,
 0x004d, 0x0042, 0x002f, 0x0043, 0x0030, 0x0035, 0x0024, 0x0014,
 0x0047, 0x0022, 0x0043, 0x003c, 0x003a, 0x0031, 0x0058, 0x004c,
 0x0043, 0x006a, 0x0047, 0x0036, 0x0026, 0x0027, 0x0017, 0x000f,
 0x006d, 0x0035, 0x0033, 0x002f, 0x005a, 0x0052, 0x003a, 0x0039,
 0x0030, 0x0048, 0x0039, 0x0029, 0x0017, 0x001b, 0x003e, 0x0009,
 0x0056, 0x002a, 0x0028, 0x0025, 0x0046, 0x0040, 0x0034, 0x002b,
 0x0046, 0x0037, 0x002a, 0x0019, 0x001d, 0x0012, 0x000b, 0x000b,
 0x0076, 0x0044, 0x001e, 0x0037, 0x0032, 0x002e, 0x004a, 0x0041,
 0x0031, 0x0027, 0x0018, 0x0010, 0x0016, 0x000d, 0x000e, 0x0007,
 0x005b, 0x002c, 0x0027, 0x0026, 0x0022, 0x003f, 0x0034, 0x002d,
 0x001f, 0x0034, 0x001c, 0x0013, 0x000e, 0x0008, 0x0009, 0x0003,
 0x007b, 0x003c, 0x003a, 0x0035, 0x002f, 0x002b, 0x0020, 0x0016,
 0x0025, 0x0018, 0x0011, 0x000c, 0x000f, 0x000a, 0x0002, 0x0001,
 0x0047, 0x0025, 0x0022, 0x001e, 0x001c, 0x0014, 0x0011, 0x001a,
 0x0015, 0x0010, 0x000a, 0x0006, 0x0008, 0x0006, 0x0002, 0x0000
]);

const mp3_huffbits_15 = new Uint8Array([
  3,  4,  5,  7,  7,  8,  9,  9,
  9, 10, 10, 11, 11, 11, 12, 13,
  4,  3,  5,  6,  7,  7,  8,  8,
  8,  9,  9, 10, 10, 10, 11, 11,
  5,  5,  5,  6,  7,  7,  8,  8,
  8,  9,  9, 10, 10, 11, 11, 11,
  6,  6,  6,  7,  7,  8,  8,  9,
  9,  9, 10, 10, 10, 11, 11, 11,
  7,  6,  7,  7,  8,  8,  9,  9,
  9,  9, 10, 10, 10, 11, 11, 11,
  8,  7,  7,  8,  8,  8,  9,  9,
  9,  9, 10, 10, 11, 11, 11, 12,
  9,  7,  8,  8,  8,  9,  9,  9,
  9, 10, 10, 10, 11, 11, 12, 12,
  9,  8,  8,  9,  9,  9,  9, 10,
 10, 10, 10, 10, 11, 11, 11, 12,
  9,  8,  8,  9,  9,  9,  9, 10,
 10, 10, 10, 11, 11, 12, 12, 12,
  9,  8,  9,  9,  9,  9, 10, 10,
 10, 11, 11, 11, 11, 12, 12, 12,
 10,  9,  9,  9, 10, 10, 10, 10,
 10, 11, 11, 11, 11, 12, 13, 12,
 10,  9,  9,  9, 10, 10, 10, 10,
 11, 11, 11, 11, 12, 12, 12, 13,
 11, 10,  9, 10, 10, 10, 11, 11,
 11, 11, 11, 11, 12, 12, 13, 13,
 11, 10, 10, 10, 10, 11, 11, 11,
 11, 12, 12, 12, 12, 12, 13, 13,
 12, 11, 11, 11, 11, 11, 11, 11,
 12, 12, 12, 12, 13, 13, 12, 13,
 12, 11, 11, 11, 11, 11, 11, 12,
 12, 12, 12, 12, 13, 13, 13, 13
]);

const mp3_huffcodes_16 = new Uint16Array([
 0x0001, 0x0005, 0x000e, 0x002c, 0x004a, 0x003f, 0x006e, 0x005d,
 0x00ac, 0x0095, 0x008a, 0x00f2, 0x00e1, 0x00c3, 0x0178, 0x0011,
 0x0003, 0x0004, 0x000c, 0x0014, 0x0023, 0x003e, 0x0035, 0x002f,
 0x0053, 0x004b, 0x0044, 0x0077, 0x00c9, 0x006b, 0x00cf, 0x0009,
 0x000f, 0x000d, 0x0017, 0x0026, 0x0043, 0x003a, 0x0067, 0x005a,
 0x00a1, 0x0048, 0x007f, 0x0075, 0x006e, 0x00d1, 0x00ce, 0x0010,
 0x002d, 0x0015, 0x0027, 0x0045, 0x0040, 0x0072, 0x0063, 0x0057,
 0x009e, 0x008c, 0x00fc, 0x00d4, 0x00c7, 0x0183, 0x016d, 0x001a,
 0x004b, 0x0024, 0x0044, 0x0041, 0x0073, 0x0065, 0x00b3, 0x00a4,
 0x009b, 0x0108, 0x00f6, 0x00e2, 0x018b, 0x017e, 0x016a, 0x0009,
 0x0042, 0x001e, 0x003b, 0x0038, 0x0066, 0x00b9, 0x00ad, 0x0109,
 0x008e, 0x00fd, 0x00e8, 0x0190, 0x0184, 0x017a, 0x01bd, 0x0010,
 0x006f, 0x0036, 0x0034, 0x0064, 0x00b8, 0x00b2, 0x00a0, 0x0085,
 0x0101, 0x00f4, 0x00e4, 0x00d9, 0x0181, 0x016e, 0x02cb, 0x000a,
 0x0062, 0x0030, 0x005b, 0x0058, 0x00a5, 0x009d, 0x0094, 0x0105,
 0x00f8, 0x0197, 0x018d, 0x0174, 0x017c, 0x0379, 0x0374, 0x0008,
 0x0055, 0x0054, 0x0051, 0x009f, 0x009c, 0x008f, 0x0104, 0x00f9,
 0x01ab, 0x0191, 0x0188, 0x017f, 0x02d7, 0x02c9, 0x02c4, 0x0007,
 0x009a, 0x004c, 0x0049, 0x008d, 0x0083, 0x0100, 0x00f5, 0x01aa,
 0x0196, 0x018a, 0x0180, 0x02df, 0x0167, 0x02c6, 0x0160, 0x000b,
 0x008b, 0x0081, 0x0043, 0x007d, 0x00f7, 0x00e9, 0x00e5, 0x00db,
 0x0189, 0x02e7, 0x02e1, 0x02d0, 0x0375, 0x0372, 0x01b7, 0x0004,
 0x00f3, 0x0078, 0x0076, 0x0073, 0x00e3, 0x00df, 0x018c, 0x02ea,
 0x02e6, 0x02e0, 0x02d1, 0x02c8, 0x02c2, 0x00df, 0x01b4, 0x0006,
 0x00ca, 0x00e0, 0x00de, 0x00da, 0x00d8, 0x0185, 0x0182, 0x017d,
 0x016c, 0x0378, 0x01bb, 0x02c3, 0x01b8, 0x01b5, 0x06c0, 0x0004,
 0x02eb, 0x00d3, 0x00d2, 0x00d0, 0x0172, 0x017b, 0x02de, 0x02d3,
 0x02ca, 0x06c7, 0x0373, 0x036d, 0x036c, 0x0d83, 0x0361, 0x0002,
 0x0179, 0x0171, 0x0066, 0x00bb, 0x02d6, 0x02d2, 0x0166, 0x02c7,
 0x02c5, 0x0362, 0x06c6, 0x0367, 0x0d82, 0x0366, 0x01b2, 0x0000,
 0x000c, 0x000a, 0x0007, 0x000b, 0x000a, 0x0011, 0x000b, 0x0009,
 0x000d, 0x000c, 0x000a, 0x0007, 0x0005, 0x0003, 0x0001, 0x0003
]);

const mp3_huffbits_16 = new Uint8Array([
  1,  4,  6,  8,  9,  9, 10, 10,
 11, 11, 11, 12, 12, 12, 13,  9,
  3,  4,  6,  7,  8,  9,  9,  9,
 10, 10, 10, 11, 12, 11, 12,  8,
  6,  6,  7,  8,  9,  9, 10, 10,
 11, 10, 11, 11, 11, 12, 12,  9,
  8,  7,  8,  9,  9, 10, 10, 10,
 11, 11, 12, 12, 12, 13, 13, 10,
  9,  8,  9,  9, 10, 10, 11, 11,
 11, 12, 12, 12, 13, 13, 13,  9,
  9,  8,  9,  9, 10, 11, 11, 12,
 11, 12, 12, 13, 13, 13, 14, 10,
 10,  9,  9, 10, 11, 11, 11, 11,
 12, 12, 12, 12, 13, 13, 14, 10,
 10,  9, 10, 10, 11, 11, 11, 12,
 12, 13, 13, 13, 13, 15, 15, 10,
 10, 10, 10, 11, 11, 11, 12, 12,
 13, 13, 13, 13, 14, 14, 14, 10,
 11, 10, 10, 11, 11, 12, 12, 13,
 13, 13, 13, 14, 13, 14, 13, 11,
 11, 11, 10, 11, 12, 12, 12, 12,
 13, 14, 14, 14, 15, 15, 14, 10,
 12, 11, 11, 11, 12, 12, 13, 14,
 14, 14, 14, 14, 14, 13, 14, 11,
 12, 12, 12, 12, 12, 13, 13, 13,
 13, 15, 14, 14, 14, 14, 16, 11,
 14, 12, 12, 12, 13, 13, 14, 14,
 14, 16, 15, 15, 15, 17, 15, 11,
 13, 13, 11, 12, 14, 14, 13, 14,
 14, 15, 16, 15, 17, 15, 14, 11,
  9,  8,  8,  9,  9, 10, 10, 10,
 11, 11, 11, 11, 11, 11, 11,  8
]);

const mp3_huffcodes_24 = new Uint16Array([
 0x000f, 0x000d, 0x002e, 0x0050, 0x0092, 0x0106, 0x00f8, 0x01b2,
 0x01aa, 0x029d, 0x028d, 0x0289, 0x026d, 0x0205, 0x0408, 0x0058,
 0x000e, 0x000c, 0x0015, 0x0026, 0x0047, 0x0082, 0x007a, 0x00d8,
 0x00d1, 0x00c6, 0x0147, 0x0159, 0x013f, 0x0129, 0x0117, 0x002a,
 0x002f, 0x0016, 0x0029, 0x004a, 0x0044, 0x0080, 0x0078, 0x00dd,
 0x00cf, 0x00c2, 0x00b6, 0x0154, 0x013b, 0x0127, 0x021d, 0x0012,
 0x0051, 0x0027, 0x004b, 0x0046, 0x0086, 0x007d, 0x0074, 0x00dc,
 0x00cc, 0x00be, 0x00b2, 0x0145, 0x0137, 0x0125, 0x010f, 0x0010,
 0x0093, 0x0048, 0x0045, 0x0087, 0x007f, 0x0076, 0x0070, 0x00d2,
 0x00c8, 0x00bc, 0x0160, 0x0143, 0x0132, 0x011d, 0x021c, 0x000e,
 0x0107, 0x0042, 0x0081, 0x007e, 0x0077, 0x0072, 0x00d6, 0x00ca,
 0x00c0, 0x00b4, 0x0155, 0x013d, 0x012d, 0x0119, 0x0106, 0x000c,
 0x00f9, 0x007b, 0x0079, 0x0075, 0x0071, 0x00d7, 0x00ce, 0x00c3,
 0x00b9, 0x015b, 0x014a, 0x0134, 0x0123, 0x0110, 0x0208, 0x000a,
 0x01b3, 0x0073, 0x006f, 0x006d, 0x00d3, 0x00cb, 0x00c4, 0x00bb,
 0x0161, 0x014c, 0x0139, 0x012a, 0x011b, 0x0213, 0x017d, 0x0011,
 0x01ab, 0x00d4, 0x00d0, 0x00cd, 0x00c9, 0x00c1, 0x00ba, 0x00b1,
 0x00a9, 0x0140, 0x012f, 0x011e, 0x010c, 0x0202, 0x0179, 0x0010,
 0x014f, 0x00c7, 0x00c5, 0x00bf, 0x00bd, 0x00b5, 0x00ae, 0x014d,
 0x0141, 0x0131, 0x0121, 0x0113, 0x0209, 0x017b, 0x0173, 0x000b,
 0x029c, 0x00b8, 0x00b7, 0x00b3, 0x00af, 0x0158, 0x014b, 0x013a,
 0x0130, 0x0122, 0x0115, 0x0212, 0x017f, 0x0175, 0x016e, 0x000a,
 0x028c, 0x015a, 0x00ab, 0x00a8, 0x00a4, 0x013e, 0x0135, 0x012b,
 0x011f, 0x0114, 0x0107, 0x0201, 0x0177, 0x0170, 0x016a, 0x0006,
 0x0288, 0x0142, 0x013c, 0x0138, 0x0133, 0x012e, 0x0124, 0x011c,
 0x010d, 0x0105, 0x0200, 0x0178, 0x0172, 0x016c, 0x0167, 0x0004,
 0x026c, 0x012c, 0x0128, 0x0126, 0x0120, 0x011a, 0x0111, 0x010a,
 0x0203, 0x017c, 0x0176, 0x0171, 0x016d, 0x0169, 0x0165, 0x0002,
 0x0409, 0x0118, 0x0116, 0x0112, 0x010b, 0x0108, 0x0103, 0x017e,
 0x017a, 0x0174, 0x016f, 0x016b, 0x0168, 0x0166, 0x0164, 0x0000,
 0x002b, 0x0014, 0x0013, 0x0011, 0x000f, 0x000d, 0x000b, 0x0009,
 0x0007, 0x0006, 0x0004, 0x0007, 0x0005, 0x0003, 0x0001, 0x0003
]);

const mp3_huffbits_24 = new Uint8Array([
  4,  4,  6,  7,  8,  9,  9, 10,
 10, 11, 11, 11, 11, 11, 12,  9,
  4,  4,  5,  6,  7,  8,  8,  9,
  9,  9, 10, 10, 10, 10, 10,  8,
  6,  5,  6,  7,  7,  8,  8,  9,
  9,  9,  9, 10, 10, 10, 11,  7,
  7,  6,  7,  7,  8,  8,  8,  9,
  9,  9,  9, 10, 10, 10, 10,  7,
  8,  7,  7,  8,  8,  8,  8,  9,
  9,  9, 10, 10, 10, 10, 11,  7,
  9,  7,  8,  8,  8,  8,  9,  9,
  9,  9, 10, 10, 10, 10, 10,  7,
  9,  8,  8,  8,  8,  9,  9,  9,
  9, 10, 10, 10, 10, 10, 11,  7,
 10,  8,  8,  8,  9,  9,  9,  9,
 10, 10, 10, 10, 10, 11, 11,  8,
 10,  9,  9,  9,  9,  9,  9,  9,
  9, 10, 10, 10, 10, 11, 11,  8,
 10,  9,  9,  9,  9,  9,  9, 10,
 10, 10, 10, 10, 11, 11, 11,  8,
 11,  9,  9,  9,  9, 10, 10, 10,
 10, 10, 10, 11, 11, 11, 11,  8,
 11, 10,  9,  9,  9, 10, 10, 10,
 10, 10, 10, 11, 11, 11, 11,  8,
 11, 10, 10, 10, 10, 10, 10, 10,
 10, 10, 11, 11, 11, 11, 11,  8,
 11, 10, 10, 10, 10, 10, 10, 10,
 11, 11, 11, 11, 11, 11, 11,  8,
 12, 10, 10, 10, 10, 10, 10, 11,
 11, 11, 11, 11, 11, 11, 11,  8,
  8,  7,  7,  7,  7,  7,  7,  7,
  7,  7,  7,  8,  8,  8,  8,  4
]);

const mp3_huff_tables = [
    [1, NULL, NULL],
    [2, mp3_huffbits_1, mp3_huffcodes_1],
    [3, mp3_huffbits_2, mp3_huffcodes_2],
    [3, mp3_huffbits_3, mp3_huffcodes_3],
    [4, mp3_huffbits_5, mp3_huffcodes_5],
    [4, mp3_huffbits_6, mp3_huffcodes_6],
    [6, mp3_huffbits_7, mp3_huffcodes_7],
    [6, mp3_huffbits_8, mp3_huffcodes_8],
    [6, mp3_huffbits_9, mp3_huffcodes_9],
    [8, mp3_huffbits_10, mp3_huffcodes_10],
    [8, mp3_huffbits_11, mp3_huffcodes_11],
    [8, mp3_huffbits_12, mp3_huffcodes_12],
    [16, mp3_huffbits_13, mp3_huffcodes_13],
    [16, mp3_huffbits_15, mp3_huffcodes_15],
    [16, mp3_huffbits_16, mp3_huffcodes_16],
    [16, mp3_huffbits_24, mp3_huffcodes_24]
];

// [32][2]
const mp3_huff_data = new Uint8Array([
    0, 0,
    1, 0,
    2, 0,
    3, 0,
    0, 0,
    4, 0,
    5, 0,
    6, 0,
    7, 0,
    8, 0,
    9, 0,
    10, 0,
    11, 0,
    12, 0,
    0, 0,
    13, 0,
    14, 1,
    14, 2,
    14, 3,
    14, 4,
    14, 6,
    14, 8,
    14, 10,
    14, 13,
    15, 4,
    15, 5,
    15, 6,
    15, 7,
    15, 8,
    15, 9,
    15, 11,
    15, 13
]);

const C1 = FIXHR(0.98480775301220805936 / 2);
const C2 = FIXHR(0.93969262078590838405 / 2);
const C3 = FIXHR(0.86602540378443864676 / 2);
const C4 = FIXHR(0.76604444311897803520 / 2);
const C5 = FIXHR(0.64278760968653932632 / 2);
//const C6 = FIXHR(0.5 / 2);
const C7 = FIXHR(0.34202014332566873304 / 2);
const C8 = FIXHR(0.17364817766693034885 / 2);
const COS0_0 =  FIXHR(0.50060299823519630134 / 2);
const COS0_1 =  FIXHR(0.50547095989754365998 / 2);
const COS0_2 =  FIXHR(0.51544730992262454697 / 2);
const COS0_3 =  FIXHR(0.53104259108978417447 / 2);
const COS0_4 =  FIXHR(0.55310389603444452782 / 2);
const COS0_5 =  FIXHR(0.58293496820613387367 / 2);
const COS0_6 =  FIXHR(0.62250412303566481615 / 2);
const COS0_7 =  FIXHR(0.67480834145500574602 / 2);
const COS0_8 =  FIXHR(0.74453627100229844977 / 2);
const COS0_9 =  FIXHR(0.83934964541552703873 / 2);
const COS0_10 = FIXHR(0.97256823786196069369 / 2);
const COS0_11 = FIXHR(1.16943993343288495515 / 4);
const COS0_12 = FIXHR(1.48416461631416627724 / 4);
const COS0_13 = FIXHR(2.05778100995341155085 / 8);
const COS0_14 = FIXHR(3.40760841846871878570 / 8);
const COS0_15 = FIXHR(10.19000812354805681150 / 32);
const COS1_0 = FIXHR(0.50241928618815570551 / 2);
const COS1_1 = FIXHR(0.52249861493968888062 / 2);
const COS1_2 = FIXHR(0.56694403481635770368 / 2);
const COS1_3 = FIXHR(0.64682178335999012954 / 2);
const COS1_4 = FIXHR(0.78815462345125022473 / 2);
const COS1_5 = FIXHR(1.06067768599034747134 / 4);
const COS1_6 = FIXHR(1.72244709823833392782 / 4);
const COS1_7 = FIXHR(5.10114861868916385802 / 16);
const COS2_0 = FIXHR(0.50979557910415916894 / 2);
const COS2_1 = FIXHR(0.60134488693504528054 / 2);
const COS2_2 = FIXHR(0.89997622313641570463 / 2);
const COS2_3 = FIXHR(2.56291544774150617881 / 8);
const COS3_0 = FIXHR(0.54119610014619698439 / 2);
const COS3_1 = FIXHR(1.30656296487637652785 / 4);
const COS4_0 = FIXHR(0.70710678118654752439 / 2);

const icos36 = new Int32Array([
    FIXR(0.50190991877167369479),
    FIXR(0.51763809020504152469), //0
    FIXR(0.55168895948124587824),
    FIXR(0.61038729438072803416),
    FIXR(0.70710678118654752439), //1
    FIXR(0.87172339781054900991),
    FIXR(1.18310079157624925896),
    FIXR(1.93185165257813657349), //2
    FIXR(5.73685662283492756461)
]);

const icos36h = new Int32Array([
    FIXHR(0.50190991877167369479 / 2),
    FIXHR(0.51763809020504152469 / 2), //0
    FIXHR(0.55168895948124587824 / 2),
    FIXHR(0.61038729438072803416 / 2),
    FIXHR(0.70710678118654752439 / 2), //1
    FIXHR(0.87172339781054900991 / 2),
    FIXHR(1.18310079157624925896 / 4),
    FIXHR(1.93185165257813657349 / 4) //2
]);

function buildTable(vlc, table_nb_bits, nb_codes, bits, bits_wrap, bits_size,
                    codes, codes_wrap, codes_size,
                    code_prefix, n_prefix) {
    var i, j, k, n, table_size, table_index, nb, n1, index, code_prefix2;
    // uint32
    var code;
    table_size = 1 << table_nb_bits;
    table_index = vlc.alloc_table(table_size);
    var table = vlc.table;
    var table_ptr = table_index * 2;

    if (table_index < 0) {
        return -1;
    }

    for (var i = 0; i < table_size; ++i) {
        table[table_ptr + (i * 2) + 1] = 0; // bits
        table[table_ptr + (i * 2)] = -1; // codes
    }

    const bits_view = bits_size === 1 ? new Uint8Array(bits.buffer) :
                   bits_size === 2 ? new Uint16Array(bits.buffer) :
                   new Uint32Array(bits.buffer);

    const codes_view = codes_size === 1 ? new Uint8Array(codes.buffer) :
                       codes_size === 2 ? new Uint16Array(codes.buffer) :
                       new Uint32Array(codes.buffer);

    for (var i = 0; i < nb_codes; ++i) {
        n = bits_view[i];
        code = codes_view[i];

        if (n <= 0) continue;

        n -= n_prefix;
        code_prefix2 = code >>> n;

        if (n > 0 && code_prefix2 === code_prefix) {
            if (n <= table_nb_bits) {
                j = (code << (table_nb_bits - n)) & (table_size - 1);
                nb = 1 << (table_nb_bits -n);
                
                for (var k = 0; k < nb; ++k) {
                    if (table[table_ptr + (j * 2) + 1] !== 0) {
                        throw new Error("should be 0");
                    }
                    table[table_ptr + (j * 2) + 1] = n;
                    table[table_ptr + (j * 2)] = i;
                    j++;
                }
            } else {
                n -= table_nb_bits;
                j = (code >>> n) & ((1 << table_nb_bits) - 1);
                n1 = -(table[table_ptr + (j * 2) + 1]);
                if (n > n1) n1 = n;
                table[table_ptr + (j * 2) + 1] = -n1;
            }
        }
    }

    for (var i = 0; i < table_size; ++i) {
        var n = table[table_ptr + (i * 2) + 1];
        if (n < 0) {
            n = -n;
            if (n > table_nb_bits) {
                n = table_nb_bits;
                table[table_ptr + (i * 2) + 1] = -n;
            }
            index = buildTable(vlc, n, nb_codes, bits, bits_wrap, bits_size,
                                codes, codes_wrap, codes_size,
                                (code_prefix << table_nb_bits) | i,
                                n_prefix + table_nb_bits);
            if (index < 0) {
                throw new Error("invalid index");
            }
            table_ptr = table_index * 2;
            table = vlc.table;
            table[table_ptr + (i * 2)] = index;
        }
    }
    return table_index;
}


function Vlc(nb_bits, nb_codes, bits, bits_wrap, bits_size, codes, codes_wrap, codes_size) {
    this.bits = nb_bits;
    this.table_size = 0;
    this.table_allocated = 0;
    this.code = null;
    this.table = null;
    buildTable(this, nb_bits, nb_codes, bits, bits_wrap, bits_size,
                codes, codes_wrap, codes_size, 0, 0);
}

Vlc.prototype.alloc_table = function(size) {
    var index = this.table_size;
    this.table_size += size;

    if (this.table_size > this.table_allocated) {
        this.table_allocated += (1 << this.bits);
        var newTable = new Int16Array(this.table_allocated * 2);
        if (this.table) {
            for (var i = 0; i < this.table.length; ++i) {
                newTable[i] = this.table[i];
            }
        }
        this.table = newTable;
    }
    return index;
};
// Initialize

(function() {
for (var i = 0; i < 257; ++i) {
    var v = mp3_enwindow[i];

    if (FRAC_BITS < 16) {
        v = (v + (1 << (16 - WFRAC_BITS - 1))) >> (16 - WFRAC_BITS);
    }

    window_values[i] = v;

    if ((i & 63) !== 0) {
        v = -v;
    }

    if (i !== 0) {
        window_values[512 - i] = v;
    }
}


for (var i = 1; i < 16; ++i) {
    // xsize, bits, codes
    var h = mp3_huff_tables[i];
    var tmp_bits = new Uint8Array(512);
    var tmp_codes = new Uint16Array(512);

    var xsize = h[0];
    var j = 0;

    for (var x = 0; x < xsize; ++x) {
        for (var y = 0; y < xsize; ++y) {
            var xAndY = x !== 0 && y !== 0 ? 1 : 0;
            tmp_bits [(x << 5) | y | (xAndY<<4)] = h[1][j];
            tmp_codes[(x << 5) | y | (xAndY<<4)] = h[2][j];
            j++;
        }
    }
    huff_vlc[i] = new Vlc(7, 512, tmp_bits, 1, 1, tmp_codes, 2, 2);
}

for (var i = 0; i < 2; ++i) {
    huff_quad_vlc[i] = new Vlc(i === 0 ? 7 : 4, 16, mp3_quad_bits[i], 1, 1, mp3_quad_codes[i], 1, 1);
}

for (var i = 0; i < 9; ++i) {
    var k = 0;
    for (var j = 0; j < 22; ++j) {
        band_index_long[i * 23 + j] = k;
        k += band_size_long[i * 22 + j];
    }
    band_index_long[i * 23 + 22] = k;
}

for (var i = 1; i < TABLE_4_3_SIZE; ++i) {
    var f = Math.pow(i / 4|0, 4 / 3) * Math.pow(2, (i & 3) * 0.25);
    var fm = libc_frexp(f);
    var e = libc_frexp_result_e;
    var m = (fm * Math.pow(2, 31) + 0.5) >>> 0;
    e += (FRAC_BITS - 31 + 5 - 100);
    table_4_3_value[i] = m;
    table_4_3_exp[i] = -e;
}

for (var i = 0; i < 512 * 16; ++i) {
    var exponent = i >> 4;
    var f = Math.pow(i & 15, 4 / 3) * Math.pow(2, (exponent - 400) * 0.25 + FRAC_BITS + 5);
    expval_table[exponent * 16 + (i & 15)] = f;

    if ((i & 15) === 1) {
        exp_table[exponent] = f;
    }
}

for (var i = 0; i < 7; ++i) {
    var f, v;
    if (i !== 6) {
        f = Math.tan(i * Math.PI / 12);
        v = FIXR(f / (1 + f));
    } else {
        v = FIXR(1);
    }
    is_table[0 * 16 + i] = v;
    is_table[1 * 16 + (6 - i)] = v;
}

for (var i = 7; i < 16; ++i) {
    is_table[0 * 16 + i] = is_table[1 * 16 + i] = 0;
}

for (var i = 0; i < 16; ++i) {
    for (var j = 0; j < 2; ++j) {
        var the_table = is_table_lsf[j];
        var e = -(j + 1) * ((i + 1) >> 1);
        var f = Math.pow(2, e / 4);
        var k = i & 1;
        the_table[(k ^ 1) * 16 + i] = FIXR(f);
        the_table[k * 16 + i] = FIXR(1);
    }
}

for (var i = 0; i < 8; ++i) {
    var ci = Math.fround(ci_table[i]);
    var cs = Math.fround(1 / Math.sqrt(1 + ci * ci));
    var ca = Math.fround(cs * ci);

    csa_table[i * 4 + 0] = FIXHR(cs / 4);
    csa_table[i * 4 + 1] = FIXHR(ca / 4);
    csa_table[i * 4 + 2] = FIXHR(ca / 4) + FIXHR(cs / 4);
    csa_table[i * 4 + 3] = FIXHR(ca / 4) - FIXHR(cs / 4);
    csa_table_float[i * 4 + 0] = cs;
    csa_table_float[i * 4 + 1] = ca;
    csa_table_float[i * 4 + 2] = ca + cs;
    csa_table_float[i * 4 + 3] = ca - cs;
}

for (var i = 0; i < 36; ++i) {
    for (var j = 0; j < 4; ++j) {
        if (j === 2 && i % 3 !== 1) continue;

        var d = Math.sin(Math.PI * (i + 0.5) / 36);

        if (j === 1) {
            if (i >= 30) {
                d = 0;
            } else if (i >= 24) {
                d = Math.sin(Math.PI * (i - 18 + 0.5) / 12);
            } else if (i >= 18) {
                d = 1;
            }
        } else if (j === 3) {
            if (i < 6) {
                d = 0;
            } else if (i < 12) {
                d = Math.sin(Math.PI * (i - 6 + 0.5) / 12);
            } else if (i < 18) {
                d = 1;
            }
        }

        d *= (0.5 / Math.cos(Math.PI * (2 * i + 19) / 72));

        if (j === 2) {
            mdct_win[j * 36 + ((i / 3) | 0)] = FIXHR((d / (1 << 5)));
        } else {
            mdct_win[j * 36 + i] = FIXHR((d / (1 << 5)));
        }
    }
}

for (var j = 0; j < 4; ++j) {
    for (var i = 0; i < 36; i+= 2) {
        mdct_win[(j + 4) * 36 + i] = mdct_win[j * 36 + i];
        mdct_win[(j + 4) * 36 + (i + 1)] = -mdct_win[j * 36 + (i + 1)];
    }
}
})();

// DCT stuff

// [64][4]
const dct32_bf_1_passes = new Int32Array([
     0, 31,  COS0_0 , 1,
    15, 16,  COS0_15, 5,
     0, 15,  COS1_0 , 1,
    16, 31, -COS1_0 , 1,
     7, 24,  COS0_7 , 1,
     8, 23,  COS0_8 , 1,
     7,  8,  COS1_7 , 4,
    23, 24, -COS1_7 , 4,
     0,  7,  COS2_0 , 1,
     8, 15, -COS2_0 , 1,
    16, 23,  COS2_0 , 1,
    24, 31, -COS2_0 , 1,
     3, 28,  COS0_3 , 1,
    12, 19,  COS0_12, 2,
     3, 12,  COS1_3 , 1,
    19, 28, -COS1_3 , 1,
     4, 27,  COS0_4 , 1,
    11, 20,  COS0_11, 2,
     4, 11,  COS1_4 , 1,
    20, 27, -COS1_4 , 1,
     3,  4,  COS2_3 , 3,
    11, 12, -COS2_3 , 3,
    19, 20,  COS2_3 , 3,
    27, 28, -COS2_3 , 3,
     0,  3,  COS3_0 , 1,
     4,  7, -COS3_0 , 1,
     8, 11,  COS3_0 , 1,
    12, 15, -COS3_0 , 1,
    16, 19,  COS3_0 , 1,
    20, 23, -COS3_0 , 1,
    24, 27,  COS3_0 , 1,
    28, 31, -COS3_0 , 1,
     1, 30,  COS0_1 , 1,
    14, 17,  COS0_14, 3,
     1, 14,  COS1_1 , 1,
    17, 30, -COS1_1 , 1,
     6, 25,  COS0_6 , 1,
     9, 22,  COS0_9 , 1,
     6,  9,  COS1_6 , 2,
    22, 25, -COS1_6 , 2,
     1,  6,  COS2_1 , 1,
     9, 14, -COS2_1 , 1,
    17, 22,  COS2_1 , 1,
    25, 30, -COS2_1 , 1,
     2, 29,  COS0_2 , 1,
    13, 18,  COS0_13, 3,
     2, 13,  COS1_2 , 1,
    18, 29, -COS1_2 , 1,
     5, 26,  COS0_5 , 1,
    10, 21,  COS0_10, 1,
     5, 10,  COS1_5 , 2,
    21, 26, -COS1_5 , 2,
     2,  5,  COS2_2 , 1,
    10, 13, -COS2_2 , 1,
    18, 21,  COS2_2 , 1,
    26, 29, -COS2_2 , 1,
     1,  2,  COS3_1 , 2,
     5,  6, -COS3_1 , 2,
     9, 10,  COS3_1 , 2,
    13, 14, -COS3_1 , 2,
    17, 18,  COS3_1 , 2,
    21, 22, -COS3_1 , 2,
    25, 26,  COS3_1 , 2,
    29, 30, -COS3_1 , 2
]);

const dct32_bf_1_pass = function(tab, tab_ptr) {
    var tmp0, tmp1;
    for (var i = 0; i < 64; ++i) {
        var index = Math.imul(i, 4);
        var a = dct32_bf_1_passes[index] + tab_ptr;
        var b = dct32_bf_1_passes[index + 1] + tab_ptr;
        var c = dct32_bf_1_passes[index + 2];
        var s = dct32_bf_1_passes[index + 3];
        tmp0 = tab[a] + tab[b];
        tmp1 = tab[a] - tab[b];
        tab[a] = tmp0;
        tab[b] = MULH(tmp1 << s, c);
    }
};

// [8][5]
const dct32_bf_2_passes = new Int32Array([
    1, 0,  1,  2,  3,
    2, 4,  5,  6,  7,
    1, 8,  9, 10, 11,
    2, 12, 13, 14, 15,
    1, 16, 17, 18, 19,
    2, 20, 21, 22, 23,
    1, 24, 25, 26, 27,
    2, 28, 29, 30, 31
]);

const dct32_bf_2_pass = function(tab, tab_ptr) {
    var tmp0, tmp1;
    for (var i = 0; i < 8; ++i) {
        var index = Math.imul(i, 5);
        var type = dct32_bf_2_passes[index];
        var a = dct32_bf_2_passes[index + 1] + tab_ptr;
        var b = dct32_bf_2_passes[index + 2] + tab_ptr;
        var c = dct32_bf_2_passes[index + 3] + tab_ptr;
        var d = dct32_bf_2_passes[index + 4] + tab_ptr;

        tmp0 = tab[a] + tab[b];
        tmp1 = tab[a] - tab[b];
        tab[a] = tmp0;
        tab[b] = MULH(tmp1 << 1, COS4_0);
        tmp0 = tab[c] + tab[d];
        tmp1 = tab[c] - tab[d];
        tab[c] = tmp0;
        tab[d] = MULH(tmp1 << 1, -COS4_0);

        if (type === 1) {
            tab[c] += tab[d];
        } else {
            tab[c] += tab[d];
            tab[a] += tab[c];
            tab[c] += tab[b];
            tab[b] += tab[d];
        }
    }
};

const dct32_tmp32 = new Int32Array(32);
const dct32_result1 = function(tab, tab_ptr) {
    tab[tab_ptr + 8] += tab[tab_ptr + 12];
    tab[tab_ptr + 12] += tab[tab_ptr + 10];
    tab[tab_ptr + 10] += tab[tab_ptr + 14];
    tab[tab_ptr + 14] += tab[tab_ptr + 9];
    tab[tab_ptr + 9] += tab[tab_ptr + 13];
    tab[tab_ptr + 13] += tab[tab_ptr + 11];
    tab[tab_ptr + 11] += tab[tab_ptr + 15];

    dct32_tmp32[0] = tab[tab_ptr + 0];
    dct32_tmp32[16] = tab[tab_ptr + 1];
    dct32_tmp32[8] = tab[tab_ptr + 2];
    dct32_tmp32[24] = tab[tab_ptr + 3];
    dct32_tmp32[4] = tab[tab_ptr + 4];
    dct32_tmp32[20] = tab[tab_ptr + 5];
    dct32_tmp32[12] = tab[tab_ptr + 6];
    dct32_tmp32[28] = tab[tab_ptr + 7];
    dct32_tmp32[2] = tab[tab_ptr + 8];
    dct32_tmp32[18] = tab[tab_ptr + 9];
    dct32_tmp32[10] = tab[tab_ptr + 10];
    dct32_tmp32[26] = tab[tab_ptr + 11];
    dct32_tmp32[6] = tab[tab_ptr + 12];
    dct32_tmp32[22] = tab[tab_ptr + 13];
    dct32_tmp32[14] = tab[tab_ptr + 14];
    dct32_tmp32[30] = tab[tab_ptr + 15];
};

const dct32_result2 = function(tab, tab_ptr) {
    tab[tab_ptr + 24] += tab[tab_ptr + 28];
    tab[tab_ptr + 28] += tab[tab_ptr + 26];
    tab[tab_ptr + 26] += tab[tab_ptr + 30];
    tab[tab_ptr + 30] += tab[tab_ptr + 25];
    tab[tab_ptr + 25] += tab[tab_ptr + 29];
    tab[tab_ptr + 29] += tab[tab_ptr + 27];
    tab[tab_ptr + 27] += tab[tab_ptr + 31];

    dct32_tmp32[1] = tab[tab_ptr + 16] + tab[tab_ptr + 24];
    dct32_tmp32[17] = tab[tab_ptr + 17] + tab[tab_ptr + 25];
    dct32_tmp32[9] = tab[tab_ptr + 18] + tab[tab_ptr + 26];
    dct32_tmp32[25] = tab[tab_ptr + 19] + tab[tab_ptr + 27];
    dct32_tmp32[5] = tab[tab_ptr + 20] + tab[tab_ptr + 28];
    dct32_tmp32[21] = tab[tab_ptr + 21] + tab[tab_ptr + 29];
    dct32_tmp32[13] = tab[tab_ptr + 22] + tab[tab_ptr + 30];
    dct32_tmp32[29] = tab[tab_ptr + 23] + tab[tab_ptr + 31];
    dct32_tmp32[3] = tab[tab_ptr + 24] + tab[tab_ptr + 20];
    dct32_tmp32[19] = tab[tab_ptr + 25] + tab[tab_ptr + 21];
    dct32_tmp32[11] = tab[tab_ptr + 26] + tab[tab_ptr + 22];
    dct32_tmp32[27] = tab[tab_ptr + 27] + tab[tab_ptr + 23];
    dct32_tmp32[7] = tab[tab_ptr + 28] + tab[tab_ptr + 18];
    dct32_tmp32[23] = tab[tab_ptr + 29] + tab[tab_ptr + 19];
    dct32_tmp32[15] = tab[tab_ptr + 30] + tab[tab_ptr + 17];
    dct32_tmp32[31] = tab[tab_ptr + 31];
};

const dct32 = function(tab, tab_ptr) {
    dct32_bf_1_pass(tab, tab_ptr);
    dct32_bf_2_pass(tab, tab_ptr);
    dct32_result1(tab, tab_ptr);
    dct32_result2(tab, tab_ptr);
};

function Granule() {
    this.scfsi = 0;
    this.part2_3_length = 0;
    this.big_values = 0;
    this.global_gain = 0;
    this.scalefac_compress = 0;
    this.block_type = 0;
    this.switch_point = 0;
    this.table_select0 = 0;
    this.table_select1 = 0;
    this.table_select2 = 0;
    this.subblock_gain0 = 0;
    this.subblock_gain1 = 0;
    this.subblock_gain2 = 0;
    this.scalefac_scale = 0;
    this.count1table_select = 0;
    this.region_size0 = 0;
    this.region_size1 = 0;
    this.region_size2 = 0;
    this.preflag = 0;
    this.short_start = 0;
    this.long_end = 0;
    this.scale_factors = new Uint8Array(40);
    this.sb_hybrid = new Int32Array(SBLIMIT * 18);
}

Granule.prototype.toJSON = function() {
    return {
        scfsi: this.scfsi,
        part2_3_length: this.part2_3_length,
        big_values: this.big_values,
        global_gain: this.global_gain,
        scalefac_compress: this.scalefac_compress,
        block_type: this.block_type,
        switch_point: this.switch_point,
        table_select0: this.table_select0,
        table_select1: this.table_select1,
        table_select2: this.table_select2,
        subblock_gain0: this.subblock_gain0,
        subblock_gain1: this.subblock_gain1,
        subblock_gain2: this.subblock_gain2,
        scalefac_scale: this.scalefac_scale,
        count1table_select: this.count1table_select,
        region_size0: this.region_size0,
        region_size1: this.region_size1,
        region_size2: this.region_size2,
        preflag: this.preflag,
        short_start: this.short_start,
        long_end: this.long_end
    };
};

const bufferCache = Object.create(null);
const getBuffer = function(channelIndex, type, length, id) {
    var key = channelIndex + " " + type + " " + length + " " + id;
    var result = bufferCache[key];
    if (!result) {
        result = 
            bufferCache[key] = type === INT16 ? new Int16Array(length) : new Float32Array(length);
    }
    return result;
};

const PENDING_HEADER = 0;
const PENDING_DATA = 1;
var id = 0;
function Mp3Context(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    var targetBufferLengthSeconds = "targetBufferLengthSeconds" in opts ? (
      Math.max(Math.min(opts.targetBufferLengthSeconds, MAX_BUFFER_LENGTH_SECONDS),
               MIN_BUFFER_LENGTH_SECONDS) || DEFAULT_BUFFER_LENGTH_SECONDS)
      : DEFAULT_BUFFER_LENGTH_SECONDS;

    var dataType = opts.dataType === INT16 ? INT16 : FLOAT;
    this.id = id++;
    this.targetBufferLengthSeconds = targetBufferLengthSeconds;
    this.dataType = dataType;
    this.granules = [new Granule(), new Granule(), new Granule(), new Granule()];
    this.last_buf = new Uint8Array(2 * BACKSTEP_SIZE * EXTRABYTES);
    this.last_buf_size = 0;
    this.frame_size = 0;
    this.free_format_next_header = 0;
    this.error_protection = 0;
    this.sample_rate = 0;
    this.sample_rate_index = 0;
    this.bit_rate = 0;
    this.gb = new BitStream();
    this.in_gb = new BitStream();
    this.nb_channels = 0;
    this.mode = 0;
    this.mode_ext = 0;
    this.lsf = 0;
    this.synth_buf = [
        new Int16Array(512 * 2),
        new Int16Array(512 * 2)
    ];
    this.synth_buf_offset = [
        0, 0
    ];
    this.sb_samples = [
        // [36][SBLIMIT]
        new Int32Array(36 * SBLIMIT),
        new Int32Array(36 * SBLIMIT)
    ];
    this.mdct_buf = [
        new Int32Array(SBLIMIT * 18),
        new Int32Array(SBLIMIT * 18)
    ];
    this.dither_state = 0;
    this.samples = new Array(2);
    this.sampleBuffersInitialized = false;
    this.sampleLength = 0;
    this.invalidFrameCount = 0;
    this.state = PENDING_HEADER;
    this.source = new Uint8Array(MAX_MP3_FRAME_BYTE_LENGTH);
    this.sourceByteLength = 0;
    this.header = 0;
    this.samplesProcessed = 0;
    this.started = false;
    this.flushed = false;
}
Mp3Context.FLOAT = FLOAT;
Mp3Context.INT16 = INT16;

Mp3Context.prototype = Object.create(EventEmitter.prototype);
Mp3Context.prototype.constructor = Mp3Context;

Mp3Context.prototype.setBufferLength = function(targetBufferLengthSeconds) {
    if (!isFinite(+targetBufferLengthSeconds)) throw new Error("targetBufferLengthSeconds must be a number");
    
    targetBufferLengthSeconds = Math.max(Math.min(targetBufferLengthSeconds, MAX_BUFFER_LENGTH_SECONDS),
                            MIN_BUFFER_LENGTH_SECONDS);
    this._flush();
    this.targetBufferLengthSeconds = targetBufferLengthSeconds;
};

Mp3Context.prototype.getSampleRate = function() {
    if (this.state !== PENDING_DATA) throw new Error("header not parsed yet");
    return this.sample_rate;
};

Mp3Context.prototype.getCurrentTime = function() {
    if (this.state !== PENDING_DATA) throw new Error("header not parsed yet");
    return this.samplesProcessed / this.sample_rate;
};

Mp3Context.prototype.getChannelCount = function() {
    if (this.state !== PENDING_DATA) throw new Error("header not parsed yet");
    return this.nb_channels;
};

Mp3Context.prototype.decodeUntilFlush = function(src, srcStart) {
    return this.update(src, srcStart === undefined ? 0 : srcStart, undefined, true);
};

Mp3Context.prototype.update = function(src, srcStart, length, breakOnFlush) {
    if (!this.started) throw new Error("call .start() before calling update");
    if (breakOnFlush === undefined) breakOnFlush = false;
    if (arguments.length < 2) {
        length = src.length;
        srcStart = 0;
    }
    if (length === undefined) length = src.length - srcStart;

    const buffer = this.source;
    while (length > 0) {
        if (this.state === PENDING_HEADER) {
            if (length >= HEADER_SIZE) {
                var header = this.header;
                for (var i = 0; i < length; ++i) {
                    header = (header << 8) | src[srcStart + i];
                    if (this.checkHeader(header) && this.decodeHeader(header)) {
                        this.state = PENDING_DATA;
                        i++;
                        break;
                    }
                }
                this.header = header;
                length -= i;
                srcStart += i;
            } else {
                var header = this.header;
                for (var i = 0; i < length; ++i) {
                    header = (header << 8) | src[srcStart + i];
                    if (this.checkHeader(header) && this.decodeHeader(header)) {
                        this.state = PENDING_DATA;
                        break;
                    }
                }
                length = 0;
                this.header = header;
                break;
            }
        } else {
            if (!this.sampleBuffersInitialized) {
                this.sampleBuffersInitialized = true;
                for (var ch = 0; ch < this.nb_channels; ++ch) {
                    this.samples[ch] =
                        getBuffer(ch, this.dataType, (this.sample_rate * this.targetBufferLengthSeconds)|0, this.id);
                }
            }
            var bytesIndex = this.sourceByteLength;
            var bytesNeeded = this.frame_size - bytesIndex - HEADER_SIZE;

            if (length >= bytesNeeded) {
                for (var i = 0; i < bytesNeeded; ++i) {
                    buffer[bytesIndex + i] = src[srcStart + i];
                }
                this.sourceByteLength = bytesIndex + bytesNeeded;
                var flushed = this.decode();
                this.sourceByteLength = 0;
                length -= bytesNeeded;
                srcStart += bytesNeeded;
                this.state = PENDING_HEADER;
                this.header = 0;
                if (flushed && breakOnFlush) {
                    return srcStart;
                }
            } else {
                for (var i = 0; i < length; ++i) {
                    buffer[bytesIndex + i] = src[srcStart + i];
                }
                this.sourceByteLength = bytesIndex + length;
                length = 0;
                break;
            }
        }
    }

    return srcStart;
};

const EMPTY_FLOAT_ARRAY = new Float32Array(0);
const EMPTY_INT16_ARRAY = new Int16Array(0);
Mp3Context.prototype._flush = function() {
    var sampleLength = this.sampleLength;
    this.flushed = true;
    if (sampleLength > 0) {
        var targetSampleLength = (this.targetBufferLengthSeconds * this.sample_rate)|0;
        var samples;

        if (targetSampleLength === sampleLength) {
            samples = this.samples.slice(0, this.nb_channels);
        } else {
            samples = new Array(this.nb_channels);
            for (var ch = 0; ch < this.nb_channels; ++ch) {
                samples[ch] = this.dataType === FLOAT ? new Float32Array(sampleLength) : new Int16Array(sampleLength);
                var dst = samples[ch];
                var src = this.samples[ch];
                for (var i = 0; i < sampleLength; ++i) {
                    dst[i] = src[i];
                }
            }
        }

        this.emit("data", samples);
        this.sampleLength = 0;
    } else {
        var samples = new Array(this.nb_channels);
        var array = this.dataType === INT16 ? EMPTY_INT16_ARRAY : EMPTY_FLOAT_ARRAY;
        for (var i = 0; i < samples.length; ++i) samples[i] = array;
        this.emit("data", samples);
    }
};

Mp3Context.prototype._error = function() {
    try {
        this._flush();
    } finally {
        this.sampleLength = 0;
        this.end();
        this.emit("error", new Error("decoder error"));
    }
};

Mp3Context.prototype.decode = function() {
    if (this.decodeMain() >= 0) {
        this.invalidFrameCount = 0;
    } else {
        this.invalidFrameCount++;
        if (this.invalidFrameCount >= MAX_INVALID_FRAME_COUNT) {
            this._error();
        }
    }

    if (this.flushed) {
        this.flushed = false;
        return true;
    }
    return false;
};

const tmp_samples_i16 = new Int16Array(1152 * 2);
const tmp_samples_f32 = new Float32Array(1152 * 2);
Mp3Context.prototype._updatePositions = function(nb_frames, targetSamples) {
    const size = nb_frames * 32;

    if (this.sampleLength + size > targetSamples) {
        const overflow = size - (targetSamples - this.sampleLength);
        const remaining = targetSamples - this.sampleLength;
        const src = this.dataType === FLOAT ? tmp_samples_f32 : tmp_samples_i16;
        for (var ch = 0; ch < this.nb_channels; ++ch) {
            var srcIndex = ch * size;
            var dstIndex = this.sampleLength;
            var dst = this.samples[ch];
            
            for (var i = 0; i < remaining; ++i) {
                dst[dstIndex + i] = src[srcIndex + i];
            }
        }
        this.sampleLength = targetSamples;
        this.samplesProcessed += remaining;
        this._flush();
        for (var ch = 0; ch < this.nb_channels; ++ch) {
            var srcIndex = (ch * size) + remaining;
            var dst = this.samples[ch];
            
            for (var i = 0; i < overflow; ++i) {
                dst[i] = src[srcIndex + i];
            }
        }
        this.sampleLength = overflow;
    } else if (nb_frames > 0) {
        this.sampleLength = this.sampleLength + nb_frames * 32;
        this.samplesProcessed += (nb_frames * 32);
    }
};

Mp3Context.prototype.decodeMain = function() {
    var gb = this.gb;
    var in_gb = this.in_gb;
    gb.init(this.source, Math.imul(this.sourceByteLength, 8), 0);
    var CRC;

    if (this.error_protection) {
        CRC = gb.getBits(16);
    }

    var nb_frames = this.decodeLayer3();
    this.last_buf_size = 0;

    var i;
    if (in_gb.buffer !== null) {
        gb.alignGetBits();
        i = (gb.bitSize - gb.getBitsCount()) >> 3;

        if (i >= 0 && i <= BACKSTEP_SIZE) {
            var gb_ptr = gb.buffer_ptr + (gb.getBitsCount() >> 3);
            for (var u = 0; u < i; ++u) {
                this.last_buf[u] = gb.buffer[gb_ptr + u];
            }
            this.last_buf_size = i;
        }
        gb.assign(in_gb);
    }

    gb.alignGetBits();
    i = (gb.bitSize - gb.getBitsCount()) >> 3;

    if (i < 0 || i > BACKSTEP_SIZE || nb_frames < 0) {
        i = this.sourceByteLength;
        if (BACKSTEP_SIZE < i) i = BACKSTEP_SIZE;
    }

    var last_buf_ptr = this.last_buf_size;
    var gb_buffer_ptr = gb.buffer_ptr + this.sourceByteLength - i;
    for (var u = 0; u < i; ++u) {
        this.last_buf[u + last_buf_ptr] = gb.buffer[gb_buffer_ptr + u];
    }
    this.last_buf_size += i;

    var method = this.dataType === FLOAT ? this.synthFilterFloat32 : this.synthFilterInt16;
    var targetSamples = (this.sample_rate * this.targetBufferLengthSeconds)|0;
    const willOverflow = this.sampleLength + (nb_frames * 32) > targetSamples;
    for (var ch = 0; ch < this.nb_channels; ++ch) {
        var dst, dstStart;
    
        if (willOverflow) {
            dst = this.dataType === FLOAT ? tmp_samples_f32 : tmp_samples_i16;
            dstStart = ch * (nb_frames * 32);
        } else {
            dst = this.samples[ch];
            dstStart = this.sampleLength;
        }

        var sb_samples = this.sb_samples[ch];
        var synth_buf_offset = this.synth_buf_offset[ch];
        var synth_buf = this.synth_buf[ch];
        var ref = {
            synth_buf_offset: synth_buf_offset,
            dither_state: this.dither_state
        };

        for (var i = 0; i < nb_frames; ++i) {
            var sb_samples_ptr = Math.imul(i, SBLIMIT);
            method.call(this, ref, dstStart, synth_buf, dst, sb_samples, sb_samples_ptr, targetSamples);
            dstStart += 32;
        }
        this.synth_buf_offset[ch] = ref.synth_buf_offset;
        this.dither_state = ref.dither_state;
    }

    this._updatePositions(nb_frames, targetSamples);
    return nb_frames * 32;
};

Mp3Context.prototype.start = function() {
    if (this.started) throw new Error("previous decoding in session, call .end()");
    this.started = true;
    this.sampleBuffersInitialized = false;
};

Mp3Context.prototype.end = function() {
    try {
        this._flush();
    } finally {
        this.sampleBuffersInitialized = false;
        this.started = false;
        this.flushed = false;
        this.last_buf_size = 0;
        this.frame_size = 0;
        this.free_format_next_header = 0;
        this.error_protection = 0;
        this.sample_rate = 0;
        this.sample_rate_index = 0;
        this.bit_rate = 0;
        this.gb = new BitStream();
        this.in_gb = new BitStream();
        this.nb_channels = 0;
        this.mode = 0;
        this.mode_ext = 0;
        this.lsf = 0;
        this.synth_buf_offset[0] = this.synth_buf_offset[1] = 0;
        this.dither_state = 0;
        this.sampleLength = 0;
        this.invalidFrameCount = 0;
        this.state = PENDING_HEADER;
        this.sourceByteLength = 0;
        this.header = 0;
        this.samplesProcessed = 0;
    }
};

Mp3Context.prototype.checkHeader = function(header) {
    if ((header & 0xffe00000) !== -2097152) {
        return false;
    }

    if ((header & (3 << 17)) !== (1 << 17)) {
        return false;
    }

    if ((header & (0xF << 12)) === (0xF << 12)) {
        return false;
    }

    if ((header & (3 << 10)) === (3 << 10)) {
        return false;
    }

    return true;
};

Mp3Context.prototype.decodeHeader = function(header) {
    var sample_rate, frame_size, mpeg25, padding;
    var sample_rate_index, bitrate_index;

    if ((header & (1<<20)) !== 0) {
        this.lsf = (header & (1<<19)) !== 0 ? 0 : 1;
        mpeg25 = 0;
    } else {
        this.lsf = 1;
        mpeg25 = 1;
    }

    sample_rate_index = (header >> 10) & 3;

    if (sample_rate_index === 3) return false;

    sample_rate = mp3_freq_tab[sample_rate_index] >> (this.lsf + mpeg25);
    sample_rate_index += 3 * (this.lsf + mpeg25);
    this.sample_rate_index = sample_rate_index;
    this.error_protection = ((header >> 16) & 1) ^ 1;
    this.sample_rate = sample_rate;

    bitrate_index = (header >> 12) & 0xf;
    padding = (header >> 9) & 1;
    this.mode = (header >> 6) & 3;
    this.mode_ext = (header >> 4) & 3;
    this.nb_channels = (this.mode === MP3_MONO) ? 1 : 2;

    bitrate_index = this.lsf * 15 + bitrate_index;
    if (bitrate_index >= 0 && bitrate_index < 30) {
        frame_size = mp3_bitrate_tab[bitrate_index];
        if (frame_size <= 0) return false;
        this.bit_rate = frame_size * 1000;
        this.frame_size = (((frame_size * 144000) / (sample_rate << this.lsf))|0) + padding;
        return true;
    } else {
        /* if no frame size computed, signal it */
        return false;
    }
    return true;
};

Mp3Context.prototype._granuleLoop1 = function(g, gb) {
    g.part2_3_length = gb.getBits(12);
    g.big_values = gb.getBits(9);
    if (g.big_values > 288) {
        return false;
    }
    g.global_gain = gb.getBits(8);

    if ((this.mode_ext & (MODE_EXT_MS_STEREO | MODE_EXT_I_STEREO)) ===
        MODE_EXT_MS_STEREO) {
        g.global_gain -= 2;
    }

    if (this.lsf !== 0) {
        g.scalefac_compress = gb.getBits(9);
    } else {
        g.scalefac_compress = gb.getBits(4);
    }
    return true;
};

Mp3Context.prototype._granuleLoop2 = function(g, gb) {
    var blocksplit_flag = gb.getBits(1);

    if (blocksplit_flag !== 0) {
        var block_type = gb.getBits(2);
        g.block_type = block_type;
        if (block_type === 0) {
            return false;
        }
        g.switch_point = gb.getBits(1);

        g.table_select0 = gb.getBits(5);
        g.table_select1 = gb.getBits(5);

        g.subblock_gain0 = gb.getBits(3);
        g.subblock_gain1 = gb.getBits(3);
        g.subblock_gain2 = gb.getBits(3);

        if (block_type === 2) {
            g.region_size0 = 18;
        } else {
            if (this.sample_rate_index <= 2) {
                g.region_size0 = 18;
            } else if (this.sample_rate_index !== 8) {
                g.region_size0 = 27;
            } else {
                g.region_size0 = 54;
            }
        }

        g.region_size1 = 288;
    } else {
        var region_address1, region_address2, l;
        g.block_type = 0;
        g.switch_point = 0;

        g.table_select0 = gb.getBits(5);
        g.table_select1 = gb.getBits(5);
        g.table_select2 = gb.getBits(5);

        region_address1 = gb.getBits(4);
        region_address2 = gb.getBits(3);

        g.region_size0 =
            band_index_long[this.sample_rate_index * 23 + (region_address1 + 1)] >> 1;

        l = Math.min(region_address1 + region_address2 + 2, 22);

        g.region_size1 = band_index_long[this.sample_rate_index * 23 + l] >> 1;
    }
    return true;
};

Mp3Context.prototype._granuleLoop3 = function(g) {
    var j, k;

    g.region_size2 = 288;

    j = 0;

    k = g.region_size0;
    if (g.big_values < k) k = g.big_values;
    g.region_size0 = k - j;
    j = k;

    k = g.region_size1;
    if (g.big_values < k) k = g.big_values;
    g.region_size1 = k - j;
    j = k;

    k = g.region_size2;
    if (g.big_values < k) k = g.big_values;
    g.region_size2 = k - j;
    j = k;
};

Mp3Context.prototype._granuleLoop4 = function(g, gb) {
    /* compute band indexes */
    if (g.block_type == 2) {
        if (g.switch_point !== 0) {
            /* if switched mode, we handle the 36 first samples as
               long blocks.  For 8000Hz, we handle the 48 first
               exponents as long blocks (XXX: check this!) */
            if (this.sample_rate_index <= 2)
                g.long_end = 8;
            else if (this.sample_rate_index != 8)
                g.long_end = 6;
            else
                g.long_end = 4; /* 8000 Hz */

            g.short_start = 2 + (this.sample_rate_index != 8);
        } else {
            g.long_end = 0;
            g.short_start = 0;
        }
    } else {
        g.short_start = 13;
        g.long_end = 22;
    }

    g.preflag = 0;
    if (this.lsf === 0) {
        g.preflag = gb.getBits(1);
    }
    g.scalefac_scale = gb.getBits(1);
    g.count1table_select = gb.getBits(1);
};

Mp3Context.prototype._granuleLoop5 = function(g, gb, prev) {
    var slen1 = slen_table[g.scalefac_compress];
    var slen2 = slen_table[16 + g.scalefac_compress];
    var sc = g.scale_factors;

    if (g.block_type === 2) {
        var n = g.switch_point !== 0 ? 17 : 18;
        var j = 0;

        if (slen1 !== 0) {
            for (var i = 0; i < n; ++i) {
                sc[j++] = gb.getBits(slen1);
            }
        } else {
            for (var i = 0; i < n; ++i) {
                sc[i] = 0;
            }
            j += n;
        }

        if (slen2 !== 0) {
            for (var i = 0; i < 18; i++) {
                sc[j++] = gb.getBits(slen2);
            }
            sc[j++] = 0;
            sc[j++] = 0;
            sc[j++] = 0;
        } else {
            for (var i = 0; i < 21; i++) {
                sc[j++] = 0;
            }
        }
    } else {
        var prev_sc = prev.scale_factors;
        var j = 0;

        for(var k = 0; k < 4; k++) {
            var n = (k === 0 ? 6 : 5);
            if ((g.scfsi & (0x8 >> k)) === 0) {
                var slen = (k < 2) ? slen1 : slen2;
                if (slen !== 0) {
                    for (var i = 0; i < n; i++) {
                        sc[j++] = gb.getBits(slen);
                    }
                } else {
                    for (var i = 0; i < n; ++i) {
                        sc[i + j] = 0;
                    }
                    j += n;
                }
            } else {
                /* simply copy from last granule */
                for(var i = 0; i < n; i++) {
                    sc[j] = prev_sc[j];
                    j++;
                }
            }
        }
        sc[j++] = 0;
    }
};

const lsf_sf_expand = function(slen, sf, n1, n2, n3) {
    if (n3) {
        slen[3] = sf % n3;
        sf /= n3;
    } else {
        slen[3] = 0;
    }
    if (n2) {
        slen[2] = sf % n2;
        sf /= n2;
    } else {
        slen[2] = 0;
    }
    slen[1] = sf % n1;
    sf /= n1;
    slen[0] = sf;
};

const slen_tmp = new Int32Array(4);
Mp3Context.prototype._granuleLoop6 = function(g, gb, ch) {
    var tindex, tindex2;
    var sl, sf;
    var sc = g.scale_factors;

    /* LSF scale factors */
    if (g.block_type === 2) {
        tindex = g.switch_point !== 0 ? 2 : 1;
    } else {
        tindex = 0;
    }
    sf = g.scalefac_compress;
    if ((this.mode_ext & MODE_EXT_I_STEREO) && ch === 1) {
        /* intensity stereo case */
        sf >>= 1;
        if (sf < 180) {
            lsf_sf_expand(slen_tmp, sf, 6, 6, 0);
            tindex2 = 3;
        } else if (sf < 244) {
            lsf_sf_expand(slen_tmp, sf - 180, 4, 4, 0);
            tindex2 = 4;
        } else {
            lsf_sf_expand(slen_tmp, sf - 244, 3, 0, 0);
            tindex2 = 5;
        }
    } else {
        /* normal case */
        if (sf < 400) {
            lsf_sf_expand(slen_tmp, sf, 5, 4, 4);
            tindex2 = 0;
        } else if (sf < 500) {
            lsf_sf_expand(slen_tmp, sf - 400, 5, 4, 0);
            tindex2 = 1;
        } else {
            lsf_sf_expand(slen_tmp, sf - 500, 3, 0, 0);
            tindex2 = 2;
            g.preflag = 1;
        }
    }

    var j = 0;
    for(var k = 0; k < 4; k++) {
        var n = lsf_nsf_table[tindex2 * 12 + tindex * 4 + k];
        sl = slen_tmp[k];
        if (sl !== 0) {
            for (var i = 0; i < n; i++) {
                sc[j++] = gb.getBits(sl);
            }
        } else {
            for (var u = 0; u < n; ++u) {
                sc[u + j] = 0;
            }
            j += n;
        }
    }

    /* XXX: should compute exact size */
    for (var u = 0; u < 40 - j; ++u) {
        sc[u + j] = 0;
    }
};

Mp3Context.prototype.computeAntialias = function(g) {
    var n, i;

    if (g.block_type === 2) {
        if (g.switch_point === 0) {
            return;
            /* XXX: check this for 8000Hz case */
        }
        n = 1;
    } else {
        n = SBLIMIT - 1;
    }
    var hybrid = g.sb_hybrid;
    var hybridPtr = 18;
    for (var i = n; i > 0; i--) {
        var tmp0, tmp1, tmp2;
        for (var j = 0; j < 8; ++j) {
            var j4 = j << 2;
            tmp0 = hybrid[hybridPtr - 1 - j];
            tmp1 = hybrid[hybridPtr + j];
            tmp2 = MULH(tmp0 + tmp1, csa_table[j4]);
            hybrid[hybridPtr - 1 - j] = (tmp2 - MULH(tmp1, csa_table[2 + j4])) << 2;
            hybrid[hybridPtr + j] = (tmp2 + MULH(tmp0, csa_table[3 + j4])) << 2;
        }

        hybridPtr += 18;
    }
};

Mp3Context.prototype._found1 = function(len, tab0ptr, tab1ptr,
                                        hybrid0, hybrid1) {
    if ((this.mode_ext & MODE_EXT_MS_STEREO) !== 0) {
        for (var j = 0; j < len; ++j) {
            var tmp0 = hybrid0[tab0ptr + j];
            var tmp1 = hybrid1[tab1ptr + j];
            hybrid0[tab0ptr + j] = MULL(tmp0 + tmp1, ISQRT2);
            hybrid1[tab1ptr + j] = MULL(tmp0 - tmp1, ISQRT2);
        }
    }
};

Mp3Context.prototype.computeStereo = function(g0, g1) {
    var i, j, k, l;
    var v1, v2;
    var sf_max, tmp0, tmp1, sf, len, non_zero_found;
    var is_tab;
    var tab0ptr, tab1ptr;
    var non_zero_found_short = new Int32Array(3);

    var hybrid0 = g0.sb_hybrid;
    var hybrid1 = g1.sb_hybrid;

    if ((this.mode_ext & MODE_EXT_I_STEREO) !== 0) {
        if (this.lsf === 0) {
            is_tab = is_table;
            sf_max = 7;
        } else {
            is_tab = is_table_lsf[g1.scalefac_compress & 1];
            sf_max = 16;
        }

        tab0ptr = tab1ptr = 576;
        k = (13 - g1.short_start) * 3 + g1.long_end - 3;

        for (var i = 12; i >= g1.short_start; i--) {
            if (i !== 11) {
                k -= 3;
            }
            var len = band_size_short[this.sample_rate_index * 13 + i];

            loop: for (var l = 2; l >= 0; l--) {
                tab0ptr -= len;
                tab1ptr -= len;

                if (non_zero_found_short[l] === 0) {
                    for (var j = 0; j < len; ++j) {
                        if (hybrid1[tab1ptr] !== 0) {
                            non_zero_found_short[l] = 1;
                            this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
                            continue loop;
                        }
                    }
                    var sf = g1.scale_factors[k + l];
                    if (sf >= sf_max) {
                        this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
                        continue loop;
                    }

                    var v1 = is_tab[sf];
                    var v2 = is_tab[16 + sf];

                    for (var j = 0; j < len; ++j) {
                        tmp0 = hybrid0[tab0ptr + j];
                        hybrid0[tab0ptr + j] = MULL(tmp0, v1);
                        hybrid1[tab1ptr + j] = MULL(tmp0, v2);
                    }
                } else {
                    this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
                }
            }
        }

        non_zero_found = non_zero_found_short[0] |
            non_zero_found_short[1] |
            non_zero_found_short[2];

        loop2: for (var i = g1.long_end - 1;i >= 0; i--) {
            len = band_size_long[this.sample_rate_index * 22 + i];
            tab0ptr -= len;
            tab1ptr -= len;
            /* test if non zero band. if so, stop doing i-stereo */
            if (non_zero_found === 0) {
                for(var j=0; j < len; j++) {
                    if (hybrid1[tab1ptr + j] !== 0) {
                        non_zero_found = 1;
                        this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
                        continue loop2;
                    }
                }
                /* for last band, use previous scale factor */
                var k = (i === 21) ? 20 : i;
                var sf = g1.scale_factors[k];
                if (sf >= sf_max) {
                    this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
                    continue loop2;
                }
                var v1 = is_tab[sf];
                var v2 = is_tab[sf + 16];
                for (var j = 0; j < len; j++) {
                    tmp0 = hybrid0[tab0ptr + j];
                    hybrid0[tab0ptr + j] = MULL(tmp0, v1);
                    hybrid1[tab1ptr + j] = MULL(tmp0, v2);
                }
            } else {
                this._found1(len, tab0ptr, tab1ptr, hybrid0, hybrid1);
            }
        }
    } else if ((this.mode_ext & MODE_EXT_MS_STEREO) !== 0) {
        for(var i = 0; i < 576; i++) {
            tmp0 = hybrid0[i];
            tmp1 = hybrid1[i];
            hybrid0[i] = tmp0 + tmp1;
            hybrid1[i] = tmp0 - tmp1;
        }

    }
};

Mp3Context.prototype.switch_buffer = function(pos, end_pos, end_pos2) {
    if (this.in_gb.buffer !== null && pos >= this.gb.bitSize) {
        this.gb.assign(this.in_gb);
        this.in_gb.buffer = null;
        this.gb.skipBits(pos - end_pos);
        end_pos2 = end_pos = (end_pos2 + this.gb.getBitsCount() - pos);
        pos = this.gb.getBitsCount();
        huffmanPosRef[0] = pos;
        huffmanPosRef[1] = end_pos;
        huffmanPosRef[2] = end_pos2;
        return true;
    }
    return false;
};

Mp3Context.prototype.synthFilterInt16 = function(ref, samples_ptr, synth_buf_values,
                                                   samples_values, sb_samples,
                                                   sb_samples_ptr) {
    var synth_buf_ptr;
    var w_ptr, w2_ptr, p_ptr;
    var samples2_ptr;

    dct32(sb_samples, sb_samples_ptr);

    var offset = ref.synth_buf_offset;
    synth_buf_ptr = offset;

    for (var j = 0; j < 32; ++j) {
        var v = Math.max(Math.min(dct32_tmp32[j], 32767), -32768);
        synth_buf_values[synth_buf_ptr + j] = v;
    }

    for (var j = 0; j < 32; ++j) {
        synth_buf_values[synth_buf_ptr + j + 512] =
            synth_buf_values[synth_buf_ptr + j];
    }

    samples2_ptr = samples_ptr + 31;
    w_ptr = 0;
    w2_ptr = 31;

    var sum = ref.dither_state;

    p_ptr = synth_buf_ptr + 16;
    for (var u = 0; u < 512; u += 64) {
        sum += (Math.imul(window_values[w_ptr + u],
                    synth_buf_values[p_ptr + u]));
    }

    p_ptr = synth_buf_ptr + 48;
    for (var u = 0; u < 512; u += 64) {
        sum -= (Math.imul(window_values[w_ptr + u + 32],
                    synth_buf_values[p_ptr + u]));
    }

    samples_values[samples_ptr] = Math.max(-32768, Math.min(32767, sum >> OUT_SHIFT));
    sum &= ((1 << OUT_SHIFT) - 1);
    samples_ptr++;
    w_ptr++;

    for (var j = 1; j < 16; ++j) {
        var sum2 = 0;
        p_ptr = synth_buf_ptr + 16 + j;

        for (var u = 0; u < 512; u += 64) {
            var tmp = synth_buf_values[p_ptr + u];
            sum += (Math.imul(window_values[w_ptr + u], tmp));
            sum2 -= (Math.imul(window_values[w2_ptr + u], tmp));
        }

        p_ptr = synth_buf_ptr + 48 - j;

        for (var u = 0; u < 512; u += 64) {
            var tmp = synth_buf_values[p_ptr + u];
            sum -= (Math.imul(window_values[w_ptr + u + 32], tmp));
            sum2 -= (Math.imul(window_values[w2_ptr + u + 32], tmp));
        }

        samples_values[samples_ptr] = Math.max(-32768, Math.min(32767, sum >> OUT_SHIFT));
        sum &= ((1 << OUT_SHIFT) - 1);
        samples_ptr++;
        sum += sum2;
        samples_values[samples2_ptr] = Math.max(-32768, Math.min(32767, sum >> OUT_SHIFT));
        sum &= ((1 << OUT_SHIFT) - 1);
        samples2_ptr--;
        w_ptr++;
        w2_ptr--;
    }

    p_ptr = synth_buf_ptr + 32;
    for (var u = 0; u < 512; u += 64) {
        sum -= (Math.imul(window_values[w_ptr + u + 32],
                    synth_buf_values[p_ptr + u]));
    }

    samples_values[samples_ptr] = Math.max(-32768, Math.min(32767, sum >> OUT_SHIFT));
    sum &= ((1 << OUT_SHIFT) - 1);
    ref.dither_state = sum;
    offset = (offset - 32) & 511;
    ref.synth_buf_offset = offset;
};

Mp3Context.prototype.synthFilterFloat32 = function(ref, samples_ptr, synth_buf_values,
                                                   samples_values, sb_samples,
                                                   sb_samples_ptr) {
    var synth_buf_ptr;
    var w_ptr, w2_ptr, p_ptr;
    var samples2_ptr;

    dct32(sb_samples, sb_samples_ptr);

    var offset = ref.synth_buf_offset;
    synth_buf_ptr = offset;

    for (var j = 0; j < 32; ++j) {
        var v = Math.max(Math.min(dct32_tmp32[j], 32767), -32768);
        synth_buf_values[synth_buf_ptr + j] = v;
    }

    for (var j = 0; j < 32; ++j) {
        synth_buf_values[synth_buf_ptr + j + 512] =
            synth_buf_values[synth_buf_ptr + j];
    }

    samples2_ptr = samples_ptr + 31;
    w_ptr = 0;
    w2_ptr = 31;

    var sum = ref.dither_state;

    p_ptr = synth_buf_ptr + 16;
    for (var u = 0; u < 512; u += 64) {
        sum += (Math.imul(window_values[w_ptr + u],
                    synth_buf_values[p_ptr + u]));
    }

    p_ptr = synth_buf_ptr + 48;
    for (var u = 0; u < 512; u += 64) {
        sum -= (Math.imul(window_values[w_ptr + u + 32],
                    synth_buf_values[p_ptr + u]));
    }

    samples_values[samples_ptr] = Math.fround((sum >> OUT_SHIFT) / 32768);
    sum &= ((1 << OUT_SHIFT) - 1);
    samples_ptr++;
    w_ptr++;

    for (var j = 1; j < 16; ++j) {
        var sum2 = 0;
        p_ptr = synth_buf_ptr + 16 + j;

        for (var u = 0; u < 512; u += 64) {
            var tmp = synth_buf_values[p_ptr + u];
            sum += (Math.imul(window_values[w_ptr + u], tmp));
            sum2 -= (Math.imul(window_values[w2_ptr + u], tmp));
        }

        p_ptr = synth_buf_ptr + 48 - j;

        for (var u = 0; u < 512; u += 64) {
            var tmp = synth_buf_values[p_ptr + u];
            sum -= (Math.imul(window_values[w_ptr + u + 32], tmp));
            sum2 -= (Math.imul(window_values[w2_ptr + u + 32], tmp));
        }

        samples_values[samples_ptr] = Math.fround((sum >> OUT_SHIFT) / 32768);
        sum &= ((1 << OUT_SHIFT) - 1);
        samples_ptr++;
        sum += sum2;
        samples_values[samples2_ptr] = Math.fround((sum >> OUT_SHIFT) / 32768);
        sum &= ((1 << OUT_SHIFT) - 1);
        samples2_ptr--;
        w_ptr++;
        w2_ptr--;
    }

    p_ptr = synth_buf_ptr + 32;
    for (var u = 0; u < 512; u += 64) {
        sum -= (Math.imul(window_values[w_ptr + u + 32],
                    synth_buf_values[p_ptr + u]));
    }

    samples_values[samples_ptr] = Math.fround((sum >> OUT_SHIFT) / 32768);
    sum &= ((1 << OUT_SHIFT) - 1);
    ref.dither_state = sum;
    offset = (offset - 32) & 511;
    ref.synth_buf_offset = offset;
};

const l3_unscale = function(value, exponent) {
    var i = Math.imul(value, 4) + (exponent&3);
    var e = table_4_3_exp[i];
    var m = table_4_3_value[i];
    e -= (exponent >> 2);
    if (e > 31) {
        return 0;
    }
    m = (m + (1 << (e - 1))) >>> e;
    return m;
};

const huffmanPosRef = new Int32Array(3);
Mp3Context.prototype.huffmanDecodeBigValues = function(g, s_index, region_size, table_select) {
    if (region_size === 0) return s_index;

    var l = mp3_huff_data[table_select << 1];
    const linbits = mp3_huff_data[(table_select << 1) + 1];
    const vlc = huff_vlc[l];
    const hybrid = g.sb_hybrid;

    var end_pos = huffmanPosRef[1];
    var end_pos2 = huffmanPosRef[2];

    if (l === 0) {
        for (var u = 0; u < (region_size << 1); ++u) {
            hybrid[u + s_index] = 0;
        }
        return s_index + (region_size << 1);
    }

    var gb = this.gb;

    for (var j = region_size; j > 0; --j) {
        var v, x;
        var pos = gb.getBitsCount();

        if (pos >= end_pos) {
            if (this.switch_buffer(pos, end_pos, end_pos2)) {
                pos = huffmanPosRef[0];
                end_pos = huffmanPosRef[1];
                end_pos2 = huffmanPosRef[2];
            }
            if (pos >= end_pos) {
                break;
            }
        }

        var y = gb.get_vlc2(vlc.table, 7, 3);

        if (y === 0) {
            hybrid[s_index] = hybrid[s_index + 1] = 0;
            s_index += 2;
            continue;
        }

        var exponent = exponents[s_index];

        if ((y & 16) !== 0) {
            x = y >> 5;
            y = y & 0x0f;

            if (x < 15) {
                v = expval_table[Math.imul(exponent, 16) + x];
            } else {
                x += gb.getBitsZ(linbits);
                v = l3_unscale(x, exponent);
            }
            if (gb.getBits1() !== 0) {
                v = -v;
            }
            hybrid[s_index] = v;

            if (y < 15) {
                v = expval_table[Math.imul(exponent, 16) + y];
            } else {
                y += gb.getBitsZ(linbits);
                v = l3_unscale(y, exponent);
            }

            if (gb.getBits1() !== 0) {
                v = -v;
            }

            hybrid[s_index + 1] = v;
        } else {
            x = y >> 5;
            y = y & 0x0f;
            x += y;

            if (x < 15) {
                v = expval_table[Math.imul(exponent, 16) + x];
            } else {
                x += gb.getBitsZ(linbits);
                v = l3_unscale(x, exponent);
            }

            if (gb.getBits1() !== 0) {
                v = -v;
            }

            hybrid[s_index + (y !== 0 ? 1 : 0)] = v;
            hybrid[s_index + (y === 0 ? 1 : 0)] = 0;
        }
        s_index += 2;
    }
    return s_index;
};

Mp3Context.prototype.huffmanDecode = function(g, end_pos2) {
    var gb = this.gb;
    var size_in_bits = gb.bitSize;
    const hybrid = g.sb_hybrid;

    var end_pos = size_in_bits;
    if (end_pos2 < end_pos) end_pos = end_pos2;

    huffmanPosRef[0] = 0;
    huffmanPosRef[1] = end_pos;
    huffmanPosRef[2] = end_pos2;

    var s_index = 0;
    s_index = this.huffmanDecodeBigValues(g, s_index, g.region_size0, g.table_select0);
    s_index = this.huffmanDecodeBigValues(g, s_index, g.region_size1, g.table_select1);
    s_index = this.huffmanDecodeBigValues(g, s_index, g.region_size2, g.table_select2);

    var vlc = huff_quad_vlc[g.count1table_select];
    var last_pos = 0;

    end_pos = huffmanPosRef[1];
    end_pos2 = huffmanPosRef[2];

    while (s_index <= 572) {
        var pos = gb.getBitsCount();
        if (pos >= end_pos) {
            if (pos > end_pos2 && last_pos !== 0) {
                /* some encoders generate an incorrect size for this
                   part. We must go back into the data */
                s_index -= 4;
                gb.skipBits(last_pos - pos);
                break;
            }

            if (this.switch_buffer(pos, end_pos, end_pos2)) {
                pos = huffmanPosRef[0];
                end_pos = huffmanPosRef[1];
                end_pos2 = huffmanPosRef[2];
            }

            if (pos >= end_pos) {
                break;
            }
        }

        last_pos = pos;

        var code = gb.get_vlc2(vlc.table, vlc.bits, 1);

        hybrid[s_index + 0] =
        hybrid[s_index + 1] =
        hybrid[s_index + 2] =
        hybrid[s_index + 3] = 0;

        while (code !== 0) {
            var inner_pos = s_index + idxtab[code];
            code ^= 8 >> idxtab[code];
            var v = exp_table[exponents[inner_pos]];

            if (gb.getBits1() !== 0) {
                v = -v;
            }
            hybrid[inner_pos] = v;
        }
        s_index += 4;
    }

    const length = 576 - s_index;
    for (var i = 0; i < length; ++i) {
        hybrid[i + s_index] = 0;
    }

    var bits_left = end_pos2 - gb.getBitsCount();

    if (bits_left < 0) {
        return false;
    }

    gb.skipBits(bits_left);
    i = gb.getBitsCount();
    this.switch_buffer(i, end_pos, end_pos2);
    return true;
};

const tmp = new Int32Array(576);
Mp3Context.prototype.reorderBlock = function(g) {
    if (g.block_type !== 2) return;

    var ptr, dst, ptr1;

    if (g.switch_point !== 0) {
        if (this.sample_rate_index !== 8) {
            ptr = 36;
        } else {
            ptr = 48;
        }
    } else {
        ptr = 0;
    }

    var hybrid = g.sb_hybrid;

    for (var i = g.short_start; i < 13; ++i) {
        var len = band_size_short[this.sample_rate_index * 13 + i];
        ptr1 = ptr;
        dst = 0;

        for (var j = len; j > 0; --j) {
            tmp[dst++] = hybrid[ptr];
            tmp[dst++] = hybrid[ptr + len];
            tmp[dst++] = hybrid[ptr + (len << 1)];
            ptr++;
        }
        ptr += (len << 1);

        var length = Math.imul(len, 3);
        for (var u = 0; u < length; ++u) {
            hybrid[ptr1 + u] = tmp[u];
        }
    }
};

const exponentsFromScaleFactors_gains = new Int32Array(3);
Mp3Context.prototype.exponentsFromScaleFactors = function(g) {
    var exp_ptr = 0;
    var bstab_ptr = Math.imul(this.sample_rate_index, 22);
    var pretab_ptr = Math.imul(g.preflag, 22);
    var gain = g.global_gain - 210;
    var shift = g.scalefac_scale + 1;
    var len, i, j, k, l, v0;

    for (var i = 0; i < g.long_end; ++i) {
        v0 = gain - ((g.scale_factors[i] + mp3_pretab_ptr[i + pretab_ptr]) << shift) + 400;
        len = band_size_long[bstab_ptr + i];

        for (var j = len; j > 0; j--) {
            exponents[exp_ptr++] = v0;
        }
    }

    if (g.short_start < 13) {
        bstab_ptr = this.sample_rate_index * 13;
        exponentsFromScaleFactors_gains[0] = gain - (g.subblock_gain0 << 3);
        exponentsFromScaleFactors_gains[1] = gain - (g.subblock_gain1 << 3);
        exponentsFromScaleFactors_gains[2] = gain - (g.subblock_gain2 << 3);

        k = g.long_end;
        for (var i = g.short_start; i < 13; ++i) {
            var len = band_size_short[i + bstab_ptr];

            for (var l = 0; l < 3; ++l) {
                v0 = exponentsFromScaleFactors_gains[l] - (g.scale_factors[k++] << shift) + 400;
                for (var j = len; j > 0; j--) {
                    exponents[exp_ptr++] = v0;
                }
            }
        }
    }
};

Mp3Context.prototype.decodeLayer3 = function() {
    var nb_granules, main_data_begin, private_bits;
    var gr, ch, bits_pos;
    var gb = this.gb;
    var nb_channels = this.nb_channels;

    if (this.lsf !== 0) {
        main_data_begin = gb.getBits(8);
        private_bits = gb.getBits(nb_channels);
        nb_granules = 1;
    } else {
        main_data_begin = gb.getBits(9);
        if (nb_channels === 2) {
            private_bits = gb.getBits(3);
        } else {
            private_bits = gb.getBits(5);
        }
        nb_granules = 2;

        for (var ch = 0; ch < nb_channels; ++ch) {
            this.granules[ch * 2].scfsi = 0;
            this.granules[ch * 2 + 1].scfsi = gb.getBits(4);
        }
    }

    for (var gr = 0; gr < nb_granules; ++gr) {
        for (var ch = 0; ch < nb_channels; ++ch) {
            var g = this.granules[ch * 2 + gr];
            if (!this._granuleLoop1(g, gb)) {
                return -1;
            }
            if (!this._granuleLoop2(g, gb)) {
                return -1;
            }
            this._granuleLoop3(g);
            this._granuleLoop4(g, gb);
        }
    }

    var ptr_ptr = (gb.buffer_ptr + gb.getBitsCount() >> 3);

    if (main_data_begin > this.last_buf_size) {
        this.last_buf_size = main_data_begin;
    }

    // memcpy(s->last_buf + s->last_buf_size, ptr, EXTRABYTES);
    var gb_buffer = gb.buffer;
    var last_buf_ptr = this.last_buf_size;
    for (var u = 0; u < EXTRABYTES; ++u) {
        this.last_buf[last_buf_ptr + u] = gb_buffer[ptr_ptr + u];
    }

    this.in_gb.assign(this.gb);
    this.gb.init(this.last_buf, main_data_begin * 8, this.last_buf_size - main_data_begin);

    for (var gr = 0; gr < nb_granules; ++gr) {
        for (var ch = 0; ch < nb_channels; ++ch) {
            var g = this.granules[ch * 2 + gr];
            var bits_pos = gb.getBitsCount();

            if (this.lsf === 0) {
                this._granuleLoop5(g, gb, this.granules[ch * 2]);
            } else {
                this._granuleLoop6(g, gb, ch);
            }


            this.exponentsFromScaleFactors(g);
            if (!this.huffmanDecode(g, bits_pos + g.part2_3_length)) {
                return -1;
            }

        }

        if (this.nb_channels === 2) {
            this.computeStereo(this.granules[gr], this.granules[2 + gr]);
        }

        for (var ch = 0; ch < this.nb_channels; ++ch) {
            var g = this.granules[ch * 2 + gr];
            this.reorderBlock(g);
            this.computeAntialias(g);
            var sb_samples = this.sb_samples[ch];
            var sb_samples_ptr = (18 * gr) * SBLIMIT;
            this.computeImdct(g, sb_samples, sb_samples_ptr, this.mdct_buf[ch]);
        }
    }
    return nb_granules * 18;
};

const imdct36_tmp = new Int32Array(18);
const imdct36 = function(out_ptr, buf_ptr, in_ptr, win_ptr,
                         out_values, buf_values, in_values, win_values) {
    var i, j, t0, t1, t2, t3, s0, s1, s2, s3;
    var tmp1_ptr;
    var in1_ptr;

    for (i = 17;i >= 1; i--) {
        in_values[in_ptr + i] += in_values[in_ptr + (i-1)];
    }

    for (i = 17; i >= 3; i -= 2) {
        in_values[in_ptr + i] += in_values[in_ptr + (i-2)];
    }

    for (j = 0; j < 2; j++) {
        tmp1_ptr = j;
        in1_ptr = in_ptr + j;
        t2 = in_values[in1_ptr + 8] + in_values[in1_ptr + 16] - in_values[in1_ptr + 4];

        t3 = in_values[in1_ptr] + (in_values[in1_ptr + 12] >> 1);
        t1 = in_values[in1_ptr] - in_values[in1_ptr + 12];
        imdct36_tmp[tmp1_ptr + 6] = t1 - (t2>>1);
        imdct36_tmp[tmp1_ptr + 16] = t1 + t2;

        t0 = MULH(2 * (in_values[in1_ptr + 4] + in_values[in1_ptr + 8]), C2);
        t1 = MULH(in_values[in1_ptr + 8] - in_values[in1_ptr + 16], -2*C8);
        t2 = MULH(2 * (in_values[in1_ptr + 4] + in_values[in1_ptr + 16]), -C4);

        imdct36_tmp[tmp1_ptr + 10] = t3 - t0 - t2;
        imdct36_tmp[tmp1_ptr + 2] = t3 + t0 + t1;
        imdct36_tmp[tmp1_ptr + 14] = t3 + t2 - t1;

        imdct36_tmp[tmp1_ptr + 4] = MULH( 2 * (in_values[in1_ptr + 10] + in_values[in1_ptr + 14] - in_values[in1_ptr + 2]), -C3);
        t2 = MULH(2 * (in_values[in1_ptr + 2] + in_values[in1_ptr +  10]), C1);
        t3 = MULH(in_values[in1_ptr + 10] - in_values[in1_ptr + 14], -2*C7);
        t0 = MULH(2 * in_values[in1_ptr + 6], C3);

        t1 = MULH(2 * (in_values[in1_ptr + 2] + in_values[in1_ptr + 14]), -C5);

        imdct36_tmp[tmp1_ptr] = t2 + t3 + t0;
        imdct36_tmp[tmp1_ptr + 12] = t2 + t1 - t0;
        imdct36_tmp[tmp1_ptr + 8] = t3 - t1 - t0;
    }

    i = 0;
    for (j = 0; j < 4; j++) {
        t0 = imdct36_tmp[i];
        t1 = imdct36_tmp[i + 2];
        s0 = t1 + t0;
        s2 = t1 - t0;

        t2 = imdct36_tmp[i + 1];
        t3 = imdct36_tmp[i + 3];
        s1 = MULH(2*(t3 + t2), icos36h[j]);
        s3 = MULL(t3 - t2, icos36[8 - j]);

        t0 = s0 + s1;
        t1 = s0 - s1;
        out_values[out_ptr + Math.imul((9 + j), SBLIMIT)] = MULH(t1, win_values[win_ptr + 9 + j]) + buf_values[buf_ptr + 9 + j];
        out_values[out_ptr + Math.imul((8 - j), SBLIMIT)] = MULH(t1, win_values[win_ptr + 8 - j]) + buf_values[buf_ptr + 8 - j];
        buf_values[buf_ptr + 9 + j] = MULH(t0, win_values[win_ptr + (27 + j)]);
        buf_values[buf_ptr + 8 - j] = MULH(t0, win_values[win_ptr + (26 - j)]);

        t0 = s2 + s3;
        t1 = s2 - s3;
        out_values[out_ptr + Math.imul((17 - j), SBLIMIT)] = MULH(t1, win_values[win_ptr + (17 - j)]) + buf_values[buf_ptr + (17 - j)];
        out_values[out_ptr + Math.imul(j, SBLIMIT)] = MULH(t1, win_values[win_ptr + j]) + buf_values[buf_ptr + j];
        buf_values[buf_ptr + 17 - j] = MULH(t0, win_values[win_ptr + (35 - j)]);
        buf_values[buf_ptr + j] = MULH(t0, win_values[win_ptr + (18 + j)]);
        i += 4;
    }

    s0 = imdct36_tmp[16];
    s1 = MULH(Math.imul(imdct36_tmp[17], 2), icos36h[4]);
    t0 = s0 + s1;
    t1 = s0 - s1;
    out_values[out_ptr + Math.imul(13, SBLIMIT)] = MULH(t1, win_values[win_ptr + 13]) + buf_values[buf_ptr + 13];
    out_values[out_ptr + Math.imul(4, SBLIMIT)] = MULH(t1, win_values[win_ptr + 4]) + buf_values[buf_ptr + 4];
    buf_values[buf_ptr + 13] = MULH(t0, win_values[win_ptr + 31]);
    buf_values[buf_ptr + 4] = MULH(t0, win_values[win_ptr + 22]);
};

const imdct12 = function(out, in_ptr, in_values) {
    var in0, in1, in2, in3, in4, in5, t1, t2;

    in0 = in_values[in_ptr];
    in1 = in_values[in_ptr + 3] + in_values[in_ptr];
    in2 = in_values[in_ptr + 6] + in_values[in_ptr + 3];
    in3 = in_values[in_ptr + 9] + in_values[in_ptr + 6];
    in4 = in_values[in_ptr + 12] + in_values[in_ptr + 9];
    in5 = in_values[in_ptr + 15] + in_values[in_ptr + 12];
    in5 += in3;
    in3 += in1;

    in2 = MULH(Math.imul(2, in2), C3);
    in3 = MULH(Math.imul(4, in3), C3);

    t1 = in0 - in4;
    t2 = MULH(2*(in1 - in5), icos36h[4]);

    out[7] = out[10] = t1 + t2;
    out[1] = out[4] = t1 - t2;

    in0 += in4 >> 1;
    in4 = in0 + in2;
    in5 += Math.imul(2, in1);
    in1 = MULH(in5 + in3, icos36h[1]);
    out[8] = out[9] = in4 + in1;
    out[2] = out[3] = in4 - in1;

    in0 -= in2;
    in5 = MULH(Math.imul(2, (in5 - in3)), icos36h[7]);
    out[0] = out[5] = in0 - in5;
    out[6] = out[11] = in0 + in5;
};

const imdct12_tmp = new Int32Array(12);
Mp3Context.prototype.computeImdct = function(g, sb_samples, sb_samples_ptr, mdct_buf) {
    var hybrid = g.sb_hybrid;
    // *hybrid
    var ptr = 576;
    var ptr1 = 36;

    while (ptr >= ptr1) {
        ptr -= 6;
        var v = hybrid[ptr] |
                hybrid[ptr + 1] |
                hybrid[ptr + 2] |
                hybrid[ptr + 3] |
                hybrid[ptr + 4] |
                hybrid[ptr + 5];

        if (v !== 0) {
            break;
        }
    }

    var sblimit = ((ptr / 18) | 0) + 1;
    var mdct_long_end;

    if (g.block_type === 2) {
        /* XXX: check for 8000 Hz */
        if (g.switch_point !== 0) {
            mdct_long_end = 2;
        } else {
            mdct_long_end = 0;
        }
    } else {
        mdct_long_end = sblimit;
    }

    var mdct_buf_ptr = 0;
    ptr = 0;
    var out_ptr;
    var win1, win;

    for (var j = 0; j < mdct_long_end; ++j) {
        out_ptr = sb_samples_ptr + j;

        if (g.switch_point !== 0 && j < 2) {
            win1 = 0;
        } else {
            win1 = Math.imul(g.block_type, 36);
        }

        win = win1 + (144 & -(j & 1));
        imdct36(out_ptr, mdct_buf_ptr, ptr, win, sb_samples, mdct_buf, hybrid, mdct_win);

        out_ptr += Math.imul(18, SBLIMIT);
        ptr += 18;
        mdct_buf_ptr += 18;
    }

    for (var j = mdct_long_end; j < sblimit; ++j) {
        win = 72 + (144 & -(j & 1));
        out_ptr = sb_samples_ptr + j;

        for (var i = 0; i < 6; ++i) {
            sb_samples[out_ptr] = mdct_buf[mdct_buf_ptr + i];
            out_ptr += SBLIMIT;
        }
        imdct12(imdct12_tmp, ptr, hybrid);

        for (var i = 0; i < 6; ++i) {
            sb_samples[out_ptr] = MULH(imdct12_tmp[i], mdct_win[win + i]) + mdct_buf[mdct_buf_ptr + i + 6];
            mdct_buf[mdct_buf_ptr + i + 12] = MULH(imdct12_tmp[i + 6], mdct_win[win + i + 6]);
            out_ptr += SBLIMIT;
        }
        imdct12(imdct12_tmp, ptr + 1, hybrid);

        for (var i = 0; i < 6; ++i) {
            sb_samples[out_ptr] = MULH(imdct12_tmp[i], mdct_win[win + i]) + mdct_buf[mdct_buf_ptr + i + 12];
            mdct_buf[mdct_buf_ptr + i] = MULH(imdct12_tmp[i + 6], mdct_win[win + i + 6]);
            out_ptr += SBLIMIT;
        }
        imdct12(imdct12_tmp, ptr + 2, hybrid);

        for (var i = 0; i < 6; ++i) {
            mdct_buf[mdct_buf_ptr + i] = MULH(imdct12_tmp[i], mdct_win[win + i]) + mdct_buf[mdct_buf_ptr + i];
            mdct_buf[mdct_buf_ptr + i + 6] = MULH(imdct12_tmp[i + 6], mdct_win[win + i + 6]);
            mdct_buf[mdct_buf_ptr + i + 12] = 0;
        }

        ptr += 18;
        mdct_buf_ptr += 18;
    }

    for (var j = sblimit; j < SBLIMIT; ++j) {
        out_ptr = sb_samples_ptr + j;

        for (var i = 0; i < 18; ++i) {
            sb_samples[out_ptr] = mdct_buf[i + mdct_buf_ptr];
            mdct_buf[i + mdct_buf_ptr] = 0;
            out_ptr += SBLIMIT;
        }
        mdct_buf_ptr += 18;
    }
};

const unaligned32_be = function(p, index) {
    return (((p[index]<<8) | p[index + 1])<<16) | (p[index + 2]<<8) | (p[index + 3]);
};

function BitStream() {
    this.buffer = null;
    this.index = 0;
    this.bitSize = 0;
    this.buffer_ptr = 0;
}

BitStream.prototype.init = function(buffer, bitSize, buffer_ptr) {
    this.buffer = buffer;
    this.index = 0;
    this.bitSize = bitSize;
    this.buffer_ptr = buffer_ptr;
};

// Emulate C's aStruct = bStruct.
BitStream.prototype.assign = function(bitStream) {
    this.buffer = bitStream.buffer;
    this.index = bitStream.index;
    this.bitSize = bitStream.bitSize;
    this.buffer_ptr = bitStream.buffer_ptr;
    return this;
};

BitStream.prototype.getBits = function(count) {
    var index = this.index;
    var ret = (unaligned32_be(this.buffer, this.buffer_ptr + (index >> 3)) << (index & 0x7)) >>>
              (32 - count);
    this.index = index + count;
    return ret;
};

BitStream.prototype.getBits1 = function() {
    var index = this.index;
    var ret = ((this.buffer[this.buffer_ptr + (index >> 3)] << (index & 0x7)) & 0xFF) >> 7;
    this.index = index + 1;
    return ret;
};

BitStream.prototype.getBitsZ = function(count) {
    if (count === 0) return 0;
    return this.getBits(count);
};

BitStream.prototype.skipBits = function(count) {
    this.index += count;
};

BitStream.prototype.getBitsCount = function() {
    return this.index;
};

BitStream.prototype.alignGetBits = function() {
    var count = (-this.index) & 7;
    if (count !== 0) {
        this.index += count;
    }
};

BitStream.prototype.get_vlc2 = function(table, bits, max_depth) {
    var buffer_ptr = this.buffer_ptr;
    var re_index = this.index;
    var re_cache = unaligned32_be(this.buffer, buffer_ptr + (re_index >> 3)) << (re_index & 0x7);

    var n, index, nb_bits;

    index = re_cache >>> (32 - bits);
    var code = table[index << 1];
    var n = table[(index << 1) + 1];

    if (max_depth > 1 && n < 0) {
        re_index += bits;
        re_cache = unaligned32_be(this.buffer, buffer_ptr + (re_index >> 3)) << (re_index & 0x7);
        nb_bits = -n;

        index = (re_cache >>> (32 - nb_bits)) + code;

        var code = table[index << 1];
        var n = table[(index << 1) + 1];

        if (max_depth > 2 && n < 0) {
            re_index += nb_bits;
            re_cache = unaligned32_be(this.buffer, buffer_ptr + (re_index >> 3)) << (re_index & 0x7);
            nb_bits = -n;

            index = (re_cache >>> (32 - nb_bits)) + code;

            var code = table[index << 1];
            var n = table[(index << 1) + 1];
        }
    }

    re_index += n;
    this.index = re_index;
    return code;
};


codecLoaded("mp3", Mp3Context);
})();
