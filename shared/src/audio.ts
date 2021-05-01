import * as io from "io-ts";

import { ChannelCount, FileReference } from "./metadata";
import { AudioPlayerEffects } from "./preferences";

export const FLOAT32_BYTES = 4;
export const WEB_AUDIO_BLOCK_SIZE = 128;
export const SCHEDULE_AHEAD_RATIO = 0.75;
export const DEFAULT_BUFFER_LENGTH_SECONDS = 0.4;
export const MIN_BUFFER_LENGTH_SECONDS = 0.4;
export const MAX_BUFFER_LENGTH_SECONDS = 2;
export const SUSTAINED_BUFFERED_AUDIO_RATIO = 4;
export const MIN_SUSTAINED_AUDIO_SECONDS = 2;
export const FADE_MINIMUM_VOLUME = 0.2;

export const BufferFillType = io.union([
    io.literal("BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER"),
    io.literal("BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER"),
    io.literal("BUFFER_FILL_TYPE_REGULAR_BUFFER"),
]);
export type BufferFillType = io.TypeOf<typeof BufferFillType>;

export interface AudioConfig {
    bufferTime?: number;
    loudnessNormalization?: boolean;
    silenceTrimming?: boolean;
    crossfadeDuration?: number;
    effects?: AudioPlayerEffects;
}

export type ChannelData = Float32Array[];

export interface FillBuffersOpts {
    bufferFillCount: number;
}

export interface SeekOpts extends FillBuffersOpts {
    bufferFillCount: number;
    time: number;
}

export interface LoadOpts extends FillBuffersOpts {
    fileReference: FileReference;
    isPreloadForNextTrack: boolean;
    progress: number;
    resumeAfterLoad: boolean;
}

export interface BufferDescriptor {
    length: number;
    startTime: number;
    endTime: number;
    loudnessInfo: { isEntirelySilent: boolean };
    sampleRate: number;
    channelCount: ChannelCount;
    decodingLatency: number;
    isBackgroundBuffer: boolean;
    isLastBuffer: boolean;
}

export interface BufferFillExtraData {
    baseTime?: number;
    demuxData?: any;
    isPreloadForNextTrack?: boolean;
    resumeAfterLoad?: boolean;
}

export interface AudioPlayerBackendActions<T> {
    audioConfiguration: (this: T, args: AudioConfig) => void;
    ping: (this: T) => void;
    seek: (this: T, opts: SeekOpts) => Promise<void>;
    load: (this: T, opts: LoadOpts) => Promise<void>;
    fillBuffers: (this: T, opts: FillBuffersOpts) => Promise<void>;
}

export interface TrackArgs {
    demuxData: {
        duration: number;
    };
    baseTime: number;
}

export interface StateModificationAction {
    type: "suspend" | "resume";
    promise: Promise<void>;
}

export interface BufferFilledResult {
    type: "bufferFilled";
    descriptor?: BufferDescriptor;
    bufferFillType: BufferFillType;
    extraData: BufferFillExtraData | null;
}
export interface IdleResult {
    type: "idle";
}
export interface ErrorResult {
    type: "error";
    message: string;
}

export type AudioPlayerResult = BufferFilledResult | IdleResult | ErrorResult;
