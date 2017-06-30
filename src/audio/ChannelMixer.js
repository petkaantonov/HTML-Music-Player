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

    mix(inputChannelCount, inputPtr, byteLength) {
        this.channel_mixer_mix(this._ptr, inputChannelCount, inputPtr, byteLength);
        const samplePtr = this._wasm.u32field(this._ptr, OUTPUT_PTR_OFFSET);
        return {
            samplePtr,
            byteLength: Math.ceil(this.destinationChannelCount / inputChannelCount * byteLength)
        };
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
    imports.env.channelMixerGetBuffer = function(byteLength) {
        let ptr = bufferCache.get(byteLength);
        if (!ptr) {
            ptr = wasm.malloc(byteLength);
            bufferCache.set(byteLength, ptr);
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
