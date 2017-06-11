#include "mp3_decoder.h"

EXPORT int mp3_get_info(mp3_context_t* ctx,
                        int* sample_rate,
                        int* channel_count,
                        int* bit_rate,
                        int* mode,
                        int* mode_ext,
                        int* lsf) {
    if (ctx != NULL && ctx->frame_size > 0) {
        *sample_rate = ctx->sample_rate;
        *channel_count = ctx->nb_channels;
        *bit_rate = ctx->bit_rate;
        *mode = ctx->mode;
        *mode_ext = ctx->mode_ext;
        *lsf = ctx->lsf;
        return 0;
    } else {
        return 1;
    }
}
