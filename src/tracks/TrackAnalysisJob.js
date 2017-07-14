import FileView from "platform/FileView";
import demuxer from "audio/backend/demuxer";
import getCodec from "audio/backend/codec";
import getCodecName from "audio/backend/sniffer";
import {allocResampler, allocDecoderContext, freeResampler, freeDecoderContext} from "audio/backend/pool";
import ChannelMixer from "audio/backend/ChannelMixer";
import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import Fingerprinter from "audio/backend/Fingerprinter";
import {MAXIMUM_BUFFER_TIME_SECONDS} from "audio/backend/DecoderContext";
import CancellableOperations from "utils/CancellationToken";

const BUFFER_DURATION = MAXIMUM_BUFFER_TIME_SECONDS;

export class TrackAnalysisError extends Error {
    constructor(msg) {
        super(msg);
        this.name = `TrackAnalysisError`;
    }
}

export default class TrackAnalysisJob extends CancellableOperations(null, `analysisOperation`) {
    constructor(backend, file) {
        super();
        this.backend = backend;
        this.file = file;

        this.cancellationToken = null;
        this.decoder = null;
        this.codecName = null;
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
        return this.metadata.sampleRate;
    }

    get sourceChannelCount() {
        return this.metadata.channels;
    }

    get shouldComputeFingerprint() {
        return this.metadata.duration >= 7;
    }

    async analyze() {
        this.cancellationToken = this.cancellationTokenForAnalysisOperation();
        const {file} = this;
        const fileView = new FileView(file);
        this.fileView = fileView;
        const codecName = await getCodecName(fileView);
        this.cancellationToken.check();
        if (!codecName) {
            throw new TrackAnalysisError(`file type not supported`);
        }
        this.codecName = codecName;

        const codec = await getCodec(codecName);
        this.cancellationToken.check();
        if (!codec) {
            throw new TrackAnalysisError(`no codec for ${codecName}`);
        }
        this.codec = codec;

        const metadata = await demuxer(codecName, fileView);
        this.cancellationToken.check();
        if (!metadata) {
            throw new TrackAnalysisError(`file type not supported`);
        }
        this.metadata = metadata;
        return this._analyze();
    }

    async _analyze() {
        const {sourceSampleRate, sourceChannelCount, metadata,
                shouldComputeFingerprint, fileView, file,
                codecName, codec} = this;
        const {wasm} = this.backend;
        const result = {
            fingerprint: null,
            duration: metadata.duration
        };

        if (!shouldComputeFingerprint) {
            return result;
        }

        const tooLongToScan = metadata.duration ? metadata.duration > 30 * 60 : file.size > 100 * 1024 * 1024;
        if (tooLongToScan) {
            return result;
        }

        const decoder = this.decoder = allocDecoderContext(wasm, codecName, codec, {
            targetBufferLengthAudioFrames: BUFFER_DURATION * sourceSampleRate
        });

        decoder.start(metadata);


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

        const fileStartPosition = metadata.dataStart;
        let filePosition = fileStartPosition;
        const fileEndPosition = metadata.dataEnd;
        while (filePosition < fileEndPosition && this.fingerprinter.needFrames()) {
            const bytesRead = await this.audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                  filePosition,
                                                                                  metadata,
                                                                                  this.cancellationToken);
            this.cancellationToken.check();
            this.audioPipeline.consumeFilledBuffer();

            filePosition += bytesRead;
        }
        result.fingerprint = this.fingerprinter.calculateFingerprint();

        return {
            duration: result.duration,
            fingerprint: result.fingerprint
        };
    }

    abort() {
        this.cancelAllAnalysisOperations();
    }

    destroy() {
        this.backend = null;
        this.file = null;
        this.cancellationToken = null;
        if (this.decoder) {
            freeDecoderContext(this.codecName, this.decoder);
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
