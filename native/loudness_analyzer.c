#import "loudness_analyzer.h"

EXPORT ebur128_state* loudness_analyzer_init(uint32_t channel_count, uint32_t sample_rate) {
    return ebur128_init(channel_count, sample_rate, EBUR128_MODE_I | EBUR128_MODE_SAMPLE_PEAK);
}

EXPORT void loudness_analyzer_destroy(ebur128_state* st) {
    ebur128_destroy(&st);
}

EXPORT int loudness_analyzer_add_frames(ebur128_state* st, int16_t* frames, uint32_t frame_count) {
    return ebur128_add_frames_short(st, frames, frame_count);
}

EXPORT int loudness_analyzer_get_result(ebur128_state* st,
        double* track_gain, double* track_peak, double* begin_silence_length, double* end_silence_length) {
    double loudness_global;
    int err = ebur128_loudness_global(st, &loudness_global);
    if (err) return err;
    *track_gain = (REFERENCE_LUFS - loudness_global);

    double peak = -1.0;
    double peak_out;
    for (uint32_t ch = 0; ch < st->channels; ++ch) {
        err = ebur128_sample_peak(st, ch, &peak_out);
        if (err) return err;
        peak = MAX(peak, peak_out);
    }
    *track_peak = peak;

    return ebur128_get_silence(st, begin_silence_length, end_silence_length);
}

