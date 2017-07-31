#ifndef LOUDNESS_ANALYZER_H
#define LOUDNESS_ANALYZER_H

#include <libebur128/ebur128.c>

#define REFERENCE_LUFS -18.0

static double decibel_to_volume(double loudness);

typedef struct {
    uint32_t frames_added;
    uint32_t max_history;
    ebur128_state* st;
} LoudnessAnalyzer;

EXPORT int loudness_analyzer_init(uint32_t channel_count,
                                  uint32_t sample_rate,
                                  uint32_t max_history,
                                  LoudnessAnalyzer** retval);
EXPORT void loudness_analyzer_destroy(LoudnessAnalyzer* this);
EXPORT int loudness_analyzer_add_frames(LoudnessAnalyzer* this,
                                        int16_t* frames,
                                        uint32_t frame_count);
EXPORT int loudness_analyzer_get_gain(LoudnessAnalyzer* this, double* gain);
EXPORT int loudness_analyzer_get_momentary_gain(LoudnessAnalyzer* this, double* gain);
EXPORT int loudness_analyzer_reinitialize(LoudnessAnalyzer* this,
                                          uint32_t channel_count,
                                          uint32_t sample_rate,
                                          uint32_t max_history);
EXPORT int loudness_analyzer_reset(LoudnessAnalyzer* this);
EXPORT void loudness_analyzer_apply_normalization(LoudnessAnalyzer* this,
                                                   double loudness,
                                                   int16_t* frames,
                                                   uint32_t frame_count);
#endif //LOUDNESS_ANALYZER_H
