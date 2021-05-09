#ifndef CHROMAPRINT_H
#define CHROMAPRINT_H

#include <math.h>
#include <fft/real_fft.c>

typedef enum {
    CHROMAPRINT_SUCCESS = 0,
    CHROMAPRINT_ERROR_NOMEM = 1,
    CHROMAPRINT_ERROR_NO_FINGERPRINT_TO_COMPRESS = 2,
    CHROMAPRINT_ERROR_INSUFFICIENT_LENGTH = 3
} ChromaprintError;

static bool initialized = false;
static uint32_t instance_in_use = 0;
#define CP_LN2 0.6931471805599453
#define CP_DURATION 120
#define CP_SAMPLE_RATE 11025
#define CP_OVERLAP 1365
#define CP_FRAMES 4096
#define CP_FRAMES_LOG2 12
#define CP_IM_OFFSET (CP_FRAMES / 2)
#define CP_NOTES 12
#define CP_FRAMES_NEEDED_TOTAL (CP_SAMPLE_RATE * CP_DURATION)
#define CP_ROWS 967
static const double COEFFS[] = {0.25, 0.75, 1.0, 0.75, 0.25};
#define CP_NOTE_FREQUENCY_START 10
#define CP_NOTE_FREQUENCY_END 1308
#define CP_REFERENCE_FREQUENCY 440
#define CP_WIDTH 16
#define CP_BASE ((double) CP_REFERENCE_FREQUENCY / (double) CP_WIDTH)
#define CP_ALGORITHM 1
#define CP_TMP_SIZE (CP_FRAMES * 2)
#define CP_BITS_SIZE (CP_ROWS * 33)

static const char* BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
static bool critical = false;
static float TMP2[CP_TMP_SIZE];
static double BUFFER[CP_FRAMES];
static double IMAGE[CP_ROWS * CP_NOTES];
static double NOTE_BUFFER[8 * CP_NOTES];
static uint8_t BITS[CP_BITS_SIZE];
static uint32_t BINS_TO_NOTES[CP_NOTE_FREQUENCY_END];

typedef struct {
    uint32_t frames_processed;
    uint32_t note_buffer_index;
    uint32_t coeff;
    uint32_t row;
    uint32_t bits_index;
    int32_t tmp_length;
} Chromaprint;

EXPORT Chromaprint* chromaprint_create();
EXPORT void chromaprint_destroy(Chromaprint* this);
EXPORT ChromaprintError chromaprint_add_samples(Chromaprint* this, float* samples, uint32_t length);
EXPORT uint32_t chromaprint_needs_samples(Chromaprint* this);
EXPORT int chromaprint_can_calculate(Chromaprint* this);
EXPORT ChromaprintError chromaprint_calculate_fingerprint(Chromaprint* this, char** base64_string_result);

static void chromaprint_process_frames(Chromaprint* this, float* src);
static void chromaprint_chroma(Chromaprint* this);
static void chromaprint_transform_image(Chromaprint* this);
static int32_t chromaprint_get_fingerprint_length(Chromaprint* this);
static ChromaprintError chromaprint_get_fingerprint(Chromaprint* this);
static void chromaprint_compress_sub_fingerprint(Chromaprint* this, uint32_t x);
static ChromaprintError chromaprint_compressed(Chromaprint* this);
static char* chromaprint_base64_encode_fingerprint(uint8_t* bytes, uint32_t length);
static uint32_t chromaprint_bits_1(Chromaprint* this, uint8_t* ret, uint32_t offset);
static uint32_t chromaprint_bits_2(Chromaprint* this, uint8_t* ret, uint32_t offset);
static void chromaprint_initialize();

static double cmp(double a, double b);
static double area(int32_t x1, int32_t y1, int32_t x2, int32_t y2);
static uint32_t quantize(double value, double t0, double t1, double t2);
static uint32_t classify0(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static uint32_t classify1(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static uint32_t classify2(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static uint32_t classify3(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static uint32_t classify4(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static uint32_t classify5(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2);
static void hanning_window(float*, uint32_t, double*);

#endif
