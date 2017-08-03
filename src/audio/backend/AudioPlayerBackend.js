import AudioSource from "audio/backend/AudioSource";
import Effects from "audio/backend/Effects";
import {Map} from "platform/platform";
import AbstractBackend from "AbstractBackend";
export const PLAYER_READY_EVENT_NAME = `playerReady`;
import {checkBoolean} from "errors/BooleanTypeError";
import {checkNumberRange, checkNumberDivisible} from "errors/NumberTypeError";
import {MIN_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";
import {CROSSFADE_MAX_DURATION} from "preferences/EffectPreferences";
import {CancellationError} from "utils/CancellationToken";

const emptyArray = [];

export const BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER = `BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER`;
export const BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER = `BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER`;
export const BUFFER_FILL_TYPE_REGULAR_BUFFER = `BUFFER_FILL_TYPE_REGULAR_BUFFER`;

export default class AudioPlayerBackend extends AbstractBackend {
    constructor(wasm, timers, metadataManager) {
        super(PLAYER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._hardwareSampleRate = 0;
        this._timers = timers;
        this._audioSources = new Map();
        this._effects = new Effects(wasm);
        this._config = {
            bufferTime: 0,
            loudnessNormalization: true,
            silenceTrimming: true,
            crossfadeDuration: 0
        };
        this._metadataManager = metadataManager;

        this._activeAudioSource = null;
        this._passiveAudioSource = null;

        this.actions = {
            audioConfiguration(args) {
                for (const key of Object.keys(args)) {
                    if (this._config.hasOwnProperty(key) || key === `effects`) {
                        this[key] = args[key];
                    } else {
                        throw new Error(`invalid configuration key: ${key}`);
                    }
                }
            },

            ping() {
                this._timers.tick();
            },

            seek: this._seek.bind(this),
            load: this._load.bind(this),
            fillBuffers: this._fillBuffersMessage.bind(this)
        };
    }

    _sendBuffer(bufferDescriptor, channelData, bufferFillType, extraData = null) {
        this._sendMessage(`_bufferFilled`, {
            descriptor: bufferDescriptor,
            bufferFillType,
            extraData
        }, channelData);
    }

    _fillBuffersMessage({bufferFillCount}) {
        if (this._activeAudioSource && !this._activeAudioSource.isBufferFillingInProgress()) {
            this._fillBuffers(bufferFillCount);
        }
    }

    async _fillBuffers(bufferFillCount) {
        const audioSource = this._activeAudioSource;
        let buffersSent = 0;
        try {
            await audioSource.fillBuffers(bufferFillCount, (bufferDescriptor, channelData) => {
                if (audioSource === this._activeAudioSource || bufferDescriptor.isBackgroundBuffer) {
                    buffersSent++;
                    this._sendBuffer(bufferDescriptor, channelData, BUFFER_FILL_TYPE_REGULAR_BUFFER);
                }
            });

            if (audioSource === this._activeAudioSource && buffersSent > 0) {
                this._sendMessage(`_idle`);
            }
        } catch (e) {
            this._checkError(e);
        }

    }

    async _seek({bufferFillCount, time}) {
        if (!this._activeAudioSource) return;
        const bufferOperationCancellationAcknowledged =
            this._activeAudioSource.bufferOperationCancellationAcknowledged();
        this._activeAudioSource.cancelAllOperations();

        try {
            const {cancellationToken, baseTime} = await this._activeAudioSource.seek({time});
            cancellationToken.check();
            await bufferOperationCancellationAcknowledged;
            cancellationToken.check();
            await this._activeAudioSource.fillBuffers(1, (bufferDescriptor, channelData) => {
                this._sendBuffer(bufferDescriptor, channelData, BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER, {baseTime});
            }, {cancellationToken, totalBuffersToFillHint: bufferFillCount + 1});
            cancellationToken.check();
            this._fillBuffers(bufferFillCount);
        } catch (e) {
            this._checkError(e);
        }

    }

    async _load({fileReference, isPreloadForNextTrack, bufferFillCount, progress = 0, resumeAfterLoad}) {
        if (this._passiveAudioSource) {
            this._passiveAudioSource.destroy();
            this._passiveAudioSource = null;
        }
        let audioSource;
        try {
            audioSource = new AudioSource(this);
            this._passiveAudioSource = audioSource;

            const {demuxData, baseTime, cancellationToken} = await audioSource.load({fileReference, isPreloadForNextTrack, progress});
            cancellationToken.check();
            await audioSource.fillBuffers(1, (bufferDescriptor, channelData) => {
                if (this._activeAudioSource) {
                    if (isPreloadForNextTrack) {
                        this._activeAudioSource.destroyAfterBuffersFilled();
                    } else {
                        this._activeAudioSource.destroy();
                    }
                }
                this._activeAudioSource = audioSource;
                this._passiveAudioSource = null;

                this._sendBuffer(bufferDescriptor, channelData, BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER, {
                    demuxData, isPreloadForNextTrack, baseTime, resumeAfterLoad
                });
            }, {cancellationToken, totalBuffersToFillHint: bufferFillCount + 1});
            cancellationToken.check();
            await this._fillBuffers(bufferFillCount);
        } catch (e) {
            this._checkError(e);
            if (audioSource !== this._activeAudioSource) {
                audioSource.destroy();
            }
        }


    }

    _checkError(e) {
        if (!(e instanceof CancellationError)) {
            this._sendError(e);
        }
    }

    _sendError(error) {
        this._sendMessage(`_error`, {message: error.message});
        if (self.env.isDevelopment()) {
            self.console.log(error);
        }
    }

    _sendMessage(methodName, args, transferList) {
        if (!transferList) transferList = emptyArray;
        args = Object(args);

        if (transferList.length > 0) {
            transferList = transferList.map((v) => {
                if (v.buffer) return v.buffer;
                return v;
            });
        }

        this.postMessage({
            methodName,
            args,
            transferList
        }, transferList);
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

    get crossfadeDuration() {
        return this._config.crossfadeDuration;
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

    set crossfadeDuration(duration) {
        checkNumberRange(`duration`, duration, 0, CROSSFADE_MAX_DURATION);
        this._config.crossfadeDuration = duration;
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
}

