import { debugFor } from "shared/debug";
import { ChannelCount } from "shared/metadata";
import BufferAllocator from "shared/wasm/BufferAllocator";
import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";
const dbg = debugFor("Resampler");

const FLOAT_BYTE_LENGTH = 4;

const pointersToInstances: Map<number, Resampler> = new Map();

export interface ResamplerOpts {
    channels: number;
    sourceSampleRate: number;
    destinationSampleRate: number;
}

let id = 0;
export default class Resampler extends BufferAllocator {
    readonly channelCount: number;
    readonly sourceSampleRate: number;
    readonly destinationSampleRate: number;
    readonly quality: 3;
    _id: number;
    _ptr: number;
    constructor(wasm: WebAssemblyWrapper, { channels, sourceSampleRate, destinationSampleRate }: ResamplerOpts) {
        super(wasm);
        this.channelCount = channels;
        this.sourceSampleRate = sourceSampleRate;
        this.destinationSampleRate = destinationSampleRate;
        this.quality = 3;
        this._id = id++;
        this._ptr = 0;
    }

    static CacheKey(channelCount: number, sourceSampleRate: number, destinationSampleRate: number) {
        return `${channelCount} ${sourceSampleRate} ${destinationSampleRate}`;
    }

    _byteLengthToAudioFrameCount(byteLength: number) {
        return byteLength / this.channelCount / FLOAT_BYTE_LENGTH;
    }

    _audioFrameCountToByteLength(audioFrameCount: number) {
        return audioFrameCount * this.channelCount * FLOAT_BYTE_LENGTH;
    }

    convertInDestinationSampleRate(frames: number) {
        if (this._ptr === 0) {
            throw new Error(`start() not called`);
        }
        return Math.floor((this.destinationSampleRate / this.sourceSampleRate) * frames);
    }

    resample(samplesPtr: number, byteLength: number) {
        const label = "resample";
        if (this._ptr === 0) {
            throw new Error(`start() not called`);
        }
        const inputFramesCount = this._byteLengthToAudioFrameCount(byteLength);
        const [, outputSamplesPtr, inputFramesRead, outputAudioFramesWritten] = this.resampler_resample(
            this._ptr,
            this.sourceSampleRate,
            this.destinationSampleRate,
            samplesPtr,
            inputFramesCount,
            false
        );
        dbg(
            label,
            "inputFramesRead",
            inputFramesRead,
            "outputFramesWrote",
            outputAudioFramesWritten,
            "expectedRead",
            inputFramesCount,
            "expectedWritten",
            this.convertInDestinationSampleRate(inputFramesCount)
        );

        const err = this.get_error();

        if (err) {
            throw new Error(err);
        }

        return {
            samplePtr: outputSamplesPtr,
            byteLength: this._audioFrameCountToByteLength(outputAudioFramesWritten),
        };
    }

    reset() {
        if (this._ptr === 0) {
            this.start();
        } else {
            this.resampler_reset(this._ptr);
        }
    }

    destroy() {
        super.destroy();
        if (this._ptr === 0) {
            throw new Error(`not started`);
        }
        this.resampler_destroy(this._ptr);
        pointersToInstances.delete(this._ptr);
        this._ptr = 0;
    }

    end() {
        this.destroy();
    }

    startIfNeeded() {
        if (this._ptr === 0) {
            this.start();
        }
    }

    start() {
        if (this._ptr !== 0) {
            throw new Error(`already started`);
        }
        this._ptr = this.resampler_create(this.channelCount, this.quality);
        if (!this._ptr) {
            throw new Error(`out of memory`);
        }
        pointersToInstances.set(this._ptr, this);
    }
}

export default interface Resampler {
    get_error: () => string | null;
    resampler_resample: (
        ptr: number,
        sourceSampleRate: number,
        destinationSampleRate: number,
        inputSamplePtr: number,
        inputLengthAudioFrames: number,
        endOfInput: boolean,
        outputSamplePtr?: number,
        inputAudioFramesReadLength?: number,
        outputAudioFramesWrittenLength?: number
    ) => [number, number, number, number];
    resampler_create: (channels: ChannelCount, quality: 1 | 3) => number;
    resampler_destroy: (ptr: number) => void;
    resampler_reset: (ptr: number) => void;
}

function beforeModuleImport(_wasm: WebAssemblyWrapper, imports: WebAssembly.Imports) {
    imports!.env!.resamplerGetBuffer = function (ptr: number, byteLength: number) {
        return pointersToInstances.get(ptr)!.getBuffer(byteLength);
    };
}

function afterInitialized(wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) {
    const get_error = exports.resampler_get_error! as Function;
    Resampler.prototype.get_error = function () {
        const error = get_error();
        if (error) {
            return wasm.convertCharPToAsciiString(error);
        } else {
            return null;
        }
    };
    Resampler.prototype.resampler_resample = wasm.createFunctionWrapper(
        {
            name: `resampler_resample`,
            unsafeJsStack: true,
        },
        `pointer`,
        `integeru`,
        `integeru`,
        `pointer`,
        `integeru`,
        `boolean`,
        `pointer-retval`,
        `integeru-retval`,
        `integeru-retval`
    );
    Resampler.prototype.resampler_create = exports.resampler_create as any;
    Resampler.prototype.resampler_destroy = exports.resampler_destroy as any;
    Resampler.prototype.resampler_reset = exports.resampler_reset as any;
}

moduleEvents.on(`general_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`general_afterInitialized`, afterInitialized);
moduleEvents.on(`audio_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`audio_afterInitialized`, afterInitialized);
moduleEvents.on(`visualizer_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`visualizer_afterInitialized`, afterInitialized);
