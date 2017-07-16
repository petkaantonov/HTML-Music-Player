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

    ebur128_state* st = ebur128_init(channel_count, sample_rate, EBUR128_MODE_I);
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
                                        int16_t* frames,
                                        uint32_t frame_count) {
    int err = ebur128_add_frames_short(this->st, frames, frame_count);
    if (err) {
        return err;
    }
    this->frames_added += frame_count;
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_get_gain(LoudnessAnalyzer* this, double* gain) {
    *gain = NAN;
    uint32_t frames_needed = this->st->samplerate * 2;
    if (this->frames_added >= frames_needed) {
        double result;
        int err = ebur128_loudness_global(this->st, &result);
        if (err) {
            return err;
        }
        result = (REFERENCE_LUFS - result);
        *gain = result;
    }
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_get_momentary_gain(LoudnessAnalyzer* this, double* gain) {
    *gain = NAN;
    uint32_t frames_needed = (uint32_t)((double)this->st->samplerate * 0.4);
    if (this->frames_added >= frames_needed) {
        double result;
        int err = ebur128_loudness_from_last_block(this->st, &result);
        if (err) {
            return err;
        }
        result = (REFERENCE_LUFS - result);
        *gain = result;
    }
    return EBUR128_SUCCESS;
}

EXPORT int loudness_analyzer_reset(LoudnessAnalyzer* this) {
    return loudness_analyzer_reinitialize(this, this->st->channels, this->st->samplerate, this->max_history);
}

EXPORT int loudness_analyzer_reinitialize(LoudnessAnalyzer* this,
                                          uint32_t channel_count,
                                          uint32_t sample_rate,
                                          uint32_t max_history) {
    this->max_history = max_history;
    this->frames_added = 0;
    ebur128_state* st = this->st;

    bool sample_rate_changed = st->samplerate != sample_rate;
    bool channel_count_changed = st->channels != channel_count;

    int err = ebur128_change_parameters(st, channel_count, sample_rate);
    if (err && err != EBUR128_ERROR_NO_CHANGE) {
        return err;
    }

    err = ebur128_set_max_history(st, max_history);
    if (err && err != EBUR128_ERROR_NO_CHANGE) {
        return err;
    }

    if (!channel_count_changed) {
        for (int i = 0; i < st->channels; ++i) {
          st->d->sample_peak[i] = 0.0;
          st->d->prev_sample_peak[i] = 0.0;
          st->d->true_peak[i] = 0.0;
          st->d->prev_true_peak[i] = 0.0;
        }
    }

    if (!sample_rate_changed) {
      for (int i = 0; i < 5; ++i) {
        for (int j = 0; j < 5; ++j) {
          st->d->v[i][j] = 0.0;
        }
      }
    }

    if (!channel_count_changed && !sample_rate_changed) {

        for (int j = 0; j < st->d->audio_data_frames * st->channels; ++j) {
            st->d->audio_data[j] = 0.0;
        }

        st->d->needed_frames = st->d->samples_in_100ms * 4;
        st->d->audio_data_index = 0;
        st->d->short_term_frame_counter = 0;

        if ((st->mode & EBUR128_MODE_TRUE_PEAK) == EBUR128_MODE_TRUE_PEAK) {
          ebur128_destroy_resampler(st);
          err = ebur128_init_resampler(st);
          if (err) {
            return err;
          }
        }
    }

    struct ebur128_dq_entry* entry;
    while (!STAILQ_EMPTY(&st->d->block_list)) {
        entry = STAILQ_FIRST(&st->d->block_list);
        STAILQ_REMOVE_HEAD(&st->d->block_list, entries);
        free(entry);
    }
    STAILQ_INIT(&st->d->block_list);
    st->d->block_list_size = 0;
    while (!STAILQ_EMPTY(&st->d->short_term_block_list)) {
        entry = STAILQ_FIRST(&st->d->short_term_block_list);
        STAILQ_REMOVE_HEAD(&st->d->short_term_block_list, entries);
        free(entry);
    }
    STAILQ_INIT(&st->d->short_term_block_list);
    st->d->st_block_list_size = 0;

    if (st->d->use_histogram) {
        for (int i = 0; i < 1000; ++i) {
          st->d->block_energy_histogram[i] = 0;
        }

        for (int i = 0; i < 1000; ++i) {
          st->d->short_term_block_energy_histogram[i] = 0;
        }
    }

    return EBUR128_SUCCESS;
}
