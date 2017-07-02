/*
 * Ported from acousticid/chromaprint
 *
 * Chromaprint -- Audio fingerprinting toolkit
 * Copyright (C) 2010  Lukas Lalinsky <lalinsky@gmail.com>,
 * Copyright (C) 2015  Petka Antonov
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301
 * USA
 */
#include "chromaprint.h"
#include <math.h>

static void chromaprint_initialize() {
    if (initialized) {
        return;
    }
    initialized = true;

    for (uint32_t i = NOTE_FREQUENCY_START; i < NOTE_FREQUENCY_END; ++i) {
        double octave = log(((double)i * (double)SAMPLE_RATE / (double)FRAMES) / (double)BASE) / LN2;
        uint32_t note = (uint32_t)((double)NOTES * (octave - floor(octave)));
        BINS_TO_NOTES[i] = note;
    }

}

EXPORT Chromaprint* chromaprint_create() {
    chromaprint_initialize();
    if (instance_in_use) {
        return NULL;
    }
    instance_in_use = 1;
    Chromaprint* this = malloc(sizeof(Chromaprint));
    if (!this) return NULL;
    this->frames_processed = 0;
    this->coeff = 1;
    this->note_buffer_index = 0;
    this->row = 0;
    this->bits_index = 0;
    this->tmp_length = 0;
    return this;
}

EXPORT void chromaprint_destroy(Chromaprint* this) {
    instance_in_use = 0;
    free(this);
}

EXPORT ChromaprintError chromaprint_add_samples(Chromaprint* this, int16_t* src, uint32_t length) {
    int32_t len = (int32_t)length;
    uint32_t src_offset = 0;

    if (len < TMP_SIZE) {
        return CHROMAPRINT_ERROR_INSUFFICIENT_LENGTH;
    }

    if (this->tmp_length > 0) {
        int32_t tmp_offset = 0;
        assert(this->tmp_length < FRAMES);
        memmove((void*)(&TMP2[this->tmp_length]), (void*)src, 2 * OVERLAP * sizeof(int16_t));

        while (this->tmp_length > 0) {
            if (this->frames_processed + FRAMES - 1 >= FRAMES_NEEDED_TOTAL) {
                return CHROMAPRINT_SUCCESS;
            }
            chromaprint_process_frames(this, &TMP2[tmp_offset]);
            this->tmp_length -= OVERLAP;
            tmp_offset += OVERLAP;
            assert_lt(tmp_offset, FRAMES + OVERLAP);
        }

        int spilled = -this->tmp_length;
        this->tmp_length = 0;
        assert(spilled >= 0);
        len -= spilled;
        src_offset = spilled;
    }

    while (len > 0) {
        if (len >= FRAMES) {
            if (this->frames_processed + FRAMES - 1 >= FRAMES_NEEDED_TOTAL) {
                break;
            }
            chromaprint_process_frames(this, &src[src_offset]);
            len -= OVERLAP;
            src_offset += OVERLAP;
        } else {
            memmove((void*)TMP2, (void*)&src[src_offset], len * sizeof(int16_t));
            this->tmp_length = len;
            len = 0;
        }
    }
    return CHROMAPRINT_SUCCESS;
}

EXPORT uint32_t chromaprint_needs_samples(Chromaprint* this) {
    return this->frames_processed + FRAMES - 1 < FRAMES_NEEDED_TOTAL;
}

EXPORT int chromaprint_can_calculate(Chromaprint* this) {
    return this->frames_processed > SAMPLE_RATE * 7;
}

EXPORT ChromaprintError chromaprint_calculate_fingerprint(Chromaprint* this, char** base64_string_result) {
    chromaprint_transform_image(this);
    int err = chromaprint_get_fingerprint(this);
    if (err) return err;
    err = chromaprint_compressed(this);
    if (err) return err;
    *base64_string_result = (char*) BITS;
    return CHROMAPRINT_SUCCESS;
}

static void chromaprint_process_frames(Chromaprint* this, int16_t* src) {
    hanning_window(src, FRAMES, BUFFER);
    real_fft_forward(BUFFER, FRAMES);
    chromaprint_chroma(this);
    this->frames_processed += OVERLAP;
}

static void chromaprint_transform_image(Chromaprint* this) {
    uint32_t rows = this->row;
    uint32_t current = 1;
    for (uint32_t i = 1; i < 12; ++i) {
        IMAGE[i] = IMAGE[i] + IMAGE[i - 1];
        current++;
    }

    uint32_t previous = 0;
    for (uint32_t i = 1; i < rows; ++i) {
        IMAGE[current] = IMAGE[current] + IMAGE[previous];
        current++;
        previous++;

        for (uint32_t j = 1; j < 12; ++j) {
            IMAGE[current] = IMAGE[current] +
                             IMAGE[current - 1] +
                             IMAGE[previous] -
                             IMAGE[previous - 1];
            current++;
            previous++;
        }
    }
}

static int32_t chromaprint_get_fingerprint_length(Chromaprint* this) {
    return this->row - 16 + 1;
}


static ChromaprintError chromaprint_get_fingerprint(Chromaprint* this) {
    int32_t length = chromaprint_get_fingerprint_length(this);

    if (length < 2) {
        return CHROMAPRINT_ERROR_INSUFFICIENT_LENGTH;
    }
    uint32_t* fingerprint = (uint32_t*)BUFFER;
    assert_lt(length * sizeof(int32_t), sizeof(int16_t) * FRAMES);

    for (uint32_t i = 0; i < length; ++i) {
        uint32_t value = 0;
        value = (value << 2) | classify0(i, 4, 3, 15, 1.98215, 2.35817, 2.63523);
        value = (value << 2) | classify4(i, 4, 6, 15, -1.03809, -0.651211, -0.282167);
        value = (value << 2) | classify1(i, 0, 4, 16, -0.298702, 0.119262, 0.558497);
        value = (value << 2) | classify3(i, 8, 2, 12, -0.105439, 0.0153946, 0.135898);
        value = (value << 2) | classify3(i, 4, 4, 8, -0.142891, 0.0258736, 0.200632);
        value = (value << 2) | classify4(i, 0, 3, 5, -0.826319, -0.590612, -0.368214);
        value = (value << 2) | classify1(i, 2, 2, 9, -0.557409, -0.233035, 0.0534525);
        value = (value << 2) | classify2(i, 7, 3, 4, -0.0646826, 0.00620476, 0.0784847);
        value = (value << 2) | classify2(i, 6, 2, 16, -0.192387, -0.029699, 0.215855);
        value = (value << 2) | classify2(i, 1, 3, 2, -0.0397818, -0.00568076, 0.0292026);
        value = (value << 2) | classify5(i, 10, 1, 15, -0.53823, -0.369934, -0.190235);
        value = (value << 2) | classify3(i, 6, 2, 10, -0.124877, 0.0296483, 0.139239);
        value = (value << 2) | classify2(i, 1, 1, 14, -0.101475, 0.0225617, 0.231971);
        value = (value << 2) | classify3(i, 5, 6, 4, -0.0799915, -0.00729616, 0.063262);
        value = (value << 2) | classify1(i, 9, 2, 12, -0.272556, 0.019424, 0.302559);
        value = (value << 2) | classify3(i, 4, 2, 14, -0.164292, -0.0321188, 0.08463);
        fingerprint[i] = value;
    }
    return CHROMAPRINT_SUCCESS;
}

static uint32_t chromaprint_bits_1(Chromaprint* this, uint8_t* ret, uint32_t offset) {
    uint32_t holder = 0;
    int32_t holder_size = 0;

    for (uint32_t i = 0; i < this->bits_index; ++i) {
        int32_t value = MIN(BITS[i], 7);

        holder |= (value << holder_size);
        holder_size += 3;

        while (holder_size >= 8) {
            ret[offset++] = holder & 0xFF;
            holder >>= 8;
            holder_size -= 8;
        }
    }

    while (holder_size > 0) {
        ret[offset++] = holder & 0xFF;
        holder >>= 8;
        holder_size -= 8;
    }
    return offset;
}

static uint32_t chromaprint_bits_2(Chromaprint* this, uint8_t* ret, uint32_t offset) {
    uint32_t holder = 0;
    int32_t holder_size = 0;

    for (uint32_t i = 0; i < this->bits_index; ++i) {
        int32_t value = BITS[i];

        if (value < 7) continue;
        value -= 7;

        holder |= (value << holder_size);
        holder_size += 5;

        while (holder_size >= 8) {
            ret[offset++] = holder & 0xFF;
            holder >>= 8;
            holder_size -= 8;
        }
    }

    while (holder_size > 0) {
        ret[offset++] = holder & 0xFF;
        holder >>= 8;
        holder_size -= 8;
    }
    return offset;
}

static void chromaprint_compress_sub_fingerprint(Chromaprint* this, uint32_t x) {
    int32_t bit = 1;
    int32_t last_bit = 0;

    while (x != 0) {
        if ((x & 1) != 0) {
            BITS[this->bits_index++] = bit - last_bit;
            last_bit = bit;
        }
        x >>= 1;
        bit++;
    }

    BITS[this->bits_index++] = 0;
}

static ChromaprintError chromaprint_compressed(Chromaprint* this) {
    this->bits_index = 0;
    uint32_t* fingerprint = (uint32_t*)BUFFER;
    int32_t length = chromaprint_get_fingerprint_length(this);
    if (length < 2) {
        return CHROMAPRINT_ERROR_INSUFFICIENT_LENGTH;
    }


    chromaprint_compress_sub_fingerprint(this, fingerprint[0]);
    for (uint32_t i = 1; i < length; ++i) {
        chromaprint_compress_sub_fingerprint(this, fingerprint[i] ^ fingerprint[i - 1]);
    }

    uint8_t* ret = (uint8_t*) fingerprint;
    uint32_t len = (uint32_t)length;
    ret[0] = ALGORITHM & 0xFF;
    ret[1] = (len >> 16) & 0xFF;
    ret[2] = (len >> 8) & 0xFF;
    ret[3] = (len >> 0) & 0xFF;

    uint32_t offset = 4;
    offset = chromaprint_bits_1(this, ret, offset);
    offset = chromaprint_bits_2(this, ret, offset);
    chromaprint_base64_encode_fingerprint(ret, offset);
    return CHROMAPRINT_SUCCESS;
}

static char* chromaprint_base64_encode_fingerprint(uint8_t* bytes, uint32_t length) {
    uint32_t new_length = ((length * 4 + 2) / 3);
    char* ret = (char*)BITS;
    assert_not_equals((uintptr_t)ret, (uintptr_t)bytes);
    assert_lt(new_length, BITS_SIZE);

    uint32_t input_index = 0;
    uint32_t output_index = 0;

    while (length > 0) {
        ret[output_index++] = BASE64[(bytes[input_index] >> 2)];
        ret[output_index++] = BASE64[((bytes[input_index] << 4) |
                                   (((--length) > 0) ? (bytes[input_index + 1] >> 4) : 0)) & 63];
        if (length > 0) {
            ret[output_index++] = BASE64[((bytes[input_index + 1] << 2) |
                                       (((--length) > 0) ? (bytes[input_index + 2] >> 6) : 0)) & 63];
            if (length > 0) {
                ret[output_index++] = BASE64[bytes[input_index + 2] & 63];
                length--;
            }
        }

        ret[output_index] = '\0';
        input_index += 3;

    }

    assert_equals(output_index, new_length);
    ret[output_index++] = '\0';
    return ret;
}


static void chromaprint_chroma(Chromaprint* this) {
    uint32_t note_buffer_offset = this->note_buffer_index * NOTES;
    for (uint32_t i = 0; i < NOTES; ++i) {
        NOTE_BUFFER[note_buffer_offset + i] = 0.0;
    }

    for (uint32_t i = NOTE_FREQUENCY_START; i < NOTE_FREQUENCY_END; ++i) {
        uint32_t note = BINS_TO_NOTES[i];
        double re = BUFFER[i];
        double im = BUFFER[i + IM_OFFSET];
        double energy = re * re + im * im;
        NOTE_BUFFER[note_buffer_offset + note] += energy;
    }

    this->note_buffer_index = (this->note_buffer_index + 1) & 7;

    if (this->coeff >= 5) {
        uint32_t offset = (this->note_buffer_index + 3) & 7;
        double TMP[NOTES];

        double sum = 0.0;
        for (uint32_t i = 0; i < NOTES; ++i) {
            TMP[i] = 0.0;

            for (uint32_t j = 0; j < 5; ++j) {
                uint32_t note_index = (((offset + j) & 7) * NOTES) + i;
                double value = NOTE_BUFFER[note_index] * COEFFS[j];
                TMP[i] += value;
            }

            sum += (TMP[i] * TMP[i]);
        }

        sum = sqrt(sum);

        uint32_t row = this->row;
        uint32_t j = row * NOTES;
        if (sum < 0.01) {
            for (uint32_t i = 0; i < NOTES; ++i) {
                IMAGE[j++] = 0.0;
            }
        } else {
            for (uint32_t i = 0; i < NOTES; ++i) {
                IMAGE[j] = TMP[i] / sum;
                j++;
            }
        }
        this->row++;
    } else {
        this->coeff++;
    }
}

static double cmp(double a, double b) {
    return log(1.0 + a) - log(1.0 + b);
}

static double area(int32_t x1, int32_t y1, int32_t x2, int32_t y2) {
    if (x2 < x1 || y2 < y1) {
        return 0.0;
    }

    double area = IMAGE[x2 * 12 + y2];

    if (x1 > 0) {
        area -= IMAGE[(x1 - 1) * 12 + y2];
        if (y1 > 0) {
            area += IMAGE[(x1 - 1) * 12 + (y1 - 1)];
        }
    }

    if (y1 > 0) {
        area -= IMAGE[x2 * 12 + (y1 - 1)];
    }

    return area;
}

static uint32_t quantize(double value, double t0, double t1, double t2) {
    if (value < t1) {
        if (value < t0) {
            return 0;
        }
        return 1;
    } else if (value < t2) {
        // Grey coded.
        return 3;
    } else {
        // Grey coded.
        return 2;
    }
}

static uint32_t classify0(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    return quantize(cmp(area(x, y, x + w - 1, y + h - 1), 0), t0, t1, t2);
}

static uint32_t classify1(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    int32_t h_2 = h / 2;

    return quantize(cmp(area(x, y + h_2, x + w - 1, y + h - 1),
               area(x, y, x + w - 1, y + h_2 - 1)), t0, t1, t2);
}

static uint32_t classify2(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    int32_t w_2 = w / 2;

    return quantize(cmp(area(x + w_2, y, x + w - 1, y + h - 1),
               area(x, y, x + w_2 - 1, y + h - 1)), t0, t1, t2);
}

static uint32_t classify3(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    int32_t h_2 = h / 2;
    int32_t w_2 = w / 2;

    double a = area(x, y + h_2, x + w_2 - 1, y + h - 1) +
            area(x + w_2, y, x + w - 1, y + h_2 - 1);

    double b = area(x, y, x + w_2 - 1, y + h_2 - 1) +
            area(x + w_2, y + h_2, x + w - 1, y + h - 1);

    return quantize(cmp(a, b), t0, t1, t2);
}

static uint32_t classify4(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    int32_t h_3 = h / 3;

    double a = area(x, y + h_3, x + w - 1, y + 2 * h_3 - 1);

    double b = area(x, y, x + w - 1, y + h_3 - 1) +
            area(x, y + 2 * h_3, x + w - 1, y + h - 1);

    return quantize(cmp(a, b), t0, t1, t2);
}

static uint32_t classify5(int32_t x, int32_t y, int32_t h, int32_t w, double t0, double t1, double t2) {
    int32_t w_3 = w / 3;

    double a = area(x + w_3, y, x + 2 * w_3 - 1, y + h - 1);

    double b = area(x, y, x + w_3 - 1, y + h - 1) +
            area(x + 2 * w_3, y, x + w - 1, y + h - 1);

    return quantize(cmp(a, b), t0, t1, t2);
}

static const double a = 0.0000011765482980900709;
static const double b = -0.0015339801862847655;
static void hanning_window(int16_t* frames, uint32_t length, double* dst) {
    assert_equals(length, 4096);
    double tmp;
    double cos_value = 1.0;
    double sin_value = 0.0;

    for (uint32_t n = 0; n < length; ++n) {
        double frame = (double)frames[n] / 32768.0;
        frame *= (0.54 - 0.46 * cos_value);
        dst[n] = frame;
        tmp = cos_value - (a * cos_value + b * sin_value);
        sin_value = sin_value + (b * cos_value - a * sin_value);
        cos_value = tmp;
    }
}
