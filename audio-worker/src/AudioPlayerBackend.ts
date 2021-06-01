import {
    AudioConfig,
    AudioPlayerBackendActions,
    AudioPlayerResult,
    BufferDescriptor,
    ChannelData,
    LoadOpts,
    MAX_FRAME,
    NextTrackResponseOpts,
    PauseOpts,
    PRELOAD_THRESHOLD_SECONDS,
    SeekOpts,
} from "shared/audio";
import TagDatabase from "shared/idb/TagDatabase";
import { debugFor } from "shared/src/debug";
import { PromiseResolve, typedKeys } from "shared/src/types/helpers";
import CircularAudioBuffer from "shared/src/worker/CircularAudioBuffer";
import { CancellationError, CancellationToken } from "shared/utils/CancellationToken";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";
import AbstractBackend from "shared/worker/AbstractBackend";
import Effects from "shared/worker/Effects";
const dbg = debugFor("AudioPlayerBackend");

import AudioSource from "./AudioSource";

type SwapTargetType = "no-swap" | "all" | "audio-sources";
type AudioDataInitial = "background" | "foreground";
type AudioBufferClearOption = "no-clear" | "clear-and-set-offset" | "only-set-offset";

interface AudioDataItem {
    samplesWritten: number;
    length: number;
    startFrames: number;
    endFrames: number;
    channelData: ChannelData;
}

interface InitialBufferOptions {
    clear: AudioBufferClearOption;
    resumeAfterLoad: boolean;
    fadeInSeconds: number;
    overrideNeededBuffers: boolean;
}

// TODO: Silence handling loudnessinfo entirelysilent
class AudioData {
    private readonly cab: CircularAudioBuffer;
    private data: AudioDataItem[];
    private clearedFrameIndex: number = 0;
    private seekFrameOffset: number = 0;

    constructor(cab: CircularAudioBuffer, initial: AudioDataInitial) {
        this.cab = cab;
        this.data = [];
        this.cab.setPaused();
        if (initial === "background") {
            this.cab.setBackgrounded();
        } else {
            this.cab.unsetBackgrounded();
        }
    }

    setAsForeground() {
        this.cab.unsetPaused();
        this.cab.unsetBackgrounded();
    }

    setAsBackground() {
        this.cab.setBackgrounded();
    }

    pause(fadeOutDelayFrames: number) {
        this.cab.requestPause(fadeOutDelayFrames);
    }

    resume() {
        this.cab.unsetPaused();
    }

    getSamplesAtRelativeFramesFromCurrent(offsetFrames: number, frameCount: number, channelData: ChannelData): void {
        let start = this.getCurrentlyPlayedFrame() + offsetFrames;
        const end = start + frameCount;
        const q = this.data;
        let dstOffset = 0;
        for (let i = 0; i < q.length; ++i) {
            const descriptor = q[i]!;
            if (descriptor.startFrames <= start && start <= descriptor.endFrames) {
                const startOffset = start - descriptor.startFrames;
                const length = Math.min(end - start, descriptor.length - startOffset);
                for (let c = 0; c < channelData.length; ++c) {
                    const sourceChannel = q[i]!.channelData[c]!;
                    const destinationChannel = channelData[c];
                    destinationChannel.set(sourceChannel.subarray(startOffset, startOffset + length), dstOffset);
                }
                start += length;
                dstOffset += length;
                if (end - start <= 0) {
                    return;
                }
            }
        }
        if (dstOffset < frameCount) {
            for (let c = 0; c < channelData.length; ++c) {
                channelData[c].fill(0, dstOffset);
            }
        }
        return;
    }

    getQueuedAndBufferedSeconds(sampleRate: number) {
        let ret = 0;
        for (let i = 0; i < this.data.length; ++i) {
            const b = this.data[i];
            ret += (b.length - b.samplesWritten) / sampleRate;
        }
        return ret + this.cab.getReadableFramesLength() / sampleRate;
    }

    addData(
        bufferDescriptor: BufferDescriptor,
        channelData: ChannelData,
        clear: AudioBufferClearOption,
        seekOffset: number = 0,
        playSilence: boolean = true
    ) {
        if (clear !== "no-clear") {
            if (clear === "clear-and-set-offset") {
                this.data = [];
                this.cab.clear();
                dbg(
                    "BufferInitialization",
                    "cleared with",
                    "seekOffset=",
                    seekOffset,
                    "frameIndex=",
                    this.clearedFrameIndex
                );
            } else {
                dbg("BufferInitialization", "only set offsets, seekOffset=", seekOffset);
            }
            this.clearedFrameIndex = this.cab.getCurrentFrameNumber();
            this.seekFrameOffset = seekOffset;
        }
        const hasSound = playSilence || !bufferDescriptor.loudnessInfo.isEntirelySilent;
        if (hasSound) {
            this.data.push({
                samplesWritten: 0,
                startFrames: bufferDescriptor.startFrames,
                endFrames: bufferDescriptor.endFrames,
                channelData,
                length: bufferDescriptor.length,
            });
            this.writeToAudioBuffer();
        } else {
            this.clearedFrameIndex -= bufferDescriptor.length;
            if (this.clearedFrameIndex < 0) {
                this.clearedFrameIndex += MAX_FRAME;
            }
        }
    }

    getCurrentlyPlayedFrame() {
        const current = this.cab.getCurrentFrameNumber();
        if (current >= this.clearedFrameIndex) {
            return Math.max(0, current - this.clearedFrameIndex) + this.seekFrameOffset;
        } else {
            return Math.max(0, MAX_FRAME - this.clearedFrameIndex + current) + this.seekFrameOffset;
        }
    }

    cleanup() {
        const removeFramesEndedBefore = this.getCurrentlyPlayedFrame();
        let removeUntil: number = 0;
        for (let i = 0; i < this.data.length; ++i) {
            if (this.data[i]!.endFrames > removeFramesEndedBefore) {
                removeUntil = i;
                break;
            }
        }
        if (removeUntil > 0) {
            this.data.splice(0, removeUntil);
        }
    }

    allBuffersWritten() {
        for (let i = 0; i < this.data.length; ++i) {
            if (this.data[i].samplesWritten < this.data[i].length) {
                return false;
            }
        }
        return true;
    }

    writeToAudioBuffer() {
        const q = this.data;
        if (!q.length) {
            return;
        }
        const cab = this.cab;
        let writableFramesLength: number;
        while ((writableFramesLength = cab.getWritableFramesLength()) > 0) {
            let item: AudioDataItem | null = null;
            for (let i = 0; i < q.length; ++i) {
                const maybeItem = q[i]!;
                if (maybeItem.samplesWritten < maybeItem.length) {
                    item = maybeItem;
                    break;
                }
            }

            if (item === null) {
                return;
            }

            const frames = Math.min(item.length - item.samplesWritten, writableFramesLength);
            const channels = item.channelData.map(v => v.subarray(item!.samplesWritten));
            const written = cab.write(channels, frames);
            item.samplesWritten += written;
            writableFramesLength -= written;
        }
    }
}

export default class AudioPlayerBackend extends AbstractBackend<
    AudioPlayerBackendActions<AudioPlayerBackend>,
    "audio"
> {
    private _wasm: WebAssemblyWrapper;
    private _effects: Effects;
    private _config: Required<AudioConfig> | null;
    private _mainAudioSource: AudioSource | null;
    private _preloadingAudioSource: AudioSource | null;
    private _tagdb: TagDatabase;
    private _timeUpdatePromiseCallbacks: PromiseResolve<void>[] = [];

    private primaryData: AudioData | null = null;
    private secondaryData: AudioData | null = null;
    private activeData: AudioData | null = null;
    private seekFrameOffset: number = 0;
    private lastCleanupCalled: number = 0;
    private swapTargets: SwapTargetType = "no-swap";
    private nextTrackResponseCallbacks: PromiseResolve<void>[] = [];

    constructor(wasm: WebAssemblyWrapper, tagdb: TagDatabase) {
        super("audio", {
            timeUpdate: () => this._timeUpdateReceived(),
            initialAudioConfiguration: a => this._initialAudioConfigurationReceived(a),
            audioConfigurationChange: a => this._audioConfigurationChangeReceived(a),
            seek: opts => this._seek(opts),
            load: opts => this._load(opts),
            nextTrackResponse: opts => this._preloadNextTrack(opts),
            nextTrackResponseUpdate: opts => this._preloadNextTrackUpdated(opts),
            pause: opts => this._pauseReceived(opts),
            resume: () => this._resumeReceived(),
        });
        this._wasm = wasm;
        this._tagdb = tagdb;
        this._effects = new Effects(wasm);
        this._config = null;

        this._mainAudioSource = null;
        this._preloadingAudioSource = null;
    }

    _pauseReceived({ fadeOutDelay }: PauseOpts) {
        const sampleRate = this.sampleRate;
        const delayFrames = fadeOutDelay * sampleRate;
        this.activeData!.pause(delayFrames);
        dbg("Action", "paused activeData, delayFrames=", delayFrames);
        if (this.passiveData!.getQueuedAndBufferedSeconds(sampleRate) > 0) {
            dbg("Action", "paused passiveData, delayFrames=", delayFrames);
            this.passiveData!.pause(delayFrames);
        }
    }

    _doResume(includePassive: boolean = true) {
        dbg("Action", "resuming activeData");
        this.activeData!.resume();
        if (includePassive && this.passiveData!.getQueuedAndBufferedSeconds(this.sampleRate) > 0) {
            dbg("Action", "resuming passiveData");
            this.passiveData!.resume();
        }
    }

    _resumeReceived() {
        this._doResume();
    }

    _postUiTimeUpdate(currentTime: number, totalTime: number) {
        if (totalTime > 0 && totalTime >= currentTime) {
            this.postMessageToAudioPlayer({
                type: "timeupdate",
                currentTime,
                totalTime,
            });
        }
    }

    _checkSwap() {
        const swapTargets = this.swapTargets;
        dbg("SwapTargets", "checked swapTargets=", swapTargets);
        if (swapTargets !== "no-swap") {
            dbg("SwapTargets", "swapping targets and sources");
            this.setSwapTargets("no-swap", "checkSwap");
            this.seekFrameOffset = 0;
            this._mainAudioSource = this._preloadingAudioSource;
            this._preloadingAudioSource = null;

            if (swapTargets === "all") {
                const active = this.activeData!;
                const newPassive = active;
                let newActive: AudioData;
                if (active === this.primaryData) {
                    newActive = this.activeData = this.secondaryData!;
                } else {
                    newActive = this.activeData = this.primaryData!;
                }
                newActive.setAsForeground();
                newPassive.setAsBackground();
            }
            this.postMessageToAudioPlayer({ type: "preloadedTrackStartedPlaying" });
        }
    }

    async _requestNextTrackIfNeeded() {
        if (!this._preloadingAudioSource) {
            dbg("Action", "posting next track request");
            this._preloadingAudioSource = new AudioSource(this);
            const ret = new Promise(resolve => {
                this.nextTrackResponseCallbacks.push(resolve);
            });
            this.postMessageToAudioPlayer({ type: "nextTrackRequest" });
            return ret;
        }
    }

    _sendTimeUpdate() {
        const { totalTime, currentTime } = this;

        if (totalTime > 0 && totalTime > currentTime) {
            const remaining = totalTime - currentTime;
            if (remaining <= this.crossfadeDuration + PRELOAD_THRESHOLD_SECONDS) {
                void this._requestNextTrackIfNeeded();
            }
            if (remaining <= this.crossfadeDuration) {
                this._checkSwap();
            }
        }

        this._postUiTimeUpdate(currentTime, totalTime);
    }

    waitNextTimeUpdate(): Promise<void> {
        return new Promise(resolve => {
            this._timeUpdatePromiseCallbacks.push(resolve);
        });
    }

    _timeUpdateReceived = () => {
        this._sendTimeUpdate();
        for (const callback of this._timeUpdatePromiseCallbacks) {
            callback();
        }
        this._timeUpdatePromiseCallbacks = [];
        const now = Date.now();
        if (now - this.lastCleanupCalled > this.bufferTime) {
            this.passiveData!.cleanup();
            this.activeData!.cleanup();
            this.lastCleanupCalled = now;
        }
        this.passiveData!.writeToAudioBuffer();
        this.activeData!.writeToAudioBuffer();
    };

    _preloadNextTrackUpdated = async (opts: NextTrackResponseOpts) => {
        if (!this._preloadingAudioSource) {
            return;
        }
        dbg("Action", "updating preload track in backend");
        this.setSwapTargets("no-swap", "preload next track updated");
        await this._preloadingAudioSource.destroy();
        this._preloadingAudioSource = new AudioSource(this);
        void this._preloadNextTrack(opts);
    };

    _resolveNextTrackResponsePromises() {
        for (const callback of this.nextTrackResponseCallbacks) {
            callback();
        }
        this.nextTrackResponseCallbacks = [];
    }

    _preloadNextTrack = async ({ fileReference }: NextTrackResponseOpts) => {
        if (
            !this._preloadingAudioSource ||
            !this._mainAudioSource ||
            this._preloadingAudioSource.destroyed ||
            this._preloadingAudioSource.initialized
        ) {
            this._resolveNextTrackResponsePromises();
            dbg("Impossible", "preload path - should not happen");
            // Should not happen.
            return;
        }
        if (!fileReference) {
            this._resolveNextTrackResponsePromises();
            dbg("BufferInitialization", "preload path - no file given");
            this._preloadingAudioSource = null;
            return;
        }

        const crossfadeDuration = this.crossfadeDuration;
        const crossfadeEnabled = crossfadeDuration > 0;
        const audioSource = this._preloadingAudioSource;
        const targetData = crossfadeEnabled ? this.passiveData! : this.activeData!;
        try {
            dbg(
                "BufferInitialization",
                "started initializing preload, crossFadeDuration=",
                crossfadeDuration,
                "crossfadeEnabled",
                crossfadeEnabled
            );
            const { cancellationToken } = await audioSource.load({
                fileReference,
                isPreloadForNextTrack: true,
                crossfadeDuration,
                progress: 0,
            });
            this.setSwapTargets(crossfadeEnabled ? "all" : "audio-sources", "preload initialized");
            this._resolveNextTrackResponsePromises();
            dbg("BufferInitialization", "preload initialized");
            cancellationToken.check();
            // Await for the audio queue.
            if (!crossfadeEnabled) {
                dbg("BufferInitialization", "Gapless playback enabled - waiting for all buffers to be written");
                await this._mainAudioSource!.waitEnded();
                cancellationToken.check();
                while (!targetData.allBuffersWritten()) {
                    await this.waitNextTimeUpdate();
                    cancellationToken.check();
                }
                dbg(
                    "BufferInitialization",
                    "Gapless playback enabled - all buffers written, writing preload track data"
                );
            }
            await this._fillBuffersLoop(
                targetData,
                audioSource,
                cancellationToken,
                {
                    clear: crossfadeEnabled ? "clear-and-set-offset" : "only-set-offset",
                    overrideNeededBuffers: crossfadeEnabled,
                    resumeAfterLoad: false,
                    fadeInSeconds: 0,
                },
                "preload"
            );
        } catch (e) {
            this.setSwapTargets("no-swap", "preload failed or cancelled");
            if (!this._checkError(e).canceled) {
                await audioSource.destroy();
                this._preloadingAudioSource = null;
                this.postMessageToAudioPlayer({ type: "stop", reason: "preload-error" });
            }
        }
    };

    _initialAudioConfigurationReceived = (config: Required<AudioConfig>) => {
        this._config = config;
        this.primaryData = new AudioData(new CircularAudioBuffer(config.sab, config.channelCount), "foreground");
        this.secondaryData = new AudioData(
            new CircularAudioBuffer(config.backgroundSab, config.channelCount),
            "background"
        );
        this.activeData = this.primaryData;
        this.activeData!.setAsForeground();
        this.passiveData!.setAsBackground();
        this.activeData.pause(0);

        this._configUpdated();
        dbg("Initialization", "backend initialized");
    };

    _audioConfigurationChangeReceived = (config: AudioConfig) => {
        if (!this._config) {
            throw new Error("initial configuration not received");
        }
        for (const key of typedKeys(config)) {
            const value = config[key];
            if (value) {
                //@ts-expect-error
                this._config[key] = value;
            }
        }
        this._configUpdated();
    };

    setSwapTargets(swapTargets: SwapTargetType, source: string) {
        dbg("SwapTargets", "set swap target to", swapTargets, "source=", source);
        this.swapTargets = swapTargets;
    }

    async _cancelLoadingBuffers(reason: string) {
        this.setSwapTargets("no-swap", "cancelLoadingBuffers()");
        if (!this._mainAudioSource) return;
        const waitFor: Promise<unknown>[] = [];
        waitFor.push(this._mainAudioSource.bufferOperationCancellationAcknowledged());
        this._mainAudioSource.cancelAllOperations(reason);
        if (this._preloadingAudioSource) {
            waitFor.push(this._preloadingAudioSource.bufferOperationCancellationAcknowledged());
            this._preloadingAudioSource.cancelAllOperations(reason);
            await this._preloadingAudioSource.destroy();
            this._preloadingAudioSource = null;
            this.passiveData!.pause(0.2 * this.sampleRate);
        }
        await Promise.all(waitFor);
    }

    _seek = async ({ time, resumeAfterInitialization }: SeekOpts) => {
        if (!this._mainAudioSource || !this._mainAudioSource.initialized) {
            return;
        }
        const duration = this._mainAudioSource.duration;
        if (duration - this.crossfadeDuration < 0) {
            return;
        }
        await this._cancelLoadingBuffers("Seek invalidated buffers");

        try {
            this._postUiTimeUpdate(time, this._mainAudioSource.duration);
            dbg("BufferInitialization", "begin seek initialization, time=", time);
            const seekResult = await this._mainAudioSource.seek({ time });
            const { cancellationToken } = seekResult;
            let { baseTime } = seekResult;
            cancellationToken.check();
            const duration = this._mainAudioSource.duration;
            baseTime = Math.max(0, Math.min(duration - this.crossfadeDuration, baseTime));
            const baseFrame = Math.round(baseTime * this.sampleRate);
            this.seekFrameOffset = baseFrame;
            this._postUiTimeUpdate(baseTime, duration);
            dbg(
                "BufferInitialization",
                "seek initialized, baseFrame=",
                baseFrame,
                "duration=",
                duration,
                "baseTime=",
                baseTime
            );
            if (duration - baseTime <= this.crossfadeDuration + PRELOAD_THRESHOLD_SECONDS) {
                dbg("BufferInitialization", "sekt past preload threshold, awaiting buffers");
                await this._requestNextTrackIfNeeded();
                dbg("BufferInitialization", "buffers awaited");
            }
            await this._fillBuffersLoop(
                this.activeData!,
                this._mainAudioSource,
                cancellationToken,
                {
                    clear: "clear-and-set-offset",
                    overrideNeededBuffers: true,
                    resumeAfterLoad: resumeAfterInitialization,
                    fadeInSeconds: 0.2,
                },
                "seek"
            );
        } catch (e) {
            this._checkError(e);
        }
    };

    async _fillBuffersLoop(
        targetData: AudioData,
        audioSource: AudioSource,
        cancellationToken: CancellationToken<any>,
        initialBufferOptions: InitialBufferOptions,
        source: string
    ) {
        const sampleRate = this.sampleRate;
        let initialBufferLoaded = false;
        let canceled: boolean = false;
        let cancelReason: string | undefined = undefined;
        try {
            const audioSourceString =
                audioSource === this._preloadingAudioSource
                    ? "preloadingAudioSource"
                    : audioSource === this._mainAudioSource
                    ? "mainAudioSource"
                    : "noSource";
            dbg(
                "BufferInitialization",
                "started buffer fill loop, source=",
                source,
                "opts=",
                JSON.stringify(initialBufferOptions),
                ", audioSource=",
                audioSourceString,
                ", audioSource.ended=",
                audioSource.ended,
                ", audioSource.destroyed=",
                audioSource.destroyed,
                ", audioSource.isBufferFillingInProgress()=",
                audioSource.isBufferFillingInProgress()
            );
            while (!audioSource.ended && !audioSource.destroyed && !audioSource.isBufferFillingInProgress()) {
                const minimumNeeded =
                    !initialBufferLoaded && initialBufferOptions.overrideNeededBuffers
                        ? Math.round(this.sustainedAudioSeconds / this.bufferTime)
                        : 0;

                const neededCount = Math.max(
                    minimumNeeded,
                    Math.round(
                        (this.sustainedAudioSeconds - targetData.getQueuedAndBufferedSeconds(sampleRate)) /
                            this.bufferTime
                    )
                );

                !initialBufferLoaded && dbg("BufferInitialization", "neededCount=", neededCount);

                if (neededCount > 0) {
                    const playSilence = this._config!.silenceTrimming
                        ? audioSource === this._preloadingAudioSource
                        : true;
                    !initialBufferLoaded &&
                        dbg("BufferInitialization", "requested fillBuffers playSilence=", playSilence);
                    await audioSource.fillBuffers(
                        neededCount,
                        (bufferDescriptor: BufferDescriptor, channelData: ChannelData) => {
                            cancellationToken.check();
                            !initialBufferLoaded &&
                                dbg(
                                    "BufferInitialization",
                                    "initial buffer callback, data=",
                                    JSON.stringify(bufferDescriptor)
                                );
                            targetData.addData(
                                bufferDescriptor,
                                channelData,
                                !initialBufferLoaded ? initialBufferOptions.clear : "no-clear",
                                audioSource === this._mainAudioSource ? this.seekFrameOffset : 0,
                                playSilence
                            );
                            if (!initialBufferLoaded && initialBufferOptions.resumeAfterLoad) {
                                this._doResume(false);
                            }
                            initialBufferLoaded = true;
                        },
                        {
                            cancellationToken,
                            fadeInSeconds:
                                // Worklet will always auto fade in when resuming.
                                initialBufferLoaded || initialBufferOptions.resumeAfterLoad
                                    ? 0
                                    : initialBufferOptions.fadeInSeconds,
                        }
                    );
                    cancellationToken.check();
                }
                !initialBufferLoaded && dbg("BufferInitialization", "filled initial buffers neededCount=", neededCount);
                await this.waitNextTimeUpdate();
                cancellationToken.check();
            }
        } catch (e) {
            ({ canceled, reason: cancelReason } = this._checkError(e));
        } finally {
            const audioSourceString =
                audioSource === this._preloadingAudioSource
                    ? "preloadingAudioSource"
                    : audioSource === this._mainAudioSource
                    ? "mainAudioSource"
                    : "noSource";
            dbg(
                "AudioTermination",
                "ended buffer fill loop source=",
                source,
                ", audioSourceString=",
                audioSourceString,
                ", ended=",
                audioSource.ended,
                ", destroyed=",
                audioSource.destroyed,
                ", canceled=",
                canceled,
                ", cancelReason=",
                cancelReason
            );
            if (!canceled) {
                if (audioSource === this._preloadingAudioSource) {
                    this._preloadingAudioSource = null;
                }
                if (audioSource === this._mainAudioSource) {
                    this._mainAudioSource = null;
                    await this._requestNextTrackIfNeeded();
                    this._checkSwap();
                }
                await audioSource.destroy();
            }
        }
    }

    _load = async ({ fileReference, progress = 0, resumeAfterInitialization }: LoadOpts) => {
        dbg("BufferInitialization", "load called, resume=", resumeAfterInitialization);
        await this._cancelLoadingBuffers("Load invalidates buffers");
        const audioSource = new AudioSource(this);
        if (this._mainAudioSource) {
            dbg("BufferInitialization", "load called, destroying previous main audio source");
            await this._mainAudioSource.destroy();
        }
        this._mainAudioSource = audioSource;
        const targetData = this.activeData!;
        try {
            const { baseFrame, cancellationToken } = await audioSource.load({
                fileReference,
                isPreloadForNextTrack: false,
                crossfadeDuration: this.crossfadeDuration,
                progress,
            });
            dbg("BufferInitialization", "load initialized, baseFrame=", baseFrame);
            cancellationToken.check();
            this.seekFrameOffset = baseFrame;
            this._postUiTimeUpdate(baseFrame / this.sampleRate, audioSource.duration);
            await this._fillBuffersLoop(
                targetData,
                audioSource,
                cancellationToken,
                {
                    clear: "clear-and-set-offset",
                    overrideNeededBuffers: true,
                    resumeAfterLoad: resumeAfterInitialization,
                    fadeInSeconds: 0.2,
                },
                "load"
            );
        } catch (e) {
            this._checkError(e);
        }
    };

    _checkError(e: Error): { canceled: boolean; reason?: string } {
        if (!(e instanceof CancellationError)) {
            this._sendError(e);
            return { canceled: false };
        }
        return { canceled: true, reason: e.reason };
    }

    _sendError(error: Error) {
        this.postMessageToAudioPlayer({ type: `error`, message: error.message });
        dbg("Error", error);
    }

    postMessageToAudioPlayer(result: AudioPlayerResult) {
        this.postMessageToFrontend([result]);
    }

    _configUpdated() {
        this._effects.setEffects(this._config!.effects);
    }

    get currentTime() {
        return this.currentlyPlayedFrame / this._config!.sampleRate;
    }

    get totalTime() {
        if (this._mainAudioSource && this._mainAudioSource.initialized) {
            return this._mainAudioSource.duration;
        }
        return 0;
    }

    get currentlyPlayedFrame() {
        return this.activeData!.getCurrentlyPlayedFrame();
    }

    get passiveData() {
        return this.primaryData === this.activeData ? this.secondaryData : this.primaryData;
    }

    get tagDatabase() {
        return this._tagdb;
    }

    get wasm() {
        return this._wasm;
    }

    get effects() {
        return this._effects;
    }

    get crossfadeDuration() {
        return this._config!.crossfadeDuration!;
    }

    get sustainedAudioSeconds() {
        return this._config!.sustainedBufferedAudioSeconds;
    }

    get sampleRate() {
        return this._config!.sampleRate;
    }

    get bufferTime() {
        return this._config!.bufferTime;
    }

    get initialTotalBuffers() {
        return Math.ceil(this.sustainedAudioSeconds / this.bufferTime);
    }

    get loudnessNormalization() {
        return this._config!.loudnessNormalization;
    }

    get silenceTrimming() {
        return this._config!.silenceTrimming;
    }
}
