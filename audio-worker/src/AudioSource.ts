import { BufferDescriptor, ChannelData, TIME_UPDATE_RESOLUTION } from "shared/audio";
import { CodecName, FileReference, fileReferenceToTrackUid, TrackMetadata } from "shared/metadata";
import FileView from "shared/platform/FileView";
import { debugFor } from "shared/src/debug";
import { PromiseResolve } from "shared/src/types/helpers";
import CancellableOperations, { CancellationToken } from "shared/utils/CancellationToken";
import AudioProcessingPipeline from "shared/worker/AudioProcessingPipeline";
import getCodec, { Decoder } from "shared/worker/codec";
import Crossfader from "shared/worker/Crossfader";
import demuxer from "shared/worker/demuxer";
import LoudnessAnalyzer from "shared/worker/LoudnessAnalyzer";
import getCodecName from "shared/worker/sniffer";

import AudioPlayerBackend from "./AudioPlayerBackend";
import seeker from "./seeker";

const dbg = debugFor("AudioSource");

interface SeekResult {
    baseTime: number;
    cancellationToken: CancellationToken<AudioSource>;
}

type BufferFilledCallback = (desc: BufferDescriptor, data: ChannelData) => void;

interface BufferFillOpts {
    cancellationToken: null | CancellationToken<AudioSource>;
    fadeInSeconds?: number;
}
let id = 0;
export default class AudioSource extends CancellableOperations(
    null,
    `bufferFillOperation`,
    `seekOperation`,
    `loadOperation`
) {
    backend: AudioPlayerBackend;
    ended: boolean;
    private readonly _id: number;
    private _decoder: Decoder | null;
    private _loudnessNormalizer: LoudnessAnalyzer | null;
    private _filePosition: number;
    private _bufferFillCancellationToken: CancellationToken<AudioSource> | null;
    private _audioPipeline: AudioProcessingPipeline | null;
    private _crossfader: Crossfader;
    private _initialized: boolean = false;
    private _lastFrame: number = 0;
    codecName: CodecName;
    private _destroyed: boolean;
    demuxData: null | TrackMetadata;
    fileView: null | FileView;
    fileReference: null | FileReference;
    private inProgressBufferFilledCallbacks: PromiseResolve<void>[] = [];
    private endedCallbacks: PromiseResolve<void>[] = [];
    _destroyAfterBuffersFilledFlag: boolean;
    constructor(backend: AudioPlayerBackend) {
        super();
        this._id = ++id;
        this.backend = backend;
        this.ended = false;
        this._decoder = null;
        this._loudnessNormalizer = null;
        this._filePosition = 0;
        this._bufferFillCancellationToken = null;
        this._audioPipeline = null;
        this._crossfader = new Crossfader();
        this.codecName = `mp3`;
        this._destroyed = false;
        this.demuxData = null;
        this.fileView = null;
        this.fileReference = null;
        this._destroyAfterBuffersFilledFlag = false;
    }

    get lastFrame() {
        return this._lastFrame;
    }

    get id() {
        return this._id;
    }

    get destroyed() {
        return this._destroyed;
    }

    get initialized() {
        return this._initialized;
    }

    get duration() {
        if (!this.demuxData) {
            return 0;
        }
        return this.demuxData.duration;
    }

    get sampleRate() {
        if (!this.demuxData) {
            throw new Error(`no demuxData set`);
        }
        return this.demuxData.sampleRate;
    }

    get channelCount() {
        if (!this.demuxData) {
            throw new Error(`no demuxData set`);
        }
        return this.demuxData.channels;
    }

    get targetBufferLengthAudioFrames() {
        return this.backend.bufferFrameLength;
    }

    get crossfadeDuration() {
        return this._crossfader.getDuration();
    }

    async waitEnded() {
        if (this.ended) {
            return;
        }
        return new Promise(resolve => {
            this.endedCallbacks.push(resolve);
        });
    }

    async destroyAfterBuffersFilled() {
        if (this.isBufferFillingInProgress()) {
            await new Promise(resolve => {
                this.inProgressBufferFilledCallbacks.push(resolve);
                this._destroyAfterBuffersFilledFlag = true;
            });
        } else {
            await this.destroy();
        }
    }

    async destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        const bufferOperationCancellationAcknowledged = this.bufferOperationCancellationAcknowledged();
        this.cancelAllOperations("destroy called");
        await bufferOperationCancellationAcknowledged;

        if (this._decoder) {
            this._decoder.destroy();
            this._decoder = null;
        }

        if (this._loudnessNormalizer) {
            this._loudnessNormalizer.destroy();
            this._loudnessNormalizer = null;
        }

        if (this._audioPipeline) {
            this._audioPipeline.destroy();
            this._audioPipeline = null;
        }
    }

    callEndedCallbacks() {
        for (const callback of this.endedCallbacks) {
            callback();
        }
        this.endedCallbacks = [];
    }

    async fillBuffers(
        totalBuffersToFill: number,
        callback: BufferFilledCallback,
        { cancellationToken = null, fadeInSeconds = 0 }: BufferFillOpts = {
            cancellationToken: null,
            fadeInSeconds: 0,
        }
    ) {
        if (this.ended || this._destroyed) {
            this.callEndedCallbacks();
            return;
        }

        if (this.isBufferFillingInProgress()) {
            throw new Error(`invalid parallel buffer fill loop`);
        }

        this._bufferFillCancellationToken = cancellationToken || this.cancellationTokenForBufferFillOperation();

        const { sampleRate, channelCount } = this;
        let i = 0;
        this._loudnessNormalizer!.setLoudnessNormalizationEnabled(this.backend.loudnessNormalization!);
        this._loudnessNormalizer!.setSilenceTrimmingEnabled(this.backend.silenceTrimming!);

        this._audioPipeline!.setBufferTime(this.backend.bufferTime, this.backend.bufferFrameLength);
        const targetSourceBufferLengthAudioFrames = this._audioPipeline!.targetSourceBufferAudioFrameCount;
        this._decoder!.targetBufferLengthAudioFrames = targetSourceBufferLengthAudioFrames;
        try {
            while (i < totalBuffersToFill) {
                const now = performance.now();
                const buffersRemainingToDecodeHint = totalBuffersToFill - i;
                const destinationBuffers = this._getDestinationBuffers();
                const bufferDescriptor = await this._decodeNextBuffer(
                    destinationBuffers,
                    this._bufferFillCancellationToken,
                    buffersRemainingToDecodeHint,
                    fadeInSeconds
                );

                if (!bufferDescriptor) {
                    this.ended = true;
                    break;
                }

                const { startFrames, endFrames, loudnessInfo, length } = bufferDescriptor;
                if (fadeInSeconds > 0) {
                    fadeInSeconds = Math.max(0, fadeInSeconds - length / this.backend.sampleRate);
                }

                const decodingLatency = performance.now() - now;
                const descriptor = {
                    length,
                    startFrames,
                    endFrames,
                    loudnessInfo,
                    sampleRate,
                    channelCount,
                    decodingLatency,
                    audioSourceId: this.id,
                };

                callback(descriptor, destinationBuffers);
                i++;
                if (this.ended) {
                    break;
                }
            }
        } catch (e) {
            if (this._bufferFillCancellationToken!.isCancelled()) {
                this._bufferFillCancellationToken!.signal();
            }
            throw e;
        } finally {
            if (this._bufferFillCancellationToken!.isCancelled()) {
                this._bufferFillCancellationToken!.signal();
            }
            this._bufferFillCancellationToken = null;
            if (this._destroyAfterBuffersFilledFlag) {
                await this.destroy();
            }
            for (const callback of this.inProgressBufferFilledCallbacks) {
                callback();
            }
            this.inProgressBufferFilledCallbacks = [];

            if (this.ended) {
                this.callEndedCallbacks();
            }
        }
    }

    cancelAllOperations(reason: string) {
        this.cancelAllSeekOperations(reason);
        this.cancelAllBufferFillOperations(reason);
        this.cancelAllLoadOperations(reason);
    }

    bufferOperationCancellationAcknowledged() {
        return (
            (this._bufferFillCancellationToken && this._bufferFillCancellationToken.getSignal()) || Promise.resolve()
        );
    }

    seek({ time }: { time: number }) {
        return this._seek(time, this.cancellationTokenForSeekOperation());
    }

    async load({
        fileReference,
        isPreloadForNextTrack,
        crossfadeDuration,
        progress = 0,
    }: {
        fileReference: FileReference;
        isPreloadForNextTrack: boolean;
        crossfadeDuration: number;
        progress: number;
    }) {
        const cancellationToken = this.cancellationTokenForLoadOperation<AudioSource>();
        const { wasm, effects, bufferTime, tagDatabase } = this.backend;
        const fileView = await tagDatabase.fileReferenceToFileView(fileReference);
        cancellationToken.check();
        this.fileReference = fileReference;
        this.fileView = fileView;
        const codecName = await getCodecName(this.fileView);
        cancellationToken.check();

        if (!codecName) {
            throw new Error(`This is not an audio file or it is an unsupported audio file`);
        }
        this.codecName = codecName;

        const DecoderContext = await getCodec(codecName);
        cancellationToken.check();

        if (!DecoderContext) {
            throw new Error(`Not decoder found for the codec: ${codecName}`);
        }

        this._crossfader.setDuration(crossfadeDuration);
        this._crossfader.setFadeInEnabled(isPreloadForNextTrack);
        this._crossfader.setFadeOutEnabled(true);

        const demuxData = await demuxer(codecName, fileView);
        cancellationToken.check();

        if (!demuxData) {
            throw new Error(`Invalid ${DecoderContext.name} file`);
        }

        const trackUid = await fileReferenceToTrackUid(fileReference);
        cancellationToken.check();

        this.demuxData = demuxData;
        this._filePosition = this.demuxData!.dataStart;
        const { sampleRate, channelCount, targetBufferLengthAudioFrames, duration, _crossfader: crossfader } = this;

        dbg(
            "Load",
            "creating decoder",
            JSON.stringify({ sampleRate, channelCount, targetBufferLengthAudioFrames, duration })
        );

        this._decoder = new DecoderContext(wasm, {
            targetBufferLengthAudioFrames,
        });
        this._decoder.start(demuxData);
        this._loudnessNormalizer = new LoudnessAnalyzer(wasm);

        const loudnessAnalyzerSerializedState = await tagDatabase.getLoudnessAnalyzerStateForTrack(trackUid);
        cancellationToken.check();

        if (loudnessAnalyzerSerializedState) {
            this._loudnessNormalizer.initializeFromSerializedState(loudnessAnalyzerSerializedState);
        } else {
            this._loudnessNormalizer.initialize(channelCount, sampleRate);
        }

        this._audioPipeline = new AudioProcessingPipeline(wasm, {
            sourceSampleRate: sampleRate,
            destinationSampleRate: this.backend.sampleRate,
            sourceChannelCount: channelCount,
            destinationChannelCount: this.backend.channelCount,
            decoder: this._decoder,
            loudnessNormalizer: this._loudnessNormalizer,
            bufferAudioFrameCount: targetBufferLengthAudioFrames,
            effects,
            bufferTime,
            duration,
            crossfader,
        });
        this._lastFrame = Math.round(demuxData.duration * this.backend.sampleRate);

        if (progress > 0) {
            const time = progress * demuxData.duration;
            let { baseTime } = await this._seek(time, cancellationToken);
            cancellationToken.check();
            baseTime = Math.min(
                demuxData.duration - crossfadeDuration - TIME_UPDATE_RESOLUTION - this.backend.bufferTime,
                Math.max(0, baseTime)
            );
            cancellationToken.check();
            this._initialized = true;
            return {
                baseTime,
                baseFrame: Math.round(baseTime * this.backend.sampleRate),
                demuxData,
                cancellationToken,
            };
        }
        this._initialized = true;
        return { baseTime: 0, baseFrame: 0, demuxData, cancellationToken };
    }

    async _decodeNextBuffer(
        destinationBuffers: ChannelData,
        cancellationToken: CancellationToken<AudioSource>,
        buffersRemainingToDecodeHint: number,
        fadeInSeconds: number
    ) {
        let bytesRead;
        try {
            bytesRead = await this._audioPipeline!.decodeFromFileViewAtOffset(
                this.fileView!,
                this._filePosition,
                this.demuxData!,
                cancellationToken,
                fadeInSeconds,
                { channelData: destinationBuffers },
                buffersRemainingToDecodeHint
            );
            cancellationToken.check();
        } catch (e) {
            if (cancellationToken.isCancelled()) {
                this._audioPipeline!.dropFilledBuffer();
            }
            throw e;
        }

        this._filePosition += bytesRead;
        this.ended = this._filePosition >= this.demuxData!.dataEnd;
        if (this.ended) {
            dbg("decodeNextBuffer", "ended from file position");
        }
        if (!this._audioPipeline!.hasFilledBuffer) {
            this.ended = true;
            this._filePosition = this.demuxData!.dataEnd;
            return null;
        }
        return this._audioPipeline!.consumeFilledBuffer();
    }

    isBufferFillingInProgress() {
        return !!this._bufferFillCancellationToken;
    }

    _getDestinationBuffers() {
        const { channelCount, targetBufferLengthAudioFrames } = this;
        dbg("Verbose", "creating destination buffers", JSON.stringify({ channelCount, targetBufferLengthAudioFrames }));
        const ret = new Array(channelCount);
        for (let ch = 0; ch < channelCount; ++ch) {
            ret[ch] = new Float32Array(targetBufferLengthAudioFrames);
        }
        return ret;
    }

    async _seek(time: number, cancellationToken: CancellationToken<AudioSource>): Promise<SeekResult> {
        const seekerResult = await seeker(this.codecName, time, this.demuxData!, this.fileView!, cancellationToken);
        cancellationToken.check();
        this._filePosition = seekerResult.offset;
        this._decoder!.applySeek(seekerResult);
        if (this._audioPipeline) {
            this._audioPipeline.applySeek();
        }
        this.ended = false;

        this._crossfader.setDuration(this.backend.crossfadeDuration!);
        this._crossfader.setFadeInEnabled(false);
        this._crossfader.setFadeOutEnabled(true);
        return {
            baseTime: seekerResult.time,
            cancellationToken,
        };
    }
}
