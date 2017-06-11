#include "effects.h"

EXPORT void effects_noise_sharpening(double effect_size,
                                     uint8_t channel_count,
                                     void* samples,
                                     size_t byte_length) {
    if (effect_size > 0) {
        uint32_t effect_multiplier = DOUBLE_TO_U32(effect_size * (double)EFFECT_MULTIPLIER);
        size_t length = byte_length / sizeof(int16_t) / channel_count;
        int16_t* samples_i16 = (int16_t*) samples;
        for (size_t i = length - 1; i >= 1; --i) {
            for (uint8_t ch = 0; ch < channel_count; ++ch) {
                int32_t sample = samples_i16[i * channel_count + ch];
                int32_t previous_sample = samples_i16[(i - 1) * channel_count + ch];
                int32_t diff = sample - previous_sample;
                samples_i16[i * channel_count + ch] = CLIP_I32_TO_I16((sample + effect_multiplier * diff) / EFFECT_MULTIPLIER);
            }
        }
    }

}
