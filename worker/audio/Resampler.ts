import BufferAllocator from "wasm/BufferAllocator";
import WebAssemblyWrapper, { moduleEvents } from "wasm/WebAssemblyWrapper";

import { ChannelCount } from "./ChannelMixer";

const FLOAT_BYTE_LENGTH = 4;

const pointersToInstances: Map<number, Resampler> = new Map();

interface ResamplerOpts {
    nb_channels: ChannelCount;
    in_rate: number;
    out_rate: number;
    quality?: number;
}

let id = 0;
export default class Resampler extends BufferAllocator {
    channelCount: number;
    _passedArgs: Required<ResamplerOpts>;
    _id: number;
    _ptr: number;
    constructor(wasm: WebAssemblyWrapper, { nb_channels, in_rate, out_rate, quality }: ResamplerOpts) {
        super(wasm);
        if (quality === undefined) quality = 0;
        this.channelCount = nb_channels;
        this._passedArgs = { nb_channels, in_rate, out_rate, quality };
        this._id = id++;
        this._ptr = 0;
    }

    _byteLengthToAudioFrameCount(byteLength: number) {
        return byteLength / this.channelCount / FLOAT_BYTE_LENGTH;
    }

    _audioFrameCountToByteLength(audioFrameCount: number) {
        return audioFrameCount * this.channelCount * FLOAT_BYTE_LENGTH;
    }

    resample(samplesPtr: number, byteLength: number) {
        if (this._ptr === 0) {
            throw new Error(`start() not called`);
        }
        const [, outputSamplesPtr, , outputAudioFramesWritten] = this.resampler_resample(
            this._ptr,
            samplesPtr,
            this._byteLengthToAudioFrameCount(byteLength)
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

    start() {
        if (this._ptr !== 0) {
            throw new Error(`already started`);
        }
        const { nb_channels, in_rate, out_rate, quality } = this._passedArgs;
        this._ptr = this.resampler_create(nb_channels, in_rate, out_rate, quality);
        if (!this._ptr) {
            throw new Error(`out of memory`);
        }
        pointersToInstances.set(this._ptr, this);
    }
}

export default interface Resampler {
    get_error: () => string;
    resampler_get_length: (ptr: number, inputLengthAudioFrames: number) => number;
    resampler_resample: (
        ptr: number,
        inputSamplePtr: number,
        inputLengthAudioFrames: number
    ) => [number, number, number, number];
    resampler_create: (channels: ChannelCount, inRate: number, outRate: number, quality: number) => number;
    resampler_destroy: (ptr: number) => void;
    resampler_reset: (ptr: number) => void;
}

moduleEvents.on(`main_beforeModuleImport`, (_wasm, imports: WebAssembly.Imports) => {
    imports!.env!.resamplerGetBuffer = function (ptr: number, byteLength: number) {
        return pointersToInstances.get(ptr)!.getBuffer(byteLength);
    };
});

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    const get_error = exports.resampler_get_error;
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
        `integer`,
        `integer`,
        `integer`,
        `integer-retval`,
        `integer-retval`,
        `integer-retval`
    );

    Resampler.prototype.resampler_get_length = exports.resampler_get_length as any;
    Resampler.prototype.resampler_create = exports.resampler_create as any;
    Resampler.prototype.resampler_destroy = exports.resampler_destroy as any;
    Resampler.prototype.resampler_reset = exports.resampler_reset as any;
});
