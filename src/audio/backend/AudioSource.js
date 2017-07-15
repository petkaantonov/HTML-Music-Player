import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import {Blob, File, Float32Array, performance} from "platform/platform";
import {allocDecoderContext, allocLoudnessAnalyzer, freeDecoderContext, freeLoudnessAnalyzer} from "audio/backend/pool";
import EventEmitter from "events";
import FileView from "platform/FileView";
import seeker from "audio/backend/seeker";
import getCodecName from "audio/backend/sniffer";
import getCodec from "audio/backend/codec";
import demuxer from "audio/backend/demuxer";
import CancellableOperations from "utils/CancellationToken";
import {SILENCE_THRESHOLD} from "audio/backend/LoudnessAnalyzer";

export const BUFFER_FILL_TYPE_SEEK = `BUFFER_FILL_TYPE_SEEK`;
export const BUFFER_FILL_TYPE_REPLACEMENT = `BUFFER_FILL_TYPE_REPLACEMENT`;
export const BUFFER_FILL_TYPE_NORMAL = `BUFFER_FILL_TYPE_NORMAL`;


const queuedMessage = {
    seek: true,
    loadBlob: true,
    loadReplacement: true,
    fillBuffers: true
};

const overridingMessage = {
    seek: true,
    loadBlob: true,
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
        this.blob = null;
        this._filePosition = 0;
        this._bufferFillCancellationToken = null;
        this._audioPipeline = null;
        this.codecName = ``;
        this.destroyed = false;
        this.metadata = null;
        this.fileView = null;
        this.replacementSource = null;
        this.replacementSpec = null;
        this.parent = parent || null;
        this.messageQueue = [];
        this._processingMessage = false;

        this._errored = this._errored.bind(this);
        this._next = this._next.bind(this);
    }

    get sampleRate() {
        if (!this.metadata) {
            throw new Error(`no metadata set`);
        }
        return this.metadata.sampleRate;
    }

    get channelCount() {
        if (!this.metadata) {
            throw new Error(`no metadata set`);
        }
        return this.metadata.channels;
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
        const {metadata, gaplessPreload, requestId} = spec;
        const {descriptor: bufferDescriptor} = args;
        const {baseTime} = bufferDescriptor.fillTypeData;
        const fillTypeData = {metadata, gaplessPreload, requestId, baseTime};
        const descriptor = {
            length: bufferDescriptor.length,
            startTime: bufferDescriptor.startTime,
            endTime: bufferDescriptor.endTime,
            loudness: bufferDescriptor.loudness,
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

    getBlobSize() {
        return this.blob.size;
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
            this.passError(args.message, args.stack);
        break;

        case `_blobLoaded`:
            this.replacementSpec.metadata = args.metadata;
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
            this.passError(`unknown message from replacement: ${name}`, new Error().stack);
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
            freeDecoderContext(this.codecName, this._decoder);
            this._decoder = null;
        }

        if (this._loudnessAnalyzer) {
            freeLoudnessAnalyzer(this._loudnessAnalyzer);
            this._loudnessAnalyzer = null;
        }

        this.fileView = null;
        this.codecName = ``;
        this.blob = null;
        this._filePosition = 0;
        this._audioPipeline = null;
        this.metadata = null;
        this.ended = false;
        this.emit(`destroy`);
        this.removeAllListeners();
        this._bufferFillCancellationToken = null;
    }

    passError(errorMessage, stack, name) {
        this.sendMessage(`_error`, {
            message: errorMessage,
            stack,
            name
        });
    }

    _errored(e) {
        this.passError(e.message, e.stack, e.name);
    }

    async _decodeNextBuffer(destinationBuffers, cancellationToken, buffersRemainingToDecode) {
        const bytesRead = await this._audioPipeline.decodeFromFileViewAtOffset(this.fileView,
                                                                               this._filePosition,
                                                                               this.metadata,
                                                                               cancellationToken,
                                                                               {channelData: destinationBuffers},
                                                                                buffersRemainingToDecode);
        if (cancellationToken.isCancelled()) {
            this._audioPipeline.dropFilledBuffer();
            return null;
        }
        this._filePosition += bytesRead;
        this.ended = this._filePosition >= this.metadata.dataEnd;
        if (!this._audioPipeline.hasFilledBuffer) {
            this.ended = true;
            this._filePosition = this.metadata.dataEnd;
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

        const {trackMetadata} = this.metadata;
        const {sampleRate, channelCount} = this;
        let i = 0;
        let currentBufferFillType = bufferFillType;
        try {
            while (i < count) {
                const now = performance.now();
                const buffersRemainingToDecode = count - i;
                const destinationBuffers = this._getDestinationBuffers();
                this._loudnessAnalyzer.setEnabled(this.backend.loudnessNormalization);
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

                let {loudness} = bufferDescriptor;
                if (!trackMetadata.establishedGain &&
                    this._loudnessAnalyzer.hasEstablishedGain()) {
                    trackMetadata.establishedGain = this._loudnessAnalyzer.getEstablishedGain();
                    this.backend.metadataParser.updateCachedMetadata(this.blob, trackMetadata);
                } else if (trackMetadata.establishedGain &&
                           !this._loudnessAnalyzer.hasEstablishedGain()) {
                    loudness = loudness < SILENCE_THRESHOLD ? trackMetadata.establishedGain : loudness;
                }

                const decodingLatency = performance.now() - now;
                const descriptor = {
                    length: Math.min(bufferDescriptor.length, targetBufferLengthAudioFrames),
                    startTime: bufferDescriptor.startTime,
                    endTime: bufferDescriptor.endTime,
                    loudness, sampleRate, channelCount, decodingLatency,
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

    async _gotCodec(codec, requestId, playerMetadata) {
        const {wasm,
                effects,
                metadataParser,
                bufferTime} = this.backend;
        const {codecName, blob} = this;
        try {
            if (this.destroyed) {
                return;
            }
            const metadata = await demuxer(codecName, this.fileView);

            if (this.destroyed) {
                return;
            }

            if (!metadata) {
                this.fileView = this.blob = null;
                this._errored(new Error(`Invalid ${codec.name} file`));
                return;
            }

            if (playerMetadata) {
                if (playerMetadata.encoderDelay !== -1) {
                    metadata.encoderDelay = playerMetadata.encoderDelay;
                }

                if (playerMetadata.encoderPadding !== -1) {
                    metadata.encoderPadding = playerMetadata.encoderPadding;
                }
            }

            const trackMetadata = await metadataParser.getCachedMetadata(blob);

            if (this.destroyed) {
                return;
            }

            if (trackMetadata) {
                metadata.trackMetadata = trackMetadata;
            }

            if (this._loudnessAnalyzer || this._decoder) {
                self.uiLog(`memory leak: unfreed loudnessAnalyzer/decoder`);
            }

            this.metadata = metadata;
            this._filePosition = this.metadata.dataStart;
            const {sampleRate, channelCount, targetBufferLengthAudioFrames} = this;

            this._decoder = allocDecoderContext(wasm, codecName, codec, {
                targetBufferLengthAudioFrames
            });
            this._decoder.start(metadata);
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
            this.sendMessage(`_blobLoaded`, {requestId, metadata});
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
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
                this.sendMessage(`_error`, {message: `Destroyed`});
                return;
            }
            if (!this.blob) {
                this.sendMessage(`_error`, {message: `No blob loaded`});
                return;
            }

            if (this._bufferFillCancellationToken) {
                return;
            }
            this._fillBuffers(count, -1, BUFFER_FILL_TYPE_NORMAL);
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
        }
    }

    loadReplacement(args) {
        if (this.destroyed) return;
        this.destroyReplacement();
        const cancellationToken = this.cancellationTokenForReplacementOperation();
        try {
            this.replacementSpec = {
                requestId: args.requestId,
                blob: args.blob,
                seekTime: args.seekTime,
                metadata: null,
                preloadBufferCount: args.count,
                gaplessPreload: args.gaplessPreload,
                cancellationToken
            };
            this.replacementSource = new AudioSource(this.backend, -1, this);
            this.replacementSource.loadBlob(args);
        } catch (e) {
            this.destroyReplacement();
            this.passError(e.message, e.stack);
        }
    }

    async seek(args) {
        try {
            const {requestId, count, time} = args;

            if (this.destroyed) {
                this.sendMessage(`_error`, {message: `Destroyed`});
                return;
            }

            if (!this.blob) {
                this.sendMessage(`_error`, {message: `No blob loaded`});
                return;
            }

            const bufferFillOperationCancellationAcknowledgedPromise =
                this._bufferFillOperationCancellationAcknowledged();
            this.cancelAllOperations();

            const cancellationToken = this.cancellationTokenForSeekOperation();
            const seekerResult = await seeker(this.codecName, time, this.metadata, this._decoder, this.fileView);
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
            this.passError(e.message, e.stack, e.name);
        }
    }

    async loadBlob(args) {
        try {
            if (this.destroyed) {
                return;
            }

            if (this._decoder) {
                freeDecoderContext(this.codecName, this._decoder);
                this._decoder = null;
            }

            if (this._loudnessAnalyzer) {
                freeLoudnessAnalyzer(this._loudnessAnalyzer);
                this._loudnessAnalyzer = null;
            }

            this.ended = false;
            this.fileView = this.blob = this.metadata = null;
            this._filePosition = 0;
            this.codecName = ``;

            const {blob} = args;
            if (!(blob instanceof Blob) && !(blob instanceof File)) {
                this.sendMessage(`_error`, {message: `Blob must be a file or blob`});
                return;
            }
            this.fileView = new FileView(blob);
            this.blob = blob;
            const codecName = await getCodecName(this.fileView);

            if (this.destroyed) {
                return;
            }

            if (!codecName) {
                this.fileView = this.blob = null;
                this._errored(new Error(`Codec not supported`));
                return;
            }

            this.codecName = codecName;
            try {
                const codec = await getCodec(codecName);

                if (this.destroyed) {
                    return;
                }

                await this._gotCodec(codec, args.requestId, args.metadata);

                if (this.destroyed) {
                    return;
                }

            } catch (e) {
                this.fileView = this.blob = null;
                this._errored(e);
            }
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
        }
    }

}
