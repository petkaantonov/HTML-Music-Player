import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";

export interface LoudnessInfo {
    isEntirelySilent: boolean;
}

const MAX_HISTORY_MS = 30000;
const FLOAT_BYTE_SIZE = 4;
const SILENCE_THRESHOLD = -65;
const MOMENTARY_WINDOW_MS = 400;
const OVERLAP_MS = 100;
const MAX_GAIN_OFFSET = 12;
const REFERENCE_LUFS = -18.0;

const MAX_HISTORY_OFFSET = 0;
const SAMPLE_RATE_OFFSET = 1;
const CHANNELS_OFFSET = 2;
const FRAMES_ADDED_OFFSET = 3;
const SAMPLE_PEAK_OFFSET = 3;
const INTEGRATED_LOUDNESS_OFFSET = 4;

export const defaultLoudnessInfo: LoudnessInfo = Object.freeze({
    isEntirelySilent: false,
});

export default class LoudnessAnalyzer {
    _maxHistoryMs: number;
    _sampleRate: number;
    _channelCount: number;
    _wasm: WebAssemblyWrapper;
    _ptr: number;
    _framesAdded: number;
    _momentaryLoudnessAvg: number;
    _loudnessNormalizationEnabled: boolean;
    _silenceTrimmingEnabled: boolean;
    _previouslyAppliedGain: number;
    _serializedStateHolderPtr: number;

    constructor(wasm: WebAssemblyWrapper) {
        this._maxHistoryMs = MAX_HISTORY_MS;
        this._sampleRate = -1;
        this._channelCount = -1;
        this._wasm = wasm;
        this._ptr = 0;
        this._framesAdded = 0;
        this._momentaryLoudnessAvg = NaN;
        this._loudnessNormalizationEnabled = false;
        this._silenceTrimmingEnabled = false;
        this._previouslyAppliedGain = -1.0;
        this._serializedStateHolderPtr = 0;
        this._ptr = 0;
    }

    _haveEnoughLoudnessData() {
        return this._framesAdded >= this._sampleRate * 3;
    }

    isHistoryStateFilled() {
        return (this._framesAdded / this._sampleRate) * 1000 >= MAX_HISTORY_MS + MOMENTARY_WINDOW_MS - OVERLAP_MS;
    }

    setLoudnessNormalizationEnabled(enabled: boolean) {
        this._loudnessNormalizationEnabled = enabled;
    }

    setSilenceTrimmingEnabled(enabled: boolean) {
        this._silenceTrimmingEnabled = enabled;
    }

    serialize() {
        if (!this._ptr) {
            throw new Error(`not initialized`);
        }
        const size = this.loudness_analyzer_get_serialized_state_size();
        if (this._serializedStateHolderPtr === 0) {
            this._serializedStateHolderPtr = this._wasm.malloc(size);
        }
        const err = this.loudness_analyzer_export_state(this._ptr, this._serializedStateHolderPtr);
        if (err) {
            throw new Error(`ebur128 error ${err}`);
        }
        const data = this._wasm.u8view(this._serializedStateHolderPtr, size);
        const ret = new Uint8Array(size);
        ret.set(data);
        return ret;
    }

    addFrames(samplePtr: number, audioFrameCount: number) {
        if (!this._ptr) {
            throw new Error(`not initialized`);
        }
        const err = this.loudness_analyzer_add_frames(this._ptr, samplePtr, audioFrameCount);
        if (err) {
            throw new Error(`ebur128 error ${err} ${samplePtr} ${audioFrameCount}`);
        }
        this._framesAdded += audioFrameCount;
    }

    applyLoudnessNormalization(samplePtr: number, audioFrameCount: number): LoudnessInfo {
        let err;
        if (!this._ptr) {
            throw new Error(`not initialized`);
        }
        const ret = { isEntirelySilent: false };
        const { _loudnessNormalizationEnabled, _silenceTrimmingEnabled } = this;

        if (!_loudnessNormalizationEnabled && !_silenceTrimmingEnabled) {
            return ret;
        }

        let integratedLoudness: number, samplePeak: number;
        const momentaryLoudnessValues = [];
        const momentaryWindowFrameCount = ((MOMENTARY_WINDOW_MS / 1000) * this._sampleRate) | 0;
        let framesAdded = 0;
        let sampleOffset = 0;
        while (framesAdded < audioFrameCount) {
            const framesToAdd = Math.min(audioFrameCount - framesAdded, momentaryWindowFrameCount);
            err = this.loudness_analyzer_add_frames(this._ptr, samplePtr + sampleOffset, framesToAdd);
            if (err) {
                throw new Error(`ebur128 error ${err} ${samplePtr + sampleOffset} ${framesToAdd}`);
            }

            sampleOffset += FLOAT_BYTE_SIZE * this._channelCount * framesToAdd;
            framesAdded += framesToAdd;
            this._framesAdded += framesToAdd;

            if (_silenceTrimmingEnabled && this._framesAdded >= momentaryWindowFrameCount) {
                let momentaryLoudness;
                [err, momentaryLoudness] = this.loudness_analyzer_get_momentary_loudness(this._ptr);

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
            [err, integratedLoudness, samplePeak] = this.loudness_analyzer_get_loudness_and_peak(this._ptr);
            if (err) {
                throw new Error(`ebur128 error ${err} ${samplePtr} ${audioFrameCount}`);
            }
        }

        if (_silenceTrimmingEnabled && this._framesAdded > momentaryWindowFrameCount) {
            let isEntirelySilent = true;
            for (let i = 0; i < momentaryLoudnessValues.length; ++i) {
                if (momentaryLoudnessValues[i]! > SILENCE_THRESHOLD) {
                    isEntirelySilent = false;
                    break;
                }
            }
            ret.isEntirelySilent = isEntirelySilent;
        }

        if (_loudnessNormalizationEnabled) {
            const loudnessValue = this._haveEnoughLoudnessData() ? integratedLoudness! : this._momentaryLoudnessAvg;
            if (loudnessValue > SILENCE_THRESHOLD) {
                const gainOffset = Math.min(REFERENCE_LUFS - loudnessValue, MAX_GAIN_OFFSET);
                const gain = Math.min(1 / samplePeak!, Math.pow(10, gainOffset / 20));
                this.loudness_analyzer_apply_gain(
                    this._ptr,
                    gain,
                    this._previouslyAppliedGain,
                    samplePtr,
                    audioFrameCount
                );
                this._previouslyAppliedGain = gain;
            }
        }

        return ret;
    }

    destroy() {
        if (!this._ptr) {
            throw new Error(`not initialized`);
        }

        this.loudness_analyzer_destroy(this._ptr);
        this._ptr = 0;

        if (this._serializedStateHolderPtr) {
            this._wasm.free(this._serializedStateHolderPtr);
            this._serializedStateHolderPtr = 0;
        }
    }

    initializeFromSerializedState(serializedState: Uint8Array) {
        if (this._ptr) {
            throw new Error(`already initialized`);
        }
        const view = new DataView(serializedState.buffer, serializedState.byteOffset, 10 * 8);

        const sampleRate = view.getUint32(SAMPLE_RATE_OFFSET * 4, true);
        const channelCount = view.getUint32(CHANNELS_OFFSET * 4, true);
        const framesAdded = view.getUint32(FRAMES_ADDED_OFFSET * 4, true);
        const maxHistoryMs = view.getUint32(MAX_HISTORY_OFFSET * 4, true);
        const integratedLoudness = view.getFloat64(INTEGRATED_LOUDNESS_OFFSET * 8, true);
        const samplePeak = view.getFloat64(SAMPLE_PEAK_OFFSET * 8, true);

        this._channelCount = channelCount;
        this._sampleRate = sampleRate;
        this._framesAdded = framesAdded;
        this._maxHistoryMs = maxHistoryMs;

        this._momentaryLoudnessAvg = integratedLoudness;

        const gainOffset = Math.min(REFERENCE_LUFS - integratedLoudness, MAX_GAIN_OFFSET);
        const gain = Math.min(1 / samplePeak, Math.pow(10, gainOffset / 20));
        this._previouslyAppliedGain = gain;

        {
            const [err, ptr] = this.loudness_analyzer_init(channelCount, sampleRate, this._maxHistoryMs);
            if (err) {
                throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${this._maxHistoryMs}`);
            }
            this._ptr = ptr;
        }

        const size = this.loudness_analyzer_get_serialized_state_size();
        if (!this._serializedStateHolderPtr) {
            this._serializedStateHolderPtr = this._wasm.malloc(size);
        }

        this._wasm.u8view(this._serializedStateHolderPtr, size).set(serializedState);
        {
            const err = this.loudness_analyzer_init_from_serialized_state(this._ptr, this._serializedStateHolderPtr);
            if (err) {
                throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${this._maxHistoryMs}`);
            }
        }
    }

    initialize(channelCount: number, sampleRate: number) {
        if (this._ptr) {
            throw new Error(`already initialized`);
        }
        this._channelCount = channelCount;
        this._sampleRate = sampleRate;
        this._framesAdded = 0;
        this._momentaryLoudnessAvg = NaN;
        this._previouslyAppliedGain = -1.0;
        const [err, ptr] = this.loudness_analyzer_init(channelCount, sampleRate, this._maxHistoryMs);
        if (err) {
            throw new Error(`ebur128 error ${err} ${channelCount} ${sampleRate} ${this._maxHistoryMs}`);
        }
        this._ptr = ptr;
    }
}

export default interface LoudnessAnalyzer {
    loudness_analyzer_init: (channelCount: number, sampleRate: number, maxHistoryMs: number) => [number, number];
    loudness_analyzer_destroy: (ptr: number) => void;
    loudness_analyzer_get_loudness_and_peak: (ptr: number) => [number, number, number];
    loudness_analyzer_get_momentary_loudness: (ptr: number) => [number, number];
    loudness_analyzer_init_from_serialized_state: (ptr: number, statePtr: number) => number;
    loudness_analyzer_add_frames: (ptr: number, samplePtr: number, audioFrameCount: number) => number;
    loudness_analyzer_apply_gain: (
        ptr: number,
        gain: number,
        previouslyAppliedGain: number,
        samplePtr: number,
        audioFrameCount: number
    ) => void;
    loudness_analyzer_get_serialized_state_size: () => number;
    loudness_analyzer_export_state: (ptr: number, statePtr: number) => number;
}

function afterInitialized(wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) {
    LoudnessAnalyzer.prototype.loudness_analyzer_init = wasm.createFunctionWrapper(
        {
            name: `loudness_analyzer_init`,
            unsafeJsStack: true,
        },
        `integeru`,
        `integeru`,
        `integeru`,
        `pointer-retval`
    );
    LoudnessAnalyzer.prototype.loudness_analyzer_get_loudness_and_peak = wasm.createFunctionWrapper(
        {
            name: `loudness_analyzer_get_loudness_and_peak`,
            unsafeJsStack: true,
        },
        `pointer`,
        `double-retval`,
        `double-retval`
    );
    LoudnessAnalyzer.prototype.loudness_analyzer_get_momentary_loudness = wasm.createFunctionWrapper(
        {
            name: `loudness_analyzer_get_momentary_loudness`,
            unsafeJsStack: true,
        },
        `pointer`,
        `double-retval`
    );
    LoudnessAnalyzer.prototype.loudness_analyzer_destroy = exports.loudness_analyzer_destroy as any;
    LoudnessAnalyzer.prototype.loudness_analyzer_init_from_serialized_state = exports.loudness_analyzer_init_from_serialized_state as any;
    LoudnessAnalyzer.prototype.loudness_analyzer_add_frames = exports.loudness_analyzer_add_frames as any;
    LoudnessAnalyzer.prototype.loudness_analyzer_apply_gain = exports.loudness_analyzer_apply_gain as any;
    LoudnessAnalyzer.prototype.loudness_analyzer_get_serialized_state_size = exports.loudness_analyzer_get_serialized_state_size as any;
    LoudnessAnalyzer.prototype.loudness_analyzer_export_state = exports.loudness_analyzer_export_state as any;
}

moduleEvents.on(`general_afterInitialized`, afterInitialized);
moduleEvents.on(`audio_afterInitialized`, afterInitialized);
moduleEvents.on(`visualizer_afterInitialized`, afterInitialized);
