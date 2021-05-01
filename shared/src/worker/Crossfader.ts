import { CROSSFADE_MAX_DURATION } from "shared/preferences";
import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";
import { ChannelCount } from "shared/worker/ChannelMixer";

interface Params {
    channelCount: ChannelCount;
    duration: number;
    currentTime: number;
    sampleRate: number;
}

export default class Crossfader {
    _shouldApplyFadeIn: boolean;
    _shouldApplyFadeOut: boolean;
    _duration: number;
    constructor() {
        this._shouldApplyFadeIn = false;
        this._shouldApplyFadeOut = true;
        this._duration = 0;
    }

    getDuration() {
        return this._duration;
    }

    setDuration(duration: number) {
        this._duration = Math.min(duration, CROSSFADE_MAX_DURATION);
    }

    setFadeInEnabled(enabled: boolean) {
        this._shouldApplyFadeIn = enabled;
    }

    setFadeOutEnabled(enabled: boolean) {
        this._shouldApplyFadeOut = enabled;
    }

    apply(samplePtr: number, byteLength: number, { channelCount, duration, currentTime, sampleRate }: Params) {
        if (this._duration > 0) {
            if (this._shouldApplyFadeIn) {
                this.effects_crossfade_fade_in(
                    currentTime,
                    duration,
                    this._duration,
                    sampleRate,
                    channelCount,
                    samplePtr,
                    byteLength
                );
            }

            if (this._shouldApplyFadeOut) {
                this.effects_crossfade_fade_out(
                    currentTime,
                    duration,
                    this._duration,
                    sampleRate,
                    channelCount,
                    samplePtr,
                    byteLength
                );
            }
        }
    }
}

export default interface Crossfader {
    effects_crossfade_fade_in: (
        currentTime: number,
        fadeDuration: number,
        trackDuration: number,
        sampleRate: number,
        channelCount: ChannelCount,
        samplePtr: number,
        byteLength: number
    ) => void;
    effects_crossfade_fade_out: (
        currentTime: number,
        fadeDuration: number,
        trackDuration: number,
        sampleRate: number,
        channelCount: ChannelCount,
        samplePtr: number,
        byteLength: number
    ) => void;
}

function afterInitialized(_wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) {
    Crossfader.prototype.effects_crossfade_fade_in = exports.effects_crossfade_fade_in as any;
    Crossfader.prototype.effects_crossfade_fade_out = exports.effects_crossfade_fade_out as any;
}

moduleEvents.on(`general_afterInitialized`, afterInitialized);
moduleEvents.on(`audio_afterInitialized`, afterInitialized);
