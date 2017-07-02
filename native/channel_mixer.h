#ifndef CHANNEL_MIXER_H
#define CHANNEL_MIXER_H

enum {
    CHANNEL_MIXER_ERR_SUCCESS = 0,
    CHANNEL_MIXER_ERR_UNSUPPORTED = 1,
    CHANNEL_MIXER_ERR_ALLOC_FAILED = 2,

    CHANNEL_MIXER_ERR_MAX_ERROR
};

typedef struct _channel_mixer {
    int16_t* output;
    uint8_t output_channels;
} ChannelMixer;

EXPORT char* channel_mixer_get_error(void);
EXPORT uint32_t channel_mixer_get_length(ChannelMixer* channel_mixer, uint32_t input_length, uint8_t input_channels);
EXPORT int channel_mixer_mix(ChannelMixer*, uint8_t, int16_t*, uint32_t);
EXPORT ChannelMixer* channel_mixer_create(uint8_t channels);
EXPORT void channel_mixer_destroy(ChannelMixer* channel_mixer);
EXPORT void channel_mixer_set_output_channels(ChannelMixer* channel_mixer, uint8_t channels);

extern int16_t* channelMixerGetBuffer(ChannelMixer* this, uint32_t length);
#endif //CHANNEL_MIXER_H
