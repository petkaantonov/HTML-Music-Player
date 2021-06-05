import { CURVE_LENGTH, getCurve, MAX_FRAME, TIME_UPDATE_RESOLUTION, WEB_AUDIO_BLOCK_SIZE } from "shared/src/audio";
import TimeStretcher from "shared/src/worker/TimeStretcher";

const FADE_MINIMUM_VOLUME = 0.05;
declare global {
    const currentFrame: number;
    const sampleRate: number;
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
    private cab: TimeStretcher | null = null;
    private resumeFadeInFrameCount: number = 0;
    private resumeFadeInCurve = getCurve(new Float32Array(CURVE_LENGTH + 1), FADE_MINIMUM_VOLUME, 1);
    private framesProcessedAfterPauseRequest: number = 0;
    private framesProcessedAfterResume: number = 0;
    private resuming: boolean = false;
    private pauseFadeOutCurve = getCurve(new Float32Array(CURVE_LENGTH + 1), 1, FADE_MINIMUM_VOLUME);
    private pauseAfterFrames: number = 0;
    private pausedRequested: boolean = false;
    private frameNumber: number = 0;
    private baseVolume: number = FADE_MINIMUM_VOLUME;
    private lastFramePosted: number = 0;
    private previousBlockWasPaused: boolean = true;
    private playbackRate: number = 1;

    constructor() {
        super();
        this.port.onmessage = e => {
            if (e.data.type === "init") {
                this.resumeFadeInFrameCount = Math.round(0.3 * sampleRate);
                this.cab = new TimeStretcher(e.data.sab, {
                    channelCount: e.data.channelCount,
                    sampleRate,
                    playbackRate: this.playbackRate,
                });
                if (e.data.background) {
                    this.cab.setBackgrounded();
                } else {
                    this.cab.unsetBackgrounded();
                }
            } else if (e.data.type === "setPlaybackRate") {
                this.playbackRate = Math.round(Math.min(4, Math.max(0.5, e.data.playbackRate)) * 20) / 20;
                this.cab!.updatePlaybackRate(this.playbackRate);
            }
        };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
        const cab = this.cab!;
        const channels = outputs[0];

        if (cab.isPaused()) {
            this.previousBlockWasPaused = true;
            return true;
        }
        const isBackgrounded = cab.isBackgrounded();
        if (!isBackgrounded && Math.abs(currentFrame - this.lastFramePosted) > TIME_UPDATE_RESOLUTION * sampleRate) {
            this.lastFramePosted = currentFrame;
            this.port.postMessage({
                type: "timeupdate",
            });
        }
        if (this.previousBlockWasPaused && !isBackgrounded) {
            this.framesProcessedAfterResume = 0;
            this.resuming = true;
            this.resumeFadeInCurve = getCurve(
                this.resumeFadeInCurve,
                Math.max(FADE_MINIMUM_VOLUME, this.baseVolume),
                1
            );
        }
        this.previousBlockWasPaused = false;

        const pauseAfterFrames = cab.getPauseRequested();
        if (pauseAfterFrames > 0) {
            this.pausedRequested = true;
            this.pauseFadeOutCurve = getCurve(
                this.pauseFadeOutCurve,
                Math.max(FADE_MINIMUM_VOLUME, this.baseVolume),
                FADE_MINIMUM_VOLUME
            );
            this.framesProcessedAfterPauseRequest = 0;
            this.pauseAfterFrames = pauseAfterFrames;
        } else if (pauseAfterFrames < 0) {
            this.pausedRequested = false;
        }
        let volume: number = -1;
        if (this.pausedRequested) {
            if (this.framesProcessedAfterPauseRequest >= this.pauseAfterFrames) {
                this.pausedRequested = false;
                this.baseVolume = FADE_MINIMUM_VOLUME;
                cab.setPaused();
                return true;
            }
            this.framesProcessedAfterPauseRequest += WEB_AUDIO_BLOCK_SIZE;
            const curveIndex = Math.min(
                CURVE_LENGTH,
                Math.round((this.framesProcessedAfterPauseRequest / this.pauseAfterFrames) * CURVE_LENGTH)
            );
            volume = this.pauseFadeOutCurve[curveIndex];
            this.baseVolume = volume;
        } else if (this.resuming) {
            if (this.framesProcessedAfterResume >= this.resumeFadeInFrameCount) {
                this.resuming = false;
                this.framesProcessedAfterResume = 0;
                this.baseVolume = 1;
            } else {
                this.framesProcessedAfterResume += WEB_AUDIO_BLOCK_SIZE;
                const curveIndex = Math.min(
                    CURVE_LENGTH,
                    Math.round((this.framesProcessedAfterResume / this.resumeFadeInFrameCount) * CURVE_LENGTH)
                );
                volume = this.resumeFadeInCurve[curveIndex];
                this.baseVolume = volume;
            }
        }

        const framesWritten = cab.read(channels, WEB_AUDIO_BLOCK_SIZE);
        if (framesWritten < 0) {
            return true;
        }
        this.frameNumber = (this.frameNumber + Math.round(framesWritten * this.playbackRate)) % MAX_FRAME;
        if (volume !== -1) {
            for (const channel of channels) {
                for (let i = 0; i < framesWritten; ++i) {
                    channel[i] *= volume;
                }
            }
        }
        cab.setCurrentFrameNumber(this.frameNumber);

        if (framesWritten < WEB_AUDIO_BLOCK_SIZE && isBackgrounded) {
            cab.setPaused();
        }
        return true;
    }
}

registerProcessor("sink-worklet", SinkWorklet);

export {};
