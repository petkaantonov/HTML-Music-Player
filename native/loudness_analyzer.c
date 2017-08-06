#import "loudness_analyzer.h"

EXPORT int loudness_analyzer_init(uint32_t channel_count,
                                  uint32_t sample_rate,
                                  uint32_t max_history,
                                  LoudnessAnalyzer** retval) {
    *retval = NULL;
    LoudnessAnalyzer* this = malloc(sizeof(LoudnessAnalyzer));

    if (!this) {
        return EBUR128_ERROR_NOMEM;
    }

    this->frames_added = 0;
    this->max_history = max_history;

    ebur128_state* st = ebur128_init(channel_count, sample_rate, EBUR128_MODE_I | EBUR128_MODE_SAMPLE_PEAK);
    if (!st) {
        return EBUR128_ERROR_NOMEM;
    }
    int err = ebur128_set_max_history(st, max_history);

    if (err) {
        return err;
    }
    this->st = st;
    *retval = this;
    return EBUR128_SUCCESS;
}

EXPORT void loudness_analyzer_destroy(LoudnessAnalyzer* this) {
    ebur128_destroy(&this->st);
    free(this);
}

EXPORT int loudness_analyzer_add_frames(LoudnessAnalyzer* this,
                                        float* frames,
                                        uint32_t frame_count) {
    int err = ebur128_add_frames_float(this->st, frames, frame_count);
    if (err) {
        return err;
    }
    this->frames_added += frame_count;
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_get_loudness_and_peak(LoudnessAnalyzer* this, double* loudness, double* peak) {
    *loudness = 0.0;
    uint32_t frames_needed = this->st->samplerate * 0.4;
    if (this->frames_added >= frames_needed) {
        double result;
        int err = ebur128_loudness_global(this->st, &result);
        if (err) {
            return err;
        }
        *loudness = result;
        double peak_value = -1.0;
        for (int ch = 0; ch < this->st->channels; ++ch) {
            int err = ebur128_prev_sample_peak(this->st, ch, &result);
            if (err) {
                return err;
            }
            peak_value = MAX(peak_value, result);
        }
        *peak = peak_value;
    }
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_get_momentary_loudness(LoudnessAnalyzer* this, double* loudness) {
    *loudness = 0.0;
    uint32_t frames_needed = (uint32_t)((double)this->st->samplerate * 0.4);
    if (this->frames_added >= frames_needed) {
        double result;
        int err = ebur128_loudness_from_last_block(this->st, &result);
        if (err) {
            return err;
        }
        *loudness = result;
    }
    return EBUR128_SUCCESS;
}

EXPORT uint32_t loudness_analyzer_get_serialized_state_size(void) {
    return sizeof(LoudnessAnalyzerSerializedState);
}

EXPORT int loudness_analyzer_export_state(LoudnessAnalyzer* this, LoudnessAnalyzerSerializedState* state) {
    state->max_history = this->max_history;
    state->sample_rate = this->st->samplerate;
    state->channels = this->st->channels;
    state->frames_added = this->frames_added;

    double integrated_loudness = 0.0;
    int err = ebur128_loudness_global(this->st, &integrated_loudness);
    if (err) {
        return err;
    }

    double peak_value = -1.0;
    for (int ch = 0; ch < this->st->channels; ++ch) {
        double result;
        int err = ebur128_sample_peak(this->st, ch, &result);
        if (err) {
            return err;
        }
        peak_value = MAX(peak_value, result);
    }
    state->sample_peak = peak_value;
    state->integrated_loudness = integrated_loudness;
    state->history_length = MIN(MAX_SERIALIZED_HISTORY, this->st->d->block_list->length);
    state->last_block_sum = this->st->d->last_block_sum;
    memmove(&state->filter_state, &this->st->d->v, sizeof(this->st->d->v));
    queue_export_values(this->st->d->block_list, state->history_state, state->history_length);
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_init_from_serialized_state(LoudnessAnalyzer* this, LoudnessAnalyzerSerializedState* state) {
    const ebur128_state* st = this->st;
    for (int i = 0; i < st->channels; ++i) {
      st->d->sample_peak[i] = state->sample_peak;
      st->d->prev_sample_peak[i] = state->sample_peak;
    }

    this->frames_added = state->frames_added;
    this->max_history = state->max_history;
    memmove(&st->d->v, &state->filter_state, sizeof(st->d->v));
    st->d->needed_frames = st->d->samples_in_100ms;
    st->d->audio_data_index = 0;
    st->d->short_term_frame_counter = 0;
    st->d->last_block_sum = state->last_block_sum;

    if (queue_copy_values(st->d->block_list, state->history_state, state->history_length)) {
        return EBUR128_ERROR_NOMEM;
    }

    return EBUR128_SUCCESS;
}

EXPORT void loudness_analyzer_apply_gain(LoudnessAnalyzer* this,
                                                   double gain_to_apply,
                                                   double previously_applied_gain,
                                                   float* frames,
                                                   uint32_t frame_count) {
    const uint32_t channels = this->st->channels;
    uint32_t length = channels * frame_count;

    if (previously_applied_gain != -1.0) {
        // When new track starts and integrated loudness hasn't stabilized, avoid
        // sudden volume changes.
        if (fabs(gain_to_apply - previously_applied_gain) > 0.25) {
            const float denominator = frame_count - 1;
            for (int i = 0; i < length; ++i) {
                float gain = (((float) i / (float)(channels)) / denominator) * (gain_to_apply - previously_applied_gain) + previously_applied_gain;
                frames[i] *= gain;
            }
            return;
        }
    }
    for (int i = 0; i < length; ++i) {
        frames[i] *= gain_to_apply;
    }
}
