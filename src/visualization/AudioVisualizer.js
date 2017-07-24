import {noUndefinedGet} from "util";
import realFft from "audio/realfft";
import {Float32Array, Float64Array} from "platform/platform";

const weights = new Float32Array([
    0, 0,
    10, 0.0003019951720402013,
    12.5, 0.0006760829753919819,
    16, 0.0014621771744567184,
    20, 0.0029853826189179603,
    25, 0.10351421666793437,
    31.5, 0.19054607179632474,
    40, 0.481131121482591,
    50, 0.5095408738576246,
    63, 0.515408738576246,
    80, 0.525408738576246,
    100, 0.5395408738576246,
    125, 0.5595408738576246,
    160, 0.4195408738576246,
    200, 0.4395408738576246,
    250, 0.4495408738576246,
    315, 0.4595408738576246,
    400, 0.4754399373371569,
    500, 0.5918309709189364,
    630, 0.6035261221856173,
    800, 0.6220108393559098,
    1000, 0.690108393559098,
    1250, 0.680108393559098,
    1600, 0.67108393559098,
    2000, 0.660108393559098,
    2500, 0.650108393559098,
    3150, 0.64108393559098,
    4000, 0.630108393559098,
    5000, 0.620108393559098,
    6300, 0.930108393559098,
    8000, 1.270108393559098,
    10000, 1.29498942093324559,
    12500, 1.346095368972401691,
    16000, 1.3946773514128719823,
    20000, 0.34276778654645035
]);



function makeBuffer(bufferSize) {
    return {
        channelData: [new Float32Array(bufferSize), new Float32Array(bufferSize)],
        visualizerData: new Float32Array(bufferSize),
        windowData: new Float64Array(bufferSize)
    };
}

const cachedBuffers = new Map();

export default class AudioVisualizer {
    constructor(audioContext, sourceNode, visualizerCanvas, opts) {
        opts = noUndefinedGet(opts);
        this.visualizerCanvas = visualizerCanvas;
        this.sampleRate = audioContext.sampleRate;
        this.maxFrequency = opts.maxFrequency || 18500;
        this.minFrequency = opts.minFrequency || 20;
        this.bufferSize = 2;
        this.baseSmoothingConstant = opts.baseSmoothingConstant || 0.00007;
        this.sourceNode = sourceNode;
        this.bins = null;
        this.binSizeChanged();

        while (this.bufferSize * this.fps() < this.sampleRate) {
            this.bufferSize *= 2;
        }

        if (this.bufferSize > 16384) {
            throw new Error(`too low fps ${this.fps()} for sample rate${this.sampleRate}`);
        }

        let buffers = cachedBuffers.get(this.bufferSize);
        if (!buffers) {
            buffers = makeBuffer(this.bufferSize);
            cachedBuffers.set(this.bufferSize, buffers);
        }
        const {channelData, windowData, visualizerData} = buffers;
        this.channelData = channelData;
        this.windowData = windowData;
        this.visualizerData = visualizerData;
        this.fillWindow();
        this.destroyed = false;
        this.paused = false;
        this.gotFrame = this.gotFrame.bind(this);
        this.frameId = this.page().requestAnimationFrame(this.gotFrame);
        this.lastFrameTimeStamp = 0;
        this.frameSkip = 1;
        this.frameNumber = 0;
    }

    page() {
        return this.visualizerCanvas.page;
    }

    binSizeChanged() {
        this.bins = new Float32Array(this.binCount());
    }

    binCount() {
        return this.visualizerCanvas.getNumBins();
    }

    fps() {
        return this.visualizerCanvas.getTargetFps();
    }

    pause() {
        if (this.paused) return;
        this.paused = true;
    }

    resume() {
        if (!this.paused) return;
        this.paused = false;
    }

    destroy() {
        this.destroyed = true;
        this.page().cancelAnimationFrame(this.frameId);
        this.sourceNode = null;
    }


    gotFrame(now) {
        if (this.destroyed) return;
        this.frameId = this.page().requestAnimationFrame(this.gotFrame);

        if (!this.visualizerCanvas.needsToDraw()) return;

        const elapsed = now - this.lastFrameTimeStamp;
        const targetFps = this.fps();

        if ((elapsed + 1) < (1000 / targetFps)) {
            let screenFps = Math.ceil(1000 / elapsed);
            let div = screenFps / targetFps;
            if (div !== (div | 0)) div = 2;
            let {frameSkip} = this;
            while (screenFps / div >= targetFps) {
                frameSkip *= div;
                screenFps /= div;
            }

            this.frameSkip = frameSkip;
        } else {
            this.frameSkip = 1;
        }
        this.frameNumber++;

        if (this.frameNumber % this.frameSkip !== 0) {
            return;
        }
        this.lastFrameTimeStamp = now;

        if (this.paused) {
            this.visualizerCanvas.drawIdleBins(now);
            return;
        }

        const frameDescriptor = this.sourceNode.getUpcomingSamples(this.channelData);

        if (!frameDescriptor.channelDataFilled) {
            return;
        }

        const {channelCount, gain} = frameDescriptor;
        const {visualizerData, channelData, windowData} = this;

        if (channelCount === 2) {
            const [src0, src1] = channelData;

            for (let i = 0; i < visualizerData.length; ++i) {
                visualizerData[i] = Math.fround(Math.fround(src0[i] + src1[i]) / 2 * gain * windowData[i]);
            }
        } else {
            const [src] = channelData;

            for (let i = 0; i < visualizerData.length; ++i) {
                visualizerData[i] = Math.fround(src[i] * gain * windowData[i]);
            }
        }

        realFft(visualizerData);
        if (this.bins.length !== this.binCount()) {
            this.binSizeChanged();
        }

        this.calculateBins(frameDescriptor);
        this.visualizerCanvas.drawBins(now, this.bins);
    }

    calculateBins({sampleRate}) {
        const X = this.visualizerData;
        const imOffset = this.bufferSize >> 1;
        const {bins} = this;
        const smoothingConstant = Math.pow(this.baseSmoothingConstant, this.bufferSize / sampleRate);
        const inverseSmoothingConstant = 1 - smoothingConstant;

        const fftFreqs = Math.ceil(this.maxFrequency / (sampleRate / this.bufferSize));
        const binSize = bins.length;

        let binFrequencyStart = 1;
        let aWeightIndex = 2;
        let previousEnd = 0;
        for (let i = 0; i < binSize; ++i) {
            let binFrequencyEnd = ((Math.pow((i + 1) / binSize, 2) * fftFreqs) | 0);

            if (binFrequencyEnd <= previousEnd) {
                binFrequencyEnd = previousEnd + 1;
            }
            previousEnd = binFrequencyEnd;
            binFrequencyEnd = Math.min(fftFreqs, binFrequencyEnd) + 1;

            const binWidth = Math.max(1, binFrequencyEnd - binFrequencyStart);
            let maxPower = 0;
            let binFrequency = 0;

            for (let j = 0; j < binWidth; ++j) {
                const re = X[binFrequencyStart + j];
                const im = X[imOffset + binFrequencyStart + j];
                const power = re * re + im * im;
                if (power > maxPower) {
                    binFrequency = ((binFrequencyStart + j) * sampleRate / this.bufferSize) | 0;
                    maxPower = power;
                }
            }

            maxPower = Math.max(0, Math.log(maxPower));

            for (let j = aWeightIndex; j < weights.length; j += 2) {
                const weightFrequency = weights[j];

                if (binFrequency < weightFrequency) {
                    maxPower *= weights[j - 1];
                    aWeightIndex = j;
                    break;
                }
            }

            maxPower = Math.min(0.97, bins[i] * smoothingConstant + inverseSmoothingConstant * maxPower * 0.24);

            bins[i] = maxPower;
            binFrequencyStart = binFrequencyEnd;
        }
    }

    fillWindow() {
        const window = this.windowData;
        const N = window.length;
        for (let n = 0; n < N; ++n) {
            // Hamming window.
            window[n] = (0.53836 - 0.46164 * Math.cos((2 * Math.PI * n) / (N - 1)));
        }
    }
}
