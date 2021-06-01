import { CancellationToken } from "shared//utils/CancellationToken";
import { ChannelData, CURVE_LENGTH, getCurve } from "shared/audio";
import { debugFor } from "shared/debug";
import { TrackMetadata } from "shared/metadata";
import FileView from "shared/platform/FileView";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";
import ChannelMixer, { ChannelCount } from "shared/worker/ChannelMixer";

import { Decoder } from "./codec";
import Crossfader from "./Crossfader";
import Effects from "./Effects";
import Fingerprinter from "./Fingerprinter";
import LoudnessAnalyzer, { defaultLoudnessInfo, LoudnessInfo } from "./LoudnessAnalyzer";
import Resampler from "./Resampler";
const dbg = debugFor("AudioProcessingPipeline");

const FADE_IN_CURVE = getCurve(new Float32Array(CURVE_LENGTH + 1), 0.2, 1);
const FLOAT_BYTE_LENGTH = 4;

class FilledBufferDescriptor {
    length: number;
    startFrames: number;
    endFrames: number;
    channelData: ChannelData | null;
    loudnessInfo: LoudnessInfo;
    constructor(
        length: number,
        startFrames: number,
        endFrames: number,
        channelData: ChannelData | null,
        loudnessInfo: LoudnessInfo
    ) {
        this.length = length;
        this.startFrames = startFrames;
        this.endFrames = endFrames;
        this.channelData = channelData;
        this.loudnessInfo = loudnessInfo;
    }
}

interface AudioProcessingPipelineOpts {
    sourceSampleRate: number;
    sourceChannelCount: ChannelCount;
    destinationSampleRate: number;
    destinationChannelCount: ChannelCount;
    decoder: Decoder;
    channelMixer?: ChannelMixer;
    effects?: Effects;
    resampler?: Resampler;
    fingerprinter?: Fingerprinter;
    loudnessAnalyzer?: LoudnessAnalyzer;
    loudnessNormalizer?: LoudnessAnalyzer;
    crossfader?: Crossfader;
    duration: number;
    bufferTime: number;
    bufferAudioFrameCount: number;
}

export default class AudioProcessingPipeline {
    _wasm: WebAssemblyWrapper;
    _filledBufferDescriptor: null | FilledBufferDescriptor;
    sourceSampleRate: number;
    sourceChannelCount: ChannelCount;
    destinationSampleRate: number;
    destinationChannelCount: ChannelCount;
    decoder: Decoder;
    channelMixer?: ChannelMixer;
    effects?: Effects;
    resampler?: Resampler;
    loudnessAnalyzer?: LoudnessAnalyzer;
    loudnessNormalizer?: LoudnessAnalyzer;
    fingerprinter?: Fingerprinter;
    bufferTime: number;
    bufferAudioFrameCount: number;
    totalDuration: number;
    crossfader?: Crossfader;
    constructor(
        wasm: WebAssemblyWrapper,
        {
            sourceSampleRate,
            sourceChannelCount,
            destinationSampleRate,
            destinationChannelCount,
            decoder,
            channelMixer,
            effects,
            resampler,
            fingerprinter,
            loudnessAnalyzer,
            loudnessNormalizer,
            crossfader,
            duration,
            bufferTime,
            bufferAudioFrameCount,
        }: AudioProcessingPipelineOpts
    ) {
        this._wasm = wasm;
        this._filledBufferDescriptor = null;

        this.sourceSampleRate = sourceSampleRate;
        this.sourceChannelCount = sourceChannelCount;
        this.destinationSampleRate = destinationSampleRate;
        this.destinationChannelCount = destinationChannelCount;
        this.decoder = decoder;
        this.channelMixer = channelMixer;
        this.effects = effects;
        this.resampler = resampler;
        this.loudnessAnalyzer = loudnessAnalyzer;
        this.loudnessNormalizer = loudnessNormalizer;
        this.fingerprinter = fingerprinter;
        this.bufferTime = bufferTime;
        this.bufferAudioFrameCount = bufferAudioFrameCount;
        this.totalDuration = duration;
        this.crossfader = crossfader;
    }

    get hasFilledBuffer() {
        return !!this._filledBufferDescriptor;
    }

    setBufferTime(bufferTime: number) {
        this.bufferTime = bufferTime;
        this.bufferAudioFrameCount = (bufferTime * this.destinationSampleRate) | 0;
    }

    dropFilledBuffer() {
        this._filledBufferDescriptor = null;
    }

    consumeFilledBuffer() {
        const ret = this._filledBufferDescriptor;
        if (!ret) {
            throw new Error(`buffer has not been filled`);
        }
        this._filledBufferDescriptor = null;
        return ret;
    }

    async decodeFromFileViewAtOffset(
        fileView: FileView,
        filePosition: number,
        metadata: TrackMetadata,
        cancellationToken: CancellationToken<any>,
        fadeInSeconds: number,
        outputSpec: { channelData: ChannelData } | null = null,
        paddingFactorHint: number = 1
    ) {
        if (this.hasFilledBuffer) {
            throw new Error(`previous buffer has not been consumed`);
        }

        const dataEndFilePosition = metadata.dataEnd;
        let totalBytesRead = 0;
        let dataRemaining = dataEndFilePosition - (filePosition + totalBytesRead);
        const { bufferTime, sourceSampleRate } = this;
        const bytesToRead = bufferTime * sourceSampleRate * Math.ceil(metadata.maxByteSizePerAudioFrame);
        const currentAudioFrame = this.decoder.getCurrentAudioFrame();
        const onFlush = (samplePtr: number, byteLength: number) => {
            const samplesProcessed = this._processSamples(
                samplePtr,
                byteLength,
                outputSpec,
                currentAudioFrame,
                fadeInSeconds
            );
            if (fadeInSeconds > 0) {
                fadeInSeconds = Math.max(0, fadeInSeconds - samplesProcessed / this.destinationSampleRate);
            }
        };

        let currentFilePosition = filePosition + totalBytesRead;
        while (dataRemaining > 0) {
            await fileView.readBlockOfSizeAt(bytesToRead, currentFilePosition, cancellationToken, paddingFactorHint);
            cancellationToken.check();

            const srcStart = currentFilePosition - fileView.start;
            const src = fileView.blockAtOffset(srcStart);
            const bytesRead = this.decoder.decodeUntilFlush(src, onFlush);
            totalBytesRead += bytesRead;
            currentFilePosition = filePosition + totalBytesRead;
            dataRemaining = dataEndFilePosition - currentFilePosition;

            if (!this.hasFilledBuffer) {
                if (dataRemaining > 0) {
                    if (bytesRead > 0) {
                        continue;
                    } else {
                        this.decoder.end(onFlush);
                        totalBytesRead = dataEndFilePosition - filePosition;
                        return totalBytesRead;
                    }
                } else {
                    this.decoder.end(onFlush);
                    totalBytesRead = dataEndFilePosition - filePosition;
                    return totalBytesRead;
                }
            }

            if (!this.hasFilledBuffer) {
                throw new Error(`decoder error`);
            }
            return totalBytesRead;
        }
        return totalBytesRead;
    }

    _processSamples(
        samplePtr: number,
        byteLength: number,
        outputSpec: { channelData: ChannelData } | null,
        startAudioFrame: number,
        fadeInSeconds: number
    ) {
        const {
            sourceSampleRate,
            sourceChannelCount,
            destinationSampleRate,
            destinationChannelCount,
            channelMixer,
            effects,
            resampler,
            loudnessAnalyzer,
            loudnessNormalizer,
            fingerprinter,
            crossfader,
        } = this;
        const audioFrameLength = byteLength / sourceChannelCount / FLOAT_BYTE_LENGTH;
        const metadata = {
            channelCount: sourceChannelCount,
            sampleRate: sourceSampleRate,
            currentTime: startAudioFrame / sourceSampleRate,
            duration: this.totalDuration,
        };

        if (loudnessAnalyzer) {
            loudnessAnalyzer.addFrames(samplePtr, audioFrameLength);
        }

        let loudnessInfo = defaultLoudnessInfo;
        if (loudnessNormalizer) {
            loudnessInfo = loudnessNormalizer.applyLoudnessNormalization(samplePtr, audioFrameLength);
        }

        if (effects) {
            for (const effect of effects) {
                ({ samplePtr, byteLength } = effect.apply(effects, samplePtr, byteLength, metadata));
            }
        }

        if (crossfader) {
            crossfader.apply(samplePtr, byteLength, metadata);
        }

        if (sourceChannelCount !== destinationChannelCount) {
            if (!channelMixer) {
                throw new Error(
                    `source channel count ${sourceChannelCount} doesnt match destination channel count ${destinationChannelCount} but channelMixer not provided`
                );
            }
            ({ samplePtr, byteLength } = channelMixer.mix(sourceChannelCount, samplePtr, byteLength));
        }

        if (sourceSampleRate !== destinationSampleRate) {
            if (!resampler) {
                throw new Error(
                    `source sample rate ${sourceSampleRate} doesnt match destination sample rate ${destinationSampleRate} but resampler not provided`
                );
            }
            ({ samplePtr, byteLength } = resampler.resample(samplePtr, byteLength));
        }

        if (fingerprinter && fingerprinter.needFrames()) {
            fingerprinter.newFrames(samplePtr, byteLength);
        }

        const finalAudioFrameLength = byteLength / FLOAT_BYTE_LENGTH / destinationChannelCount;
        const src = this._wasm.f32view(samplePtr, byteLength / FLOAT_BYTE_LENGTH);

        const fadeInFrames = Math.round(fadeInSeconds * destinationSampleRate);
        const channelData = outputSpec ? outputSpec.channelData : null;
        if (channelData) {
            if (fadeInFrames > 0) {
                dbg("AudioProcessing", "fading in, fadeInFrames=", fadeInFrames);
                for (let ch = 0; ch < destinationChannelCount; ++ch) {
                    const dst = channelData[ch]!;
                    for (let i = 0; i < finalAudioFrameLength; ++i) {
                        let sample = src[i * destinationChannelCount + ch]!;
                        if (i <= fadeInFrames) {
                            const curveIndex = Math.min(CURVE_LENGTH, Math.round((i / fadeInFrames) * CURVE_LENGTH));
                            sample *= FADE_IN_CURVE[curveIndex];
                        }
                        dst[i] = sample;
                    }
                }
            } else {
                for (let ch = 0; ch < destinationChannelCount; ++ch) {
                    const dst = channelData[ch]!;
                    for (let i = 0; i < finalAudioFrameLength; ++i) {
                        const sample = src[i * destinationChannelCount + ch]!;
                        dst[i] = sample;
                    }
                }
            }
        }

        this._filledBufferDescriptor = new FilledBufferDescriptor(
            finalAudioFrameLength,
            startAudioFrame,
            startAudioFrame + finalAudioFrameLength,
            channelData,
            loudnessInfo
        );
        return finalAudioFrameLength;
    }
}
