#ifndef REAL_FFT_H
#define REAL_FFT_H

#define COS_INDEX 0
#define SIN_INDEX 1

#define FFT_MAX_SIZE 32768
#define FFT_MAX_SIZE_LOG2 15
static double* tables[FFT_MAX_SIZE_LOG2][2];
static double* AUX[FFT_MAX_SIZE_LOG2];

int real_fft_forward(double* array, uint32_t length);

static double* ensure_table(uint32_t N);
static double* get_aux(uint32_t N);
static uint32_t reverse_bits(uint32_t v, uint32_t count);
static void reorder(double* array, uint32_t length);
static int do_half(double* array, uint32_t length);
static int split(double* array, uint32_t length);
static int combine(double* array, uint32_t length);


#endif //REAL_FFT_H


