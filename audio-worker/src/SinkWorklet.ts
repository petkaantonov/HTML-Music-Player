import { MAX_FRAME, WEB_AUDIO_BLOCK_SIZE } from "shared/src/audio";
import CircularAudioBuffer from "shared/worker/CircularAudioBuffer";

const CURVE_LENGTH = 8;
const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);
const FADE_MINIMUM_VOLUME = 0.2;
const FADE_OUT_CURVE = getCurve(new Float32Array(CURVE_LENGTH + 1), 1, FADE_MINIMUM_VOLUME);
const FADE_IN_CURVE = getCurve(new Float32Array(CURVE_LENGTH + 1), 0, 1);

function getCurve(ret: Float32Array, v0: number, v1: number) {
    const t0 = 0;
    const t1 = CURVE_LENGTH;
    for (let t = t0; t <= t1; ++t) {
        const value = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
        ret[t] = value;
    }
    return ret;
}

declare global {
    function registerProcessor<T>(name: string, c: new (...args: any[]) => AudioWorkletProcessor<T>): void;

    interface Options<T> {
        numberOfInputs?: number;
        numberOfOutputs?: number;
        outputChannelCount?: number[];
        parameterData?: T;
        processorOptions?: any;
    }

    abstract class AudioWorkletProcessor<T> {
        get port(): MessagePort;
        constructor(opts?: Options<T>);
        abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: T): boolean;
    }
}

class SinkWorklet extends AudioWorkletProcessor<{}> {
    private cab: CircularAudioBuffer | null = null;
    private framesProcessedAfterPauseRequest: number = 0;
    private pauseAfterFrames: number = 0;
    private pausedRequested: boolean = false;
    private frameNumber: number = 0;
    private sampleRate: number = 0;
    private lastFramePosted: number = 0;

    constructor() {
        super();
        this.port.onmessage = e => {
            if (e.data.type === "init") {
                this.sampleRate = e.data.sampleRate;
                this.cab = new CircularAudioBuffer(e.data.sab, e.data.channelCount);
                if (e.data.background) {
                    this.cab.setBackgrounded();
                } else {
                    this.cab.unsetBackgrounded();
                }
            }
        };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
        const cab = this.cab;
        const channels = outputs[0];
        if (!cab || cab.isPaused()) {
            return true;
        }

        let ret = true;

        if (channels.length !== 2) {
            console.log(outputs);
            console.log("not 2", channels.length);
            ret = false;
        }
        if (channels[0].length !== 128) {
            console.log("not 128");
            ret = false;
        }
        if (channels[1].length !== 128) {
            console.log("not 128");
            ret = false;
        }
        if (!ret) {
            return ret;
        }

        const pauseAfterFrames = cab.getPauseRequested();
        if (pauseAfterFrames > 0) {
            this.pausedRequested = true;
            this.framesProcessedAfterPauseRequest = 0;
            this.pauseAfterFrames = pauseAfterFrames;
        } else if (pauseAfterFrames < 0) {
            this.pausedRequested = false;
        }
        let volume: number = -1;
        if (this.pausedRequested) {
            if (this.framesProcessedAfterPauseRequest >= this.pauseAfterFrames) {
                this.pausedRequested = false;
                cab.setPaused();
                return true;
            }
            this.framesProcessedAfterPauseRequest += WEB_AUDIO_BLOCK_SIZE;
            const curveIndex = Math.min(
                CURVE_LENGTH,
                Math.round((this.framesProcessedAfterPauseRequest / this.pauseAfterFrames) * CURVE_LENGTH)
            );
            volume = FADE_OUT_CURVE[curveIndex];
        }
        const framesWritten = cab.read(channels, WEB_AUDIO_BLOCK_SIZE);
        if (framesWritten < 0) {
            return true;
        }
        this.frameNumber = (this.frameNumber + framesWritten) % MAX_FRAME;
        if (volume !== -1) {
            for (const channel of channels) {
                for (let i = 0; i < framesWritten; ++i) {
                    channel[i] *= volume;
                }
            }
        }
        cab.setCurrentFrameNumber(this.frameNumber);
        const isBackgrounded = cab.isBackgrounded();
        if (!isBackgrounded && Math.abs(this.frameNumber - this.lastFramePosted) > 4410) {
            this.lastFramePosted = this.frameNumber;
            this.port.postMessage({
                type: "timeupdate",
            });
        }
        if (framesWritten < WEB_AUDIO_BLOCK_SIZE && isBackgrounded) {
            cab.setPaused();
        }
        return true;
    }
}

registerProcessor("sink-worklet", SinkWorklet);

export {};
