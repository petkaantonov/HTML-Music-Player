import EventEmitter from "events";
import AudioProcessingPipeline from "audio/AudioProcessingPipeline";
import {Blob, File} from "platform/platform";
import {allocResampler, allocDecoderContext, freeResampler, freeDecoderContext} from "audio/pool";
import FileView from "platform/FileView";
import seeker from "audio/seeker";
import getCodecName from "audio/sniffer";
import getCodec from "audio/codec";
import demuxer from "audio/demuxer";

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

export default class AudioSource extends EventEmitter {
    constructor(backend, id, parent) {
        super();
        this.backend = backend;
        this.id = id;
        this.ended = false;
        this._decoder = null;
        this.blob = null;
        this._filePosition = 0;
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
        this.bufferFillId = 0;

        this._errored = this._errored.bind(this);
        this._next = this._next.bind(this);
    }

    transfer(other) {
        if (this._decoder) {
            freeDecoderContext(this.codecName, this._decoder);
            this._decoder = null;
        }
        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
        }

        this.ended = other.ended;
        this.blob = other.blob;
        this.fileView = other.fileView;
        this.metadata = other.metadata;
        this.codecName = other.codecName;
        this._decoder = other._decoder;
        this._filePosition = other._filePosition;
        this._audioPipeline = other._audioPipeline;
        this.resampler = other.resampler;

        other._decoder = null;
        other.resampler = null;
        other.fileView = null;
        other.blob = null;
        other.metadata = null;
        other._audioPipeline = null;
        other.destroy();
    }

    _abortPendingBufferFills() {
        this.bufferFillId++;
    }

    _clearAllRequestsExceptFirst() {
        for (let i = 1; i < this.messageQueue.length; ++i) {
            const spec = this.messageQueue[i];
            this.backend.sendMessage(-1, `_freeTransferList`, null, spec.transferList);
        }
        this.messageQueue.length = Math.min(this.messageQueue.length, 1);
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


    newMessage(spec) {
        const {methodName, args, transferList} = spec;
        if (noDelayMessageMap[methodName] === true) {
            this[methodName](args, transferList);
            return;
        }

        if (obsoletesOtherMessagesMap[methodName] === true) {
            this._abortPendingBufferFills();
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

    messageFromReplacement(name, args, transferList, sender) {
        if (args.requestId === undefined) {
            this.destroyReplacement();
            this.passError(args.message, args.stack);
            return;
        } else if (this.replacementSpec.requestId !== args.requestId ||
            this.replacementSource !== sender) {
            sender.destroy();
            this.backend.sendMessage(-1, `_freeTransferList`, args, transferList);
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

        case `_seeked`: {
            const spec = this.replacementSpec;
            const {metadata, requestId, gaplessPreload} = spec;
            const {isUserSeek, baseTime, count, channelCount, info} = args;
            this.replacementSpec = null;
            this._abortPendingBufferFills();
            this._clearAllRequestsExceptFirst();
            this.transfer(this.replacementSource);
            this.replacementSource.parent = null;
            this.replacementSource = null;
            this.sendMessage(`_replacementLoaded`, {
                metadata,
                requestId,
                isUserSeek,
                gaplessPreload,
                baseTime,
                count,
                channelCount,
                info
            }, transferList);
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

    destroy() {
        if (this.destroyed) return;
        this._abortPendingBufferFills();
        this._clearAllRequestsExceptFirst();
        this.parent = null;
        this.destroyReplacement();
        this.destroyed = true;
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
        this.metadata = null;
        this.ended = false;
        this.emit(`destroy`);
        this.removeAllListeners();
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
        let {destinationChannelCount,
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

    async _decodeNextBuffer(transferList, transferListIndex) {
        const id = this.bufferFillId;
        const bytesRead = await this._audioPipeline.decodeFromFileViewAtOffset(this.fileView,
                                                                               this._filePosition,
                                                                               this.metadata,
                                                                               {transferList, transferListIndex});
        // Request for decoding has been abandoned while waiting
        if (id !== this.bufferFillId) {
            return null;
        }
        this._filePosition += bytesRead;
        this.ended = this._filePosition >= this.metadata.dataEnd;
        return this._audioPipeline.consumeFilledBuffer();
    }

    async _fillBuffers(count, requestId, transferList) {
        const id = this.bufferFillId;
        const {channelMixer} = this.backend;
        if (this.ended) {
            return {
                requestId,
                channelCount: channelMixer.getChannels(),
                count: 0,
                info: [],
                trackEndingBufferIndex: -1
            };
        }

        const result = {
            requestId,
            channelCount: channelMixer.getChannels(),
            count: 0,
            info: [],
            trackEndingBufferIndex: -1
        };

        let transferListIndex = 0;
        let i = 0;

        while (i < count) {
            const bufferDescriptor = await this._decodeNextBuffer(transferList, transferListIndex);
            if (!bufferDescriptor) {
                this.backend.sendMessage(-1, `_freeTransferList`, null, transferList);
                return null;
            }

            transferListIndex += bufferDescriptor.destinationChannelCount;
            result.info.push({
                length: bufferDescriptor.length,
                startTime: bufferDescriptor.startTime,
                endTime: bufferDescriptor.endTime
            });
            result.count++;

            if (this.ended) {
                result.trackEndingBufferIndex = i;
                break;
            }

            if (this.bufferFillId !== id) {
                this.backend.sendMessage(-1, `_freeTransferList`, null, transferList);
                return null;
            }
            i++;
        }
        return result;

    }

    async fillBuffers(args, transferList) {
        try {
            const {count} = args;
            if (this.destroyed) {
                this.sendMessage(`_error`, {message: `Destroyed`}, transferList);
                return;
            }
            if (!this.blob) {
                this.sendMessage(`_error`, {message: `No blob loaded`}, transferList);
                return;
            }

            const result = await this._fillBuffers(count, -1, transferList);
            if (result) {
                this.sendMessage(`_buffersFilled`, result, transferList);
            }
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
            const result = await this._fillBuffers(count, requestId, transferList);
            if (result) {
                result.baseTime = seekerResult.time;
                result.isUserSeek = args.isUserSeek;
                this._clearFillRequests();
                this.sendMessage(`_seeked`, result, transferList);
            }
        } catch (e) {
            this.passError(e.message, e.stack, e.name, transferList);
        }
    }

    sourceEndedPing(args) {
        try {
            if (this.destroyed) return;
            this.sendMessage(`_sourceEndedPong`, {requestId: args.requestId});
        } catch (e) {
            this.passError(e.message, e.stack, e.name);
        }
    }
}
