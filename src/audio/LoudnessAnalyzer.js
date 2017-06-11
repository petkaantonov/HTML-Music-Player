
import {moduleEvents} from "wasm/WebAssemblyWrapper";

export default class LoudnessAnalyzer {
    constructor(wasm, channelCount, sampleRate) {
        this._wasm = wasm;
        this._ptr = this.loudness_analyzer_init(channelCount, sampleRate);
        if (!this._ptr) {
            throw new Error(`malloc failed`);
        }
    }

    newFrames(samplePtr, audioFrameCount) {
        this.loudness_analyzer_add_frames(this._ptr, samplePtr, audioFrameCount);
    }

    destroy() {
        if (this._ptr) {
            this.loudness_analyzer_destroy(this._ptr);
            this._ptr = 0;
        }
    }

    getLoudnessAnalysis() {
        const [err, trackGain, trackPeak, beginSilenceLength, endSilenceLength] =
            this.loudness_analyzer_get_result(this._ptr);



        if (err) {
            throw new Error(`ebur128 err: ${err}`);
        }



        return {
            trackGain,
            trackPeak,
            silence: {
                beginSilenceLength,
                endSilenceLength
            }
        };
    }
}



moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    LoudnessAnalyzer.prototype.loudness_analyzer_get_result = wasm.createFunctionWrapper({
        name: `loudness_analyzer_get_result`,
        unsafeJsStack: true
    }, `integer`, `double-retval`, `double-retval`, `double-retval`, `double-retval`);
    LoudnessAnalyzer.prototype.loudness_analyzer_init = exports.loudness_analyzer_init;
    LoudnessAnalyzer.prototype.loudness_analyzer_destroy = exports.loudness_analyzer_destroy;
    LoudnessAnalyzer.prototype.loudness_analyzer_add_frames = exports.loudness_analyzer_add_frames;

});
