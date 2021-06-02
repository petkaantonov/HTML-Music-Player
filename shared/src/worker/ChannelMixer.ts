import { ChannelCount } from "shared/metadata";
import BufferAllocator from "shared/wasm/BufferAllocator";
import WebAssemblyWrapper, { moduleEvents } from "shared/wasm/WebAssemblyWrapper";

const OUTPUT_PTR_OFFSET = 0;

const pointersToInstances = new Map();

interface Opts {
    destinationChannelCount: ChannelCount;
}

export default class ChannelMixer extends BufferAllocator {
    destinationChannelCount: ChannelCount;
    _ptr: number;
    _wasm: any;
    constructor(wasm: WebAssemblyWrapper, { destinationChannelCount }: Opts) {
        super(wasm);
        this.destinationChannelCount = destinationChannelCount;
        this._ptr = 0;
        this._alloc();
    }

    mix(inputChannelCount: ChannelCount, inputPtr: number, byteLength: number) {
        this.channel_mixer_mix(this._ptr, inputChannelCount, inputPtr, byteLength);
        const samplePtr = this._wasm.u32field(this._ptr, OUTPUT_PTR_OFFSET);
        return {
            samplePtr,
            byteLength: Math.ceil((this.destinationChannelCount / inputChannelCount) * byteLength),
        };
    }

    getChannels() {
        return this.destinationChannelCount;
    }

    setChannels(destinationChannelCount: ChannelCount) {
        this.destinationChannelCount = destinationChannelCount;
        this.channel_mixer_set_output_channels(this._ptr, this.destinationChannelCount);
    }

    _alloc() {
        if (this._ptr !== 0) {
            throw new Error(`already allocated`);
        }
        this._ptr = this.channel_mixer_create(this.destinationChannelCount);
        if (!this._ptr) {
            throw new Error(`out of memory`);
        }
        pointersToInstances.set(this._ptr, this);
    }

    destroy() {
        super.destroy();
        if (this._ptr === 0) {
            throw new Error(`not allocated`);
        }
        this.channel_mixer_destroy(this._ptr);
        pointersToInstances.delete(this._ptr);
        this._ptr = 0;
    }
}

export default interface ChannelMixer {
    channel_mixer_get_error: () => number;
    channel_mixer_get_length: (ptr: number, inputLength: number, inputChannels: ChannelCount) => number;
    channel_mixer_mix: (ptr: number, inputChannelCount: ChannelCount, inputPtr: number, byteLength: number) => number;
    channel_mixer_create: (inputChannelCount: ChannelCount) => number;
    channel_mixer_destroy: (ptr: number) => number;
    channel_mixer_set_output_channels: (ptr: number, channelCount: ChannelCount) => number;
}

function beforeModuleImport(_wasm: WebAssemblyWrapper, imports: WebAssembly.Imports) {
    imports!.env!.channelMixerGetBuffer = function (ptr: number, byteLength: number) {
        return pointersToInstances.get(ptr).getBuffer(byteLength);
    };
}

function afterInitialized(_wasm: WebAssemblyWrapper, exports: WebAssembly.Exports) {
    ChannelMixer.prototype.channel_mixer_get_error = exports.channel_mixer_get_error as () => number;
    ChannelMixer.prototype.channel_mixer_get_length = exports.channel_mixer_get_length as (
        ptr: number,
        inputLength: number,
        inputChannels: ChannelCount
    ) => number;
    ChannelMixer.prototype.channel_mixer_mix = exports.channel_mixer_mix as (
        ptr: number,
        inputChannelCount: ChannelCount,
        inputPtr: number,
        byteLength: number
    ) => number;
    ChannelMixer.prototype.channel_mixer_create = exports.channel_mixer_create as (
        inputChannelCount: ChannelCount
    ) => number;
    ChannelMixer.prototype.channel_mixer_destroy = exports.channel_mixer_destroy as (ptr: number) => number;
    ChannelMixer.prototype.channel_mixer_set_output_channels = exports.channel_mixer_set_output_channels as (
        ptr: number,
        channelCount: ChannelCount
    ) => number;
}

moduleEvents.on(`general_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`general_afterInitialized`, afterInitialized);
moduleEvents.on(`audio_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`audio_afterInitialized`, afterInitialized);
moduleEvents.on(`visualizer_beforeModuleImport`, beforeModuleImport);
moduleEvents.on(`visualizer_afterInitialized`, afterInitialized);
