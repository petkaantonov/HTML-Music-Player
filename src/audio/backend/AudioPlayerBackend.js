import AudioSource from "audio/backend/AudioSource";
import Effects from "audio/backend/Effects";
import {ArrayBuffer, Map} from "platform/platform";
import AbstractBackend from "AbstractBackend";
export const PLAYER_READY_EVENT_NAME = `playerReady`;

export default class AudioPlayerBackend extends AbstractBackend {
    constructor(wasm, timers, db, metadataParser) {
        super(PLAYER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._hardwareSampleRate = 0;
        this._bufferTime = 0;
        this._timers = timers;
        this._audioSources = new Map();
        this._effects = new Effects();
        this._db = db;
        this._loudnessNormalization = true;
        this._metadataParser = metadataParser;
    }

    get metadataParser() {
        return this._metadataParser;
    }

    get wasm() {
        return this._wasm;
    }

    get bufferTime() {
        const ret = this._bufferTime;
        if (!ret) throw new Error(`buffer time not set`);
        return ret;
    }

    get effects() {
        return this._effects;
    }

    get loudnessNormalization() {
        return this._loudnessNormalization;
    }

    sendMessage(nodeId, methodName, args, transferList) {
        if (transferList === undefined) transferList = [];
        args = Object(args);

        if (transferList && transferList.length > 0) {
            transferList = transferList.map((v) => {
                if (v.buffer) return v.buffer;
                return v;
            });
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
        const {nodeId, args, methodName} = event.data;

        if (nodeId === -1) {
            if (methodName === `audioConfiguration`) {
                if (`bufferTime` in args) {
                    this._bufferTime = args.bufferTime;
                }
                if (`loudnessNormalization` in args) {
                    this._loudnessNormalization = args.loudnessNormalization;
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
            this._audioSources.get(nodeId).newMessage({methodName, args});
        }
    }
}

