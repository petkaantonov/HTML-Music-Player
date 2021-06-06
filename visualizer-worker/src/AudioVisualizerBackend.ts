import realFft from "shared/realfft";
import { RENDERED_CHANNEL_COUNT } from "shared/src/audio";
import { debugFor } from "shared/src/debug";
import { decode } from "shared/src/types/helpers";
import VisualizerBus, { HEADER_BYTES } from "shared/src/worker/VisualizerBus";
import {
    AudioBackendMessage,
    AudioVisualizerBackendActions,
    DimensionOpts,
    VisibilityOpts,
    VisualizerMessage,
    VisualizerOpts,
} from "shared/visualizer";
import AbstractBackend from "shared/worker/AbstractBackend";

import Renderer from "./Renderer";
const dbg = debugFor("AudioVisualizerBackend");

const cachedBins = new Float64Array(300);

const weights = new Float32Array([
    0,
    0,
    10,
    0.0003019951720402013,
    12.5,
    0.0006760829753919819,
    16,
    0.0014621771744567184,
    20,
    0.0029853826189179603,
    25,
    0.10351421666793437,
    31.5,
    0.19054607179632474,
    40,
    0.481131121482591,
    50,
    0.5095408738576246,
    63,
    0.515408738576246,
    80,
    0.525408738576246,
    100,
    0.5395408738576246,
    125,
    0.5595408738576246,
    160,
    0.4195408738576246,
    200,
    0.4395408738576246,
    250,
    0.4495408738576246,
    315,
    0.4595408738576246,
    400,
    0.4754399373371569,
    500,
    0.5918309709189364,
    630,
    0.6035261221856173,
    800,
    0.6220108393559098,
    1000,
    0.690108393559098,
    1250,
    0.680108393559098,
    1600,
    0.67108393559098,
    2000,
    0.660108393559098,
    2500,
    0.650108393559098,
    3150,
    0.64108393559098,
    4000,
    0.630108393559098,
    5000,
    0.620108393559098,
    6300,
    0.930108393559098,
    8000,
    1.05108393559098,
    10000,
    1.08498942093324559,
    12500,
    1.126095368972401691,
    16000,
    1.3946773514128719823,
    20000,
    0.34276778654645035,
]);

// FPS
// Dimensions
// Latency
export default class AudioVisualizerBackend extends AbstractBackend<
    AudioVisualizerBackendActions<AudioVisualizerBackend>,
    "visualizer"
> {
    private _frameSkip = 1;
    private _numericFrameId = 0;
    private audioPlayerBackendport: MessagePort | null = null;
    private bus: VisualizerBus | null = null;
    private renderer: Renderer | null = null;
    private sampleRate: number = 0;
    private _maxFrequency: number = 0;
    private animationFrameRequested: boolean = false;
    private paused: boolean = true;
    private visible: boolean = false;
    private lastRenderTime: number = 0;
    private _minFrequency: number = 0;
    private fps: number = 0;
    private audioPlayerLatency: number = 0;
    private _bufferSize: number = 0;
    private _baseSmoothingConstant: number = 0;
    private _visualizerData: Float32Array | null = null;
    private _windowData: Float32Array | null = null;
    private avgLatency: number = 0;
    constructor() {
        super("visualizer", {
            setVisibility: (opts: VisibilityOpts) => this._setVisibility(opts),
            setDimensions: (opts: DimensionOpts) => this._setDimensions(opts),
            initialize: (opts: VisualizerOpts) => this._initialize(opts),
        });
    }

    get bins(): number {
        return this.renderer!.getNumBins();
    }

    _setVisibility(opts: VisibilityOpts) {
        this.visible = opts.visible;
        if (!this.animationFrameRequested && !this.paused && this.visible) {
            this.animationFrameRequested = true;
            requestAnimationFrame(this._animationFrameReceived);
        }
    }

    _setDimensions(opts: DimensionOpts) {
        this.renderer!.setDimensions(opts);
    }

    _initialize({
        sampleRate,
        canvas,
        maxFrequency,
        bufferSize,
        minFrequency,
        baseSmoothingConstant,
        audioPlayerLatency,
        interpolator,
        capDropTime,
        width,
        height,
        audioPlayerBackendPort,
        binWidth,
        gapWidth,
        visible,
        capHeight,
        capSeparator,
        capStyle,
        ghostOpacity,
        pixelRatio,
    }: VisualizerOpts) {
        const sab = new SharedArrayBuffer(HEADER_BYTES + RENDERED_CHANNEL_COUNT * bufferSize * 4);
        this.visible = visible;
        this._maxFrequency = maxFrequency;
        this._bufferSize = bufferSize;
        this._minFrequency = minFrequency;
        this._baseSmoothingConstant = baseSmoothingConstant;
        this.audioPlayerLatency = audioPlayerLatency;
        this.sampleRate = sampleRate;
        this.bus = new VisualizerBus(sab);
        this.audioPlayerBackendport = audioPlayerBackendPort;
        audioPlayerBackendPort.onmessage = this.receiveAudioBackendMessage;
        this._visualizerData = new Float32Array(this._bufferSize);
        this._windowData = new Float32Array(this._bufferSize);
        this._fillWindow();
        this.renderer = new Renderer({
            canvas,
            width,
            height,
            capDropTime,
            interpolator,
            binWidth,
            gapWidth,
            capHeight,
            capSeparator,
            capStyle,
            ghostOpacity,
            pixelRatio,
        });
        this.postAudioBackendMessage({
            type: "initialize",
            sab,
        });
        dbg(
            "initialize",
            JSON.stringify({
                sampleRate,
                canvas,
                maxFrequency,
                bufferSize,
                minFrequency,
                baseSmoothingConstant,
                audioPlayerLatency,
                interpolator,
                capDropTime,
                width,
                height,
                audioPlayerBackendPort,
                binWidth,
                gapWidth,
                visible,
                capHeight,
                capSeparator,
                capStyle,
                ghostOpacity,
                pixelRatio,
            })
        );
    }

    receiveAudioBackendMessage = (e: MessageEvent<any>) => {
        const message = decode(AudioBackendMessage, e.data);
        switch (message.type) {
            case "resume":
                this.paused = false;
                if (!this.animationFrameRequested && this.visible) {
                    this.animationFrameRequested = true;
                    requestAnimationFrame(this._animationFrameReceived);
                }
                break;
            case "pause":
                this.paused = true;
                break;
        }
    };

    postAudioBackendMessage(message: VisualizerMessage) {
        this.audioPlayerBackendport!.postMessage(message);
    }

    _getBins(frames: Float32Array) {
        const { _visualizerData: visualizerData, _windowData: windowData } = this;

        for (let i = 0; i < frames.length; ++i) {
            visualizerData![i] = Math.fround(
                (Math.fround(frames[i * RENDERED_CHANNEL_COUNT]! + frames[i * RENDERED_CHANNEL_COUNT + 1]!) / 2) *
                    windowData![i]!
            );
        }
        realFft(visualizerData!);
        const binsF64 = cachedBins.subarray(0, this.bins);
        this._calculateBins(visualizerData!, binsF64, this.sampleRate);
        return binsF64;
    }

    _shouldSkipFrame() {
        return (this._numericFrameId & (this._frameSkip - 1)) !== 0;
    }

    _adjustFrameRate() {
        const { fps } = this;

        if (fps > 60 * 1.1) {
            if (fps / 2 > 0.8 * 60 && this._frameSkip < 8) {
                this._frameSkip <<= 1;
            }
        } else if (fps < 60 * 0.8 && this._frameSkip > 1) {
            this._frameSkip >>= 1;
        }
    }

    _animationFrameReceived = () => {
        this._numericFrameId++;
        if (this._shouldSkipFrame()) {
            if (!this.paused && this.visible) {
                this.animationFrameRequested = true;
                requestAnimationFrame(this._animationFrameReceived);
            }
            return;
        }
        const then = this.lastRenderTime;
        const now = performance.now();
        if (then !== 0) {
            const elapsed = now - then;
            const fps = 1000 / elapsed;
            if (fps > 1) {
                this.fps = this.fps * (1 - 0.1) + fps * 0.1;
                this._adjustFrameRate();
            }
        }
        this.animationFrameRequested = false;
        this.bus!.resetFramesAvailable();
        this.postAudioBackendMessage({
            type: "audioFramesForVisualizer",
            latency: this.audioPlayerLatency + this.avgLatency / 1000,
            frames: this._bufferSize,
        });
        const frames = this.bus!.getFrames();
        const afterFramesNow = performance.now();
        const latency = afterFramesNow - now;
        this.avgLatency = this.avgLatency * (1 - 0.1) + latency * 0.1;

        let bins: Float64Array;
        if (frames.length / RENDERED_CHANNEL_COUNT !== this._bufferSize) {
            bins = cachedBins.subarray(0, this.bins).fill(0);
        } else {
            bins = this._getBins(frames);
        }

        if ((this.renderer!.drawBins(afterFramesNow, bins) || !this.paused) && this.visible) {
            this.animationFrameRequested = true;
            requestAnimationFrame(this._animationFrameReceived);
        }
        this.lastRenderTime = now;
    };

    _fillWindow() {
        const window = this._windowData!;
        const N = window.length;
        for (let n = 0; n < N; ++n) {
            // Hamming window.
            window[n] = Math.fround(0.53836 - 0.46164 * Math.cos((2 * Math.PI * n) / (N - 1)));
        }
    }

    _calculateBins(X: Float32Array, bins: Float64Array, sampleRate: number) {
        const {
            _baseSmoothingConstant: baseSmoothingConstant,
            _maxFrequency: maxFrequency,
            _bufferSize: bufferSize,
        } = this;
        const imOffset = bufferSize >> 1;
        const smoothingConstant = Math.pow(baseSmoothingConstant, bufferSize / sampleRate);
        const inverseSmoothingConstant = 1 - smoothingConstant;

        const fftFreqs = Math.ceil(maxFrequency / (sampleRate / bufferSize));
        const binSize = bins.length;

        let binFrequencyStart = 1;
        let aWeightIndex = 2;
        let previousEnd = 0;
        for (let i = 0; i < binSize; ++i) {
            let binFrequencyEnd = (Math.pow((i + 1) / binSize, 2) * fftFreqs) | 0;

            if (binFrequencyEnd <= previousEnd) {
                binFrequencyEnd = previousEnd + 1;
            }
            previousEnd = binFrequencyEnd;
            binFrequencyEnd = Math.min(fftFreqs, binFrequencyEnd) + 1;

            const binWidth = Math.max(1, binFrequencyEnd - binFrequencyStart);
            let maxPower = 0;
            let binFrequency = 0;

            for (let j = 0; j < binWidth; ++j) {
                const re = X[binFrequencyStart + j]!;
                const im = X[imOffset + binFrequencyStart + j]!;
                const power = re * re + im * im;
                if (power > maxPower) {
                    binFrequency = (((binFrequencyStart + j) * sampleRate) / bufferSize) | 0;
                    maxPower = power;
                }
            }

            maxPower = Math.max(0, Math.log(maxPower));

            for (let j = aWeightIndex; j < weights.length; j += 2) {
                const weightFrequency = weights[j]!;

                if (binFrequency < weightFrequency) {
                    maxPower *= weights[j - 1]!;
                    aWeightIndex = j;
                    break;
                }
            }

            maxPower = Math.min(0.97, bins[i]! * smoothingConstant + inverseSmoothingConstant * maxPower * 0.24);

            bins[i] = maxPower;
            binFrequencyStart = binFrequencyEnd;
        }
    }
}
