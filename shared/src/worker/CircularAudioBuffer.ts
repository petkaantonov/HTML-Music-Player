const READ_PTR = 0;
const WRITE_PTR = 1;
const HEADER = [READ_PTR, WRITE_PTR];
const HEADER_BYTES = HEADER.length * 2;

// Hold 8192 frames
export default class CircularAudioBuffer {
    private sab;
    private readPtr: Int32Array;
    private writePtr: Int32Array;
    private data: Float32Array;
    private capacity: number;
    private channels: number;

    constructor(sab: SharedArrayBuffer, channels: number) {
        this.sab = sab;
        const [readPtr, writePtr] = HEADER.map((_: number, i: number) => new Int32Array(this.sab, i * 4, 4));
        this.readPtr = readPtr;
        this.writePtr = writePtr;
        this.data = new Float32Array(this.sab, HEADER_BYTES);
        this.capacity = this.data.length;
        this.channels = channels;
    }

    getSabRef() {
        return this.sab;
    }

    getWritableLength() {
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        return (writeIndex >= readIndex ? this.capacity - writeIndex + readIndex : readIndex - writeIndex) - 1;
    }

    write(channels: Float32Array[], frames: number): void {
        if (channels.length !== this.channels) {
            throw new Error(`wrong channels, expected ${this.channels} got ${channels.length}`);
        }
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = frames * channels.length;
        const writableLength = Math.min(
            neededLength,
            (writeIndex >= readIndex ? this.capacity - writeIndex + readIndex : readIndex - writeIndex) - 1
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
    }

    read(channels: Float32Array[], frames: number): number {
        const channelCount = channels.length;
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = channelCount * frames;
        const absReadableLength =
            writeIndex >= readIndex ? writeIndex - readIndex : this.capacity - readIndex + writeIndex;
        const readableLength = Math.min(neededLength, absReadableLength);

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
            return readableFrames;
        } else {
            return 0;
        }
    }
}
