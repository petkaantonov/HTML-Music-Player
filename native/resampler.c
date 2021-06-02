#include "resampler.h"
#include <math.h>

static int resampler_error = 0;

EXPORT const char* resampler_get_error() {
    if (!resampler_error) {
        return (const char*)NULL;
    }
    int err = resampler_error;
    resampler_error = 0;
    return src_strerror(err);
}

EXPORT SRC_STATE* resampler_create(uint32_t channels, uint32_t quality) {
    resampler_error = 0;
    return src_new(quality, channels, &resampler_error);
}

EXPORT void resampler_destroy(SRC_STATE* state) {
    src_delete(state);
}

EXPORT void resampler_reset(SRC_STATE* state) {
    src_reset(state);
}

EXPORT int resampler_resample(SRC_STATE* this,
                              uint32_t source_sample_rate,
                              uint32_t destination_sample_rate,
                              float* input_sample_ptr,
                              uint32_t input_length_audio_frames,
                              int32_t end_of_input,
                              float** output_sample_ptr_out,
                              uint32_t* input_audio_frames_read_out,
                              uint32_t* output_audio_frames_written_out) {
    resampler_error = 0;
    double ratio = (double)destination_sample_rate/ (double)source_sample_rate;
    uint32_t output_length_audio_frames = (uint32_t)(ceil(ratio * (double)input_length_audio_frames));
    uint32_t channel_count = this->channels;
    float* output_sample_ptr = resamplerGetBuffer(this, output_length_audio_frames * channel_count * sizeof(float));
    *input_audio_frames_read_out = 0;
    *output_audio_frames_written_out = 0;
    *output_sample_ptr_out = NULL;
    resampler_error = 0;
    SRC_DATA data;
    data.data_in = input_sample_ptr;
    data.data_out = output_sample_ptr;
    data.end_of_input = end_of_input;
    data.input_frames = input_length_audio_frames;
    data.output_frames = output_length_audio_frames;
    data.src_ratio = ratio;
    resampler_error = src_process(this, &data);
    if (resampler_error) {
        return resampler_error;
    }
    *input_audio_frames_read_out = data.input_frames_used;
    *output_audio_frames_written_out = data.output_frames_gen;
    *output_sample_ptr_out = data.data_out;
    return 0;
}
