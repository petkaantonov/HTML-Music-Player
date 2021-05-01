import {
    AudioConfig,
    AudioPlayerBackendActions,
    AudioPlayerResult,
    BufferDescriptor,
    BufferFillExtraData,
    BufferFillType,
    ChannelData,
    FillBuffersOpts,
    LoadOpts,
    MAX_BUFFER_LENGTH_SECONDS,
    MIN_BUFFER_LENGTH_SECONDS,
    SeekOpts,
} from "shared/audio";
import { checkBoolean, checkNumberDivisible, checkNumberRange } from "shared/errors";
import TagDatabase from "shared/idb/TagDatabase";
import Timers from "shared/platform/Timers";
import { CROSSFADE_MAX_DURATION } from "shared/preferences";
import { CancellationError } from "shared/utils/CancellationToken";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";
import AbstractBackend from "shared/worker/AbstractBackend";
import Effects, { EffectSpecList } from "shared/worker/Effects";

import AudioSource from "./AudioSource";

export default class AudioPlayerBackend extends AbstractBackend<
    AudioPlayerBackendActions<AudioPlayerBackend>,
    "audio"
> {
    _wasm: WebAssemblyWrapper;
    _hardwareSampleRate: number;
    _timers: Timers;
    _audioSources: Map<any, any>;
    _effects: Effects;
    _config: AudioConfig;
    _activeAudioSource: AudioSource | null;
    _passiveAudioSource: AudioSource | null;
    _tagdb: TagDatabase;
    constructor(wasm: WebAssemblyWrapper, timers: Timers, tagdb: TagDatabase) {
        super("audio", {
            audioConfiguration: (config: AudioConfig) => {
                this._config = { ...this._config, ...config };
            },

            ping: () => {
                this._timers.tick();
            },

            seek: async ({ bufferFillCount, time }: SeekOpts) => {
                if (!this._activeAudioSource) return;
                const bufferOperationCancellationAcknowledged = this._activeAudioSource.bufferOperationCancellationAcknowledged();
                this._activeAudioSource.cancelAllOperations();

                try {
                    const { cancellationToken, baseTime } = await this._activeAudioSource.seek({ time });
                    cancellationToken.check();
                    await bufferOperationCancellationAcknowledged;
                    cancellationToken.check();
                    await this._activeAudioSource.fillBuffers(
                        1,
                        (bufferDescriptor: BufferDescriptor, channelData: ChannelData) => {
                            this._sendBuffer(bufferDescriptor, channelData, "BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER", {
                                baseTime,
                            });
                        },
                        { cancellationToken, totalBuffersToFillHint: bufferFillCount + 1 }
                    );
                    cancellationToken.check();
                    await this._fillBuffers(bufferFillCount);
                } catch (e) {
                    this._checkError(e);
                }
            },
            load: async ({
                fileReference,
                isPreloadForNextTrack,
                bufferFillCount,
                progress = 0,
                resumeAfterLoad,
            }: LoadOpts) => {
                if (this._passiveAudioSource) {
                    await this._passiveAudioSource.destroy();
                    this._passiveAudioSource = null;
                }
                let audioSource: AudioSource;
                try {
                    audioSource = new AudioSource(this);
                    this._passiveAudioSource = audioSource;

                    const { demuxData, baseTime, cancellationToken } = await audioSource.load({
                        fileReference,
                        isPreloadForNextTrack,
                        progress,
                    });
                    cancellationToken.check();
                    await audioSource.fillBuffers(
                        1,
                        async (bufferDescriptor: BufferDescriptor, channelData: ChannelData) => {
                            if (this._activeAudioSource) {
                                if (isPreloadForNextTrack) {
                                    void this._activeAudioSource.destroyAfterBuffersFilled();
                                } else {
                                    await this._activeAudioSource.destroy();
                                }
                            }
                            this._activeAudioSource = audioSource;
                            this._passiveAudioSource = null;

                            this._sendBuffer(bufferDescriptor, channelData, "BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER", {
                                demuxData,
                                isPreloadForNextTrack,
                                baseTime,
                                resumeAfterLoad,
                            });
                        },
                        { cancellationToken, totalBuffersToFillHint: bufferFillCount + 1 }
                    );
                    cancellationToken.check();
                    await this._fillBuffers(bufferFillCount);
                } catch (e) {
                    this._checkError(e);
                    if (audioSource! !== this._activeAudioSource) {
                        await audioSource!.destroy();
                    }
                }
            },
            fillBuffers: async ({ bufferFillCount }: FillBuffersOpts) => {
                if (this._activeAudioSource && !this._activeAudioSource.isBufferFillingInProgress()) {
                    await this._fillBuffers(bufferFillCount);
                }
            },
        });
        this._wasm = wasm;
        this._hardwareSampleRate = 0;
        this._timers = timers;
        this._tagdb = tagdb;
        this._audioSources = new Map();
        this._effects = new Effects(wasm);
        this._config = {
            bufferTime: 0,
            loudnessNormalization: true,
            silenceTrimming: true,
            crossfadeDuration: 0,
        };

        this._activeAudioSource = null;
        this._passiveAudioSource = null;
    }

    _sendBuffer(
        bufferDescriptor: BufferDescriptor,
        channelData: ChannelData,
        bufferFillType: BufferFillType,
        extraData: null | BufferFillExtraData = null
    ) {
        this.postMessageToAudioPlayer(
            {
                type: "bufferFilled",
                descriptor: bufferDescriptor,
                bufferFillType,
                extraData,
            },
            this._asTransferList(channelData)
        );
    }

    async _fillBuffers(bufferFillCount: number) {
        if (!this._activeAudioSource) return;
        const audioSource = this._activeAudioSource;
        let buffersSent = 0;
        try {
            await audioSource.fillBuffers(bufferFillCount, (bufferDescriptor, channelData) => {
                if (audioSource === this._activeAudioSource || bufferDescriptor.isBackgroundBuffer) {
                    buffersSent++;
                    this._sendBuffer(bufferDescriptor, channelData, "BUFFER_FILL_TYPE_REGULAR_BUFFER");
                }
            });

            if (audioSource === this._activeAudioSource && buffersSent > 0) {
                this.postMessageToAudioPlayer({ type: "idle" }, []);
            }
        } catch (e) {
            this._checkError(e);
        }
    }

    _checkError(e: Error) {
        if (!(e instanceof CancellationError)) {
            this._sendError(e);
        }
    }

    _sendError(error: Error) {
        this.postMessageToAudioPlayer({ type: `error`, message: error.message }, []);
        // eslint-disable-next-line no-console
        console.log(error);
    }

    _asTransferList(transferListArg?: (ArrayBuffer | { buffer: ArrayBuffer })[]): ArrayBuffer[] {
        if (!transferListArg) transferListArg = [];
        const transferList: ArrayBuffer[] = transferListArg.map<ArrayBuffer>(v => {
            if ("buffer" in v) return v.buffer;
            return v;
        });
        return transferList;
    }

    postMessageToAudioPlayer(result: AudioPlayerResult, transferList: ArrayBuffer[]) {
        this.postMessageToFrontend([result], transferList);
    }

    get tagDatabase() {
        return this._tagdb;
    }

    get wasm() {
        return this._wasm;
    }

    get effects() {
        return this._effects;
    }

    setEffectList(effects: EffectSpecList) {
        this._effects.setEffects(effects);
    }

    get crossfadeDuration() {
        return this._config.crossfadeDuration!;
    }

    set crossfadeDuration(duration: number) {
        checkNumberRange(`duration`, duration, 0, CROSSFADE_MAX_DURATION);
        this._config.crossfadeDuration = duration;
    }

    get bufferTime() {
        const ret = this._config.bufferTime;
        if (!ret) throw new Error(`buffer time not set`);
        return ret;
    }

    set bufferTime(bufferTime) {
        checkNumberRange(`bufferTime`, bufferTime, MIN_BUFFER_LENGTH_SECONDS, MAX_BUFFER_LENGTH_SECONDS);
        checkNumberDivisible(`bufferTime`, bufferTime, 0.1);
        this._config.bufferTime = bufferTime;
    }
    get loudnessNormalization() {
        return this._config.loudnessNormalization;
    }
    set loudnessNormalization(loudnessNormalization) {
        checkBoolean(`loudnessNormalization`, loudnessNormalization);
        this._config.loudnessNormalization = loudnessNormalization;
    }

    get silenceTrimming() {
        return this._config.silenceTrimming;
    }

    set silenceTrimming(silenceTrimming) {
        checkBoolean(`silenceTrimming`, silenceTrimming);
        this._config.silenceTrimming = silenceTrimming;
    }
}
