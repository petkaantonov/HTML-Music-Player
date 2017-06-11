#ifndef LOUDNESS_ANALYZER_H
#define LOUDNESS_ANALYZER_H

#include <libebur128/ebur128.c>

#define REFERENCE_LUFS -18.0

EXPORT ebur128_state* loudness_analyzer_init(uint32_t channel_count, uint32_t sample_rate);
EXPORT void loudness_analyzer_destroy(ebur128_state* st);
EXPORT int loudness_analyzer_add_frames(ebur128_state* st, int16_t* frames, uint32_t frame_count);
EXPORT int loudness_analyzer_get_result(ebur128_state* st,
                                        double* track_gain, double* track_peak, double* begin_silence_length, double* end_silence_length);

#endif //LOUDNESS_ANALYZER_H
