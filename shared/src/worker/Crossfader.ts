import { debugFor } from "shared/debug";
import { ChannelCount } from "shared/metadata";
import { CROSSFADE_MAX_DURATION } from "shared/preferences";
import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";
const dbg = debugFor("Crossfader");

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
            const framesRequested = byteLength / channelCount / 4;
            const bufferDuration = framesRequested / sampleRate;

            if (this._shouldApplyFadeIn && currentTime <= this._duration) {
                dbg(
                    "fadein",
                    JSON.stringify({
                        frames: framesRequested,
                        channelCount,
                        duration,
                        currentTime,
                        sampleRate,
                    })
                );
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

            if (this._shouldApplyFadeOut && currentTime + bufferDuration >= duration - this._duration) {
                const framesRemaining = Math.min(
                    byteLength / channelCount / 4,
                    Math.floor(Math.max(0, duration - currentTime) * sampleRate)
                );
                const framesNeeded = Math.min(framesRemaining, framesRequested);

                dbg(
                    "fadeout",
                    JSON.stringify({
                        frames: framesRequested,
                        channelCount,
                        duration,
                        currentTime,
                        sampleRate,
                    })
                );
                this.effects_crossfade_fade_out(
                    currentTime,
                    duration,
                    this._duration,
                    sampleRate,
                    channelCount,
                    samplePtr,
                    framesNeeded,
                    framesRequested
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
        framesNeeded: number,
        framesRequested: number
    ) => void;
}

function afterInitialized(_wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) {
    Crossfader.prototype.effects_crossfade_fade_in = exports.effects_crossfade_fade_in as any;
    Crossfader.prototype.effects_crossfade_fade_out = exports.effects_crossfade_fade_out as any;
}

moduleEvents.on(`general_afterInitialized`, afterInitialized);
moduleEvents.on(`audio_afterInitialized`, afterInitialized);
