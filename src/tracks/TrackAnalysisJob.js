import FileView from "platform/FileView";
import demuxer from "audio/demuxer";
import getCodec from "audio/codec";
import getCodecName from "audio/sniffer";
import {allocResampler, allocDecoderContext, freeResampler, freeDecoderContext} from "audio/pool";
import LoudnessAnalyzer from "audio/LoudnessAnalyzer";
import ChannelMixer from "audio/ChannelMixer";
import AudioProcessingPipeline from "audio/AudioProcessingPipeline";
import Fingerprinter from "audio/Fingerprinter";
import {MAXIMUM_BUFFER_TIME_SECONDS} from "audio/DecoderContext";
import CancellableOperations from "utils/CancellationToken";

const BUFFER_DURATION = MAXIMUM_BUFFER_TIME_SECONDS;

export class TrackAnalysisError extends Error {}

export default class TrackAnalysisJob extends CancellableOperations(null, `analysisOperation`) {
    constructor(backend, {id, file, loudness, fingerprint, uid}) {
        super();
        this.backend = backend;
        this.id = id;
        this.file = file;
        this.loudness = loudness;
        this.fingerprint = fingerprint;
        this.uid = uid;

        this.cancellationToken = null;
        this.decoder = null;
        this.codecName = null;
        this.resampler = null;
        this.decodedChannelData = null;
        this.fingerprinter = null;
        this.loudnessAnalyzer = null;
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

    get shouldComputeLoudness() {
        return !!this.loudness;
    }

    get shouldComputeFingerprint() {
        return this.fingerprint && this.metadata.duration >= 7;
    }

    get targetCpuUtilization() {
        return this.backend.cpuUtilization;
    }

    getDowntime(cpuUsedTime) {
        return cpuUsedTime / this.targetCpuUtilization - cpuUsedTime;
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
                shouldComputeFingerprint, shouldComputeLoudness, fileView, id, file,
                codecName, codec} = this;
        const {wasm} = this.backend;
        const result = {
            loudness: null,
            fingerprint: null,
            duration: metadata.duration
        };

        const tooLongToScan = metadata.duration ? metadata.duration > 30 * 60 : file.size > 100 * 1024 * 1024;
        if (tooLongToScan) {
            return result;
        }

        const decoder = this.decoder = allocDecoderContext(wasm, codecName, codec, {
            targetBufferLengthAudioFrames: BUFFER_DURATION * sourceSampleRate
        });

        decoder.start(metadata);

        if (shouldComputeLoudness) {
            this.loudnessAnalyzer = new LoudnessAnalyzer(wasm, sourceChannelCount, sourceSampleRate);
        }

        let destinationChannelCount = sourceChannelCount;
        let destinationSampleRate = sourceSampleRate;
        let resamplerQuality;
        if (shouldComputeFingerprint) {
            this.fingerprinter = new Fingerprinter(wasm);
            ({destinationChannelCount, destinationSampleRate, resamplerQuality} = this.fingerprinter);
            this.resampler = allocResampler(wasm,
                                            destinationChannelCount,
                                            sourceSampleRate,
                                            destinationSampleRate,
                                            resamplerQuality);
            this.channelMixer = new ChannelMixer(wasm, {destinationChannelCount});
        }

        this.audioPipeline = new AudioProcessingPipeline(wasm, {
            sourceSampleRate, sourceChannelCount,
            destinationSampleRate, destinationChannelCount,
            decoder,
            resampler: this.resampler,
            channelMixer: this.channelMixer,
            bufferTime: BUFFER_DURATION,
            bufferAudioFrameCount: destinationSampleRate * BUFFER_DURATION,
            fingerprinter: this.fingerprinter,
            loudnessAnalyzer: this.loudnessAnalyzer
        });

        const fileStartPosition = metadata.dataStart;
        let filePosition = fileStartPosition;
        const fileEndPosition = metadata.dataEnd;
        let progress = 0;
        let previousProgress = 0;
        while (filePosition < fileEndPosition) {
            const bytesRead = await this.audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                  filePosition,
                                                                                  metadata,
                                                                                  this.cancellationToken);
            this.cancellationToken.check();
            this.audioPipeline.consumeFilledBuffer();

            filePosition += bytesRead;

            progress = (filePosition - fileStartPosition) / (fileEndPosition - fileStartPosition);
            if (progress - previousProgress > 0.02) {
                this.backend.reportProgress(id, progress);
                previousProgress = progress;
            }
        }

        if (this.fingerprinter) {
            result.fingerprint = this.fingerprinter.calculateFingerprint();
        }

        if (this.loudnessAnalyzer) {
            result.loudness = this.loudnessAnalyzer.getLoudnessAnalysis();
        }

        return {
            duration: result.duration,
            loudness: result.loudness,
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

        if (this.loudnessAnalyzer) {
            this.loudnessAnalyzer.destroy();
            this.loudnessAnalyzer = null;
        }

        if (this.channelMixer) {
            this.channelMixer.destroy();
            this.channelMixer = null;
        }
    }
}
