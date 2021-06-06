import { debugFor } from "shared/src/debug";
import { InterpolatorName } from "shared/src/easing";
import { AudioVisualizerBackendActions } from "shared/visualizer";
import { SelectDeps } from "ui/Application";
import AudioPlayerFrontend from "ui/audio/AudioPlayerFrontend";
import Page from "ui/platform/dom/Page";
import VisualizerCanvas from "ui/visualization/VisualizerCanvas";
import WorkerFrontend from "ui/WorkerFrontend";
const dbg = debugFor("AudioVisualizerFrontend");

type Deps = SelectDeps<"page" | "audioManager" | "visualizerWorker">;
interface Opts {
    maxFrequency: number;
    minFrequency: number;
    bufferSize: number;
    baseSmoothingConstant: number;
    targetFps: number;
    capDropTime: number;
    interpolator: InterpolatorName;
    binWidth: number;
    gapWidth: number;
    capHeight: number;
    capSeparator: number;
    capStyle: string;
    pixelRatio: number;
    ghostOpacity?: number;
}
export default class AudioVisualizerFrontend extends WorkerFrontend<null> {
    page: Page;
    audioManager: AudioPlayerFrontend;

    readonly maxFrequency: number;
    readonly minFrequency: number;
    readonly bufferSize: number;
    readonly baseSmoothingConstant: number;
    readonly targetFps: number;
    readonly capDropTime: number;
    readonly interpolator: InterpolatorName;
    readonly binWidth: number;
    readonly gapWidth: number;
    readonly capHeight: number;
    readonly capSeparator: number;
    readonly capStyle: string;
    readonly pixelRatio: number;
    readonly ghostOpacity?: number;
    constructor(opts: Opts, deps: Deps) {
        super("visualizer", deps.visualizerWorker);
        this.page = deps.page;
        this.audioManager = deps.audioManager;

        this.maxFrequency = opts.maxFrequency;
        this.minFrequency = opts.minFrequency;
        this.bufferSize = opts.bufferSize;
        this.baseSmoothingConstant = opts.baseSmoothingConstant;
        this.targetFps = opts.targetFps;
        this.capDropTime = opts.capDropTime;
        this.interpolator = opts.interpolator;
        this.binWidth = opts.binWidth;
        this.gapWidth = opts.gapWidth;
        this.capHeight = opts.capHeight;
        this.capSeparator = opts.capSeparator;
        this.capStyle = opts.capStyle;
        this.ghostOpacity = opts.ghostOpacity;
        this.pixelRatio = opts.pixelRatio;
    }

    receiveMessageFromBackend(_arg: any, _transferList?: ArrayBuffer[]): void {
        throw new Error("Method not implemented.");
    }

    async ready() {
        await Promise.all([super.ready(), this.audioManager.ready()]);
    }

    dimensionsChanged = (visualizerCanvas: VisualizerCanvas) => {
        const { width, height } = visualizerCanvas;
        this.postMessageToVisualizerBackend("setDimensions", undefined, {
            width,
            height,
        });
    };

    visibilityChanged = (visualizerCanvas: VisualizerCanvas) => {
        this.postMessageToVisualizerBackend("setVisibility", undefined, {
            visible: visualizerCanvas.isVisible,
        });
    };

    async initialize(visualizerCanvas: VisualizerCanvas) {
        await Promise.all([visualizerCanvas.initialize(), this.ready()]);
        visualizerCanvas.on("dimensionChange", this.dimensionsChanged);
        visualizerCanvas.on("visibilityChange", this.visibilityChanged);
        const canvas = visualizerCanvas.canvas.transferControlToOffscreen();
        const { width, height, isVisible } = visualizerCanvas;
        const { sampleRate, audioPlayerBackendPort, totalLatency: audioPlayerLatency } = this.audioManager;
        const {
            maxFrequency,
            minFrequency,
            bufferSize,
            baseSmoothingConstant,
            interpolator,
            capDropTime,
            binWidth,
            gapWidth,
            capHeight,
            capSeparator,
            capStyle,
            ghostOpacity,
            pixelRatio,
        } = this;
        this.postMessageToVisualizerBackend("initialize", [canvas, audioPlayerBackendPort], {
            maxFrequency,
            minFrequency,
            bufferSize,
            baseSmoothingConstant,
            audioPlayerBackendPort,
            sampleRate,
            audioPlayerLatency,
            width,
            height,
            capDropTime,
            interpolator,
            canvas,
            binWidth,
            gapWidth,
            capHeight,
            capSeparator,
            capStyle,
            ghostOpacity,
            pixelRatio,
            visible: isVisible,
        });
        dbg(
            "initialize",
            JSON.stringify({
                maxFrequency,
                minFrequency,
                bufferSize,
                baseSmoothingConstant,
                audioPlayerBackendPort,
                sampleRate,
                audioPlayerLatency,
                width,
                height,
                capDropTime,
                interpolator,
                canvas,
                binWidth,
                gapWidth,
                capHeight,
                capSeparator,
                capStyle,
                ghostOpacity,
                pixelRatio,
                visible: isVisible,
            })
        );
    }

    postMessageToVisualizerBackend = <T extends string & keyof AudioVisualizerBackendActions<unknown>>(
        action: T,
        transferList?: Transferable[],
        ...args: Parameters<AudioVisualizerBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args, transferList);
    };
}
