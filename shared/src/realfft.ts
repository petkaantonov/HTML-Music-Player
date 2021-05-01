const realFft = (function () {
    const MAX_SIZE = 32768;
    const MAX_SIZE_LOG2 = (Math.log(MAX_SIZE) * Math.LOG2E) | 0;
    const tables = new Array(MAX_SIZE_LOG2);
    const AUX = new Array(MAX_SIZE_LOG2);

    const getTable = function (N: number) {
        const index = (Math.log(N) * Math.LOG2E) | 0;

        if (tables[index] === undefined) {
            const sin = new Float64Array(N);
            const cos = new Float64Array(N);

            for (let i = 0; i < N; ++i) {
                sin[i] = Math.sin((Math.PI * 2 * i) / N);
                cos[i] = Math.cos((Math.PI * 2 * i) / N);
            }
            tables[index] = { cos, sin };
        }

        return tables[index];
    };

    const getAux = function (N: number) {
        const index = (Math.log(N) * Math.LOG2E) | 0;

        if (AUX[index] === undefined) {
            AUX[index] = new Float64Array(N << 2);
        }

        return AUX[index];
    };

    const reverseBits = function (v: number, count: number) {
        v = ((v >>> 1) & 0x55555555) | ((v & 0x55555555) << 1);
        v = ((v >>> 2) & 0x33333333) | ((v & 0x33333333) << 2);
        v = ((v >>> 4) & 0x0f0f0f0f) | ((v & 0x0f0f0f0f) << 4);
        v = ((v >>> 8) & 0x00ff00ff) | ((v & 0x00ff00ff) << 8);
        v = (v >>> 16) | (v << 16);
        return v >>> (32 - count);
    };

    const split = function (array: Float32Array) {
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

        for (let k = 1; k < N; ++k) {
            const re = array[k << 1]!;
            const im = array[(k << 1) + 1]!;
            const reSym = array[(N - k) << 1]!;
            const imSym = array[((N - k) << 1) + 1]!;
            aux[k] = (re + reSym) / 2;
            aux[imOffset + k] = (im - imSym) / 2;
            aux[oddOffset + k] = (im + imSym) / 2;
            aux[oddOffset + imOffset + k] = (reSym - re) / 2;
        }
    };

    const combine = function (array: Float32Array) {
        const N2 = array.length;
        const N = N2 >> 1;
        const imOffset = N;
        const oddOffset = N2;
        const aux = getAux(N);

        const a = 2 * Math.pow(Math.sin(-Math.PI / N2), 2);
        const b = Math.sin((-Math.PI * 2) / N2);
        let cos = 1;
        let sin = 0;

        for (let k = 0; k < N; ++k) {
            const Xere = aux[k];
            const Xeim = aux[imOffset + k];
            const Xore = aux[oddOffset + k];
            const Xoim = aux[oddOffset + imOffset + k];
            const re = Xere + Xore * cos - Xoim * sin;
            const im = Xeim + Xore * sin + Xoim * cos;
            array[k] = re;
            array[imOffset + k] = im;
            const cosTmp = cos - (a * cos + b * sin);
            const sinTmp = sin + (b * cos - a * sin);
            cos = cosTmp;
            sin = sinTmp;
        }
    };

    const reorder = function (array: Float32Array) {
        const N = array.length >> 1;
        const log2N = (Math.log(N) * Math.LOG2E) | 0;

        for (let i = 0; i < N; ++i) {
            const j = reverseBits(i, log2N);

            if (i < j) {
                const ii = i << 1;
                const jj = j << 1;
                const tmpR = array[ii]!;
                const tmpI = array[ii + 1]!;
                array[ii] = array[jj]!;
                array[ii + 1] = array[jj + 1]!;
                array[jj] = tmpR;
                array[jj + 1] = tmpI;
            }
        }
    };

    const fftHalf = function (array: Float32Array) {
        const N = array.length >> 1;
        const table = getTable(N);
        const sinTable = table.sin;
        const cosTable = table.cos;

        for (let n = 2; n <= N; n <<= 1) {
            const halfn = n >> 1;
            const stride = N / n;

            for (let i = 0; i < N; i += n) {
                const plusHalf = i + halfn;
                let k = 0;

                for (let j = i; j < plusHalf; j++) {
                    const cos = cosTable[k];
                    const sin = sinTable[k];
                    const realIndex = j << 1;
                    const realIndexPlusHalf = (j + halfn) << 1;
                    const Tre = array[realIndexPlusHalf]! * cos + array[realIndexPlusHalf + 1]! * sin;
                    const Tim = -array[realIndexPlusHalf]! * sin + array[realIndexPlusHalf + 1]! * cos;
                    array[realIndexPlusHalf] = array[realIndex]! - Tre;
                    array[realIndexPlusHalf + 1] = array[realIndex + 1]! - Tim;
                    array[realIndex] += Tre;
                    array[realIndex + 1] += Tim;

                    k += stride;
                }
            }
        }
    };

    return function (array: Float32Array) {
        const N2 = array.length;

        if ((N2 & (N2 >>> 1)) !== 0) {
            throw new Error(`array size must be a power of two`);
        }

        if (N2 > MAX_SIZE) {
            throw new Error(`maximum size is: ${MAX_SIZE}`);
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

export default realFft;
