import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import {Float32Array, performance} from "platform/platform";
import {allocLoudnessAnalyzer, freeLoudnessAnalyzer} from "audio/backend/pool";
import EventEmitter from "events";
import seeker from "audio/backend/seeker";
import getCodecName from "audio/backend/sniffer";
import getCodec from "audio/backend/codec";
import demuxer from "audio/backend/demuxer";
import {fileReferenceToTrackUid} from "metadata/MetadataManagerBackend";
import CancellableOperations from "utils/CancellationToken";

export const BUFFER_FILL_TYPE_SEEK = `BUFFER_FILL_TYPE_SEEK`;
export const BUFFER_FILL_TYPE_REPLACEMENT = `BUFFER_FILL_TYPE_REPLACEMENT`;
export const BUFFER_FILL_TYPE_NORMAL = `BUFFER_FILL_TYPE_NORMAL`;


const queuedMessage = {
    seek: true,
    loadInitialAudioData: true,
    loadReplacement: true,
    fillBuffers: true
};

const overridingMessage = {
    seek: true,
    loadInitialAudioData: true,
    loadReplacement: true
};

export default class AudioSource extends CancellableOperations(EventEmitter,
                                                               `bufferFillOperation`,
                                                               `seekOperation`,
                                                               `replacementOperation`) {
    constructor(backend, id, parent) {
        super();
        this.backend = backend;
        this.id = id;
        this.ended = false;
        this._decoder = null;
        this._loudnessAnalyzer = null;
        this._filePosition = 0;
        this._bufferFillCancellationToken = null;
        this._audioPipeline = null;
        this.codecName = ``;
        this.destroyed = false;
        this.demuxData = null;
        this.fileView = null;
        this.fileReference = null;
        this.replacementSource = null;
        this.replacementSpec = null;
        this.parent = parent || null;
        this.messageQueue = [];
        this.trackInfo = null;
        this._processingMessage = false;

        this._next = this._next.bind(this);
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

    _clearQueue() {
        this.messageQueue.length = 0;
    }

    async _next() {
        if (!this._processingMessage && this.messageQueue.length > 0) {
            const {methodName, args} = this.messageQueue.shift();
            try {
                this._processingMessage = true;
                await this[methodName](args);
            } finally {
                this._processingMessage = false;
                this._next();
            }
        }
    }

    _passReplacementBuffer(spec, args, destinationBuffers) {
        const {demuxData, gaplessPreload, requestId} = spec;
        const {descriptor: bufferDescriptor} = args;
        const {baseTime} = bufferDescriptor.fillTypeData;
        const fillTypeData = {demuxData, gaplessPreload, requestId, baseTime};
        const descriptor = {
            length: bufferDescriptor.length,
            startTime: bufferDescriptor.startTime,
            endTime: bufferDescriptor.endTime,
            loudnessInfo: bufferDescriptor.loudnessInfo,
            sampleRate: bufferDescriptor.sampleRate,
            channelCount: bufferDescriptor.channelCount,
            decodingLatency: bufferDescriptor.decodingLatency,
            fillTypeData
        };
        this._sendFilledBuffer(requestId,
                               descriptor,
                               destinationBuffers,
                               BUFFER_FILL_TYPE_REPLACEMENT,
                               false);
    }

    newMessage(spec) {
        const {methodName, args} = spec;

        if (overridingMessage[methodName] === true) {
            this.cancelAllOperations();
            this._clearQueue();
        }

        if (queuedMessage[methodName] === true) {
            this.messageQueue.push(spec);
        } else {
            this[methodName](args);
        }
        this._next();
    }

    sendMessage(name, args, destinationBuffers) {
        if (this.destroyed) return;
        if (this.parent === null || this.parent === undefined) {
            this.backend.sendMessage(this.id, name, args, destinationBuffers);
        } else {
            this.parent.messageFromReplacement(name, args, destinationBuffers, this);
        }
    }

    messageFromReplacement(name, args, destinationBuffers, sender) {
        if (sender !== this.replacementSource) {
            sender.destroy();
            return;
        }

        const {cancellationToken} = this.replacementSpec;

        if (cancellationToken.isCancelled()) {
            this.destroyReplacement();
            return;
        }

        switch (name) {
        case `_error`:
            this.destroyReplacement();
            this.sendError(args.message);
        break;

        case `_initialAudioDataLoaded`:
            this.replacementSpec.demuxData = args.demuxData;
            this.replacementSource.seek({
                requestId: args.requestId,
                count: this.replacementSpec.preloadBufferCount,
                time: this.replacementSpec.seekTime,
                isUserSeek: false
            });
        break;

        case `_bufferFilled`: {
            const spec = this.replacementSpec;
            this.replacementSpec = null;
            this.backend.transferSourceId(this, this.replacementSource);
            this.replacementSource.parent = null;
            try {
                this.replacementSource._passReplacementBuffer(spec, args, destinationBuffers);
            } finally {
                this.replacementSource = null;
                this.destroy(false);
            }
            break;
        }

        default:
            this.sendError(`unknown message from replacement: ${name}`);
        break;
        }
    }

    destroyReplacement() {
        if (this.replacementSource) {
            const spec = this.replacementSpec;
            if (spec) {
                this.replacementSpec = null;
            }
            this.replacementSource.destroy();
            this.replacementSource = null;
        }
    }

    async destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this._clearQueue();
        const bufferFillOperationCancellationAcknowledgedPromise = this._bufferFillOperationCancellationAcknowledged();
        this.cancelAllOperations();
        await bufferFillOperationCancellationAcknowledgedPromise;

        this.destroyReplacement();
        this.parent = null;

        if (this._decoder) {
            this._decoder.destroy();
            this._decoder = null;
        }

        if (this._loudnessAnalyzer) {
            freeLoudnessAnalyzer(this._loudnessAnalyzer);
            this._loudnessAnalyzer = null;
        }

        this.fileView = null;
        this.fileReference = null;
        this.codecName = ``;
        this._filePosition = 0;
        this.trackInfo = null;
        this._audioPipeline = null;
        this.demuxData = null;
        this.ended = false;
        this.emit(`destroy`);
        this.removeAllListeners();
        this._bufferFillCancellationToken = null;
    }

    sendError(message) {
        this.sendMessage(`_error`, {message});
    }

    async _decodeNextBuffer(destinationBuffers, cancellationToken, buffersRemainingToDecode) {
        const bytesRead = await this._audioPipeline.decodeFromFileViewAtOffset(this.fileView,
                                                                               this._filePosition,
                                                                               this.demuxData,
                                                                               cancellationToken,
                                                                               {channelData: destinationBuffers},
                                                                                buffersRemainingToDecode);
        if (cancellationToken.isCancelled()) {
            this._audioPipeline.dropFilledBuffer();
            return null;
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

    _sendFilledBuffer(requestId, descriptor, destinationBuffers, bufferFillType, isLastBuffer = false) {
        this.sendMessage(`_bufferFilled`,
                        {requestId, descriptor, isLastBuffer, bufferFillType},
                        destinationBuffers);
    }

    _bufferFillOperationCancellationAcknowledged() {
        return this._bufferFillCancellationToken && this._bufferFillCancellationToken.getSignal() || Promise.resolve();
    }

    _getDestinationBuffers() {
        const {channelCount, targetBufferLengthAudioFrames} = this;
        const ret = new Array(channelCount);
        for (let ch = 0; ch < channelCount; ++ch) {
            ret[ch] = new Float32Array(targetBufferLengthAudioFrames);
        }
        return ret;
    }

    async _fillBuffers(count, requestId, bufferFillType, fillTypeData = null) {
        if (this.ended) {
            this._sendFilledBuffer(requestId, null, null, bufferFillType, true);
            return;
        }

        if (this._bufferFillCancellationToken) {
            throw new Error(`invalid parallel buffer fill loop`);
        }

        this._bufferFillCancellationToken = this.cancellationTokenForBufferFillOperation();

        let {establishedGain} = this.demuxData;
        const {sampleRate, channelCount} = this;
        let i = 0;
        let currentBufferFillType = bufferFillType;
        try {
            while (i < count) {
                const now = performance.now();
                const buffersRemainingToDecode = count - i;
                const destinationBuffers = this._getDestinationBuffers();
                this._loudnessAnalyzer.setLoudnessNormalizationEnabled(this.backend.loudnessNormalization);
                this._loudnessAnalyzer.setSilenceTrimmingEnabled(this.backend.silenceTrimming);
                this._audioPipeline.setBufferTime(this.backend.bufferTime);
                const targetBufferLengthAudioFrames = this._audioPipeline.bufferAudioFrameCount;
                this._decoder.targetBufferLengthAudioFrames = targetBufferLengthAudioFrames;
                const bufferDescriptor = await this._decodeNextBuffer(destinationBuffers,
                                                                      this._bufferFillCancellationToken,
                                                                      buffersRemainingToDecode);
                if (this._bufferFillCancellationToken.isCancelled()) {
                    this._bufferFillCancellationToken.signal();
                    break;
                }

                if (!bufferDescriptor) {
                    break;
                }

                let {loudnessInfo} = bufferDescriptor;
                if (!establishedGain &&
                    this._loudnessAnalyzer.hasEstablishedGain()) {
                    establishedGain = this._loudnessAnalyzer.getEstablishedGain();
                    this.backend.metadataManager.setEstablishedGain(this.trackInfo.trackUid, establishedGain);
                } else if (establishedGain &&
                           !this._loudnessAnalyzer.hasEstablishedGain()) {
                    loudnessInfo = Object.assign({}, loudnessInfo, {loudness: establishedGain});
                }

                const decodingLatency = performance.now() - now;
                const descriptor = {
                    length: Math.min(bufferDescriptor.length, targetBufferLengthAudioFrames),
                    startTime: bufferDescriptor.startTime,
                    endTime: bufferDescriptor.endTime,
                    loudnessInfo, sampleRate, channelCount, decodingLatency,
                    fillTypeData: null
                };

                if (currentBufferFillType !== BUFFER_FILL_TYPE_NORMAL) {
                    descriptor.fillTypeData = fillTypeData;
                }

                this._sendFilledBuffer(requestId, descriptor, destinationBuffers, currentBufferFillType, this.ended);
                i++;
                currentBufferFillType = BUFFER_FILL_TYPE_NORMAL;

                if (this.ended) {
                    break;
                }
            }
        } finally {
            this._bufferFillCancellationToken = null;
            if (!this.destroyed && !this.ended) {
                this.sendMessage(`_idle`, {});
            }
        }
    }

    async _gotCodec(DecoderContext, requestId) {
        const {wasm,
                effects,
                metadataManager,
                bufferTime} = this.backend;
        const {codecName, fileView, fileReference} = this;
        try {
            if (this.destroyed) {
                return;
            }
            const demuxData = await demuxer(codecName, fileView);

            if (this.destroyed) {
                return;
            }

            if (!demuxData) {
                this.fileView = null;
                this._send(new Error(`Invalid ${DecoderContext.name} file`));
                return;
            }

            const trackUid = await fileReferenceToTrackUid(fileReference);
            const trackInfo = await metadataManager.getTrackInfoByTrackUid(trackUid);

            if (this.destroyed) {
                return;
            }

            if (trackInfo) {
                this.trackInfo = trackInfo;
                demuxData.establishedGain = trackInfo.establishedGain || undefined;
            } else {
                this.trackInfo = null;
            }

            if (this._loudnessAnalyzer || this._decoder) {
                self.uiLog(`memory leak: unfreed loudnessAnalyzer/decoder`);
            }

            this.demuxData = demuxData;
            this._filePosition = this.demuxData.dataStart;
            const {sampleRate, channelCount, targetBufferLengthAudioFrames} = this;

            this._decoder = new DecoderContext(wasm, {
                targetBufferLengthAudioFrames
            });
            this._decoder.start(demuxData);
            this._loudnessAnalyzer = allocLoudnessAnalyzer(wasm, channelCount, sampleRate, this.backend.loudnessNormalization);

            this._audioPipeline = new AudioProcessingPipeline(wasm, {
                sourceSampleRate: sampleRate,
                destinationSampleRate: sampleRate,
                sourceChannelCount: channelCount,
                destinationChannelCount: channelCount,
                decoder: this._decoder,
                loudnessAnalyzer: this._loudnessAnalyzer,
                bufferAudioFrameCount: targetBufferLengthAudioFrames,
                effects, bufferTime
            });
            this.sendMessage(`_initialAudioDataLoaded`, {requestId, demuxData});
        } catch (e) {
            this.sendError(e.message);
        }
    }

    cancelAllOperations() {
        this.destroyReplacement();
        this.cancelAllSeekOperations();
        this.cancelAllBufferFillOperations();
        this.cancelAllReplacementOperations();
    }

    fillBuffers({count}) {
        try {
            if (this.destroyed) {
                this.sendError(`AudioSource has been destroyed`);
                return;
            }
            if (!this.fileView) {
                this.sendError(`No initial audio data has been loaded`);
                return;
            }

            if (this._bufferFillCancellationToken) {
                return;
            }
            this._fillBuffers(count, -1, BUFFER_FILL_TYPE_NORMAL);
        } catch (e) {
            this.sendError(e.message);
        }
    }

    loadReplacement(args) {
        if (this.destroyed) return;
        this.destroyReplacement();
        const cancellationToken = this.cancellationTokenForReplacementOperation();
        try {
            this.replacementSpec = {
                requestId: args.requestId,
                fileReference: args.fileReference,
                seekTime: args.seekTime,
                demuxData: null,
                preloadBufferCount: args.count,
                gaplessPreload: args.gaplessPreload,
                cancellationToken
            };
            this.replacementSource = new AudioSource(this.backend, -1, this);
            this.replacementSource.loadInitialAudioData(args);
        } catch (e) {
            this.destroyReplacement();
            this.sendError(e.message);
        }
    }

    async seek(args) {
        try {
            const {requestId, count, time} = args;

            if (this.destroyed) {
                this.sendError(`AudioSource has been destroyed`);
                return;
            }
            if (!this.fileView) {
                this.sendError(`No initial audio data has been loaded`);
                return;
            }

            const bufferFillOperationCancellationAcknowledgedPromise =
                this._bufferFillOperationCancellationAcknowledged();
            this.cancelAllOperations();

            const cancellationToken = this.cancellationTokenForSeekOperation();
            const seekerResult = await seeker(this.codecName, time, this.demuxData, this._decoder, this.fileView);
            if (cancellationToken.isCancelled()) {
                return;
            }

            this._filePosition = seekerResult.offset;
            this._decoder.applySeek(seekerResult);

            await bufferFillOperationCancellationAcknowledgedPromise;

            if (cancellationToken.isCancelled()) {
                return;
            }

            this.ended = false;

            this._fillBuffers(count, requestId, BUFFER_FILL_TYPE_SEEK, {
                baseTime: seekerResult.time,
                isUserSeek: args.isUserSeek,
                requestId
            });
        } catch (e) {
            this.sendError(e.message);
        }
    }

    async loadInitialAudioData({fileReference, requestId}) {
        try {
            if (this.destroyed) {
                return;
            }

            if (this._decoder) {
                this._decoder.destroy();
                this._decoder = null;
            }

            if (this._loudnessAnalyzer) {
                freeLoudnessAnalyzer(this._loudnessAnalyzer);
                this._loudnessAnalyzer = null;
            }

            this.ended = false;
            this.fileView = this.demuxData = null;
            this.fileReference = null;
            this._filePosition = 0;
            this.codecName = ``;

            const {metadataManager} = this.backend;
            let fileView;
            try {
                fileView = await metadataManager.fileReferenceToFileView(fileReference);
            } catch (e) {
                this.sendError(e.message);
                return;
            }

            this.fileReference = fileReference;
            this.fileView = fileView;
            const codecName = await getCodecName(this.fileView);

            if (this.destroyed) {
                return;
            }

            if (!codecName) {
                this.fileView = null;
                this.fileReference = null;
                this.sendError(`This is not an audio file or it is an unsupported audio file`);
                return;
            }

            this.codecName = codecName;
            try {
                const codec = await getCodec(codecName);
                if (this.destroyed) {
                    return;
                }
                if (!codec) {
                    throw new Error(`Not decoder found for the codec: ${codecName}`);
                }
                await this._gotCodec(codec, requestId);
                if (this.destroyed) {
                    return;
                }

            } catch (e) {
                this.fileView = null;
                this.fileReference = null;
                this.sendError(e.message);
            }
        } catch (e) {
            this.sendError(e.message);
        }
    }

}
