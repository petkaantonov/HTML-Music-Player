#include "real_fft.h"
#include <math.h>

static double* ensure_table(uint32_t N) {
    int index = 31 - CLZ(N);
    double* ret = tables[index][COS_INDEX];

    if (!ret) {
        double* sin_table = malloc(sizeof(double) * N);
        double* cos_table = malloc(sizeof(double) * N);

        if (!sin_table || !cos_table) {
            return NULL;
        }

        for (uint32_t i = 0; i < N; ++i) {
            sin_table[i] = sin(M_PI * 2.0 * (double) i / (double)(N));
            cos_table[i] = cos(M_PI * 2.0 * (double) i / (double)(N));
        }
        tables[index][COS_INDEX] = cos_table;
        tables[index][SIN_INDEX] = sin_table;
        return cos_table;
    }

    return ret;
}

static double* get_aux(uint32_t N) {
    int index = 31 - CLZ(N);
    double* ret = AUX[index];

    if (!ret) {
        double* aux = malloc(sizeof(double) * N * 4);
        if (!aux) {
            return aux;
        }
        AUX[index] = aux;
        return aux;
    }
    return ret;
}

static uint32_t reverse_bits(uint32_t v, uint32_t count) {
    v = ((v >> 1) & 0x55555555) | ((v & 0x55555555) << 1);
    v = ((v >> 2) & 0x33333333) | ((v & 0x33333333) << 2);
    v = ((v >> 4) & 0x0F0F0F0F) | ((v & 0x0F0F0F0F) << 4);
    v = ((v >> 8) & 0x00FF00FF) | ((v & 0x00FF00FF) << 8);
    v = ( v >> 16 ) | ( v << 16);
    return v >> (32 - count);
}

static void reorder(double* array, uint32_t length) {
    uint32_t N = length >> 1;
    uint32_t log2N = 31 - CLZ(N);

    for (uint32_t i = 0; i < N; ++i) {
        uint32_t j = reverse_bits(i, log2N);

        if (i < j) {
            uint32_t ii = i << 1;
            uint32_t jj = j << 1;
            double tmpR = array[ii];
            double tmpI = array[ii + 1];
            array[ii] = array[jj];
            array[ii + 1] = array[jj + 1];
            array[jj] = tmpR;
            array[jj + 1] = tmpI;
        }
    }

}

static int do_half(double* array, uint32_t length) {
    uint32_t N = length >> 1;
    if (!ensure_table(N)) {
        return 0;
    }
    int index = 31 - CLZ(N);
    double* sin_table = tables[index][SIN_INDEX];
    double* cos_table = tables[index][COS_INDEX];

    for (uint32_t n = 2; n <= N; n <<= 1) {
        uint32_t halfn = n >> 1;
        uint32_t stride = N / n;

        for (uint32_t i = 0; i < N; i += n) {
            uint32_t plusHalf = i + halfn;
            uint32_t k = 0;

            for (uint32_t j = i; j < plusHalf; j++) {
                double cos_value = cos_table[k];
                double sin_value = sin_table[k];
                uint32_t realIndex = j << 1;
                uint32_t realIndexPlusHalf = (j + halfn) << 1;
                double Tre = array[realIndexPlusHalf] * cos_value + array[realIndexPlusHalf + 1] * sin_value;
                double Tim = -array[realIndexPlusHalf] * sin_value + array[realIndexPlusHalf + 1] * cos_value;
                array[realIndexPlusHalf] = array[realIndex] - Tre;
                array[realIndexPlusHalf + 1] = array[realIndex + 1] - Tim;
                array[realIndex] += Tre;
                array[realIndex + 1] += Tim;

                k += stride;
            }
        }
    }
    return 1;
}

static int split(double* array, uint32_t length) {
    uint32_t N2 = length;
    uint32_t N = N2 >> 1;
    uint32_t halfN = N >> 1;
    uint32_t imOffset = N;
    uint32_t oddOffset = N2;
    double* aux = get_aux(N);
    if (!aux) {
        return 0;
    }

    aux[0] = array[0];
    aux[imOffset] = 0;
    aux[halfN] = array[halfN << 1];
    aux[imOffset + halfN] = 0;
    aux[oddOffset] = array[1];
    aux[oddOffset + imOffset] = 0;
    aux[oddOffset + halfN] = array[(halfN << 1) + 1];
    aux[oddOffset + imOffset + halfN] = 0;

    for (uint32_t k = 1; k < N; ++k) {
        double re = array[k << 1];
        double im = array[(k << 1) + 1];
        double reSym = array[(N - k) << 1];
        double imSym = array[((N - k) << 1) + 1];
        aux[k] = (re + reSym) / 2;
        aux[imOffset + k] = (im - imSym) / 2;
        aux[oddOffset + k] = (im + imSym) / 2;
        aux[oddOffset + imOffset + k] = (reSym - re) / 2;
    }
    return 1;
}

static int combine(double* array, uint32_t length) {
    uint32_t N2 = length;
    uint32_t N = N2 >> 1;
    uint32_t imOffset = N;
    uint32_t oddOffset = N2;
    double* aux = get_aux(N);
    if (!aux) {
        return 0;
    }

    double a = 2 * pow(sin(-M_PI / N2), 2);
    double b = sin(-M_PI * 2 / N2);
    double cos_value = 1;
    double sin_value = 0;

    for (uint32_t k = 0; k < N; ++k) {
        double Xere = aux[k];
        double Xeim = aux[imOffset + k];
        double Xore = aux[oddOffset + k];
        double Xoim = aux[oddOffset + imOffset + k];
        double re = Xere + (Xore * cos_value) - (Xoim * sin_value);
        double im = Xeim + (Xore * sin_value) + (Xoim * cos_value);
        array[k] = re;
        array[imOffset + k] = im;
        double cosTmp = cos_value - (a * cos_value + b * sin_value);
        double sinTmp = sin_value + (b * cos_value - a * sin_value);
        cos_value = cosTmp;
        sin_value = sinTmp;
    }
    return 1;
}

int real_fft_forward(double* array, uint32_t length) {
    reorder(array, length);
    if (!do_half(array, length)) {
        return 0;
    }
    if (!split(array, length)) {
        return 0;
    }
    if (!combine(array, length)) {
        return 0;
    }
    return 1;
}
