import * as io from "io-ts";

import { ChannelCount, FileReference } from "./metadata";
import { AudioPlayerEffects } from "./preferences";

export const FLOAT32_BYTES = 4;
export const WEB_AUDIO_BLOCK_SIZE = 128;
export const MAX_FRAME = 8388608 * WEB_AUDIO_BLOCK_SIZE;
export const SCHEDULE_AHEAD_RATIO = 0.75;
export const DEFAULT_BUFFER_LENGTH_SECONDS = 0.4;
export const MIN_BUFFER_LENGTH_SECONDS = 0.4;
export const MAX_BUFFER_LENGTH_SECONDS = 2;
export const SUSTAINED_BUFFERED_AUDIO_RATIO = 4;
export const MAX_SUSTAINED_AUDIO_SECONDS = SUSTAINED_BUFFERED_AUDIO_RATIO * MAX_BUFFER_LENGTH_SECONDS;
export const MIN_SUSTAINED_AUDIO_SECONDS = 2;
export const FADE_MINIMUM_VOLUME = 0.2;
export const PRELOAD_THRESHOLD_SECONDS = 5;

export const AudioWorkletMessage = io.type({
    type: io.literal("timeupdate"),
});
export type AudioWorkletMessage = io.TypeOf<typeof AudioWorkletMessage>;

export const BufferFillType = io.union([
    io.literal("BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER"),
    io.literal("BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER"),
    io.literal("BUFFER_FILL_TYPE_REGULAR_BUFFER"),
]);
export type BufferFillType = io.TypeOf<typeof BufferFillType>;

export interface AudioConfig {
    outputLatency?: number;
    baseLatency?: number;
    bufferTime?: number;
    sustainedBufferedAudioSeconds?: number;
    loudnessNormalization?: boolean;
    silenceTrimming?: boolean;
    crossfadeDuration?: number;
    effects?: AudioPlayerEffects;
    sab?: SharedArrayBuffer;
    backgroundSab?: SharedArrayBuffer;
    sampleRate?: number;
    channelCount?: number;
}

export type ChannelData = Float32Array[];

export interface SeekOpts {
    time: number;
    resumeAfterInitialization: boolean;
}

export interface LoadOpts {
    fileReference: FileReference;
    progress: number;
    resumeAfterInitialization: boolean;
}

export interface NextTrackResponseOpts {
    fileReference?: FileReference;
}

export interface BufferDescriptor {
    length: number;
    startFrames: number;
    endFrames: number;
    loudnessInfo: { isEntirelySilent: boolean };
    sampleRate: number;
    channelCount: ChannelCount;
    decodingLatency: number;
    isFadeoutBuffer: boolean;
    isLastBuffer: boolean;
}

export interface BufferFillExtraData {
    baseTime?: number;
    demuxData?: any;
    isPreloadForNextTrack?: boolean;
    resumeAfterLoad?: boolean;
}

export interface PauseOpts {
    fadeOutDelay: number;
}

export interface AudioPlayerBackendActions<T> {
    timeUpdate: (this: T) => void;
    initialAudioConfiguration: (this: T, args: Required<AudioConfig>) => void;
    audioConfigurationChange: (this: T, args: AudioConfig) => void;
    pause: (this: T, opts: PauseOpts) => void;
    resume: (this: T) => void;
    seek: (this: T, opts: SeekOpts) => Promise<void>;
    load: (this: T, opts: LoadOpts) => Promise<void>;
    nextTrackResponse: (this: T, opts: NextTrackResponseOpts) => Promise<void>;
    nextTrackResponseUpdate: (this: T, opts: NextTrackResponseOpts) => Promise<void>;
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

export const TimeUpdateResult = io.type({
    type: io.literal("timeupdate"),
    currentTime: io.number,
    totalTime: io.number,
});

export type TimeUpdateResult = io.TypeOf<typeof TimeUpdateResult>;

export const ErrorResult = io.type({
    type: io.literal("error"),
    message: io.string,
});

export type ErrorResult = io.TypeOf<typeof ErrorResult>;

export const StopResult = io.type({
    type: io.literal("stop"),
    reason: io.keyof({ "preload-error": true }),
});

export type StopResult = io.TypeOf<typeof StopResult>;

export const RequestNextTrackResult = io.type({
    type: io.literal("nextTrackRequest"),
});
export type RequestNextTrackResult = io.TypeOf<typeof RequestNextTrackResult>;

export const NextTrackStartedPlayingResult = io.type({
    type: io.literal("preloadedTrackStartedPlaying"),
});
export type NextTrackStartedPlayingResult = io.TypeOf<typeof NextTrackStartedPlayingResult>;

export const AudioPlayerResult = io.union([
    NextTrackStartedPlayingResult,
    TimeUpdateResult,
    ErrorResult,
    StopResult,
    RequestNextTrackResult,
]);
export type AudioPlayerResult = io.TypeOf<typeof AudioPlayerResult>;
