import {noUndefinedGet} from "util";
import {Float32Array, Float64Array, performance} from "platform/platform";
import {AUDIO_VISUALIZER_READY_EVENT_NAME} from "visualization/AudioVisualizerBackend";
import WorkerFrontend from "WorkerFrontend";
import {CANVAS_ENABLED_STATE_CHANGE_EVENT} from "visualization/VisualizerCanvas";

const ALPHA = 0.1;

export default class AudioVisualizer extends WorkerFrontend {
    constructor(opts, deps) {
        super(AUDIO_VISUALIZER_READY_EVENT_NAME, deps.workerWrapper);
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.visualizerCanvas = null;

        this.maxFrequency = opts.maxFrequency;
        this.minFrequency = opts.minFrequency;
        this.bufferSize = opts.bufferSize;
        this.baseSmoothingConstant = opts.baseSmoothingConstant;
        this.targetFps = opts.targetFps;

        this._receivedFrame = this._receivedFrame.bind(this);

        this._frameSkip = 1;
        this._sourceNode = null;
        this._channelData = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
        this._bins = null;
        this._paused = false;
        this._resolveGetBinsPromise = null;
        this._awaitingBackendResponse = false;
        this._frameHandle = -1;
        this._numericFrameId = 0;
        this._nextBinUpdateRequestId = 0;
        this._binsUpdatedForRequestId = -1;
        this._lastRafArg = -1;
        this._actualFps = 0;
        this._workerFps = 0;
        this._init();
    }

    get canvasEnabled() {
        return this.visualizerCanvas && this.visualizerCanvas.isEnabled();
    }

    get actualFps() {
        return Math.ceil(this._actualFps);
    }

    get workerFps() {
        return Math.floor(this._workerFps);
    }

    _getAudioLatency() {
        return this._sourceNode.getAudioLatency();
    }

    _adjustFrameRate() {
        const {targetFps, actualFps} = this;

        if (actualFps > targetFps * 1.1) {
            if (actualFps / 2 > 0.8 * targetFps && this._frameSkip < 8) {
                this._frameSkip <<= 1;
            }
        } else if (actualFps < targetFps * 0.8 && this._frameSkip > 1) {
            this._frameSkip >>= 1;
        }
    }

    _getBins(frameDescriptor) {
        this._awaitingBackendResponse = true;
        return new Promise((resolve) => {
            this._resolveGetBinsPromise = resolve;
            const channelData = this._channelData.map(v => v.buffer);
            const bins = this._bins.buffer;
            const transferList = channelData.concat(bins);
            this.postMessage({
                action: `getBins`,
                args: {
                    frameDescriptor,
                    channelData,
                    bins,
                    binCount: this.binCount()
                }
            }, transferList);
        });
    }

    receiveMessage(event) {
        try {
            const {channelData, bins} = event.data;
            for (let i = 0; i < channelData.length; ++i) {
                this._channelData[i] = new Float32Array(channelData[i]);
            }
            this._bins = new Float64Array(bins);
            this._resolveGetBinsPromise();
            this._resolveGetBinsPromise = null;
        } finally {
            this._awaitingBackendResponse = false;
        }
    }

    _shouldSkipFrame() {
        return (this._numericFrameId & (this._frameSkip - 1)) !== 0;
    }

    _requestAnimationFrame() {
        if (!this.canvasEnabled) {
            return false;
        }
        this._frameHandle = this.page.requestAnimationFrame(this._receivedFrame);
        this._numericFrameId++;
        return true;
    }

    async _requestBinsAndAnimationFrame() {
        if (!this._requestAnimationFrame()) {
            return;
        }

        const requestId = ++this._nextBinUpdateRequestId;
        if (this.visualizerCanvas.needsToDraw() &&
            !this._paused &&
            !this._awaitingBackendResponse) {
            const {actualFps} = this;
            const offsetSeconds = (actualFps > 0 ? (1000 / actualFps / 1000) : 1000 / this.targetFps) -
                                    this._getAudioLatency();

            const frameDescriptor = this._sourceNode.getSamplesScheduledAtOffsetRelativeToNow(this._channelData, offsetSeconds);

            if (!frameDescriptor.channelDataFilled) {
                return;
            }

            const binCount = this.binCount();
            if (!this._bins || this._bins.length !== binCount) {
                this._bins = new Float64Array(binCount);
            }

            const now = performance.now();
            await this._getBins(frameDescriptor);
            this._binsUpdatedForRequestId = requestId;
            const fps = 1000 / (performance.now() - now);
            this._workerFps = (this._workerFps * (1 - ALPHA)) + fps * ALPHA;
        }
    }

    _receivedFrame(now) {
        if (!this._shouldSkipFrame()) {
            const then = this._lastRafArg;
            this._lastRafArg = now;
            if (then !== -1) {
                const elapsed = now - then;
                const fps = 1000 / elapsed;
                if (fps > 1) {
                    this._actualFps = (this._actualFps * (1 - ALPHA)) + fps * ALPHA;
                    this._adjustFrameRate();
                }
            }

            if (this._binsUpdatedForRequestId === this._nextBinUpdateRequestId) {
                this.visualizerCanvas.drawBins(now, this._bins);
            } else if (this.visualizerCanvas.needsToDraw() && this._paused) {
                this.visualizerCanvas.drawIdleBins(now);
            } else {
                // TODO: This happens when fps is too high yet worker is too
                // Slow.
            }
            this._requestBinsAndAnimationFrame();
        } else {
            this._requestAnimationFrame();
        }
    }

    setCanvas(visualizerCanvas) {
        this.visualizerCanvas = visualizerCanvas;
        visualizerCanvas.on(CANVAS_ENABLED_STATE_CHANGE_EVENT, this._visualizerCanvasEnabledStateChanged.bind(this));
    }

    _visualizerCanvasEnabledStateChanged() {
        if (this.canvasEnabled && this._sourceNode) {
            this._requestBinsAndAnimationFrame();
        } else {
            this.page.cancelAnimationFrame(this._frameHandle);
        }
    }

    async _init() {
        await this.ready();
        const {maxFrequency,
                minFrequency,
                bufferSize,
                baseSmoothingConstant} = this;
        this.postMessage({
            action: `configure`,
            args: {
                maxFrequency,
                minFrequency,
                bufferSize,
                baseSmoothingConstant
            }
        });
    }

    connectSourceNode(sourceNode) {
        this._lastRafArg = -1;
        this.page.cancelAnimationFrame(this._frameHandle);
        this._sourceNode = sourceNode;
        this._requestBinsAndAnimationFrame();
    }

    disconnectSourceNode(sourceNode) {
        if (this._sourceNode === sourceNode) {
            this._lastRafArg = -1;
            this.page.cancelAnimationFrame(this._frameHandle);
            this._sourceNode = null;
        }
    }

    binCount() {
        return this.visualizerCanvas.getNumBins();
    }

    pause() {
        if (this._paused) return;
        this._paused = true;
    }

    resume() {
        if (!this._paused) return;
        this._paused = false;
    }
}
