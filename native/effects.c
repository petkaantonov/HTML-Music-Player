#include "effects.h"

static float effects_bass_boost_state[EFFECT_BASS_BOOST_MAX_CHANNELS];
static double effects_equalizer_state[EFFECT_EQUALIZER_STATE_LENGTH];
static const float bass_boost_gain1 = 1.0 / (EFFECT_BASS_BOOST_SELECTIVITY + 1.0);
static const float bass_boost_gain2 = 0.5;

EXPORT void effects_equalizer_reset() {
    for (int i = 0; i < EFFECT_EQUALIZER_STATE_LENGTH; ++i) {
        effects_equalizer_state[i] = 0.0;
    }
}

EXPORT void effects_bass_boost_reset() {
    for (int i = 0; i < EFFECT_BASS_BOOST_MAX_CHANNELS; ++i) {
        effects_bass_boost_state[i] = 0.0;
    }
}

static double get_fade_in_volume(double t0, double t, double t1) {
    t = (t / ((t1 - t0) / 2.0)) - 1.0;
    return sqrt(0.5 * (1.0 + t));
}

static double get_fade_out_volume(double t0, double t, double t1) {
    t = (t / ((t1 - t0) / 2.0)) - 1.0;
    return sqrt(0.5 * (1.0 - t));
}

EXPORT void effects_bass_boost_apply(double effect_size,
                               uint32_t channel_count,
                               int16_t* samples,
                               uint32_t byte_length) {
    if (channel_count > EFFECT_BASS_BOOST_MAX_CHANNELS) {
        return;
    }
    size_t length = byte_length / sizeof(int16_t) / channel_count;
    int16_t* samples_i16 = (int16_t*) samples;
    const float ratio = EFFECT_BASS_BOOST_MIN_RATIO + effect_size * (EFFECT_BASS_BOOST_MAX_RATIO - EFFECT_BASS_BOOST_MIN_RATIO);

    for (int i = 0; i < length; ++i) {
        for (int ch = 0; ch < channel_count; ++ch) {
            float sample = ((float)samples_i16[i * channel_count + ch]) / 32768.0;
            effects_bass_boost_state[ch] = (sample + effects_bass_boost_state[ch] * EFFECT_BASS_BOOST_SELECTIVITY) * bass_boost_gain1;
            sample = (sample + effects_bass_boost_state[ch] * ratio) * bass_boost_gain2;
            samples_i16[i * channel_count + ch] = CLIP_I32_TO_I16((int32_t) (sample * 32768.0));
        }
    }

    const uint32_t* effects_bass_boost_state_bits = (uint32_t*) effects_bass_boost_state;
    for (int j = 0; j < EFFECT_BASS_BOOST_MAX_CHANNELS; ++j) {
        if ((effects_bass_boost_state_bits[j] & 0x7F800000) == 0) {
            effects_bass_boost_state[j] = 0.0;
        }
    }
}

EXPORT void effects_noise_sharpening(double effect_size,
                                     uint8_t channel_count,
                                     void* samples,
                                     size_t byte_length) {
    size_t length = byte_length / sizeof(int16_t) / channel_count;
    int16_t* samples_i16 = (int16_t*) samples;

    if (effect_size > 0) {
        int32_t effect_multiplier = DOUBLE_TO_U32(effect_size * (double)EFFECT_MULTIPLIER);
        for (size_t i = length - 1; i >= 1; --i) {
            for (uint8_t ch = 0; ch < channel_count; ++ch) {
                int32_t sample = samples_i16[i * channel_count + ch];
                int32_t previous_sample = samples_i16[(i - 1) * channel_count + ch];
                int32_t diff = sample - previous_sample;
                int32_t value = (sample + (effect_multiplier * diff / EFFECT_MULTIPLIER));
                samples_i16[i * channel_count + ch] = CLIP_I32_TO_I16(value);
            }
        }
    }
}

EXPORT void effects_crossfade_fade_in(double track_current_time,
                                      double track_duration,
                                      double fade_duration,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      void* samples,
                                      size_t byte_length) {
    if (fade_duration == 0.0 || track_current_time > fade_duration) {
        return;
    }
    const uint32_t buffer_frame_count = byte_length / sizeof(int16_t) / channel_count;
    const uint32_t fade_frame_count = (uint32_t)((double)(fade_duration - track_current_time) * (double) sample_rate);
    const uint32_t total_frames_to_process = MIN(buffer_frame_count, fade_frame_count);

    int16_t* samples_i16 = (int16_t*) samples;
    int32_t volume_multiplier;
    for (int i = 0; i < total_frames_to_process; i++) {
        if ((i & (EFFECT_BLOCK_SIZE - 1)) == 0) {
            double t = track_current_time + ((double) i) / ((double) sample_rate);
            double vol = get_fade_in_volume(0.0, t, fade_duration);
            volume_multiplier = DOUBLE_TO_U32(vol * (double)EFFECT_MULTIPLIER);
        }

        for (int ch = 0; ch < channel_count; ++ch) {
            int32_t val = (((int32_t)samples_i16[i * channel_count + ch]) * volume_multiplier) / EFFECT_MULTIPLIER;
            samples_i16[i * channel_count + ch] = CLIP_I32_TO_I16(val);
        }
    }
}

EXPORT void effects_crossfade_fade_out(double track_current_time,
                                      double track_duration,
                                      double fade_duration,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      void* samples,
                                      size_t byte_length) {
    const uint32_t frame_count = byte_length / sizeof(int16_t) / channel_count;
    const double buffer_duration = (double)frame_count / (double)sample_rate;
    const double fade_start_time = track_duration - fade_duration;
    if (fade_duration == 0.0 || track_current_time + buffer_duration < fade_start_time) {
        return;
    }

    const uint32_t start_frame = (int)(MAX(fade_start_time - track_current_time, 0.0) * (double)sample_rate);
    int16_t* samples_i16 = (int16_t*) samples;

    double t = (track_current_time + ((double) start_frame) / ((double) sample_rate)) - fade_start_time;
    t = MAX(0, t);
    double vol = get_fade_out_volume(0.0, t, fade_duration);
    int32_t volume_multiplier = DOUBLE_TO_U32(vol * (double)EFFECT_MULTIPLIER);

    for (int i = start_frame; i < frame_count; i++) {
        if ((i & (EFFECT_BLOCK_SIZE - 1)) == 0) {
            double t = (track_current_time + ((double) i) / ((double) sample_rate)) - fade_start_time;
            t = MAX(0, t);
            double vol = get_fade_out_volume(0.0, t, fade_duration);
            volume_multiplier = DOUBLE_TO_U32(vol * (double)EFFECT_MULTIPLIER);
        }

        for (int ch = 0; ch < channel_count; ++ch) {
            int32_t val = (((int32_t)samples_i16[i * channel_count + ch]) * volume_multiplier) / EFFECT_MULTIPLIER;
            samples_i16[i * channel_count + ch] = CLIP_I32_TO_I16(val);
        }
    }
}

#define EFFECT_APPLY_BAND(input, output, state_index_base, param_base, param_ptr)                       \
        output = param_ptr[param_base + 0] * input +                                                    \
                 param_ptr[param_base + 1] * effects_equalizer_state[state_index_base + 0] +            \
                 param_ptr[param_base + 2] * effects_equalizer_state[state_index_base + 1] -            \
                 param_ptr[param_base + 3] * effects_equalizer_state[state_index_base + 2] -            \
                 param_ptr[param_base + 4] * effects_equalizer_state[state_index_base + 3];             \
        effects_equalizer_state[state_index_base + 1] = effects_equalizer_state[state_index_base + 0];  \
        effects_equalizer_state[state_index_base + 0] = input;                                          \
        effects_equalizer_state[state_index_base + 3] = effects_equalizer_state[state_index_base + 2];  \
        effects_equalizer_state[state_index_base + 2] = output;

#define EFFECT_APPLY_BAND_TO_CHANNEL(input, output, channel_index, channel_count, band_index, param_ptr)    \
        EFFECT_APPLY_BAND(input, output,                                                                    \
                          (band_index * channel_count + channel_index) * EFFECT_EQUALIZER_STATE_PARAMS,     \
                          (band_index * EFFECT_EQUALIZER_COEFF_PARAMS),                                     \
                          param_ptr)

EXPORT void effects_equalizer_apply(int16_t* samples,
                                    uint32_t byte_length,
                                    uint32_t channel_count,
                                    double* param_ptr) {
    uint32_t frame_length = byte_length / sizeof(int16_t) / channel_count;
    if (channel_count > EFFECT_EQUALIZER_MAX_CHANNELS) {
        return;
    } else if (channel_count == 2) {
        for (int i = 0; i < frame_length; ++i) {
            double tmp1, tmp2, result;

            tmp1 = (double) samples[i * 2] / 32768.0;
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 0, 2, 0, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 0, 2, 1, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 0, 2, 2, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 0, 2, 3, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 0, 2, 4, param_ptr);
            tmp2 = SATURATE_DOUBLE(tmp2);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 0, 2, 5, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 0, 2, 6, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 0, 2, 7, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 0, 2, 8, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, result, 0, 2, 9, param_ptr);
            samples[i * 2] = CLIP_I32_TO_I16((int32_t)(result * 32768.0));

            tmp1 = (double) samples[i * 2 + 1] / 32768.0;
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 1, 2, 0, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 1, 2, 1, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 1, 2, 2, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 1, 2, 3, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 1, 2, 4, param_ptr);
            tmp2 = SATURATE_DOUBLE(tmp2);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 1, 2, 5, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 1, 2, 6, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, tmp1, 1, 2, 7, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp1, tmp2, 1, 2, 8, param_ptr);
            EFFECT_APPLY_BAND_TO_CHANNEL(tmp2, result, 1, 2, 9, param_ptr);
            samples[i * 2 + 1] = CLIP_I32_TO_I16((int32_t)(result * 32768.0));

            if ((i & (EFFECT_BLOCK_SIZE - 1)) == 0) {
                const uint64_t* effects_equalizer_state_bits = (uint64_t*) effects_equalizer_state;
                for (int j = 0; j < EFFECT_EQUALIZER_STATE_LENGTH; ++j) {
                    if ((effects_equalizer_state_bits[j] & 0x7FF0000000000000LLU) == 0LLU) {
                        effects_equalizer_state[j] = 0.0;
                    }
                }
            }
        }
    } else {
        return;
    }
}

#undef EFFECT_APPLY_BAND
#undef EFFECT_APPLY_BAND_TO_CHANNEL
