import AudioSource from "audio/backend/AudioSource";
import Effects from "audio/backend/Effects";
import {Map} from "platform/platform";
import AbstractBackend from "AbstractBackend";
export const PLAYER_READY_EVENT_NAME = `playerReady`;
import {checkBoolean} from "errors/BooleanTypeError";
import {checkNumberRange, checkNumberDivisible} from "errors/NumberTypeError";
import {MIN_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";

const emptyArray = [];

export default class AudioPlayerBackend extends AbstractBackend {
    constructor(wasm, timers, db, metadataManager) {
        super(PLAYER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._hardwareSampleRate = 0;
        this._timers = timers;
        this._audioSources = new Map();
        this._effects = new Effects();
        this._db = db;
        this._config = {
            bufferTime: 0,
            loudnessNormalization: true,
            silenceTrimming: true
        };
        this._metadataManager = metadataManager;
    }

    get metadataManager() {
        return this._metadataManager;
    }

    get wasm() {
        return this._wasm;
    }

    get effects() {
        return this._effects;
    }

    get bufferTime() {
        const ret = this._config.bufferTime;
        if (!ret) throw new Error(`buffer time not set`);
        return ret;
    }

    get loudnessNormalization() {
        return this._config.loudnessNormalization;
    }

    get silenceTrimming() {
        return this._config.silenceTrimming;
    }

    set bufferTime(bufferTime) {
        checkNumberRange(`bufferTime`, bufferTime, MIN_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS);
        checkNumberDivisible(`bufferTime`, bufferTime, 0.1);
        this._config.bufferTime = bufferTime;
    }

    set loudnessNormalization(loudnessNormalization) {
        checkBoolean(`loudnessNormalization`, loudnessNormalization);
        this._config.loudnessNormalization = loudnessNormalization;
    }

    set silenceTrimming(silenceTrimming) {
        checkBoolean(`silenceTrimming`, silenceTrimming);
        this._config.silenceTrimming = silenceTrimming;
    }

    set effects(effects) {
        this._effects.setEffects(effects);
    }

    sendMessage(nodeId, methodName, args, transferList) {
        if (!transferList) transferList = emptyArray;
        args = Object(args);

        if (transferList.length > 0) {
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
                for (const key of Object.keys(args)) {
                    if (this._config.hasOwnProperty(key) || key === `effects`) {
                        this[key] = args[key];
                    } else {
                        throw new Error(`invalid configuration key: ${key}`);
                    }
                }
            } else if (methodName === `register`) {
                const audioSource = new AudioSource(this, args.id);
                audioSource.once(`destroy`, () => {
                    if (audioSource.id >= 0) {
                        this._audioSources.delete(audioSource.id);
                    }
                });
                this._audioSources.set(args.id, audioSource);
            } else if (methodName === `ping`) {
                this._timers.tick();
            }
        } else {
            this._audioSources.get(nodeId).newMessage({methodName, args});
        }
    }
}

