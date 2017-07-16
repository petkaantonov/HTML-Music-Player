import {moduleEvents} from "wasm/WebAssemblyWrapper";
import {checkBoolean} from "errors/BooleanTypeError";

const MAX_HISTORY_MS = 8000;
const INT16_BYTE_SIZE = 2;
const SILENCE_THRESHOLD = 50;
const MOMENTARY_WINDOW_MS = 400;

export const defaultLoudnessInfo = Object.freeze({
    loudness: 0,
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
        this._establishedGain = -1;
        this._framesAdded = 0;
        this._loudnessNormalizationEnabled = loudnessNormalizationEnabled;
        this._silenceTrimmingEnabled = silenceTrimmingEnabled;

        const [err, ptr] = this.loudness_analyzer_init(channelCount, sampleRate, MAX_HISTORY_MS);
        if (err) {
            throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${MAX_HISTORY_MS}`);
        }
        this._ptr = ptr;
    }

    setLoudnessNormalizationEnabled(enabled) {
        checkBoolean("enabled", enabled);
        this._loudnessNormalizationEnabled = enabled;
    }

    setSilenceTrimmingEnabled(enabled) {
        checkBoolean("enabled", enabled);
        this._silenceTrimmingEnabled = enabled;
    }

    getLoudnessInfo(samplePtr, audioFrameCount) {
        if (!this._ptr) {
            throw new Error(`not allocated`);
        }
        const ret = {
            loudness: 0,
            isEntirelySilent: false
        };
        const {_loudnessNormalizationEnabled, _silenceTrimmingEnabled} = this;

        if (!_loudnessNormalizationEnabled && !_silenceTrimmingEnabled) {
            return ret;
        }


        const momentaryLoudnessSlices = [];
        const momentaryWindowFrameCount = MOMENTARY_WINDOW_MS / 1000 * this._sampleRate | 0;
        let framesAdded = 0;

        while (framesAdded < audioFrameCount) {
            const framesToAdd = Math.min(audioFrameCount - framesAdded, momentaryWindowFrameCount);
            let err = this.loudness_analyzer_add_frames(this._ptr, samplePtr, framesToAdd);
            if (err) {
                throw new Error(`ebur128 error ${err} ${samplePtr} ${framesToAdd}`);
            }

            samplePtr += (INT16_BYTE_SIZE * this._channelCount * framesToAdd);
            framesAdded += framesToAdd;
            this._framesAdded += framesToAdd;

            if (_silenceTrimmingEnabled &&
                this._framesAdded > momentaryWindowFrameCount) {
                const retVals = this.loudness_analyzer_get_momentary_gain(this._ptr);
                err = retVals[0];
                if (err) {
                    throw new Error(`ebur128 error ${err} ${this._framesAdded}`);
                } else {
                    const gain = retVals[1];
                    momentaryLoudnessSlices.push(gain);
                }
            }

        }

        if (_loudnessNormalizationEnabled) {
            const [error, gain] = this.loudness_analyzer_get_gain(this._ptr);
            if (error) {
                throw new Error(`ebur128 error ${error} ${samplePtr} ${audioFrameCount}`);
            }

            if (!this.hasEstablishedGain() && isFinite(gain)) {
                const neededFrames = Math.ceil(this._maxHistoryMs / 1000 * this._sampleRate);
                if (this._framesAdded >= neededFrames) {
                    this._establishedGain = gain;
                }
            }

            ret.loudness = gain;
        }

        if (_silenceTrimmingEnabled &&
            this._framesAdded > momentaryWindowFrameCount) {
            let isEntirelySilent = true;
            for (let i = 0; i < momentaryLoudnessSlices.length; ++i) {
                if (momentaryLoudnessSlices[i] < SILENCE_THRESHOLD) {
                    isEntirelySilent = false;
                    break;
                }
            }
            ret.isEntirelySilent = isEntirelySilent;
        }

        return ret;
    }

    hasEstablishedGain() {
        return this._establishedGain !== -1;
    }

    getEstablishedGain() {
        return this._establishedGain;
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
        this._establishedGain = -1;
        this._framesAdded = 0;
        const err = this.loudness_analyzer_reset(this._ptr);
        if (err) {
            throw new Error(`ebur128: reset error ${err}`);
        }
    }

    reinitialized(channelCount, sampleRate) {
        this._channelCount = channelCount;
        this._sampleRate = sampleRate;
        this._establishedGain = -1;
        this._framesAdded = 0;
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
    LoudnessAnalyzer.prototype.loudness_analyzer_get_gain = wasm.createFunctionWrapper({
        name: `loudness_analyzer_get_gain`,
        unsafeJsStack: true
    }, `integer`, `double-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_get_momentary_gain = wasm.createFunctionWrapper({
        name: `loudness_analyzer_get_momentary_gain`,
        unsafeJsStack: true
    }, `integer`, `double-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_destroy = exports.loudness_analyzer_destroy;
    LoudnessAnalyzer.prototype.loudness_analyzer_reinitialize = exports.loudness_analyzer_reinitialize;
    LoudnessAnalyzer.prototype.loudness_analyzer_reset = exports.loudness_analyzer_reset;
    LoudnessAnalyzer.prototype.loudness_analyzer_add_frames = exports.loudness_analyzer_add_frames;

});
