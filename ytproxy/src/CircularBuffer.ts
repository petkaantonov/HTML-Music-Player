const READ_PTR = 0;
const WRITE_PTR = 1;
const EOF = 2;
const AVAILABLE = 3;
const HEADER = [READ_PTR, WRITE_PTR, EOF, AVAILABLE];
const HEADER_BYTES = HEADER.length * 4;

export function withHeaderDataZeroed(sab: SharedArrayBuffer) {
    const arr = new Int32Array(sab, 0, HEADER_BYTES);
    let i = 0;
    for (const _ of HEADER) {
        Atomics.store(arr, i++, 0);
    }
    return sab;
}
// Writer (main thread) writes asynchronusly
// Reader (Worker) reads synchronously, because ffmpeg only has synchronous implementation.
export default class CircularBuffer {
    private sab: SharedArrayBuffer;
    private readPtr: Int32Array;
    private writePtr: Int32Array;
    private eof: Int32Array;
    private available: Int32Array;
    private data: Uint8Array;
    private capacity: number;

    constructor(sab: SharedArrayBuffer) {
        if (sab.byteLength <= HEADER_BYTES) {
            throw new Error("buffer is barely big enough to contain header");
        }
        this.sab = sab;
        const [readPtr, writePtr, eof, available] = HEADER.map(
            (_: number, i: number) => new Int32Array(this.sab, i * 4, 4)
        );
        this.readPtr = readPtr;
        this.writePtr = writePtr;
        this.eof = eof;
        this.available = available;
        this.data = new Uint8Array(this.sab, HEADER_BYTES, this.sab.byteLength - HEADER_BYTES);
        this.capacity = this.data.length;
    }

    getSabRef() {
        return this.sab;
    }

    isEof() {
        return Atomics.load(this.eof, 0) === 1 && Atomics.load(this.available, 0) === 0;
    }

    markEof() {
        Atomics.store(this.eof, 0, 1);
        Atomics.notify(this.available, 0);
    }

    write(buffer: Uint8Array): number {
        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = buffer.length;
        const writableLength = Math.min(
            neededLength,
            (writeIndex >= readIndex ? this.capacity - writeIndex + readIndex : readIndex - writeIndex) - 1
        );

        if (writableLength > 0) {
            const firstLength = Math.min(this.capacity - writeIndex, writableLength);
            const secondLength = writableLength - firstLength;
            this.data.set(buffer.subarray(0, firstLength), writeIndex);
            if (secondLength > 0) {
                this.data.set(buffer.subarray(firstLength, writableLength), 0);
            }
            Atomics.store(this.writePtr, 0, (writeIndex + writableLength) % this.capacity);
            Atomics.store(this.available, 0, 1);
            Atomics.notify(this.available, 0);
            return writableLength;
        } else {
            return 0;
        }
    }

    read(buffer: Uint8Array): number {
        if (this.isEof()) {
            return 0;
        }
        if (Atomics.wait(this.available, 0, 0, 20000) === "timed-out") {
            throw new Error("no available data for 20 seconds, quitting");
        }

        const readIndex = Atomics.load(this.readPtr, 0);
        const writeIndex = Atomics.load(this.writePtr, 0);
        const neededLength = buffer.length;
        const absReadableLength =
            writeIndex >= readIndex ? writeIndex - readIndex : this.capacity - readIndex + writeIndex;
        const readableLength = Math.min(neededLength, absReadableLength);

        if (readableLength > 0) {
            const firstLength = Math.min(this.capacity - readIndex, readableLength);
            const secondLength = readableLength - firstLength;
            buffer.set(this.data.subarray(readIndex, readIndex + firstLength), 0);
            if (secondLength > 0) {
                buffer.set(this.data.subarray(0, secondLength), firstLength);
            }
            Atomics.store(this.readPtr, 0, (readIndex + readableLength) % this.capacity);
            if (absReadableLength <= neededLength) {
                Atomics.store(this.available, 0, 0);
            }
            return readableLength;
        } else {
            Atomics.store(this.available, 0, 0);
            return 0;
        }
    }
}
