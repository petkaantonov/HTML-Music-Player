#include "resampler.h"
#include <math.h>

static int resampler_error = 0;

EXPORT const char* resampler_get_error() {
    if (!resampler_error) {
        return (const char*)NULL;
    }
    int err = resampler_error;
    resampler_error = 0;
    return speex_resampler_strerror(err);
}

EXPORT uint32_t resampler_get_length(SpeexResamplerState* resampler, uint32_t input_length_i16) {
    spx_uint32_t num, den;
    speex_resampler_get_ratio(resampler, &num, &den);
    return (uint32_t)(ceil((double)(input_length_i16 * den) / (double)num));
}

EXPORT SpeexResamplerState* resampler_create(uint32_t channels, uint32_t in_rate, uint32_t out_rate, uint32_t quality) {
    resampler_error = 0;
    return speex_resampler_init(channels, in_rate, out_rate, quality, &resampler_error);
}

EXPORT void resampler_destroy(SpeexResamplerState* resampler) {
    speex_resampler_destroy(resampler);
}

EXPORT void resampler_reset(SpeexResamplerState* resampler) {
    speex_resampler_reset_mem(resampler);
}

EXPORT int resampler_resample(SpeexResamplerState* resampler, int16_t* samples, uint32_t input_length_i16,
                                    int16_t** output_samples, uint32_t* input_samples_read, uint32_t* output_samples_written) {
    *input_samples_read = 0;
    *output_samples_written = 0;
    resampler_error = 0;
    spx_uint32_t output_length_i16 = resampler_get_length(resampler, input_length_i16);
    int16_t* output = resamplerGetBuffer(output_length_i16);
    resampler_error = speex_resampler_process_interleaved_int(resampler, samples, &input_length_i16, output, &output_length_i16);
    *input_samples_read = input_length_i16;
    *output_samples_written = output_length_i16;
    *output_samples = output;
    return resampler_error;
}
