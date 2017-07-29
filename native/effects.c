#include "effects.h"

static double get_fade_in_volume(double t0, double t, double t1) {
    t = (t / ((t1 - t0) / 2.0)) - 1.0;
    return sqrt(0.5 * (1.0 + t));
}

static double get_fade_out_volume(double t0, double t, double t1) {
    t = (t / ((t1 - t0) / 2.0)) - 1.0;
    return sqrt(0.5 * (1.0 - t));
}

EXPORT void effects_noise_sharpening(double effect_size,
                                     uint8_t channel_count,
                                     void* samples,
                                     size_t byte_length) {
    if (effect_size > 0) {
        int32_t effect_multiplier = DOUBLE_TO_U32(effect_size * (double)EFFECT_MULTIPLIER);
        size_t length = byte_length / sizeof(int16_t) / channel_count;
        int16_t* samples_i16 = (int16_t*) samples;
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
