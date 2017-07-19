import {Uint8Array} from "platform/platform";
import DecoderContext from "audio/backend/DecoderContext";
import {MAX_BUFFER_LENGTH_SECONDS} from "audio/frontend/buffering";
import {moduleEvents} from "wasm/WebAssemblyWrapper";

const DECODER_DELAY = 529;
const MAX_SAMPLE_RATE = 48000;
const MAX_CHANNELS = 2;
const MAX_AUDIO_FRAMES_PER_MP3_FRAME = 1152;
const MAX_BUFFER_LENGTH_AUDIO_FRAMES = Math.ceil(MAX_BUFFER_LENGTH_SECONDS * MAX_SAMPLE_RATE / MAX_AUDIO_FRAMES_PER_MP3_FRAME) *
                                                MAX_AUDIO_FRAMES_PER_MP3_FRAME;
const MIN_BUFFER_LENGTH_AUDIO_FRAMES = MAX_AUDIO_FRAMES_PER_MP3_FRAME;
const MAX_INVALID_FRAME_COUNT = 100;
const MAX_MP3_FRAME_BYTE_LENGTH = 2881;
const MAX_BYTES_PER_AUDIO_FRAME = MAX_MP3_FRAME_BYTE_LENGTH / (MAX_AUDIO_FRAMES_PER_MP3_FRAME * MAX_CHANNELS);
const INT_16_BYTE_LENGTH = 2;

const {max, min} = Math;

export default class Mp3Context extends DecoderContext {
    constructor(wasm, opts) {
        super(opts);
        this._invalidMp3FrameCount = 0;
        this._audioFramesToSkip = 0;
        this._audioFramesSkipped = 0;
        this._demuxData = null;
        this._currentMp3Frame = 0;
        this._currentUnflushedAudioFrameCount = 0;

        this._totalMp3Frames = (-1 >>> 1) | 0;

        this._wasm = wasm;
        this._ptr = this.mp3_create_ctx();
        if (this._ptr === 0) {
            throw new Error(`allocation failed`);
        }
        this._srcBufferMaxLength = 0;
        this._srcBufferPtr = 0;
        this._samplesPtrMaxLength = 0;
        this._samplesPtr = 0;

        this._bytesWrittenToSampleBufferResultPtr = wasm.u32calloc(1);
        this.reinitialized(opts);
    }

    reinitialized(opts) {
        const prev = this.targetBufferLengthAudioFrames;
        super.reinitialized(opts);
        let {targetBufferLengthAudioFrames} = this;
        targetBufferLengthAudioFrames = max(min(targetBufferLengthAudioFrames, MAX_BUFFER_LENGTH_AUDIO_FRAMES), MIN_BUFFER_LENGTH_AUDIO_FRAMES);
        this.targetBufferLengthAudioFrames = targetBufferLengthAudioFrames;

        if (!this._samplesPtr || prev !== this.targetBufferLengthAudioFrames) {
            if (this._samplesPtr) {
                this._wasm.free(this._samplesPtr);
                this._samplesPtr = 0;
            }

            if (this._srcBufferPtr) {
                this._wasm.free(this._srcBufferPtr);
                this._srcBufferPtr = 0;
            }

            const maxAudioSamplesPerMp3Frame = MAX_AUDIO_FRAMES_PER_MP3_FRAME * MAX_CHANNELS;
            const maxAudioSamplesUntilFlush = (Math.ceil(MAX_BUFFER_LENGTH_SECONDS * MAX_SAMPLE_RATE * MAX_CHANNELS / maxAudioSamplesPerMp3Frame) *
                                                                                            maxAudioSamplesPerMp3Frame) +
                                                                    (MAX_AUDIO_FRAMES_PER_MP3_FRAME * MAX_CHANNELS);
            const byteLengthSamples = maxAudioSamplesUntilFlush * INT_16_BYTE_LENGTH;

            this._srcBufferMaxLength = Math.ceil(MAX_BYTES_PER_AUDIO_FRAME * (maxAudioSamplesUntilFlush / MAX_CHANNELS));
            this._srcBufferPtr = this._wasm.malloc(this._srcBufferMaxLength);
            this._samplesPtrMaxLength = byteLengthSamples;
            this._samplesPtr = this._wasm.malloc(byteLengthSamples);
        }
        return this;
    }


    getCurrentAudioFrame() {
        const {samplesPerFrame: audioFramesPerMp3Frame} = this._demuxData;
        return Math.max(0, audioFramesPerMp3Frame * this._currentMp3Frame +
                           (audioFramesPerMp3Frame - (this._currentUnflushedAudioFrameCount % audioFramesPerMp3Frame)) -
                           audioFramesPerMp3Frame -
                           this._audioFramesSkipped);
    }

    end(flushCallback = null) {
        if (!super.end()) {
            if (flushCallback) {
                throw new Error(`not started`);
            }
            this._resetState();
            return false;
        }
        let flushed = false;
        try {
            if (flushCallback && this._currentUnflushedAudioFrameCount > 0) {
                this._flush(this._samplesPtr,
                            this._audioFrameCountToByteLength(this._currentUnflushedAudioFrameCount),
                            flushCallback);
                flushed = true;

            }
        } finally {
            this._resetState();
        }
        return flushed;
    }

    destroy() {
        if (this._ptr === 0) throw new Error(`null pointer`);
        this._resetState();
        this.mp3_destroy_ctx(this._ptr);
        this._ptr = 0;

        this._wasm.free(this._srcBufferPtr);
        this._srcBufferPtr = 0;
        this._wasm.free(this._samplesPtr);
        this._samplesPtr = 0;
        this._wasm.free(this._bytesWrittenToSampleBufferResultPtr);
        this._bytesWrittenToSampleBufferResultPtr = 0;
    }

    applySeek(mp3SeekResult) {
        super.applySeek();
        this._resetDecodingState();
        this._currentMp3Frame = mp3SeekResult.frame;
        this._audioFramesToSkip = mp3SeekResult.samplesToSkip;
        if (this._currentMp3Frame === 0) this._audioFramesToSkip += DECODER_DELAY;
    }


    start(demuxData = null) {
        super.start();

        if (demuxData) {
            this._audioFramesToSkip = demuxData.encoderDelay + DECODER_DELAY;
            this._totalMp3Frames = demuxData.frames;
        } else {
            this._audioFramesToSkip = DECODER_DELAY;
            this._totalMp3Frames = ((-1 >>> 1) | 0);
        }
        this._demuxData = demuxData;
    }

    decodeUntilFlush(src, flushCallback) {
        super.decodeUntilFlush();

        if (this._currentMp3Frame >= this._totalMp3Frames) {
            return 0;
        }

        const {_ptr, _samplesPtr, _bytesWrittenToSampleBufferResultPtr} = this;
        let {_srcBufferPtr} = this;

        const sourceLength = Math.min(src.length, this._srcBufferMaxLength);

        if (this._wasm.pointsToMemory(src)) {
            _srcBufferPtr = src.byteOffset;
        } else {
            const sourceBytes = sourceLength === src.length ? src : new Uint8Array(src.buffer, src.byteOffset, sourceLength);
            this._wasm.u8view(_srcBufferPtr, sourceLength).set(sourceBytes);
        }

        let sourceByteLengthRemaining = sourceLength;
        let outputSamplesByteOffset = this._currentUnflushedAudioFrameCount > 0 ?
                this._audioFrameCountToByteLength(this._currentUnflushedAudioFrameCount) : 0;

        let sourceBufferByteOffset = 0;
        while (sourceByteLengthRemaining > 0) {
            const bytesRead = this.mp3_decode_frame(_ptr,
                                                    _srcBufferPtr + sourceBufferByteOffset,
                                                    sourceByteLengthRemaining,
                                                    _samplesPtr + outputSamplesByteOffset,
                                                    _bytesWrittenToSampleBufferResultPtr);
            const bytesWrittenToOutputBuffer = this._wasm.u32(_bytesWrittenToSampleBufferResultPtr);

            if (bytesRead > 0) {
                sourceByteLengthRemaining -= bytesRead;
                sourceBufferByteOffset += bytesRead;
            }

            if (bytesWrittenToOutputBuffer > 0) {
                if (!this.hasEstablishedMetadata()) {
                    this._establishMetadata();
                }

                const audioFramesDecoded = this._byteLengthToAudioFrameCount(bytesWrittenToOutputBuffer);
                this._currentMp3Frame++;
                const didFlush = this._mp3FrameDecoded(audioFramesDecoded, flushCallback);

                if (didFlush) {
                    this._invalidMp3FrameCount = 0;
                    return sourceLength - sourceByteLengthRemaining;
                }
                outputSamplesByteOffset = this._audioFrameCountToByteLength(this._currentUnflushedAudioFrameCount);
            } else if (sourceByteLengthRemaining > MAX_MP3_FRAME_BYTE_LENGTH) {
                if ((++this._invalidMp3FrameCount) < MAX_INVALID_FRAME_COUNT) {
                    const offset = Math.min(sourceByteLengthRemaining, 419);
                    sourceByteLengthRemaining -= offset;
                    sourceBufferByteOffset += offset;
                } else {
                    // TODO DecoderError invalid codec
                    throw new Error(`too many invalid frames`);
                }
            } else {
                return sourceLength - sourceByteLengthRemaining;
            }
        }
        return sourceLength - sourceByteLengthRemaining;
    }

    _mp3FrameDecoded(audioFramesDecoded, flushCallback) {
        let flushed = false;
        const currentFrameCount = this._currentUnflushedAudioFrameCount;
        const {targetBufferLengthAudioFrames} = this;
        const demuxData = this._demuxData;

        if (demuxData !== null) {
            const frame = this._currentMp3Frame;
            if (demuxData.paddingStartFrame !== -1 && frame >= demuxData.paddingStartFrame) {
                if (frame === demuxData.paddingStartFrame) {
                    audioFramesDecoded -= (demuxData.encoderPadding % demuxData.samplesPerFrame);
                } else {
                    return flushed;
                }
            }
        }

        const skipped = Math.min(audioFramesDecoded, this._audioFramesToSkip);
        if (skipped > 0) {
            audioFramesDecoded -= skipped;
            this._audioFramesToSkip -= skipped;
            this._audioFramesSkipped += skipped;
        }

        if (audioFramesDecoded > 0) {
            const samplesPtr = this._samplesPtr;
            if (currentFrameCount + audioFramesDecoded >= targetBufferLengthAudioFrames) {
                const remaining = targetBufferLengthAudioFrames - currentFrameCount;
                const overflow = audioFramesDecoded - remaining;

                flushed = true;
                this._flush(this._samplesPtrOffsetByAudioFrames(skipped),
                            this._audioFrameCountToByteLength(targetBufferLengthAudioFrames),
                            flushCallback);

                if (overflow > 0) {
                    this._copySamples(samplesPtr, 0,
                                      samplesPtr, skipped + targetBufferLengthAudioFrames,
                                      overflow);

                    this._currentUnflushedAudioFrameCount = overflow;
                } else {
                    this._currentUnflushedAudioFrameCount = 0;
                }
            } else {
                if (skipped > 0) {
                    this._copySamples(samplesPtr, this._currentUnflushedAudioFrameCount,
                                      samplesPtr, skipped,
                                      audioFramesDecoded);
                }

                this._currentUnflushedAudioFrameCount += audioFramesDecoded;
            }
        }
        return flushed;
    }

    _byteLengthToAudioFrameCount(byteLength) {
        return byteLength / this.channelCount / INT_16_BYTE_LENGTH;
    }

    _audioFrameCountToByteLength(audioFrameCount) {
        return audioFrameCount * this.channelCount * INT_16_BYTE_LENGTH;
    }

    _samplesPtrOffsetByAudioFrames(frameOffset) {
        return this._samplesPtr + this._audioFrameCountToByteLength(frameOffset);
    }

    _copySamples(dstPtr, dstOffset, srcPtr, srcOffset, count) {
        this._wasm.memcpy(dstPtr + this._audioFrameCountToByteLength(dstOffset),
                          srcPtr + this._audioFrameCountToByteLength(srcOffset),
                          this._audioFrameCountToByteLength(count));
    }

    _flush(ptr, byteLength, callback) {
        this._currentUnflushedAudioFrameCount = 0;
        callback(ptr, byteLength);
    }

    _resetState() {
        super._resetState();
        this._totalMp3Frames = (-1 >>> 1) | 0;
        this._demuxData = null;
        this._resetDecodingState();
    }

    _resetDecodingState() {
        this._audioFramesSkipped = 0;
        this._audioFramesToSkip = 0;
        this._currentUnflushedAudioFrameCount = 0;
        this._invalidMp3FrameCount = 0;
        this._currentMp3Frame = 0;
        this.mp3_reset_ctx(this._ptr);
    }

    _establishMetadata() {
        const [retVal, sampleRate, channelCount] = this.mp3_get_info(this._ptr);

        if (retVal !== 0) {
            throw new Error(`mp3_get_info retval != 0: ${retVal}`);
        }

        this.establishSampleRate(sampleRate);
        this.establishChannelCount(channelCount);
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    Mp3Context.prototype.mp3_get_info = wasm.createFunctionWrapper({
        name: `mp3_get_info`,
        unsafeJsStack: true
    }, `integer`,
        `integer-retval`, `integer-retval`,
        `integer-retval`, `integer-retval`,
        `integer-retval`, `integer-retval`);
    Mp3Context.prototype.mp3_create_ctx = exports.mp3_create_ctx;
    Mp3Context.prototype.mp3_reset_ctx = exports.mp3_reset_ctx;
    Mp3Context.prototype.mp3_destroy_ctx = exports.mp3_destroy_ctx;
    Mp3Context.prototype.mp3_decode_frame = exports.mp3_decode_frame;
});
