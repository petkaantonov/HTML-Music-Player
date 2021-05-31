const READ_PTR = 0;
const WRITE_PTR = 1;
const WRITER_CLEARING = 2;
const READER_PROCESSING_SAMPLES = 3;
const FRAME_PTR = 4;
const PAUSE_PTR = 5;
const PAUSE_REQUESTED_PTR = 6;
const IS_BACKGROUND_PTR = 7;
const HEADER = [
    READ_PTR,
    WRITE_PTR,
    WRITER_CLEARING,
    READER_PROCESSING_SAMPLES,
    FRAME_PTR,
    PAUSE_PTR,
    PAUSE_REQUESTED_PTR,
    IS_BACKGROUND_PTR,
];
export const HEADER_BYTES = HEADER.length * 4;

export class CircularAudioBufferSignals {
    protected sab: SharedArrayBuffer;
    protected pausePtr: Int32Array;
    protected pauseRequestedPtr: Int32Array;
    protected framePtr: Int32Array;
    protected isBackgroundPtr: Int32Array;

    constructor(sab: SharedArrayBuffer) {
        this.sab = sab;
        this.framePtr = new Int32Array(this.sab, FRAME_PTR * 4, 4);
        this.pausePtr = new Int32Array(this.sab, PAUSE_PTR * 4, 4);
        this.pauseRequestedPtr = new Int32Array(this.sab, PAUSE_REQUESTED_PTR * 4, 4);
        this.isBackgroundPtr = new Int32Array(this.sab, IS_BACKGROUND_PTR * 4, 4);
    }

    setBackgrounded() {
        Atomics.store(this.isBackgroundPtr, 0, 1);
    }

    unsetBackgrounded() {
        Atomics.store(this.isBackgroundPtr, 0, 0);
    }

    isBackgrounded() {
        return Atomics.load(this.isBackgroundPtr, 0) === 1;
    }

    requestPause(afterFrames: number) {
        if (afterFrames === 0) {
            this.setPaused();
        } else {
            Atomics.store(this.pauseRequestedPtr, 0, afterFrames);
        }
    }

    getPauseRequested() {
        return Atomics.exchange(this.pauseRequestedPtr, 0, 0);
    }

    setPaused() {
        Atomics.store(this.pausePtr, 0, 1);
        Atomics.store(this.pauseRequestedPtr, 0, 0);
    }

    isPaused() {
        return Atomics.load(this.pausePtr, 0) === 1;
    }

    unsetPaused() {
        Atomics.store(this.pausePtr, 0, 0);
        Atomics.store(this.pauseRequestedPtr, 0, -1);
    }

    setCurrentFrameNumber(frames: number) {
        Atomics.store(this.framePtr, 0, frames);
    }

    getCurrentFrameNumber() {
        return Atomics.load(this.framePtr, 0);
    }
}

export default class CircularAudioBuffer extends CircularAudioBufferSignals {
    private readPtr: Int32Array;
    private writePtr: Int32Array;
    private writerClearing: Int32Array;
    private readerProcessingSamples: Int32Array;

    private data: Float32Array;
    private capacity: number;
    private channels: number;

    constructor(sab: SharedArrayBuffer, channels: number) {
        super(sab);
        const [readPtr, writePtr, writerClearing, readerProcessingSamples] = HEADER.map(
            (_: number, i: number) => new Int32Array(this.sab, i * 4, 4)
        );
        this.readPtr = readPtr;
        this.writePtr = writePtr;
        this.readerProcessingSamples = readerProcessingSamples;
        this.writerClearing = writerClearing;
        this.data = new Float32Array(this.sab, HEADER_BYTES);
        this.capacity = this.data.length;
        this.channels = channels;
        if (this.data.length % this.channels !== 0) {
            throw new Error("Data length must be evenly divisible by channel count");
        }
    }

    printValues() {
        console.log(
            "read ptr",
            Atomics.load(this.readPtr, 0),
            "write ptr",
            Atomics.load(this.writePtr, 0),
            "writer clearing",
            Atomics.load(this.writerClearing, 0),
            "reader processing",
            Atomics.load(this.readerProcessingSamples, 0),
            "frame index",
            Atomics.load(this.framePtr, 0),
            "pause ptr",
            Atomics.load(this.pausePtr, 0),
            "pause requested",
            Atomics.load(this.pauseRequestedPtr, 0),
            "is background",
            Atomics.load(this.isBackgroundPtr, 0)
        );
    }

    getSabRef() {
        return this.sab;
    }

    getReadableFramesLength() {
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        return (
            (writeIndex >= readIndex ? writeIndex - readIndex : this.capacity - readIndex + writeIndex) / this.channels
        );
    }

    getWritableFramesLength() {
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        return (
            ((writeIndex >= readIndex ? this.capacity - writeIndex + readIndex : readIndex - writeIndex) -
                this.channels) /
            this.channels
        );
    }

    clear() {
        Atomics.store(this.writerClearing, 0, 1);
        Atomics.wait(this.readerProcessingSamples, 0, 1, 100);
        const readIndex = Atomics.load(this.readPtr, 0);
        Atomics.store(this.writePtr, 0, readIndex);
        Atomics.store(this.writerClearing, 0, 0);
        return 0;
    }

    write(channels: Float32Array[], frames: number): number {
        if (channels.length !== this.channels) {
            throw new Error(`wrong channels, expected ${this.channels} got ${channels.length}`);
        }
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = frames * channels.length;
        const writableLength = Math.min(
            neededLength,
            (writeIndex >= readIndex ? this.capacity - writeIndex + readIndex : readIndex - writeIndex) - this.channels
        );

        if (writableLength < neededLength) {
            throw new Error("no room for write");
        }

        const firstLength = Math.min(this.capacity - writeIndex, writableLength);
        const firstFrames = firstLength / channels.length;
        const secondLength = writableLength - firstLength;
        const secondFrames = secondLength / channels.length;
        const data = this.data;
        const channelCount = channels.length;
        for (let i = 0; i < firstFrames; ++i) {
            for (let c = 0; c < channelCount; ++c) {
                data[writeIndex + i * channelCount + c] = channels[c][i];
            }
        }
        for (let i = 0; i < secondFrames; ++i) {
            for (let c = 0; c < channelCount; ++c) {
                data[i * channelCount + c] = channels[c][i + firstFrames];
            }
        }

        Atomics.store(this.writePtr, 0, (writeIndex + writableLength) % this.capacity);
        return firstFrames + secondFrames;
    }

    read(channels: Float32Array[], frames: number): number {
        if (channels.length !== this.channels) {
            throw new Error(`wrong channels, expected ${this.channels} got ${channels.length}`);
        }
        if (Atomics.load(this.writerClearing, 0) === 1) {
            return -1;
        }
        Atomics.store(this.readerProcessingSamples, 0, 1);
        const channelCount = channels.length;
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = channelCount * frames;
        const absReadableLength =
            writeIndex >= readIndex ? writeIndex - readIndex : this.capacity - readIndex + writeIndex;
        const readableLength = Math.min(neededLength, absReadableLength);

        let ret: number;
        if (readableLength > 0) {
            const readableFrames = readableLength / channelCount;
            const firstLength = Math.min(this.capacity - readIndex, readableLength);
            const firstFrames = firstLength / channelCount;
            const secondLength = readableLength - firstLength;
            const secondFrames = secondLength / channelCount;
            const data = this.data;
            for (let i = 0; i < firstFrames; ++i) {
                for (let c = 0; c < channelCount; ++c) {
                    channels[c][i] = data[readIndex + i * channelCount + c];
                }
            }
            for (let i = 0; i < secondFrames; ++i) {
                for (let c = 0; c < channelCount; ++c) {
                    channels[c][i + firstFrames] = data[i * channelCount + c];
                }
            }
            Atomics.store(this.readPtr, 0, (readIndex + readableLength) % this.capacity);

            ret = readableFrames;
        } else {
            ret = 0;
        }

        Atomics.store(this.readerProcessingSamples, 0, 0);
        Atomics.notify(this.readerProcessingSamples, 0, 1);
        return ret;
    }
}
