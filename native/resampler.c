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

EXPORT uint32_t resampler_get_length(SpeexResamplerState* this, uint32_t input_length_audio_frames) {
    spx_uint32_t num, den;
    speex_resampler_get_ratio(this, &num, &den);
    return (uint32_t)(ceil((double)(input_length_audio_frames * den) / (double)num));
}

EXPORT SpeexResamplerState* resampler_create(uint32_t channels, uint32_t in_rate, uint32_t out_rate, uint32_t quality) {
    resampler_error = 0;
    return speex_resampler_init(channels, in_rate, out_rate, quality, &resampler_error);
}

EXPORT void resampler_destroy(SpeexResamplerState* this) {
    speex_resampler_destroy(this);
}

EXPORT void resampler_reset(SpeexResamplerState* this) {
    speex_resampler_reset_mem(this);
}

EXPORT int resampler_resample(SpeexResamplerState* this,
                              int16_t* input_sample_ptr,
                              uint32_t input_length_audio_frames,
                              int16_t** output_sample_ptr_out,
                              uint32_t* input_audio_frames_read_out,
                              uint32_t* output_audio_frames_written_out) {
    uint32_t channel_count = this->nb_channels;
    *input_audio_frames_read_out = 0;
    *output_audio_frames_written_out = 0;
    *output_sample_ptr_out = NULL;
    resampler_error = 0;
    spx_uint32_t output_length_audio_frames = resampler_get_length(this, input_length_audio_frames);
    int16_t* output_sample_ptr = resamplerGetBuffer(this, output_length_audio_frames * channel_count * sizeof(int16_t));
    resampler_error = speex_resampler_process_interleaved_int(this,
                                                              input_sample_ptr,
                                                              &input_length_audio_frames,
                                                              output_sample_ptr,
                                                              &output_length_audio_frames);
    if (resampler_error) {
        return resampler_error;
    }
    *input_audio_frames_read_out = input_length_audio_frames;
    *output_audio_frames_written_out = output_length_audio_frames;
    *output_sample_ptr_out = output_sample_ptr;
    return 0;
}
