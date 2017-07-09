import ChannelMixer from "audio/ChannelMixer";
import AudioSource from "audio/AudioSource";
import Effects from "audio/Effects";
import {ArrayBuffer, Map} from "platform/platform";
import AbstractBackend from "AbstractBackend";
export const PLAYER_READY_EVENT_NAME = `playerReady`;

export default class AudioPlayerBackend extends AbstractBackend {
    constructor(wasm, timers) {
        super(PLAYER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._hardwareSampleRate = 0;
        this._bufferTime = 0;
        this._resamplerQuality = -1;
        this._channelMixer = null;
        this._timers = timers;
        this._audioSources = new Map();
        this._effects = new Effects();
    }

    get wasm() {
        return this._wasm;
    }

    get bufferTime() {
        const ret = this._bufferTime;
        if (!ret) throw new Error(`buffer time not set`);
        return ret;
    }

    get bufferAudioFrameCount() {
        return Math.ceil(this.bufferTime * this.destinationSampleRate);
    }

    get destinationChannelCount() {
        return this.channelMixer.getChannels();
    }

    get destinationSampleRate() {
        const ret = this._hardwareSampleRate;
        if (!ret) {
            throw new Error(`sample rate not set`);
        }
        return ret;
    }

    get resamplerQuality() {
        const ret = this._resamplerQuality;
        if (ret < 0) {
            throw new Error(`resampler quality not set`);
        }
        return ret;
    }


    get channelMixer() {
        const ret = this._channelMixer;
        if (!ret) {
            throw new Error(`channel count not set`);
        }
        return ret;
    }

    get effects() {
        return this._effects;
    }

    sendMessage(nodeId, methodName, args, transferList) {
        if (transferList === undefined) transferList = [];
        args = Object(args);
        transferList = transferList.map((v) => {
            if (v.buffer) return v.buffer;
            return v;
        });

        // Check for already neutered array buffers.
        if (transferList && transferList.length > 0) {
            for (let i = 0; i < transferList.length; ++i) {
                let item = transferList[i];

                if (!(item instanceof ArrayBuffer)) {
                    item = item.buffer;
                }

                if (item.byteLength === 0) {
                    return;
                }
            }
        }

        this.postMessage({
            nodeId,
            methodName,
            args,
            transferList
        }, transferList);
    }

    transferSourceId(from, to) {
        if (to.id !== -1 || !this._audioSources.has(from.id)) {
            throw new Error(`invalid source id transfer from ${from.id} to ${to.id}`);
        }
        to.id = from.id;
        from.id = -1;
        this._audioSources.set(to.id, to);
    }

    receiveMessage(event) {
        const {nodeId, args, methodName, transferList} = event.data;

        if (nodeId === -1) {
            if (methodName === `audioConfiguration`) {
                if (`resamplerQuality` in args) {
                    this._resamplerQuality = args.resamplerQuality;
                }

                if (`channelCount` in args) {
                    if (!this._channelMixer) {
                         this._channelMixer = new ChannelMixer(this._wasm, {destinationChannelCount: args.channelCount});
                    } else {
                        this.channelMixer.setChannels(args.channelCount);
                    }
                }

                if (`sampleRate` in args) {
                    this._hardwareSampleRate = args.sampleRate;
                }

                if (`bufferTime` in args) {
                    this._bufferTime = args.bufferTime;
                }
            } else if (methodName === `register`) {
                const audioSource = new AudioSource(this, args.id);
                audioSource.once(`destroy`, () => {
                    if (audioSource.id >= 0) {
                        this._audioSources.delete(audioSource.id);
                    }
                });
                this._audioSources.set(args.id, audioSource);
            } else if (methodName === `setEffects`) {
                this._effects.setEffects(args.effects);
            } else if (methodName === `ping`) {
                this._timers.tick();
            }
        } else {
            this._audioSources.get(nodeId).newMessage({
                methodName,
                args,
                transferList
            });
        }
    }
}

