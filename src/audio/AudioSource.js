import AudioProcessingPipeline from "audio/AudioProcessingPipeline";
import {Blob, File} from "platform/platform";
import {allocResampler, allocDecoderContext, allocLoudnessAnalyzer,
        freeResampler, freeDecoderContext, freeLoudnessAnalyzer} from "audio/pool";
import EventEmitter from "events";
import FileView from "platform/FileView";
import seeker from "audio/seeker";
import getCodecName from "audio/sniffer";
import getCodec from "audio/codec";
import demuxer from "audio/demuxer";
import CancellableOperations from "utils/CancellationToken";

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
        this.resampler = null;
        this.replacementSource = null;
        this.replacementSpec = null;
        this.parent = parent || null;
        this.messageQueue = [];
        this._processingMessage = false;

        this._errored = this._errored.bind(this);
        this._next = this._next.bind(this);
    }

    _freeTransferList(transferList) {
        this.backend.sendMessage(-1, `_freeTransferList`, null, transferList);
    }

    _clearQueue() {
        for (let i = 0; i < this.messageQueue.length; ++i) {
            const spec = this.messageQueue[i];
            this._freeTransferList(spec.transferList);
        }
        this.messageQueue.length = 0;
    }

    async _next() {
        if (!this._processingMessage && this.messageQueue.length > 0) {
            const {methodName, args, transferList} = this.messageQueue.shift();
            try {
                this._processingMessage = true;
                await this[methodName](args, transferList);
            } finally {
                this._processingMessage = false;
                this._next();
            }
        }
    }

    _passReplacementBuffer(spec, args, bufferTransferList) {
        const {metadata, gaplessPreload, requestId} = spec;
        const {descriptor: bufferDescriptor} = args;
        const {baseTime} = bufferDescriptor.fillTypeData;
        const fillTypeData = {metadata, gaplessPreload, requestId, baseTime};
        const descriptor = {
            length: bufferDescriptor.length,
            startTime: bufferDescriptor.startTime,
            endTime: bufferDescriptor.endTime,
            loudness: bufferDescriptor.loudness,
            fillTypeData
        };
        this._sendFilledBuffer(requestId,
                               descriptor,
                               bufferTransferList,
                               BUFFER_FILL_TYPE_REPLACEMENT,
                               false);
    }

    newMessage(spec) {
        const {methodName, args, transferList} = spec;

        if (overridingMessage[methodName] === true) {
            this.cancelAllOperations();
            this._clearQueue();
        }

        if (queuedMessage[methodName] === true) {
            this.messageQueue.push(spec);
        } else {
            this[methodName](args, transferList);
        }
        this._next();
    }

    getBlobSize() {
        return this.blob.size;
    }

    sendMessage(name, args, transferList) {
        if (this.destroyed) return;
        if (this.parent === null || this.parent === undefined) {
            this.backend.sendMessage(this.id, name, args, transferList);
        } else {
            this.parent.messageFromReplacement(name, args, transferList, this);
        }
    }

    messageFromReplacement(name, args, transferList, sender) {
        if (sender !== this.replacementSource) {
            sender.destroy();
            this._freeTransferList(transferList);
            return;
        }

        const {cancellationToken} = this.replacementSpec;

        if (cancellationToken.isCancelled()) {
            this._freeTransferList(transferList);
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
            }, this.replacementSpec.transferList);
        break;

        case `_bufferFilled`: {
            const spec = this.replacementSpec;
            this.replacementSpec = null;
            this.backend.transferSourceId(this, this.replacementSource);
            this.replacementSource.parent = null;
            try {
                this.replacementSource._passReplacementBuffer(spec, args, transferList);
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
                this._freeTransferList(spec.transferList);
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

        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
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

    passError(errorMessage, stack, name, transferList) {
        this.sendMessage(`_error`, {
            message: errorMessage,
            stack,
            name
        }, transferList);
    }

    _errored(e) {
        this.passError(e.message, e.stack, e.name);
    }

    async _decodeNextBuffer(transferList, cancellationToken) {
        const bytesRead = await this._audioPipeline.decodeFromFileViewAtOffset(this.fileView,
                                                                               this._filePosition,
                                                                               this.metadata,
                                                                               cancellationToken,
                                                                               {transferList});
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

    _sendFilledBuffer(requestId, descriptor, transferList, bufferFillType, isLastBuffer = false) {
        this.sendMessage(`_bufferFilled`,
                        {requestId, descriptor, isLastBuffer, bufferFillType},
                        transferList);
    }

    _drainArrayBuffersFromTransferlist(transferList) {
        const buffersNeeded = this.backend.destinationChannelCount;
        const ret = [];
        while (ret.length < buffersNeeded) {
            ret.push(transferList.shift());
        }
        return ret;
    }

    _bufferFillOperationCancellationAcknowledged() {
        return this._bufferFillCancellationToken && this._bufferFillCancellationToken.getSignal() || Promise.resolve();
    }

    async _fillBuffers(count, requestId, bufferFillType, transferList, fillTypeData = null) {
        if (this.ended) {
            this._sendFilledBuffer(requestId, null, transferList, bufferFillType, true);
            return;
        }

        if (this._bufferFillCancellationToken) {
            throw new Error(`invalid parallel buffer fill loop`);
        }

        this._bufferFillCancellationToken = this.cancellationTokenForBufferFillOperation();

        const {trackMetadata} = this.metadata;
        let i = 0;
        let currentBufferFillType = bufferFillType;
        try {
            while (i < count) {
                const currentTransferList = this._drainArrayBuffersFromTransferlist(transferList);
                const bufferDescriptor = await this._decodeNextBuffer(currentTransferList,
                                                                      this._bufferFillCancellationToken);

                if (this._bufferFillCancellationToken.isCancelled()) {
                    this._bufferFillCancellationToken.signal();
                    this._freeTransferList(transferList.concat(currentTransferList));
                    break;
                }

                if (!bufferDescriptor) {
                    this._freeTransferList(transferList.concat(currentTransferList));
                    break;
                }


                let loudness = bufferDescriptor.loudness;
                if (!trackMetadata.establishedGain &&
                    this._loudnessAnalyzer.hasEstablishedGain()) {
                    trackMetadata.establishedGain = this._loudnessAnalyzer.getEstablishedGain();
                    this.backend.metadataParser.updateCachedMetadata(this.blob, trackMetadata);
                } else if (trackMetadata.establishedGain &&
                           !this._loudnessAnalyzer.hasEstablishedGain()) {
                    loudness = trackMetadata.establishedGain;
                }

                const descriptor = {
                    length: bufferDescriptor.length,
                    startTime: bufferDescriptor.startTime,
                    endTime: bufferDescriptor.endTime,
                    loudness,
                    fillTypeData: null
                };

                if (currentBufferFillType !== BUFFER_FILL_TYPE_NORMAL) {
                    descriptor.fillTypeData = fillTypeData;
                }

                this._sendFilledBuffer(requestId, descriptor, currentTransferList, currentBufferFillType, this.ended);
                i++;
                currentBufferFillType = BUFFER_FILL_TYPE_NORMAL;

                if (this.ended) {
                    this._freeTransferList(transferList);
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
        const {destinationChannelCount,
                destinationSampleRate,
                resamplerQuality,
                bufferTime,
                bufferAudioFrameCount,
                wasm,
                channelMixer,
                effects,
                metadataParser} = this.backend;
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


            this.metadata = metadata;
            const {sampleRate: sourceSampleRate,
                   channels: sourceChannelCount} = metadata;

            if (sourceSampleRate !== destinationSampleRate) {
                this.resampler = allocResampler(wasm,
                                                destinationChannelCount,
                                                sourceSampleRate,
                                                destinationSampleRate,
                                                resamplerQuality);
            } else if (this.resampler) {
                console.warn(`should not have resampler`);
                freeResampler(this.resampler);
                this.resampler = null;
            }

            this._decoder = allocDecoderContext(wasm, codecName, codec, {
                targetBufferLengthAudioFrames: bufferTime * sourceSampleRate
            });

            this._decoder.start(metadata);

            this._loudnessAnalyzer = allocLoudnessAnalyzer(wasm, sourceChannelCount, sourceSampleRate, 20 * 1000);

            const {resampler, _decoder: decoder, _loudnessAnalyzer: loudnessAnalyzer} = this;

            this._filePosition = this.metadata.dataStart;
            this._audioPipeline = new AudioProcessingPipeline(wasm, {
                sourceSampleRate, sourceChannelCount,
                destinationSampleRate, destinationChannelCount,
                decoder, resampler, loudnessAnalyzer,
                channelMixer, effects, bufferTime, bufferAudioFrameCount
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

    fillBuffers({count}, transferList) {
        try {
            if (this.destroyed) {
                this.sendMessage(`_error`, {message: `Destroyed`}, transferList);
                return;
            }
            if (!this.blob) {
                this.sendMessage(`_error`, {message: `No blob loaded`}, transferList);
                return;
            }

            if (this._bufferFillCancellationToken) {
                this._freeTransferList(transferList);
                return;
            }
            this._fillBuffers(count, -1, BUFFER_FILL_TYPE_NORMAL, transferList);
        } catch (e) {
            this.passError(e.message, e.stack, e.name, transferList);
        }
    }

    loadReplacement(args, transferList) {
        if (this.destroyed) return;
        this.destroyReplacement();
        const cancellationToken = this.cancellationTokenForReplacementOperation();
        try {
            this.replacementSpec = {
                requestId: args.requestId,
                blob: args.blob,
                seekTime: args.seekTime,
                transferList,
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

    async seek(args, transferList) {
        try {
            const {requestId, count, time} = args;

            if (this.destroyed) {
                this.sendMessage(`_error`, {message: `Destroyed`}, transferList);
                return;
            }

            if (!this.blob) {
                this.sendMessage(`_error`, {message: `No blob loaded`}, transferList);
                return;
            }

            const bufferFillOperationCancellationAcknowledgedPromise =
                this._bufferFillOperationCancellationAcknowledged();
            this.cancelAllOperations();

            const cancellationToken = this.cancellationTokenForSeekOperation();
            const seekerResult = await seeker(this.codecName, time, this.metadata, this._decoder, this.fileView);
            if (cancellationToken.isCancelled()) {
                this._freeTransferList(transferList);
                return;
            }

            this._filePosition = seekerResult.offset;
            this._decoder.applySeek(seekerResult);

            await bufferFillOperationCancellationAcknowledgedPromise;

            if (cancellationToken.isCancelled()) {
                this._freeTransferList(transferList);
                return;
            }

            this.ended = false;
            if (this.resampler) {
                this.resampler.reset();
            }

            this._fillBuffers(count, requestId, BUFFER_FILL_TYPE_SEEK, transferList, {
                baseTime: seekerResult.time,
                isUserSeek: args.isUserSeek,
                requestId
            });
        } catch (e) {
            this.passError(e.message, e.stack, e.name, transferList);
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

            if (this.resampler) {
                freeResampler(this.resampler);
                this.resampler = null;
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
