import {moduleEvents} from "wasm/WebAssemblyWrapper";

const I16_BYTE_LENGTH = 2;

let id = 0;
export default class Resampler {
    constructor(wasm, {nb_channels, in_rate, out_rate, quality}) {
        if (quality === undefined) quality = 0;
        this._wasm = wasm;
        this.channelCount = nb_channels;
        this._passedArgs = {nb_channels, in_rate, out_rate, quality};
        this._id = id++;
        this._ptr = 0;
    }

    _byteLengthToAudioFrameCount(byteLength) {
        return byteLength / this.channelCount / I16_BYTE_LENGTH;
    }

    _audioFrameCountToByteLength(audioFrameCount) {
        return audioFrameCount * this.channelCount * I16_BYTE_LENGTH;
    }

    resample(samplesPtr, byteLength) {
        if (this._ptr === 0) {
            throw new Error(`start() not called`);
        }
        const [, outputSamplesPtr, inputAudioFramesRead, outputAudioFramesWritten] =
                this.resampler_resample(this._ptr, samplesPtr, this._byteLengthToAudioFrameCount(byteLength));
        const err = this.get_error();

        if (err) {
            throw err;
        }

        return {
            samplePtr: outputSamplesPtr,
            byteLength: this._audioFrameCountToByteLength(outputAudioFramesWritten)
        };
    }

    reset() {
        if (this._ptr === 0) {
            this.start();
        } else {
            this.resampler_reset(this._ptr);
        }
    }

    end() {
        if (this._ptr === 0) {
            throw new Error(`not started`);
        }
        this.resampler_destroy(this._ptr);
        this._ptr = 0;
    }

    start() {
        if (this._ptr !== 0) {
            throw new Error(`already started`);
        }
        const {nb_channels, in_rate, out_rate, quality} = this._passedArgs;
        this._ptr = this.resampler_create(nb_channels, in_rate, out_rate, quality);
    }
}

moduleEvents.on(`main_beforeModuleImport`, (wasm, imports) => {
    const bufferCache = new Map();
    imports.env.resamplerGetBuffer = function(byteLength) {
        let ptr = bufferCache.get(byteLength);
        if (!ptr) {
            ptr = wasm.malloc(byteLength);
            bufferCache.set(byteLength, ptr);
        }
        return ptr;
    };
});

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    const get_error = exports.resampler_get_error;
    Resampler.prototype.get_error = function() {
        const error = get_error();
        if (error) {
            return wasm.convertCharPToAsciiString(error);
        } else {
            return null;
        }
    };
    Resampler.prototype.resampler_resample = wasm.createFunctionWrapper({
        name: `resampler_resample`,
        unsafeJsStack: true
    }, `integer`, `integer`, `integer`,
        `integer-retval`, `integer-retval`, `integer-retval`);

    [`create`, `destroy`, `get_length`, `reset`].forEach((methodBaseName) => {
        const methodName = `resampler_${methodBaseName}`;
        const method = exports[methodName];
        Resampler.prototype[methodName] = function(...args) {
            const ret = method(...args);
            const error = this.get_error();
            if (error) {
                throw error;
            }
            return ret;
        };
    });
});
