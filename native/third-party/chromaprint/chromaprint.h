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
static const double LN2 = 0.6931471805599453;
static const uint32_t DURATION = 120;
static const uint32_t SAMPLE_RATE = 11025;
static const uint32_t OVERLAP = 1365;
static const uint32_t FRAMES = 4096;
// log(FRAMES) / LN2
static const uint32_t FRAMES_LOG2 = 12;
static const uint32_t IM_OFFSET = FRAMES / 2;
static const uint32_t NOTES = 12;
static const uint32_t FRAMES_NEEDED_TOTAL = SAMPLE_RATE * DURATION;
static const uint32_t ROWS = 967;
static const double COEFFS[] = {0.25, 0.75, 1.0, 0.75, 0.25};
static const uint32_t NOTE_FREQUENCY_START = 10;
static const uint32_t NOTE_FREQUENCY_END = 1308;
static const uint32_t REFERENCE_FREQUENCY = 440;
static const uint32_t WIDTH = 16;
static const double BASE = (double) REFERENCE_FREQUENCY / (double) WIDTH;
static const uint32_t ALGORITHM = 1;
static const uint32_t TMP_SIZE = FRAMES * 2;
static const uint32_t BITS_SIZE = ROWS * 33;

static const char* BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
static bool critical = false;
static float TMP2[TMP_SIZE];
static double BUFFER[FRAMES];
static double IMAGE[ROWS * NOTES];
static double NOTE_BUFFER[8 * NOTES];
static uint8_t BITS[BITS_SIZE];
static uint32_t BINS_TO_NOTES[NOTE_FREQUENCY_END];

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
