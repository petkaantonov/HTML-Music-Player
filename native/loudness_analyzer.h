#ifndef LOUDNESS_ANALYZER_H
#define LOUDNESS_ANALYZER_H

#include <libebur128/ebur128.c>

#define MAX_SERIALIZED_HISTORY 300

typedef struct {
    uint32_t frames_added;
    uint32_t max_history;
    ebur128_state* st;
} LoudnessAnalyzer;

typedef struct {
    uint32_t max_history;
    uint32_t sample_rate;
    uint32_t channels;
    uint32_t frames_added;
    uint32_t history_length;
    double sample_peak;
    double integrated_loudness;
    double last_block_sum;
    double filter_state[5][5];
    uint8_t reserved[128];
    double history_state[MAX_SERIALIZED_HISTORY];
} LoudnessAnalyzerSerializedState;

EXPORT int loudness_analyzer_init(uint32_t channel_count,
                                  uint32_t sample_rate,
                                  uint32_t max_history,
                                  LoudnessAnalyzer** retval);
EXPORT void loudness_analyzer_destroy(LoudnessAnalyzer* this);
EXPORT int loudness_analyzer_add_frames(LoudnessAnalyzer* this,
                                        float* frames,
                                        uint32_t frame_count);
EXPORT int loudness_analyzer_get_loudness_and_peak(LoudnessAnalyzer* this, double* gain, double* peak);
EXPORT int loudness_analyzer_get_momentary_loudness(LoudnessAnalyzer* this, double* gain);
EXPORT int loudness_analyzer_init_from_serialized_state(LoudnessAnalyzer* this, LoudnessAnalyzerSerializedState* state);
EXPORT void loudness_analyzer_apply_gain(LoudnessAnalyzer* this,
                                                   double gain_to_apply,
                                                   double previously_applied_gain,
                                                   float* frames,
                                                   uint32_t frame_count);
EXPORT int loudness_analyzer_export_state(LoudnessAnalyzer* this, LoudnessAnalyzerSerializedState* state);
EXPORT int loudness_analyzer_import_state(LoudnessAnalyzer* this, LoudnessAnalyzerSerializedState* state);
EXPORT uint32_t loudness_analyzer_get_serialized_state_size(void);
#endif //LOUDNESS_ANALYZER_H
