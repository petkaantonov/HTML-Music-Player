#import "loudness_analyzer.h"

EXPORT int loudness_analyzer_init(uint32_t channel_count,
                                  uint32_t sample_rate,
                                  uint32_t window,
                                  LoudnessAnalyzer** retval) {
    *retval = NULL;
    LoudnessAnalyzer* this = malloc(sizeof(LoudnessAnalyzer));

    if (!this) {
        return EBUR128_ERROR_NOMEM;
    }

    this->frames_added = 0;
    this->window = window;

    ebur128_state* st = ebur128_init(channel_count, sample_rate, 0, window);
    if (!st) {
        return EBUR128_ERROR_NOMEM;
    }
    this->st = st;
    *retval = this;
    return EBUR128_SUCCESS;
}

EXPORT void loudness_analyzer_destroy(LoudnessAnalyzer* this) {
    ebur128_destroy(&this->st);
    free(this);
}

EXPORT int loudness_analyzer_get_gain(LoudnessAnalyzer* this,
                                      int16_t* frames,
                                      uint32_t frame_count,
                                      double* gain) {
    *gain = NAN;
    int err = ebur128_add_frames_short(this->st, frames, frame_count);
    if (err) {
        return err;
    }
    this->frames_added += frame_count;

    uint32_t frames_needed = (uint32_t)((double)this->st->samplerate * (double)0.4);
    if (this->frames_added < frames_needed) {
        *gain = (REFERENCE_LUFS) * ((double)(((double)(frames_needed - this->frames_added + frame_count)) / ((double)frames_needed)));
        return EBUR128_SUCCESS;
    } else {
        double result;
        int err = ebur128_loudness_window(this->st, this->window, &result);
        if (err) {
            return err;
        }
        result = (REFERENCE_LUFS - result);
        *gain = result;
        return EBUR128_SUCCESS;
    }
}

EXPORT int loudness_analyzer_reset(LoudnessAnalyzer* this) {
    return loudness_analyzer_reinitialize(this, this->st->channels, this->st->samplerate, this->window);
}

EXPORT int loudness_analyzer_reinitialize(LoudnessAnalyzer* this,
                                          uint32_t channel_count,
                                          uint32_t sample_rate,
                                          uint32_t window) {
    this->window = window;
    this->frames_added = 0;
    ebur128_state* st = this->st;
    bool needs_reinitialization = false;
    bool needs_realloc = st->d->window != window || sample_rate != st->samplerate;

    int err = ebur128_change_parameters(st, channel_count, sample_rate);
    if (err) {
        needs_reinitialization = err == EBUR128_ERROR_NO_CHANGE;
        if (err != EBUR128_ERROR_NO_CHANGE) {
            return err;
        }
    }

    err = ebur128_set_max_window(st, window);
    if (err) {
        needs_reinitialization = err == EBUR128_ERROR_NO_CHANGE;
        if (err != EBUR128_ERROR_NO_CHANGE) {
            return err;
        }
    }

    if (!needs_reinitialization) {
        return EBUR128_SUCCESS;
    }


    if (needs_realloc) {
        free(st->d->audio_data);
        st->d->audio_data = NULL;
    }

    st->d->audio_data_frames = st->samplerate * st->d->window / 1000;
    if (st->d->audio_data_frames % st->d->samples_in_100ms) {
    /* round up to multiple of samples_in_100ms */
    st->d->audio_data_frames = st->d->audio_data_frames
                             + st->d->samples_in_100ms
                             - (st->d->audio_data_frames % st->d->samples_in_100ms);
    }
    st->d->audio_data_max_frames = MAX(st->d->audio_data_frames, st->d->samples_in_100ms * 4);

    if (needs_realloc) {
        st->d->audio_data = (double*) malloc(st->d->audio_data_max_frames *
                                           st->channels *
                                           sizeof(double));
        if (!st->d->audio_data) {
            return EBUR128_ERROR_NOMEM;
        }
    }

    for (int j = 0; j < st->d->audio_data_max_frames * st->channels; ++j) {
        st->d->audio_data[j] = 0.0;
    }

    /* the first block needs 400ms of audio data */
    st->d->needed_frames = st->d->samples_in_100ms * 4;
    /* start at the beginning of the buffer */
    st->d->audio_data_index = 0;
    /* reset short term frame counter */
    st->d->short_term_frame_counter = 0;
    return EBUR128_SUCCESS;
}
