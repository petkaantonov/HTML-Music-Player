import AbstractBackend from "AbstractBackend";
import {Float32Array, Float64Array} from "platform/platform";
import realFft from "audio/realfft";

export const AUDIO_VISUALIZER_READY_EVENT_NAME = `audioVisualizerReady`;

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

export default class AudioVisualizerBackend extends AbstractBackend {
    constructor(wasm) {
        super(AUDIO_VISUALIZER_READY_EVENT_NAME);
        this._wasm = wasm;

        this._maxFrequency = 0;
        this._minFrequency = 0;
        this._bufferSize = 0;
        this._baseSmoothingConstant = 0;

        this._visualizerData = null;
        this._windowData = null;

        this.actions = {
            configure({maxFrequency,
                        minFrequency,
                        bufferSize,
                        baseSmoothingConstant}) {
                this._maxFrequency = maxFrequency;
                this._minFrequency = minFrequency;
                this._bufferSize = bufferSize;
                this._baseSmoothingConstant = baseSmoothingConstant;

                this._visualizerData = new Float32Array(this._bufferSize);
                this._windowData = new Float32Array(this._bufferSize);
                this._fillWindow();
            },

            getBins({channelData, bins, frameDescriptor}) {
                const channelDataF32 = channelData.map(v => new Float32Array(v));
                const binsF64 = new Float64Array(bins);
                const {channelCount, gain, sampleRate} = frameDescriptor;
                const {_visualizerData: visualizerData,
                       _windowData: windowData,
                       _bufferSize: bufferSize} = this;

                if (channelCount === 2) {
                    const [src0, src1] = channelDataF32;

                    for (let i = 0; i < bufferSize; ++i) {
                        visualizerData[i] = Math.fround(Math.fround(src0[i] + src1[i]) / 2 * gain * windowData[i]);
                    }
                } else {
                    const [src] = channelDataF32;

                    for (let i = 0; i < bufferSize; ++i) {
                        visualizerData[i] = Math.fround(src[i] * gain * windowData[i]);
                    }
                }

                realFft(visualizerData);
                this._calculateBins(visualizerData, binsF64, sampleRate);
                const transferList = channelData.concat(bins);
                this.postMessage({
                    bins,
                    channelData
                }, transferList);
            }
        };
    }

    _fillWindow() {
        const window = this._windowData;
        const N = window.length;
        for (let n = 0; n < N; ++n) {
            // Hamming window.
            window[n] = Math.fround(0.53836 - 0.46164 * Math.cos((2 * Math.PI * n) / (N - 1)));
        }
    }

    _calculateBins(X, bins, sampleRate) {
        const {_baseSmoothingConstant: baseSmoothingConstant,
               _maxFrequency: maxFrequency,
               _bufferSize: bufferSize} = this;
        const imOffset = bufferSize >> 1;
        const smoothingConstant = Math.pow(baseSmoothingConstant, bufferSize / sampleRate);
        const inverseSmoothingConstant = 1 - smoothingConstant;

        const fftFreqs = Math.ceil(maxFrequency / (sampleRate / bufferSize));
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
                    binFrequency = ((binFrequencyStart + j) * sampleRate / bufferSize) | 0;
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
}
