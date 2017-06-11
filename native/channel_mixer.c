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

EXPORT uint32_t channel_mixer_get_length(ChannelMixer* channel_mixer, uint32_t i16_input_length, uint8_t input_channels) {
    return (uint32_t)((double)channel_mixer->output_channels / (double)input_channels * (double) i16_input_length);
}

EXPORT int channel_mixer_mix(ChannelMixer* channel_mixer,
                             uint8_t input_channels,
                             int16_t* input,
                             uint32_t i16_input_length) {
    channel_mixer_error = CHANNEL_MIXER_ERR_SUCCESS;
    channel_mixer->output = (int16_t*)NULL;
    uint8_t output_channels = channel_mixer->output_channels;

    if (output_channels == input_channels) {
        channel_mixer->output = input;
        return CHANNEL_MIXER_ERR_SUCCESS;
    }

    if (output_channels == 1) {
        if (input_channels == 2) {
            int16_t* buf = channelMixerGetBuffer(i16_input_length / 2);
            for (uint32_t i = 0; i < i16_input_length / 2; ++i) {
                buf[i] = CLIP_I32_TO_I16(((int32_t)input[i * 2] + (int32_t)input[i * 2 + 1]) / 2);
            }
            channel_mixer->output = buf;
            return CHANNEL_MIXER_ERR_SUCCESS;
        } else {
            channel_mixer_error = CHANNEL_MIXER_ERR_UNSUPPORTED;
            return CHANNEL_MIXER_ERR_UNSUPPORTED;
        }
    } else if (output_channels == 2) {
        if (input_channels == 1) {
            int16_t* buf = channelMixerGetBuffer(i16_input_length * 2);
            for (uint32_t i = 0; i < i16_input_length; ++i) {
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
