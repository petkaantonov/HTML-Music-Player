#ifndef RESAMPLER_H
#define RESAMPLER_H

#include <resampler/resample.c>

EXPORT const char* resampler_get_error(void);
EXPORT uint32_t resampler_get_length(SpeexResamplerState* resampler, uint32_t input_length);
EXPORT int resampler_resample(SpeexResamplerState* resampler,
                              int16_t* samples,
                              uint32_t length,
                              int16_t** output_samples,
                              uint32_t* input_samples_read,
                              uint32_t* output_samples_written);
EXPORT SpeexResamplerState* resampler_create(uint32_t channels, uint32_t in_rate, uint32_t out_rate, uint32_t quality);
EXPORT void resampler_destroy(SpeexResamplerState* resampler);
EXPORT void resampler_reset(SpeexResamplerState* resampler);

extern int16_t* resamplerGetBuffer(uint32_t length);

#endif //RESAMPLER_H
