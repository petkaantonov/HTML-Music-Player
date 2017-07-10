#ifndef RESAMPLER_H
#define RESAMPLER_H

#define OUTSIDE_SPEEX 1
#define RANDOM_PREFIX speex
#define FIXED_POINT 1
#define RESAMPLE_FULL_SINC_TABLE 1

#include <resampler/resample.c>

EXPORT const char* resampler_get_error(void);
EXPORT uint32_t resampler_get_length(SpeexResamplerState* this, uint32_t input_length_audio_frames);
EXPORT int resampler_resample(SpeexResamplerState* this,
                                int16_t* input_sample_ptr,
                                uint32_t input_length_audio_frames,
                                int16_t** output_sample_ptr_out,
                                uint32_t* input_audio_frames_read_out,
                                uint32_t* output_audio_frames_written_out);
EXPORT SpeexResamplerState* resampler_create(uint32_t channels,
                                             uint32_t in_rate,
                                             uint32_t out_rate,
                                             uint32_t quality);
EXPORT void resampler_destroy(SpeexResamplerState* this);
EXPORT void resampler_reset(SpeexResamplerState* this);

extern int16_t* resamplerGetBuffer(SpeexResamplerState* this, uint32_t length);

#endif //RESAMPLER_H
