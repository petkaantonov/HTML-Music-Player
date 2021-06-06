import { RENDERED_CHANNEL_COUNT } from "shared/audio";
const FRAMES_AVAILABLE = 0;
const HEADER = [FRAMES_AVAILABLE];
export const HEADER_BYTES = HEADER.length * 4;

const EMPTY = new Float32Array(0);

export default class VisualizerBus {
    private sab: SharedArrayBuffer;
    private framesAvailable: Int32Array;
    private data: Float32Array;

    constructor(sab: SharedArrayBuffer) {
        if (sab.byteLength <= HEADER_BYTES) {
            throw new Error("buffer is barely big enough to contain header");
        }
        this.sab = sab;
        const [framesAvailable] = HEADER.map((_: number, i: number) => new Int32Array(this.sab, i * 4, 4));
        this.framesAvailable = framesAvailable;
        this.data = new Float32Array(this.sab, HEADER_BYTES);
    }

    getDataRefForFrameCount(framesCount: number) {
        return this.data.subarray(0, framesCount * RENDERED_CHANNEL_COUNT);
    }

    notifyFramesWritten(frameCount: number) {
        Atomics.store(this.framesAvailable, 0, frameCount);
        Atomics.notify(this.framesAvailable, 0);
    }

    resetFramesAvailable() {
        Atomics.store(this.framesAvailable, 0, 0);
    }

    getFrames() {
        if (Atomics.wait(this.framesAvailable, 0, 0, 100) !== "timed-out") {
            const framesCount = Atomics.load(this.framesAvailable, 0);
            return this.data.subarray(0, framesCount * RENDERED_CHANNEL_COUNT);
        }
        return EMPTY;
    }
}
