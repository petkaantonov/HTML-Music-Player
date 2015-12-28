"use strict";
const Random = (function() {

    var reth, retl;

    const add = function(ah, al, bh, bl) {
        var retll = (al & 0xFFFF) + (bl & 0xFFFF);

        var retlh = retll >>> 16;
        retll = retll & 0xFFFF;
        retlh = retlh + (al >>> 16) + (bl >>> 16);

        var rethl = retlh >>> 16;
        retlh = retlh & 0xFFFF;
        rethl = rethl + (ah & 0xFFFF) + (bh & 0xFFFF);

        var rethh = rethl >>> 16;
        rethl = rethl & 0xFFFF;
        rethh = rethh + (ah >>> 16) + (bh >>> 16);
        rethh = rethh & 0xFFFF;

        reth = (rethh << 16) | rethl;
        retl = (retlh << 16) | retll;
    };

    const xor = function(ah, al, bh, bl) {
        reth = ah ^ bh;
        retl = al ^ bl;
    };

    // Count must be < 32.
    const shl = function(h, l, count) {
        retl = l << count;
        reth = (h << count) | (l >>> (32 - count));
    };

    // Count must be < 32.
    const shr = function(h, l, count) {
        retl = (l >>> count) | (h << (32 - count));
        reth = h >>> count;
    };

    var state0l, state0h, state1l, state1h;

    if (typeof performance !== "undefined" &&
        performance &&
        typeof performance.now === "function") {
        var f64 = new Float64Array(2);
        var ui32 = new Uint32Array(f64.buffer);
        f64[0] = performance.now();
        f64[1] = Date.now();
        state0l = ui32[0] ^ 0xD9BA67D4;
        state0h = state0l ^ ui32[1] ^ 0x1BB963C5;
        state1l = state0h ^ ui32[2] ^ 0x498D51D5;
        state1h = state1l ^ ui32[3] ^ 0x69CF85D3;
    } else {
        const now = Date.now() & 0xFFFFFFFF;
        state0l = now ^ 0xD9BA67D4;
        state0h = now ^ 0x1BB963C5;
        state1l = now ^ 0x498D51D5;
        state1h = now ^ 0x69CF85D3;
    }

    function next64() {
        var s1h = state0h;
        var s1l = state0l;
        var s0h = state1h;
        var s0l = state1l;
        state0h = s0h;
        state0l = s0l;

        shl(s1h, s1l, 23);
        xor(s1h, s1l, reth, retl);
        s1h = reth;
        s1l = retl;

        shr(s1h, s1l, 17);
        var bh = reth;
        var bl = retl;
        shr(s0h, s0l, 26);
        var ch = reth;
        var cl = retl;

        xor(s1h, s1l, s0h, s0l);
        xor(reth, retl, bh, bl);
        xor(reth, retl, ch, cl);

        state1h = reth;
        state1l = retl;

        add(reth, retl, s0h, s0l);
    }

    var l = (Date.now() & 0x7FF) + 100;
    while (l--) next64();


    function next53() {
        next64();
        return (reth & 0x1FFFFF) * 4294967296 + (retl >>> 0);
    }

    return {
        nextMaxInt: function() {
            return next53();
        },

        // [min, max)
        nextInRange: function(min, max) {
            return Math.floor((max - min) * (next53() / 9007199254740992)) + min;
        },

        // [0, max)
        nextUpTo: function(max) {
            return Math.floor(max * (next53() / 9007199254740992));
        },

        // [0, 1) that uses the full 53 bit mantissa range.
        next: function() {
            return next53() / 9007199254740992;
        },

        next32: function() {
            next64();
            return (reth ^ (reth >>> 19) ^ (retl ^ (retl >>> 8))) >>> 0;
        },

        nextBytes: function(array) {
            const length = array.length;
            for (var i = 0; i < length; i += 8) {
                next64();
                var cur = reth;
                var max = Math.min(length, i + 4);
                for (var j = i; j < max; ++j) {
                    array[j] = cur & 0xFF;
                    cur >>>= 8;
                }
                cur = retl;
                max = Math.min(length, i + 8);
                for (var j = i + 4; j < max; ++j) {
                    array[j] = cur & 0xFF;
                    cur >>>= 8;
                }
            }
        }
    };

})();

module.exports = Random;
