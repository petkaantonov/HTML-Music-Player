import * as io from "io-ts";
import { InterpolatorName } from "shared/easing";
import { ioTypeFromClass } from "shared/types/helpers";

export const SHADOW_BLUR = 2;
export const SHADOW_COLOR = `rgb(11,32,53)`;
export const MAX_CANVAS_WIDTH = 638;

export const InitializeAudioBackend = io.type({
    type: io.literal("initialize"),
    sab: ioTypeFromClass(SharedArrayBuffer),
});

export type InitializeAudioBackend = io.TypeOf<typeof InitializeAudioBackend>;

export const RequestFramesForVisualizer = io.type({
    type: io.literal("audioFramesForVisualizer"),
    latency: io.number,
    frames: io.number,
});
export type RequestFramesForVisualizer = io.TypeOf<typeof RequestFramesForVisualizer>;

export const VisualizerMessage = io.union([InitializeAudioBackend, RequestFramesForVisualizer]);
export type VisualizerMessage = io.TypeOf<typeof VisualizerMessage>;

export const AudioResumedMessage = io.type({
    type: io.literal("resume"),
});

export type AudioResumedMessage = io.TypeOf<typeof AudioResumedMessage>;

export const AudioPausedMessage = io.type({
    type: io.literal("pause"),
});

export type AudioPausedMessage = io.TypeOf<typeof AudioPausedMessage>;

export const AudioBackendMessage = io.union([AudioResumedMessage, AudioPausedMessage]);
export type AudioBackendMessage = io.TypeOf<typeof AudioBackendMessage>;

export const ALPHA = 0.1;

export interface DimensionOpts {
    width: number;
    height: number;
}

export interface CanvasOpts {
    canvas: OffscreenCanvas;
}

export interface RendererOpts {
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

export interface VisibilityOpts {
    visible: boolean;
}

export interface VisualizerOpts extends DimensionOpts, CanvasOpts, RendererOpts, VisibilityOpts {
    audioPlayerBackendPort: MessagePort;
    sampleRate: number;
    maxFrequency: number;
    bufferSize: number;
    minFrequency: number;
    baseSmoothingConstant: number;
    audioPlayerLatency: number;
}

export interface AudioVisualizerBackendActions<T> {
    setDimensions: (this: T, o: DimensionOpts) => void;
    setVisibility: (this: T, o: VisibilityOpts) => void;
    initialize: (this: T, o: VisualizerOpts) => void;
}
