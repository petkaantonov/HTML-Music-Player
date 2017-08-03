import {defaultLoudnessInfo} from "audio/backend/LoudnessAnalyzer";

const FLOAT_BYTE_LENGTH = 4;
const WEB_AUDIO_BLOCK_SIZE = 128;

class FilledBufferDescriptor {
    constructor(length, startTime, endTime, channelData, loudnessInfo) {
        this.length = length;
        this.startTime = startTime;
        this.endTime = endTime;
        this.channelData = channelData;
        this.loudnessInfo = loudnessInfo;
    }
}

export default class AudioProcessingPipeline {
    constructor(wasm, {
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
        crossfader,
        duration,
        bufferTime,
        bufferAudioFrameCount
    }) {
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
        this.fingerprinter = fingerprinter;
        this.bufferTime = bufferTime;
        this.bufferAudioFrameCount = bufferAudioFrameCount;
        this.totalDuration = duration;
        this.crossfader = crossfader;
    }

    get hasFilledBuffer() {
        return !!this._filledBufferDescriptor;
    }

    setBufferTime(bufferTime) {
        this.bufferTime = bufferTime;
        this.bufferAudioFrameCount = bufferTime * this.destinationSampleRate | 0;
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

    async decodeFromFileViewAtOffset(fileView,
                                     filePosition,
                                     metadata,
                                     cancellationToken,
                                     outputSpec = null,
                                     paddingFactorHint = 1) {
        if (this.hasFilledBuffer) {
            throw new Error(`previous buffer has not been consumed`);
        }

        const dataEndFilePosition = metadata.dataEnd;
        let totalBytesRead = 0;
        let dataRemaining = dataEndFilePosition - (filePosition + totalBytesRead);
        const {bufferTime, sourceSampleRate} = this;
        const bytesToRead = bufferTime * sourceSampleRate * Math.ceil(metadata.maxByteSizePerAudioFrame);
        const currentAudioFrame = this.decoder.getCurrentAudioFrame();
        const onFlush = (samplePtr, byteLength) => {
            this._processSamples(samplePtr, byteLength, outputSpec, currentAudioFrame);
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

    _processSamples(samplePtr, byteLength, outputSpec, startAudioFrame) {
        const {sourceSampleRate,
                sourceChannelCount,
                destinationSampleRate,
                destinationChannelCount,
                channelMixer,
                effects,
                resampler,
                loudnessAnalyzer,
                fingerprinter,
                crossfader} = this;
        const metadata = {
            channelCount: sourceChannelCount,
            sampleRate: sourceSampleRate,
            currentTime: startAudioFrame / sourceSampleRate,
            duration: this.totalDuration
        };
        let loudnessInfo = defaultLoudnessInfo;

        if (effects) {
            for (const effect of effects) {
                ({samplePtr, byteLength} = effect.apply(effects, samplePtr, byteLength, metadata));
            }
        }

        if (loudnessAnalyzer) {
            const audioFrameLength = byteLength / sourceChannelCount / FLOAT_BYTE_LENGTH;
            loudnessInfo = loudnessAnalyzer.applyLoudnessNormalization(samplePtr, audioFrameLength);
        }

        if (crossfader) {
            crossfader.apply(samplePtr, byteLength, metadata);
        }

        if (sourceChannelCount !== destinationChannelCount) {
            ({samplePtr, byteLength} = channelMixer.mix(sourceChannelCount, samplePtr, byteLength));
        }

        if (sourceSampleRate !== destinationSampleRate) {
            ({samplePtr, byteLength} = resampler.resample(samplePtr, byteLength));
        }

        if (fingerprinter && fingerprinter.needFrames()) {
            fingerprinter.newFrames(samplePtr, byteLength);
        }

        const audioFrameLength = byteLength / FLOAT_BYTE_LENGTH / destinationChannelCount;
        let paddingFrameLength = 0;
        const src = this._wasm.f32view(samplePtr, byteLength / FLOAT_BYTE_LENGTH);

        const channelData = outputSpec ? outputSpec.channelData : null;
        if (channelData) {
            if (audioFrameLength < this.bufferAudioFrameCount) {
                paddingFrameLength =
                    Math.ceil(audioFrameLength / WEB_AUDIO_BLOCK_SIZE) * WEB_AUDIO_BLOCK_SIZE - audioFrameLength;
            }

            if (destinationChannelCount === 2) {
                const dst0 = channelData[0];
                const dst1 = channelData[1];

                for (let i = 0; i < audioFrameLength; ++i) {
                    dst0[i] = src[i * 2];
                    dst1[i] = src[i * 2 + 1];
                }

                for (let i = 0; i < paddingFrameLength; ++i) {
                    const j = i + audioFrameLength;
                    dst0[j] = dst1[j] = 0.0;
                }
            } else {
                for (let ch = 0; ch < destinationChannelCount; ++ch) {
                    const dst = channelData[ch];
                    for (let i = 0; i < audioFrameLength; ++i) {
                        dst[i] = src[i * destinationChannelCount + ch];
                    }

                    for (let i = 0; i < paddingFrameLength; ++i) {
                        const j = i + audioFrameLength;
                        dst[j] = 0.0;
                    }
                }
            }
        }

        const length = audioFrameLength + paddingFrameLength;
        const startTime = Math.round(startAudioFrame / sourceSampleRate * 1e9) / 1e9;
        const endTime = Math.round((startTime + (length / destinationSampleRate)) * 1e9) / 1e9;
        this._filledBufferDescriptor = new FilledBufferDescriptor(length, startTime, endTime, channelData, loudnessInfo);
    }
}
