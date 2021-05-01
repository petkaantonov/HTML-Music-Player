import { ChannelCount } from "shared/metadata";

export const ALPHA = 0.1;

export interface FrameDescriptor {
    channelCount: ChannelCount;
    sampleRate: number;
    channelDataFilled: boolean;
}

export interface ConfigOpts {
    maxFrequency: number;
    bufferSize: number;
    minFrequency: number;
    baseSmoothingConstant: number;
}
export interface GetBinsOpts {
    channelData: ArrayBuffer[];
    bins: ArrayBuffer;
    frameDescriptor: FrameDescriptor;
    binCount: number;
}

export interface AudioVisualizerBackendActions<T> {
    configure: (this: T, o: ConfigOpts) => void;
    getBins: (this: T, o: GetBinsOpts) => void;
}

export interface BinsResult {
    type: "bins";
    bins: ArrayBuffer;
    channelData: ArrayBuffer[];
}

export type AudioVisualizerResult = BinsResult;
