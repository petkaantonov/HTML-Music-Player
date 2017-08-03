#include "channel_mixer.h"

static int channel_mixer_error = 0;

EXPORT char* channel_mixer_get_error() {
    switch (channel_mixer_error) {
        case CHANNEL_MIXER_ERR_SUCCESS: return NULL;
        case CHANNEL_MIXER_ERR_UNSUPPORTED: return "Unsupported channel counts";
        case CHANNEL_MIXER_ERR_ALLOC_FAILED: return "Memory allocation failed";
        default: return "Unknown error";
    }
}

EXPORT uint32_t channel_mixer_get_length(ChannelMixer* channel_mixer, uint32_t byte_length, uint8_t input_channel_count) {
    return (uint32_t)((double)channel_mixer->output_channels / (double)input_channel_count * (double) byte_length);
}

EXPORT int channel_mixer_mix(ChannelMixer* channel_mixer,
                             uint8_t input_channel_count,
                             float* input,
                             uint32_t input_byte_length) {
    channel_mixer_error = CHANNEL_MIXER_ERR_SUCCESS;
    channel_mixer->output = (float*)NULL;
    uint8_t output_channel_count = channel_mixer->output_channels;

    if (output_channel_count == input_channel_count) {
        channel_mixer->output = input;
        return CHANNEL_MIXER_ERR_SUCCESS;
    }

    const uint32_t input_audio_frame_length = input_byte_length / input_channel_count / sizeof(float);
    if (output_channel_count == 1) {
        if (input_channel_count == 2) {
            float* buf = channelMixerGetBuffer(channel_mixer, input_byte_length / 2);
            for (uint32_t i = 0; i < input_audio_frame_length; ++i) {
                buf[i] = (input[i * 2] + input[i * 2 + 1]) / 2.0f;
            }
            channel_mixer->output = buf;
            return CHANNEL_MIXER_ERR_SUCCESS;
        } else {
            channel_mixer_error = CHANNEL_MIXER_ERR_UNSUPPORTED;
            return CHANNEL_MIXER_ERR_UNSUPPORTED;
        }
    } else if (output_channel_count == 2) {
        if (input_channel_count == 1) {
            float* buf = channelMixerGetBuffer(channel_mixer, input_byte_length * 2);

            for (uint32_t i = 0; i < input_audio_frame_length; ++i) {
                buf[i * 2] = input[i];
                buf[i * 2 + 1] = input[i];
            }
            channel_mixer->output = buf;
            return CHANNEL_MIXER_ERR_SUCCESS;
        } else {
            channel_mixer_error = CHANNEL_MIXER_ERR_UNSUPPORTED;
            return CHANNEL_MIXER_ERR_UNSUPPORTED;
        }
    } else {
        return CHANNEL_MIXER_ERR_UNSUPPORTED;
    }
}

EXPORT ChannelMixer* channel_mixer_create(uint8_t channels) {
    channel_mixer_error = CHANNEL_MIXER_ERR_SUCCESS;
    ChannelMixer* mixer = malloc(sizeof(ChannelMixer));
    if (mixer) {
        mixer->output_channels = channels;
    } else {
        channel_mixer_error = CHANNEL_MIXER_ERR_ALLOC_FAILED;
    }
    return mixer;
}

EXPORT void channel_mixer_destroy(ChannelMixer* channel_mixer) {
    free(channel_mixer);
}

EXPORT void channel_mixer_set_output_channels(ChannelMixer* channel_mixer, uint8_t channels) {
    channel_mixer->output_channels = channels;
}
