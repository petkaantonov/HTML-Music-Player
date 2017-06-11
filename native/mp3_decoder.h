#ifndef __MP3_DECODER_H_INCLUDED__
#define __MP3_DECODER_H_INCLUDED__

#include <mp3/minimp3.c>

EXPORT int mp3_get_info(mp3_context_t* ctx,
                        int* sample_rate,
                        int* channel_count,
                        int* bit_rate,
                        int* mode,
                        int* mode_ext,
                        int* lsf);

#endif // __MP3_DECODER_H_INCLUDED__
