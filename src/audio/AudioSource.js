import AudioProcessingPipeline from "audio/AudioProcessingPipeline";
import {Blob, File} from "platform/platform";
import {allocResampler, allocDecoderContext, freeResampler, freeDecoderContext} from "audio/pool";
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

const noDelayMessageMap = {
    sourceEndedPing: true
};

const obsoletesOtherMessagesMap = {
    seek: true,
    loadBlob: true
};

const priorityMessageMap = {
    loadReplacement: true
};

export default class AudioSource extends CancellableOperations(EventEmitter, `bufferFillOperation`) {
    constructor(backend, id, parent) {
        super();
        this.backend = backend;
        this.id = id;
        this.ended = false;
        this._decoder = null;
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

        this._errored = this._errored.bind(this);
        this._next = this._next.bind(this);
    }

    _clearAllRequestsExceptFirst() {
        for (let i = 1; i < this.messageQueue.length; ++i) {
            const spec = this.messageQueue[i];
            this.backend.sendMessage(-1, `_freeTransferList`, null, spec.transferList);
        }
        this.messageQueue.length = Math.min(this.messageQueue.length, 1);
    }

    _clearAllRequests() {
        for (let i = 0; i < this.messageQueue.length; ++i) {
            const spec = this.messageQueue[i];
            this.backend.sendMessage(-1, `_freeTransferList`, null, spec.transferList);
        }
        this.messageQueue.length = 0;
    }

    _clearFillRequests() {
        if (typeof this.fillBuffers !== `function`) {
            throw new Error(`fillBuffers not found`);
        }
        for (let i = 0; i < this.messageQueue.length; ++i) {
            if (this.messageQueue[i].methodName === `fillBuffers`) {
                const spec = this.messageQueue[i];
                this.backend.sendMessage(-1, `_freeTransferList`, null, spec.transferList);
                this.messageQueue.splice(i, 1);
                i--;
            }
        }
    }

    _clearLoadReplacementRequests() {
        if (typeof this.loadReplacement !== `function`) {
            throw new Error(`loadReplacement not found`);
        }
        for (let i = 0; i < this.messageQueue.length; ++i) {
            if (this.messageQueue[i].methodName === `loadReplacement`) {
                const spec = this.messageQueue[i];
                this.backend.sendMessage(-1, `_freeTransferList`, null, spec.transferList);
                this.messageQueue.splice(i, 1);
                i--;
            }
        }
    }

    async _processMessage(spec) {
        const {methodName, args, transferList} = spec;
        try {
            await this[methodName](args, transferList);
        } finally {
            if (this.messageQueue.length > 0 &&
                this.messageQueue[0] === spec) {
                this.messageQueue.shift();
            }
            this._next();
        }
    }

    _next() {
        if (this.messageQueue.length > 0) {
            this._processMessage(this.messageQueue[0]);
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
        if (noDelayMessageMap[methodName] === true) {
            this[methodName](args, transferList);
            return;
        }

        if (obsoletesOtherMessagesMap[methodName] === true) {
            this.cancelAllBufferFillOperations();
            this._clearAllRequestsExceptFirst();
            this.messageQueue.push(spec);
        } else if (priorityMessageMap[methodName] === true) {
            this._clearLoadReplacementRequests();
            this.messageQueue.splice(1, 0, spec);
        } else {
            this.messageQueue.push(spec);
        }

        if (this.messageQueue.length === 1) {
            this._next();
        }
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

    messageFromReplacement(name, args, transferList) {
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
                this.backend.sendMessage(-1, `_freeTransferList`, {}, spec.transferList);
                this.replacementSpec = null;
            }
            this.replacementSource.destroy();
            this.replacementSource = null;
        }
    }

    loadReplacement(args, transferList) {
        if (this.destroyed) return;
        this.destroyReplacement();
        try {
            this.replacementSpec = {
                requestId: args.requestId,
                blob: args.blob,
                seekTime: args.seekTime,
                transferList,
                metadata: null,
                preloadBufferCount: args.count,
                gaplessPreload: args.gaplessPreload
            };
            this.replacementSource = new AudioSource(this.backend, -1, this);
            this.replacementSource.loadBlob(args);
        } catch (e) {
            this.destroyReplacement();
            this.passError(e.message, e.stack);
        }
    }

    async destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this._clearAllRequests();
        const signal = this._getSignal();
        this.cancelAllBufferFillOperations();
        if (signal) {
            await signal;
        }
        this.parent = null;
        this.destroyReplacement();
        if (this._decoder) {
            freeDecoderContext(this.codecName, this._decoder);
            this._decoder = null;
        }
        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
        }
        this.fileView = null;
        this.codecName = ``;
        this._decoder = this.blob = null;
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

    async gotCodec(codec, requestId, playerMetadata) {
        const {destinationChannelCount,
                destinationSampleRate,
                resamplerQuality,
                bufferTime,
                bufferAudioFrameCount,
                wasm,
                channelMixer,
                effects} = this.backend;
        const {codecName} = this;
        try {
            if (this.destroyed) return;
            const metadata = await demuxer(codecName, this.fileView);

            if (!metadata) {
                this.fileView = this.blob = null;
                this.sendMessage(`_error`, {message: `Invalid ${codec.name} file`});
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
                freeResampler(this.resampler);
                this.resampler = null;
            }

            this._decoder = allocDecoderContext(wasm, codecName, codec, {
                targetBufferLengthAudioFrames: bufferTime * sourceSampleRate
            });

            this._decoder.start(metadata);

            const {resampler, _decoder: decoder} = this;

            this._filePosition = this.metadata.dataStart;
            this._audioPipeline = new AudioProcessingPipeline(wasm, {
                sourceSampleRate, sourceChannelCount,
                destinationSampleRate, destinationChannelCount,
                decoder, resampler,
                channelMixer, effects, bufferTime, bufferAudioFrameCount
            });
            this.sendMessage(`_blobLoaded`, {requestId, metadata});
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
        }
    }

    async loadBlob(args) {
        try {
            if (this.destroyed) return;
            if (this._decoder) {
                freeDecoderContext(this.codecName, this._decoder);
                this._decoder = null;
            }
            if (this.resampler) {
                freeResampler(this.resampler);
                this.resampler = null;
            }
            this.ended = false;
            this.resampler = this.fileView = this._decoder = this.blob = this.metadata = null;
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
            if (!codecName) {
                this.fileView = this.blob = null;
                this.sendMessage(`_error`, {message: `Codec not supported`});
                return;
            }
            this.codecName = codecName;
            try {
                const codec = await getCodec(codecName);
                await this.gotCodec(codec, args.requestId, args.metadata);
            } catch (e) {
                this.fileView = this.blob = null;
                this.sendMessage(`_error`, {message: `Unable to load codec: ${e.message}`});
            }
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
        }
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

    _getSignal() {
        return this._bufferFillCancellationToken && this._bufferFillCancellationToken.getSignal() || null;
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

        let i = 0;
        let currentBufferFillType = bufferFillType;
        try {
            while (i < count) {
                const currentTransferList = this._drainArrayBuffersFromTransferlist(transferList);
                const bufferDescriptor = await this._decodeNextBuffer(currentTransferList,
                                                                      this._bufferFillCancellationToken);

                if (this._bufferFillCancellationToken.isCancelled()) {
                    this._bufferFillCancellationToken.signal();
                    this.backend.sendMessage(-1, `_freeTransferList`, null, transferList.concat(currentTransferList));
                    break;
                }

                if (!bufferDescriptor) {
                    this.backend.sendMessage(-1, `_freeTransferList`, null, transferList.concat(currentTransferList));
                    break;
                }

                const descriptor = {
                    length: bufferDescriptor.length,
                    startTime: bufferDescriptor.startTime,
                    endTime: bufferDescriptor.endTime,
                    fillTypeData: null
                };

                if (currentBufferFillType !== BUFFER_FILL_TYPE_NORMAL) {
                    descriptor.fillTypeData = fillTypeData;
                }

                this._sendFilledBuffer(requestId, descriptor, currentTransferList, currentBufferFillType, this.ended);
                i++;
                currentBufferFillType = BUFFER_FILL_TYPE_NORMAL;

                if (this.ended) {
                    this.backend.sendMessage(-1, `_freeTransferList`, null, transferList);
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
                this.backend.sendMessage(-1, `_freeTransferList`, null, transferList);
                return;
            }
            this._fillBuffers(count, -1, BUFFER_FILL_TYPE_NORMAL, transferList);
        } catch (e) {
            this.passError(e.message, e.stack, e.name, transferList);
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

            this.ended = false;

            if (this.resampler) {
                this.resampler.reset();
            }

            const seekerResult = await seeker(this.codecName, time, this.metadata, this._decoder, this.fileView);
            this._filePosition = seekerResult.offset;
            this._decoder.applySeek(seekerResult);
            const signal = this._getSignal();
            this._clearFillRequests();
            this.cancelAllBufferFillOperations();
            if (signal) {
                await signal;
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
}
