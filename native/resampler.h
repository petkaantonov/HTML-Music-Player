#ifndef RESAMPLER_H
#define RESAMPLER_H

#undef ENABLE_SINC_BEST_CONVERTER
#undef ENABLE_SINC_FAST_CONVERTER
#undef ENABLE_SINC_MEDIUM_CONVERTER

#include "wasm.h"

#define PACKAGE "ok"
#define VERSION "1.0"
#include <libsamplerate/src_zoh.c>
#include <libsamplerate/samplerate.c>
#undef PACKAGE
#undef VERSION

EXPORT const char* resampler_get_error(void);
EXPORT SRC_STATE* resampler_create(uint32_t channels, uint32_t quality);
EXPORT void resampler_destroy(SRC_STATE* state);
EXPORT void resampler_reset(SRC_STATE* state);
EXPORT int resampler_resample(SRC_STATE* this,
                              uint32_t source_sample_rate,
                              uint32_t destination_sample_rate,
                              float* input_sample_ptr,
                              uint32_t input_length_audio_frames,
                              int32_t end_of_input,
                              float** output_sample_ptr_out,
                              uint32_t* input_audio_frames_read_out,
                              uint32_t* output_audio_frames_written_out);

extern float* resamplerGetBuffer(SRC_STATE* this, uint32_t length);

#endif //RESAMPLER_H
