import {moduleEvents} from "wasm/WebAssemblyWrapper";
import {checkBoolean} from "errors/BooleanTypeError";
import {checkNumberRange} from "errors/NumberTypeError";
import {CROSSFADE_MIN_DURATION, CROSSFADE_MAX_DURATION} from "preferences/EffectPreferences";

export default class Crossfader {
    constructor() {
        this._shouldApplyFadeIn = false;
        this._shouldApplyFadeOut = true;
        this._duration = 0;
    }

    getDuration() {
        return this._duration;
    }

    setDuration(duration) {
        checkNumberRange(`duration`, duration, 0, CROSSFADE_MAX_DURATION);
        this._duration = duration;
    }

    setFadeInEnabled(enabled) {
        checkBoolean(`enabled`, enabled);
        this._shouldApplyFadeIn = enabled;
    }

    setFadeOutEnabled(enabled) {
        checkBoolean(`enabled`, enabled);
        this._shouldApplyFadeOut = enabled;
    }

    apply(samplePtr, byteLength, {channelCount, duration, currentTime, sampleRate}) {
        if (this._duration > 0) {
            if (this._shouldApplyFadeIn) {
                this.effects_crossfade_fade_in(currentTime, duration, this._duration, sampleRate, channelCount,
                                                samplePtr, byteLength);
            }

            if (this._shouldApplyFadeOut) {
                this.effects_crossfade_fade_out(currentTime, duration, this._duration, sampleRate, channelCount,
                                                 samplePtr, byteLength);
            }
        }
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    Crossfader.prototype.effects_crossfade_fade_in = exports.effects_crossfade_fade_in;
    Crossfader.prototype.effects_crossfade_fade_out = exports.effects_crossfade_fade_out;
});
