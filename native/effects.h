#include <wasm.h>

#ifndef EFFECTS_H
#define EFFECTS_H

#define EFFECT_BASS_BOOST_MAX_CHANNELS 5
#define EFFECT_BASS_BOOST_SELECTIVITY 70.0
#define EFFECT_BASS_BOOST_MAX_RATIO 16.0
#define EFFECT_BASS_BOOST_MIN_RATIO 2.0
#define EFFECT_BLOCK_SIZE 1024
#define EFFECT_EQUALIZER_BAND_COUNT 10
#define EFFECT_EQUALIZER_MAX_CHANNELS 2
#define EFFECT_EQUALIZER_STATE_PARAMS 4
#define EFFECT_EQUALIZER_COEFF_PARAMS 5
#define EFFECT_EQUALIZER_STATE_LENGTH (EFFECT_EQUALIZER_STATE_PARAMS * EFFECT_EQUALIZER_BAND_COUNT * EFFECT_EQUALIZER_MAX_CHANNELS)

static double get_fade_in_volume(double t0, double t, double t1);
static double get_fade_out_volume(double t0, double t, double t1);

EXPORT void effects_noise_sharpening(double effect_size,
                                     uint8_t channel_count,
                                     float* samples,
                                     uint32_t byte_length);

EXPORT void effects_crossfade_fade_in(double track_duration,
                                      double fade_duration,
                                      double sample_start_time,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      float* samples,
                                      size_t byte_length);

EXPORT void effects_crossfade_fade_out(double track_duration,
                                      double fade_duration,
                                      double sample_start_time,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      float* samples,
                                      uint32_t frames_needed,
                                      uint32_t frames_requested);

EXPORT void effects_equalizer_reset(void);
EXPORT void effects_equalizer_apply(float* samples,
                                    uint32_t byte_length,
                                    uint32_t channel_count,
                                    double* param_ptr);

EXPORT void effects_bass_boost_reset(void);
EXPORT void effects_bass_boost_apply(double effect_size,
                                     uint32_t channel_count,
                                     float* samples,
                                     uint32_t byte_length);
#endif //EFFECTS_H
