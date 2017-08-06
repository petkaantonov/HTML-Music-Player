import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import {Float32Array, performance} from "platform/platform";
import seeker from "audio/backend/seeker";
import getCodecName from "audio/backend/sniffer";
import getCodec from "audio/backend/codec";
import demuxer from "audio/backend/demuxer";
import Crossfader from "audio/backend/Crossfader";
import {fileReferenceToTrackUid} from "metadata/MetadataManagerBackend";
import CancellableOperations from "utils/CancellationToken";
import LoudnessAnalyzer from "audio/backend/LoudnessAnalyzer";

export default class AudioSource extends CancellableOperations(null,
                                                               `bufferFillOperation`,
                                                               `seekOperation`,
                                                               `loadOperation`) {
    constructor(backend) {
        super();
        this.backend = backend;
        this.ended = false;
        this._decoder = null;
        this._loudnessNormalizer = null;
        this._filePosition = 0;
        this._bufferFillCancellationToken = null;
        this._audioPipeline = null;
        this._crossfader = new Crossfader();
        this.codecName = ``;
        this._destroyed = false;
        this.demuxData = null;
        this.fileView = null;
        this.fileReference = null;
        this._destroyAfterBuffersFilledFlag = false;
    }

    get duration() {
        if (!this.demuxData) {
            throw new Error(`no demuxData set`);
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
        return this.backend.bufferTime * this.sampleRate;
    }

    get crossfadeDuration() {
        return this._crossfader.getDuration();
    }

    destroyAfterBuffersFilled() {
        if (this.isBufferFillingInProgress()) {
            this._destroyAfterBuffersFilledFlag = true;
        } else {
            this.destroy();
        }
    }

    async destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        const bufferOperationCancellationAcknowledged = this.bufferOperationCancellationAcknowledged();
        this.cancelAllOperations();
        await bufferOperationCancellationAcknowledged;

        if (this._decoder) {
            this._decoder.destroy();
            this._decoder = null;
        }

        if (this._loudnessNormalizer) {
            this._loudnessNormalizer.destroy();
            this._loudnessNormalizer = null;
        }
    }

    async fillBuffers(totalBuffersToFill, callback, {
        cancellationToken = null,
        totalBuffersToFillHint = totalBuffersToFill
    } = {
        cancellationToken: null,
        totalBuffersToFillHint: totalBuffersToFill
    }) {
        if (this.ended) {
            return;
        }

        if (this.isBufferFillingInProgress()) {
            throw new Error(`invalid parallel buffer fill loop`);
        }

        this._bufferFillCancellationToken = cancellationToken || this.cancellationTokenForBufferFillOperation();

        const {sampleRate, channelCount} = this;
        let i = 0;
        const {crossfadeDuration, duration} = this;
        this._loudnessNormalizer.setLoudnessNormalizationEnabled(this.backend.loudnessNormalization);
        this._loudnessNormalizer.setSilenceTrimmingEnabled(this.backend.silenceTrimming);
        this._audioPipeline.setBufferTime(this.backend.bufferTime);
        const targetBufferLengthAudioFrames = this._audioPipeline.bufferAudioFrameCount;
        this._decoder.targetBufferLengthAudioFrames = targetBufferLengthAudioFrames;
        try {
            while (i < totalBuffersToFill) {
                const now = performance.now();
                const buffersRemainingToDecodeHint = totalBuffersToFillHint - i;
                const destinationBuffers = this._getDestinationBuffers();
                const bufferDescriptor = await this._decodeNextBuffer(destinationBuffers,
                                                                      this._bufferFillCancellationToken,
                                                                      buffersRemainingToDecodeHint);

                if (!bufferDescriptor) {
                    this.ended = true;
                    break;
                }

                const {startTime, endTime, loudnessInfo} = bufferDescriptor;
                let isBackgroundBuffer = false;
                let isLastBuffer = false;

                if (crossfadeDuration > 0) {
                    const fadeOutStartTime = duration - crossfadeDuration;
                    if (startTime > fadeOutStartTime) {
                        isBackgroundBuffer = true;
                    } else if (endTime >= fadeOutStartTime) {
                        isLastBuffer = true;
                        totalBuffersToFill += Math.ceil(crossfadeDuration / this._audioPipeline.bufferTime);
                    }
                } else {
                    isLastBuffer = this.ended;
                }

                const decodingLatency = performance.now() - now;
                const descriptor = {
                    length: Math.min(bufferDescriptor.length, targetBufferLengthAudioFrames),
                    startTime,
                    endTime,
                    loudnessInfo,
                    sampleRate,
                    channelCount,
                    decodingLatency,
                    isBackgroundBuffer,
                    isLastBuffer
                };

                callback(descriptor, destinationBuffers);
                i++;
                if (this.ended) {
                    break;
                }
            }
        } catch (e) {
            if (this._bufferFillCancellationToken.isCancelled()) {
                this._bufferFillCancellationToken.signal();
            }
            throw e;
        } finally {
            if (this._bufferFillCancellationToken.isCancelled()) {
                this._bufferFillCancellationToken.signal();
            }
            this._bufferFillCancellationToken = null;
            if (this._destroyAfterBuffersFilledFlag) {
                this.destroy();
            }
        }
    }

    cancelAllOperations() {
        this.cancelAllSeekOperations();
        this.cancelAllBufferFillOperations();
        this.cancelAllLoadOperations();
    }

    bufferOperationCancellationAcknowledged() {
        return this._bufferFillCancellationToken && this._bufferFillCancellationToken.getSignal() || Promise.resolve();
    }

    seek({time}) {
        return this._seek(time, this.cancellationTokenForSeekOperation());
    }

    async load({fileReference, isPreloadForNextTrack, progress = 0}) {
        const cancellationToken = this.cancellationTokenForLoadOperation();
        const {wasm, effects, bufferTime, metadataManager} = this.backend;
        const fileView = await metadataManager.fileReferenceToFileView(fileReference);
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

        this._crossfader.setDuration(this.backend.crossfadeDuration);
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
        this._filePosition = this.demuxData.dataStart;
        const {sampleRate, channelCount, targetBufferLengthAudioFrames, duration,
                _crossfader: crossfader} = this;

        this._decoder = new DecoderContext(wasm, {
            targetBufferLengthAudioFrames
        });
        this._decoder.start(demuxData);
        this._loudnessNormalizer = new LoudnessAnalyzer(wasm);

        const loudnessAnalyzerSerializedState = await metadataManager.getLoudnessAnalyzerStateForTrack(trackUid);
        cancellationToken.check();

        if (loudnessAnalyzerSerializedState) {
            this._loudnessNormalizer.initializeFromSerializedState(loudnessAnalyzerSerializedState);
        } else {
            this._loudnessNormalizer.initialize(channelCount, sampleRate);
        }

        this._audioPipeline = new AudioProcessingPipeline(wasm, {
            sourceSampleRate: sampleRate,
            destinationSampleRate: sampleRate,
            sourceChannelCount: channelCount,
            destinationChannelCount: channelCount,
            decoder: this._decoder,
            loudnessNormalizer: this._loudnessNormalizer,
            bufferAudioFrameCount: targetBufferLengthAudioFrames,
            effects, bufferTime, duration, crossfader
        });

        if (progress > 0) {
            const time = progress * demuxData.duration;
            const {baseTime} = await this._seek(time, cancellationToken);
            cancellationToken.check();
            return {baseTime, demuxData, cancellationToken};
        }

        return {baseTime: 0, demuxData, cancellationToken};
    }

    async _decodeNextBuffer(destinationBuffers, cancellationToken, buffersRemainingToDecodeHint) {
        let bytesRead;
        try {
            bytesRead = await this._audioPipeline.decodeFromFileViewAtOffset(this.fileView,
                                                                               this._filePosition,
                                                                               this.demuxData,
                                                                               cancellationToken,
                                                                               {channelData: destinationBuffers},
                                                                                buffersRemainingToDecodeHint);
        } catch (e) {
            if (cancellationToken.isCancelled()) {
                this._audioPipeline.dropFilledBuffer();
            }
            throw e;
        }

        this._filePosition += bytesRead;
        this.ended = this._filePosition >= this.demuxData.dataEnd;
        if (!this._audioPipeline.hasFilledBuffer) {
            this.ended = true;
            this._filePosition = this.demuxData.dataEnd;
            return null;
        }
        return this._audioPipeline.consumeFilledBuffer();
    }

    isBufferFillingInProgress() {
        return !!this._bufferFillCancellationToken;
    }

    _getDestinationBuffers() {
        const {channelCount, targetBufferLengthAudioFrames} = this;
        const ret = new Array(channelCount);
        for (let ch = 0; ch < channelCount; ++ch) {
            ret[ch] = new Float32Array(targetBufferLengthAudioFrames);
        }
        return ret;
    }

    async _seek(time, cancellationToken) {
        const seekerResult = await seeker(this.codecName, time, this.demuxData, this._decoder, this.fileView, cancellationToken);
        this._filePosition = seekerResult.offset;
        this._decoder.applySeek(seekerResult);
        this.ended = false;

        this._crossfader.setDuration(this.backend.crossfadeDuration);
        this._crossfader.setFadeInEnabled(false);
        this._crossfader.setFadeOutEnabled(true);
        return {baseTime: seekerResult.time, cancellationToken};
    }
}
