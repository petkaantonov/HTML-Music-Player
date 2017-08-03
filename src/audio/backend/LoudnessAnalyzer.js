import {moduleEvents} from "wasm/WebAssemblyWrapper";
import {checkBoolean} from "errors/BooleanTypeError";

const MAX_HISTORY_MS = 30000;
const INT16_BYTE_SIZE = 2;
const SILENCE_THRESHOLD = -65;
const MOMENTARY_WINDOW_MS = 400;
const MAX_GAIN_OFFSET = 12;
const REFERENCE_LUFS = -18.0;

export const defaultLoudnessInfo = Object.freeze({
    isEntirelySilent: false
});

export default class LoudnessAnalyzer {
    constructor(wasm, channelCount, sampleRate, {
        loudnessNormalizationEnabled = true,
        silenceTrimmingEnabled = true
    }) {
        this._maxHistoryMs = MAX_HISTORY_MS;
        this._sampleRate = sampleRate;
        this._channelCount = channelCount;
        this._wasm = wasm;
        this._ptr = 0;
        this._framesAdded = 0;
        this._momentaryLoudnessAvg = NaN;
        this._loudnessNormalizationEnabled = loudnessNormalizationEnabled;
        this._silenceTrimmingEnabled = silenceTrimmingEnabled;
        this._previouslyAppliedGain = -1.0;

        const [err, ptr] = this.loudness_analyzer_init(channelCount, sampleRate, MAX_HISTORY_MS);
        if (err) {
            throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${MAX_HISTORY_MS}`);
        }
        this._ptr = ptr;
    }

    _haveEnoughLoudnessData() {
        return this._framesAdded >= this._sampleRate * 3;
    }



    setLoudnessNormalizationEnabled(enabled) {
        checkBoolean(`enabled`, enabled);
        this._loudnessNormalizationEnabled = enabled;
    }

    setSilenceTrimmingEnabled(enabled) {
        checkBoolean(`enabled`, enabled);
        this._silenceTrimmingEnabled = enabled;
    }

    applyLoudnessNormalization(samplePtr, audioFrameCount) {
        let err;
        if (!this._ptr) {
            throw new Error(`not allocated`);
        }
        const ret = {isEntirelySilent: false};
        const {_loudnessNormalizationEnabled, _silenceTrimmingEnabled} = this;

        if (!_loudnessNormalizationEnabled && !_silenceTrimmingEnabled) {
            return ret;
        }

        let integratedLoudness, samplePeak;
        const momentaryLoudnessValues = [];
        const momentaryWindowFrameCount = MOMENTARY_WINDOW_MS / 1000 * this._sampleRate | 0;
        let framesAdded = 0;
        let sampleOffset = 0;
        while (framesAdded < audioFrameCount) {
            const framesToAdd = Math.min(audioFrameCount - framesAdded, momentaryWindowFrameCount);
            err = this.loudness_analyzer_add_frames(this._ptr, samplePtr + sampleOffset, framesToAdd);
            if (err) {
                throw new Error(`ebur128 error ${err} ${samplePtr + sampleOffset} ${framesToAdd}`);
            }

            sampleOffset += (INT16_BYTE_SIZE * this._channelCount * framesToAdd);
            framesAdded += framesToAdd;
            this._framesAdded += framesToAdd;

            if (_silenceTrimmingEnabled &&
                this._framesAdded >= momentaryWindowFrameCount) {
                let momentaryLoudness;
                ([err, momentaryLoudness] = this.loudness_analyzer_get_momentary_loudness(this._ptr));

                if (err) {
                    throw new Error(`ebur128 error ${err} ${this._framesAdded}`);
                } else {
                    if (!isFinite(this._momentaryLoudnessAvg)) {
                        this._momentaryLoudnessAvg = momentaryLoudness;
                    } else {
                        this._momentaryLoudnessAvg = this._momentaryLoudnessAvg * 0.3 + momentaryLoudness * 0.7;
                    }
                    momentaryLoudnessValues.push(momentaryLoudness);
                }
            }

        }

        if (_loudnessNormalizationEnabled) {
            ([err, integratedLoudness, samplePeak] = this.loudness_analyzer_get_loudness_and_peak(this._ptr));
            if (err) {
                throw new Error(`ebur128 error ${err} ${samplePtr} ${audioFrameCount}`);
            }
        }

        if (_silenceTrimmingEnabled &&
            this._framesAdded > momentaryWindowFrameCount) {
            let isEntirelySilent = true;
            for (let i = 0; i < momentaryLoudnessValues.length; ++i) {
                if (momentaryLoudnessValues[i] > SILENCE_THRESHOLD) {
                    isEntirelySilent = false;
                    break;
                }
            }
            ret.isEntirelySilent = isEntirelySilent;
        }

        if (_loudnessNormalizationEnabled) {
            const loudnessValue = this._haveEnoughLoudnessData() ? integratedLoudness : this._momentaryLoudnessAvg;
            if (loudnessValue > SILENCE_THRESHOLD) {
                const gainOffset = Math.min(REFERENCE_LUFS - loudnessValue, MAX_GAIN_OFFSET);
                const gain = Math.min(1 / samplePeak, Math.pow(10, (gainOffset / 20)));
                this.loudness_analyzer_apply_gain(this._ptr, gain, this._previouslyAppliedGain, samplePtr, audioFrameCount);
                this._previouslyAppliedGain = gain;
            }
        }

        return ret;
    }

    destroy() {
        if (this._ptr) {
            this.loudness_analyzer_destroy(this._ptr);
            this._ptr = 0;
        }
    }

    reset() {
        if (!this._ptr) {
            throw new Error(`not allocated`);
        }
        this._framesAdded = 0;
        const err = this.loudness_analyzer_reset(this._ptr);
        if (err) {
            throw new Error(`ebur128: reset error ${err}`);
        }
    }

    reinitialized(channelCount, sampleRate) {
        this._channelCount = channelCount;
        this._sampleRate = sampleRate;
        this._framesAdded = 0;
        this._momentaryLoudnessAvg = NaN;
        this._previouslyAppliedGain = -1.0;
        if (!this._ptr) {
            const [err, ptr] = this.loudness_analyzer_init(channelCount, sampleRate, this._maxHistoryMs);
            if (err) {
                throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${this._maxHistoryMs}`);
            }
            this._ptr = ptr;
        } else {
            const err = this.loudness_analyzer_reinitialize(this._ptr, channelCount, sampleRate, this._maxHistoryMs);
            if (err) {
                throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${this._maxHistoryMs}`);
            }
        }
        return this;
    }
}



moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    LoudnessAnalyzer.prototype.loudness_analyzer_init = wasm.createFunctionWrapper({
        name: `loudness_analyzer_init`,
        unsafeJsStack: true
    }, `integer`, `integer`, `integer`, `integer-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_get_loudness_and_peak = wasm.createFunctionWrapper({
        name: `loudness_analyzer_get_loudness_and_peak`,
        unsafeJsStack: true
    }, `integer`, `double-retval`, `double-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_get_momentary_loudness = wasm.createFunctionWrapper({
        name: `loudness_analyzer_get_momentary_loudness`,
        unsafeJsStack: true
    }, `integer`, `double-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_destroy = exports.loudness_analyzer_destroy;
    LoudnessAnalyzer.prototype.loudness_analyzer_reinitialize = exports.loudness_analyzer_reinitialize;
    LoudnessAnalyzer.prototype.loudness_analyzer_reset = exports.loudness_analyzer_reset;
    LoudnessAnalyzer.prototype.loudness_analyzer_add_frames = exports.loudness_analyzer_add_frames;
    LoudnessAnalyzer.prototype.loudness_analyzer_apply_gain = exports.loudness_analyzer_apply_gain;

});
