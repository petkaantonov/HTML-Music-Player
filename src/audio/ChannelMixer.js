import {moduleEvents} from "wasm/WebAssemblyWrapper";

const OUTPUT_PTR_OFFSET = 0;

export default class ChannelMixer {
    constructor(wasm, {destinationChannelCount}) {
        if (!(destinationChannelCount >= 1 && destinationChannelCount <= 5)) {
            throw new Error(`invalid count ${destinationChannelCount}`);
        }
        this.destinationChannelCount = destinationChannelCount;
        this._wasm = wasm;
        this._ptr = 0;
        this._alloc();
    }

    mix(inputChannelCount, inputPtr, inputI16Length) {
        this.channel_mixer_mix(this._ptr, inputChannelCount, inputPtr, inputI16Length);
        const samplePtr = this._wasm.u32field(this._ptr, OUTPUT_PTR_OFFSET);
        return {
            samplePtr,
            byteLength: this.getLength(inputI16Length, inputChannelCount) * 2
        };
    }

    getLength(inputI16Length, inputChannelCount) {
        return this.channel_mixer_get_length(this._ptr, inputI16Length, inputChannelCount);
    }

    getChannels() {
        return this.destinationChannelCount;
    }

    setChannels(destinationChannelCount) {
        if (!(destinationChannelCount >= 1 && destinationChannelCount <= 5)) {
            throw new Error(`invalid count ${destinationChannelCount}`);
        }
        this.destinationChannelCount = destinationChannelCount;
        this.channel_mixer_set_output_channels(this._ptr, this.destinationChannelCount);
    }

    _alloc() {
        if (this._ptr !== 0) {
            throw new Error(`already allocated`);
        }
        this._ptr = this.channel_mixer_create(this.destinationChannelCount);
    }

    destroy() {
        if (this._ptr === 0) {
            throw new Error(`not allocated`);
        }
        this.channel_mixer_destroy(this._ptr);
        this._ptr = 0;
    }
}

moduleEvents.on(`main_beforeModuleImport`, (wasm, imports) => {
    const bufferCache = new Map();
    imports.env.channelMixerGetBuffer = function(i16length) {
        let ptr = bufferCache.get(i16length);
        if (!ptr) {
            ptr = wasm.u16calloc(i16length);
            bufferCache.set(i16length, ptr);
        }
        return ptr;
    };
});

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    const get_error = exports.channel_mixer_get_error;
    [`create`, `destroy`, `mix`, `get_length`, `set_output_channels`].forEach((methodBaseName) => {
        const methodName = `channel_mixer_${methodBaseName}`;
        const method = exports[methodName];
        ChannelMixer.prototype[methodName] = function(...args) {
            const ret = method(...args);
            const error = get_error();
            if (error) {
                throw new Error(wasm.convertCharPToAsciiString(error));
            }
            return ret;
        };
    });
});
