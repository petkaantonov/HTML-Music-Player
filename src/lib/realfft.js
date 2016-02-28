"use strict";
var realFft = (function() {
    const MAX_SIZE = 32768;
    const MAX_SIZE_LOG2 = Math.log(MAX_SIZE) * Math.LOG2E|0;
    const tables = new Array(MAX_SIZE_LOG2);
    const aux = new Array(MAX_SIZE_LOG2);

    const getTable = function(N) {
        var index = Math.log(N) * Math.LOG2E|0;

        if (tables[index] === undefined) {
            var sin = new Float64Array(N);
            var cos = new Float64Array(N);

            for (var i = 0; i < N; ++i) {
                sin[i] = Math.sin(Math.PI * 2 * i / N);
                cos[i] = Math.cos(Math.PI * 2 * i / N);
            }
            tables[index] = {cos: cos, sin: sin};
        }

        return tables[index];
    };

    const getAux = function(N) {
        const index = Math.log(N) * Math.LOG2E|0;

        if (aux[index] === undefined) {
            aux[index] = new Float64Array(N << 2);
        }

        return aux[index];
    };

    const reverseBits = function(v, count) {
        v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
        v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
        v = ((v >>> 4) & 0x0F0F0F0F) | ((v & 0x0F0F0F0F) << 4);
        v = ((v >>> 8) & 0x00FF00FF) | ((v & 0x00FF00FF) << 8);
        v = ( v >>> 16             ) | ( v               << 16);
        return v >>> (32 - count);
    };

    const split = function(array) {
        const N2 = array.length;
        const N = N2 >> 1;
        const halfN = N >> 1;
        const imOffset = N;
        const oddOffset = N2;
        const aux = getAux(N);

        aux[0] = array[0];
        aux[imOffset] = 0;
        aux[halfN] = array[halfN << 1];
        aux[imOffset + halfN] = 0;
        aux[oddOffset] = array[1];
        aux[oddOffset + imOffset] = 0;
        aux[oddOffset + halfN] = array[(halfN << 1) + 1];
        aux[oddOffset + imOffset + halfN] = 0;

        for (var k = 1; k < N; ++k) {
            var re = array[k << 1];
            var im = array[(k << 1) + 1];
            var reSym = array[(N - k) << 1];
            var imSym = array[((N - k) << 1) + 1];
            aux[k] = (re + reSym) / 2;
            aux[imOffset + k] = (im - imSym) / 2;
            aux[oddOffset + k] = (im + imSym) / 2;
            aux[oddOffset + imOffset + k] = (reSym - re) / 2;
        }
    };

    const combine = function(array) {
        const N2 = array.length;
        const N = N2 >> 1;
        const imOffset = N;
        const oddOffset = N2;
        const aux = getAux(N);

        var a = 2 * Math.pow(Math.sin(-Math.PI / N2), 2);
        var b = Math.sin(-Math.PI * 2 / N2);
        var cos = 1;
        var sin = 0;

        for (var k = 0; k < N; ++k) {
            var Xere = aux[k];
            var Xeim = aux[imOffset + k];
            var Xore = aux[oddOffset + k];
            var Xoim = aux[oddOffset + imOffset + k];
            var re = Xere + (Xore * cos) - (Xoim * sin);
            var im = Xeim + (Xore * sin) + (Xoim * cos);
            array[k] = re;
            array[imOffset + k] = im;
            var cosTmp = cos - (a * cos + b * sin);
            var sinTmp = sin + (b * cos - a * sin);
            cos = cosTmp;
            sin = sinTmp;
        }
    };

    const reorder = function(array) {
        const N = array.length >> 1;
        const log2N = Math.log(N) * Math.LOG2E|0;

        for (var i = 0; i < N; ++i) {
            var j = reverseBits(i, log2N);

            if (i < j) {
                var ii = i << 1;
                var jj = j << 1;
                var tmpR = array[ii];
                var tmpI = array[ii + 1];
                array[ii] = array[jj];
                array[ii + 1] = array[jj + 1];
                array[jj] = tmpR;
                array[jj + 1] = tmpI;
            }
        }
    };

    const fftHalf = function(array) {
        const pi2 = Math.PI * 2;
        const N = array.length >> 1;
        const table = getTable(N);
        const sinTable = table.sin;
        const cosTable = table.cos;

        for (var n = 2; n <= N; n <<= 1) {
            var halfn = n >> 1;
            var stride = N / n;

            for (var i = 0; i < N; i += n) {
                var plusHalf = i + halfn;
                var k = 0;

                for (var j = i; j < plusHalf; j++) {
                    var cos = cosTable[k];
                    var sin = sinTable[k];
                    var realIndex = j << 1;
                    var realIndexPlusHalf = (j + halfn) << 1;
                    var Tre =  array[realIndexPlusHalf] * cos + array[realIndexPlusHalf + 1] * sin;
                    var Tim = -array[realIndexPlusHalf] * sin + array[realIndexPlusHalf + 1] * cos;
                    array[realIndexPlusHalf] = array[realIndex] - Tre;
                    array[realIndexPlusHalf + 1] = array[realIndex + 1] - Tim;
                    array[realIndex] += Tre;
                    array[realIndex + 1] += Tim;

                    k += stride;
                }
            }
        }
    };

    return function(array) {
        const N2 = array.length;

        if ((N2 & (N2 >>> 1)) !== 0) {
            throw new Error("array size must be a power of two");
        }

        if (N2 > MAX_SIZE) {
            throw new Error("maximum size is: " + MAX_SIZE);
        }

        if (N2 <= 1) {
            return;
        }

        reorder(array);
        fftHalf(array);
        split(array);
        combine(array);
    };

})();

module.exports = realFft;
