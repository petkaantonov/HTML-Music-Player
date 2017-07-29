#ifndef EFFECTS_H
#define EFFECTS_H

#define EFFECT_MULTIPLIER ((int32_t)10000)
#define EFFECT_BLOCK_SIZE 1024

static double get_fade_in_volume(double t0, double t, double t1);
static double get_fade_out_volume(double t0, double t, double t1);

EXPORT void effects_noise_sharpening(double effect_size, uint8_t channel_count, void* samples, uint32_t byte_length);

EXPORT void effects_crossfade_fade_in(double track_duration,
                                      double fade_duration,
                                      double sample_start_time,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      void* samples,
                                      size_t byte_length);

EXPORT void effects_crossfade_fade_out(double track_duration,
                                      double fade_duration,
                                      double sample_start_time,
                                      uint32_t sample_rate,
                                      uint8_t channel_count,
                                      void* samples,
                                      size_t byte_length);

#endif //EFFECTS_H
