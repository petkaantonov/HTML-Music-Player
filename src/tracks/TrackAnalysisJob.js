import FileView from "platform/FileView";
import getCodec from "audio/backend/codec";
import {allocResampler, freeResampler} from "audio/backend/pool";
import ChannelMixer from "audio/backend/ChannelMixer";
import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import Fingerprinter from "audio/backend/Fingerprinter";
import {MAX_BUFFER_LENGTH_SECONDS as MAXIMUM_BUFFER_TIME_SECONDS} from "audio/frontend/buffering";
import CancellableOperations from "utils/CancellationToken";

const BUFFER_DURATION = MAXIMUM_BUFFER_TIME_SECONDS;

export class TrackAnalysisError extends Error {
    constructor(msg) {
        super(msg);
        this.name = `TrackAnalysisError`;
    }
}

export default class TrackAnalysisJob extends CancellableOperations(null, `analysisOperation`) {
    constructor(backend, file, uid) {
        super();
        this.uid = uid;
        this.backend = backend;
        this.file = file;
        this.cancellationToken = null;
        this.decoder = null;
        this.resampler = null;
        this.decodedChannelData = null;
        this.fingerprinter = null;
        this.channelMixer = null;
        this.metadata = null;
        this.fileView = null;
        this.codec = null;
        this.audioPipeline = null;
    }

    get sourceSampleRate() {
        return this.metadata.demuxData.sampleRate;
    }

    get sourceChannelCount() {
        return this.metadata.demuxData.channels;
    }

    get shouldComputeFingerprint() {
        return this.metadata.demuxData.duration >= 7;
    }

    async analyze() {
        this.cancellationToken = this.cancellationTokenForAnalysisOperation();
        const {file, backend} = this;
        const {metadataParser} = backend;
        const fileView = new FileView(file);
        this.fileView = fileView;
        const metadata = await metadataParser.getCachedMetadata(file);
        this.cancellationToken.check();
        if (!metadata) {
            throw new TrackAnalysisError(`file type not supported`);
        }
        this.metadata = metadata;

        const codec = await getCodec(metadata.codecName);
        this.cancellationToken.check();
        if (!codec) {
            throw new TrackAnalysisError(`no codec for ${metadata.codecName}`);
        }
        this.codec = codec;

        return this._analyze();
    }

    async _analyze() {
        const {sourceSampleRate, sourceChannelCount, metadata,
                shouldComputeFingerprint, fileView, file, codec} = this;
        const {wasm} = this.backend;
        const {demuxData} = metadata;
        const {duration, dataStart, dataEnd} = demuxData;

        const result = {
            fingerprint: null
        };

        if (!shouldComputeFingerprint) {
            return result;
        }

        const tooLongToScan = duration ? duration > 30 * 60 : file.size > 100 * 1024 * 1024;
        if (tooLongToScan) {
            return result;
        }

        const decoder = this.decoder = new codec(wasm, {
            targetBufferLengthAudioFrames: BUFFER_DURATION * sourceSampleRate
        });
        decoder.start(demuxData);


        this.fingerprinter = new Fingerprinter(wasm);
        const {destinationChannelCount, destinationSampleRate, resamplerQuality} = this.fingerprinter;
        this.resampler = allocResampler(wasm,
                                        destinationChannelCount,
                                        sourceSampleRate,
                                        destinationSampleRate,
                                        resamplerQuality);
        this.channelMixer = new ChannelMixer(wasm, {destinationChannelCount});

        this.audioPipeline = new AudioProcessingPipeline(wasm, {
            sourceSampleRate, sourceChannelCount,
            destinationSampleRate, destinationChannelCount,
            decoder,
            resampler: this.resampler,
            channelMixer: this.channelMixer,
            bufferTime: BUFFER_DURATION,
            bufferAudioFrameCount: destinationSampleRate * BUFFER_DURATION,
            fingerprinter: this.fingerprinter
        });

        const fileStartPosition = dataStart;
        let filePosition = fileStartPosition;
        const fileEndPosition = dataEnd;
        while (filePosition < fileEndPosition && this.fingerprinter.needFrames()) {
            const bytesRead = await this.audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                  filePosition,
                                                                                  demuxData,
                                                                                  this.cancellationToken);
            this.cancellationToken.check();
            this.audioPipeline.consumeFilledBuffer();

            filePosition += bytesRead;
        }
        result.fingerprint = this.fingerprinter.calculateFingerprint();

        return result;
    }

    abort() {
        this.cancelAllAnalysisOperations();
    }

    destroy() {
        this.backend = null;
        this.file = null;
        this.cancellationToken = null;
        if (this.decoder) {
            this.decoder.destroy();
            this.decoder = null;
        }

        if (this.resampler) {
            freeResampler(this.resampler);
            this.resampler = null;
        }

        if (this.fingerprinter) {
            this.fingerprinter.destroy();
            this.fingerprinter = null;
        }

        if (this.channelMixer) {
            this.channelMixer.destroy();
            this.channelMixer = null;
        }
    }
}
