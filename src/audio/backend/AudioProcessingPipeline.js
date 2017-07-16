import {defaultLoudnessInfo} from "audio/backend/LoudnessAnalyzer";

const I16_BYTE_LENGTH = 2;
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

// TODO: Remove this comment after testing framework is in place and it will become unnecessary.
/*
Const WAV_CHANNELS = 2;
const WAV_SR = 48000;
const WAV_DURATION = 0.2 * WAV_SR * 1 / 0.2 * 30;
const wavData = new Int16Array(WAV_CHANNELS * WAV_DURATION + 44 / 2);

let wavLength = 0;

function applyWav(samplePtr, byteLength, wasm) {
    if (wavLength < WAV_DURATION) {
        const o = wavLength * WAV_CHANNELS * 2 + 44;
        new Uint8Array(wavData.buffer).set(wasm.u8view(samplePtr, byteLength), o);
        wavLength += byteLength / WAV_CHANNELS / I16_BYTE_LENGTH;
    } else {
        const buf = new Uint8Array(wavData.buffer);
        const dataV = new DataView(wavData.buffer);
        dataV.setUint32(0, 0x52494646 >>> 0, false);
        dataV.setUint32(4, wavData.byteLength - 8, true);
        dataV.setUint32(8, 0x57415645 >>> 0, false);
        dataV.setUint32(12, 0x666d7420 >>> 0, false);
        dataV.setUint32(16, 16, true);
        dataV.setUint16(20, 1, true);
        dataV.setUint16(22, WAV_CHANNELS, true);
        dataV.setUint32(24, WAV_SR, true);
        dataV.setUint32(28, WAV_SR * 2 * WAV_CHANNELS, true);
        dataV.setUint16(32, 2 * WAV_CHANNELS, true);
        dataV.setUint16(34, 16, true);
        dataV.setUint32(36, 0x64617461 >>> 0, false);
        dataV.setUint32(40, wavData.byteLength - 44, true);


        const a = new Blob([wavData], {type: `audio/wav`});
        // Just listen to the wav file to see if decoding/channelmixing/resampling was done correctly...
        const b = URL.createObjectURL(a);
        debugger;
    }
}*/

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
    }

    get hasFilledBuffer() {
        return !!this._filledBufferDescriptor;
    }

    setBufferTime(bufferTime) {
        this.bufferTime = bufferTime;
        this.bufferAudioFrameCount = bufferTime * this.destinationSampleRate;
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
            await fileView.readBlockOfSizeAt(bytesToRead, currentFilePosition, paddingFactorHint);

            if (cancellationToken.isCancelled()) {
                return 0;
            }
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
                fingerprinter} = this;

        let loudnessInfo = defaultLoudnessInfo;
        if (loudnessAnalyzer) {
            const audioFrameLength = byteLength / sourceChannelCount / I16_BYTE_LENGTH;
            loudnessInfo = loudnessAnalyzer.getLoudnessInfo(samplePtr, audioFrameLength);
        }

        if (effects) {
            for (const effect of effects) {
                ({samplePtr, byteLength} = effect.apply(sourceChannelCount, samplePtr, byteLength));
            }
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

        const audioFrameLength = byteLength / I16_BYTE_LENGTH / destinationChannelCount;
        let paddingFrameLength = 0;
        const src = this._wasm.i16view(samplePtr, byteLength / I16_BYTE_LENGTH);

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
                    dst0[i] = Math.fround(src[i * 2] / 32768);
                    dst1[i] = Math.fround(src[i * 2 + 1] / 32768);
                }

                for (let i = 0; i < paddingFrameLength; ++i) {
                    const j = i + audioFrameLength;
                    dst0[j] = dst1[j] = 0.0;
                }
            } else {
                for (let ch = 0; ch < destinationChannelCount; ++ch) {
                    const dst = channelData[ch];
                    for (let i = 0; i < audioFrameLength; ++i) {
                        const sample = src[i * destinationChannelCount + ch];
                        dst[i] = Math.fround(sample / 32768);
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
