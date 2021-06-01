import {
    AudioConfig,
    AudioPlayerBackendActions,
    AudioWorkletMessage,
    CURVE_LENGTH,
    getCurve,
    MAX_SUSTAINED_AUDIO_SECONDS,
    MIN_SUSTAINED_AUDIO_SECONDS,
    SUSTAINED_BUFFERED_AUDIO_RATIO,
} from "shared/audio";
import { debugFor } from "shared/debug";
import { ChannelCount, ITrack } from "shared/metadata";
import Timers from "shared/platform/Timers";
import { AudioPlayerResult, FADE_MINIMUM_VOLUME } from "shared/src/audio";
import { HEADER_BYTES } from "shared/src/worker/CircularAudioBuffer";
import { assertNever, decode, EventEmitterInterface } from "shared/types/helpers";
import { SelectDeps } from "ui/Application";
import { cancelAndHold } from "ui/platform/audio";
import Page from "ui/platform/dom/Page";
import PlaylistController from "ui/player/PlaylistController";
import ApplicationPreferencesBindingContext from "ui/ui/ApplicationPreferencesBindingContext";
import EffectPreferencesBindingContext from "ui/ui/EffectPreferencesBindingContext";
import WorkerFrontend from "ui/WorkerFrontend";

const dbg = debugFor("AudioPlayerFrontend");

const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);
const PAUSE_RESUME_FADE_TIME = 0.4;
const MUTE_UNMUTE_FADE_TIME = 0.4;
const VOLUME_RATIO = 2;

function getFadeOutCurve(startValue: number) {
    return getCurve(CURVE_HOLDER, startValue, FADE_MINIMUM_VOLUME);
}

function getFadeInCurve() {
    return getCurve(CURVE_HOLDER, FADE_MINIMUM_VOLUME, 1);
}

type Deps = SelectDeps<
    | "audioWorker"
    | "playlist"
    | "page"
    | "effectPreferencesBindingContext"
    | "applicationPreferencesBindingContext"
    | "timers"
>;

export default class AudioPlayerFrontend extends WorkerFrontend<AudioPlayerResult> {
    playlist: PlaylistController;
    page: Page;
    effectPreferencesBindingContext: EffectPreferencesBindingContext;
    applicationPreferencesBindingContext: ApplicationPreferencesBindingContext;
    timers: Timers;
    private _audioContext: AudioContext;
    private _volumeValue: number = 0.15;
    private _mutedValue: boolean = false;
    private _paused: boolean = true;
    private _fadeInOutNode: GainNode;
    private _volumeNode: GainNode;
    private _currentTime: number = 0;
    private _duration: number = 0;
    private _fadeOutEnded: number = 0;
    private _fadeInStarted: number = 0;
    private _fadeInStartedWithLength: number = 0;
    private _suspensionTimeoutId: number = -1;
    private _ignoreNextTrackLoads: boolean = false;

    constructor(deps: Deps) {
        super("audio", deps.audioWorker);
        this.playlist = deps.playlist;
        this.page = deps.page;
        this.effectPreferencesBindingContext = deps.effectPreferencesBindingContext;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.timers = deps.timers;
        this.effectPreferencesBindingContext.on(`change`, this._effectPreferencesChanged);
        this.applicationPreferencesBindingContext.on(`change`, this._applicationPreferencesChanged);
        this._audioContext = new AudioContext({ latencyHint: `playback` });
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        void this._audioContext.suspend().catch(_e => {});
        this._volumeNode = this._audioContext.createGain();
        this._fadeInOutNode = this._audioContext.createGain();
        this._fadeInOutNode.connect(this._volumeNode);
        this._volumeNode.connect(this._audioContext.destination);
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;
        this._volumeChanged(this._mutedValue, this._mutedValue);
        void this._initBackend();
    }

    get audioContextState() {
        return this._audioContext.state;
    }

    get outputLatency() {
        return this._audioContext.outputLatency;
    }

    get baseLatency() {
        return this._audioContext.baseLatency;
    }

    get sampleRate() {
        return this._audioContext.sampleRate;
    }

    get totalLatency() {
        return this.baseLatency + this.outputLatency;
    }

    get channelCount() {
        return decode(ChannelCount, this._audioContext.destination.channelCount);
    }

    get bufferLengthSeconds() {
        return this.applicationPreferencesBindingContext.preferencesManager().get("bufferLengthMilliSeconds") / 1000;
    }

    get totalSustainedAudioSeconds() {
        return Math.max(MIN_SUSTAINED_AUDIO_SECONDS, this.bufferLengthSeconds * SUSTAINED_BUFFERED_AUDIO_RATIO);
    }

    get crossfadeDuration() {
        return this.effectPreferencesBindingContext.getCrossfadeDuration();
    }

    private _handleAudioWorkletMessage = (e: MessageEvent<any>) => {
        const message = decode(AudioWorkletMessage, e.data);
        switch (message.type) {
            case "timeupdate":
                this.postMessageToAudioBackend("timeUpdate");
                break;
        }
    };

    isPaused() {
        return this._paused;
    }

    private _suspendAudioContext = async () => {
        if (this._audioContext.state === "suspended") {
            return;
        }
        dbg("AudioContext", "suspending audiocontext");
        return this._audioContext.suspend();
    };

    private _resumeAudioContext = async () => {
        if (this._audioContext.state === "running") {
            return;
        }
        await this._audioContext.resume();
        dbg("AudioContext", "resumed audiocontext");
        this.emit("audioContextDidReset");
    };

    private _startSuspensionTimeout() {
        if (this._suspensionTimeoutId === -1) {
            this._suspensionTimeoutId = this.page.setTimeout(() => {
                this._suspensionTimeoutId = -1;
                void this._suspendAudioContext();
            }, 5000);
        }
    }

    private _stopSuspensionTimeout() {
        if (this._suspensionTimeoutId > -1) {
            this.page.clearTimeout(this._suspensionTimeoutId);
        }
    }

    async resume(backendResumeHandled: boolean = false) {
        if (!this.isPaused()) {
            return;
        }
        dbg("Action", "resume called, backendResumeHandled=", backendResumeHandled);
        await this._resumeAudioContext();
        if (this.audioContextState !== "running") {
            throw new Error("invalid resume() not from user action");
        }
        this._paused = false;
        if (!backendResumeHandled) {
            this.postMessageToAudioBackend("resume");
        }
        this.emit("playbackStateChanged");
        this._stopSuspensionTimeout();
        dbg("Action", "resumed");
    }

    pause() {
        if (this.isPaused()) {
            return;
        }
        this._paused = true;
        this.emit("playbackStateChanged");
        this.postMessageToAudioBackend("pause", { fadeOutDelay: PAUSE_RESUME_FADE_TIME });
        this._startSuspensionTimeout();
    }

    getSampleRate() {
        return this._audioContext.sampleRate;
    }

    getVolume() {
        return this._volumeValue;
    }

    isMuted() {
        return this._mutedValue;
    }

    setVolume(volume: number) {
        this._volumeValue = volume;
        this._volumeChanged(this._mutedValue, this._mutedValue);
    }

    setMuted(muted: boolean) {
        const prev = this._mutedValue;
        this._mutedValue = muted;
        this._volumeChanged(prev, muted);
    }

    async loadTrack(track: ITrack, initialProgress: number = 0, resume: boolean) {
        dbg(
            "Action",
            "loadTrack, resume=",
            resume,
            "ignored=",
            this._ignoreNextTrackLoads,
            "initialProgress=",
            initialProgress
        );
        this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
        if (this._ignoreNextTrackLoads) {
            return;
        }
        if (resume && this.isPaused()) {
            await this.resume(true);
        }
        if (resume && this.audioContextState !== "running") {
            // TODO await for user interaction.
            throw new Error("wanted resume without user interaction");
        }
        this.postMessageToAudioBackend("load", {
            fileReference: track.getFileReference(),
            progress: initialProgress,
            resumeAfterInitialization: resume,
        });
    }

    async setCurrentTime(time: number) {
        time = Math.max(0, time);
        time = Math.max(0, Math.min(this._duration - 0.2, time));
        if (!isFinite(time)) {
            return;
        }
        this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
        this.postMessageToAudioBackend("seek", { time, resumeAfterInitialization: false });
    }

    getCurrentTime() {
        return this._currentTime;
    }

    getDuration() {
        return this._duration;
    }

    _sendNextTrackToBackend = () => {
        dbg("State", "next track sent to backend for preloading");
        const next = this.playlist.getNextTrack();
        this.postMessageToAudioBackend("nextTrackResponse", {
            fileReference: next ? next.fileReference : undefined,
        });
    };

    receiveMessageFromBackend(result: AudioPlayerResult) {
        switch (result.type) {
            case "timeupdate":
                this._emitPlaybackProgress(result.currentTime, result.totalTime);
                break;
            case "error":
                this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
                this._error(result);
                break;
            case "preloadedTrackStartedPlaying":
                dbg("State", "preloaded track started playing");
                this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
                this._ignoreNextTrackLoads = true;
                try {
                    this.emit("preloadedTrackPlaybackStarted");
                } finally {
                    this._ignoreNextTrackLoads = false;
                }
                break;
            case "nextTrackRequest":
                {
                    this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
                    this._sendNextTrackToBackend();
                    this.playlist.on("playlistNextTrackChanged", this._sendNextTrackToBackend);
                }
                break;
            case "stop":
                this.playlist.removeListener("playlistNextTrackChanged", this._sendNextTrackToBackend);
                break;
            default:
                assertNever(result);
        }
    }

    _volume() {
        if (this._mutedValue) {
            return 0;
        }
        return this._volumeValue * VOLUME_RATIO;
    }

    _volumeChanged(previousMuted: boolean, currentMuted: boolean) {
        if (!this._volumeNode) {
            return;
        }
        if (previousMuted !== currentMuted) {
            let scheduledTime;
            if (previousMuted) {
                scheduledTime = this._unmuteRequested();
            } else {
                scheduledTime = this._muteRequested();
            }
            this._volumeNode.gain.cancelScheduledValues(scheduledTime);
            this._volumeNode.gain.setValueAtTime(this._volume(), scheduledTime);
        } else if (!this._mutedValue) {
            this._volumeNode.gain.cancelScheduledValues(this._getAudioContextCurrentTime());
            this._volumeNode.gain.value = this._volume();
        }
    }

    _effectPreferencesChanged = async () => {
        await this.ready();
        void this._updateBackendConfig({
            effects: this.effectPreferencesBindingContext.getAudioPlayerEffects(),
            crossfadeDuration: this.crossfadeDuration,
        });
    };

    _applicationPreferencesChanged = async () => {
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferencesManager();

        void this._updateBackendConfig({
            loudnessNormalization: preferences.get("enableLoudnessNormalization"),
            silenceTrimming: preferences.get("enableSilenceTrimming"),
            bufferTime: this.bufferLengthSeconds,
            sustainedBufferedAudioSeconds: this.totalSustainedAudioSeconds,
        });
    };

    async _updateBackendConfig(config: AudioConfig) {
        await this.ready();
        this.postMessageToAudioBackend("audioConfigurationChange", config);
    }

    async _initBackend() {
        const { channelCount, sampleRate } = this;
        const sab = new SharedArrayBuffer(
            Float32Array.BYTES_PER_ELEMENT * channelCount * sampleRate * MAX_SUSTAINED_AUDIO_SECONDS + HEADER_BYTES
        );
        const backgroundSab = new SharedArrayBuffer(
            Float32Array.BYTES_PER_ELEMENT * channelCount * sampleRate * MAX_SUSTAINED_AUDIO_SECONDS + HEADER_BYTES
        );

        this.addReadyPromise(
            this._audioContext.audioWorklet.addModule(process.env.AUDIO_WORKLET_PATH!).then(() => {
                const nodeOpts = {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [channelCount],
                };
                const primaryWorkletNode = new AudioWorkletNode(this._audioContext, "sink-worklet", nodeOpts);
                const secondaryWorkletNode = new AudioWorkletNode(this._audioContext, "sink-worklet", nodeOpts);
                primaryWorkletNode.connect(this._fadeInOutNode);
                secondaryWorkletNode.connect(this._fadeInOutNode);
                secondaryWorkletNode.port.postMessage({
                    type: "init",
                    sab: backgroundSab,
                    channelCount,
                    sampleRate,
                    background: true,
                });
                primaryWorkletNode.port.postMessage({
                    type: "init",
                    sab,
                    sampleRate,
                    channelCount,
                });
                primaryWorkletNode.port.onmessage = this._handleAudioWorkletMessage;
                secondaryWorkletNode.port.onmessage = this._handleAudioWorkletMessage;
            })
        );
        await this.ready();
        const preferences = this.applicationPreferencesBindingContext.preferencesManager();
        this.postMessageToAudioBackend("initialAudioConfiguration", {
            loudnessNormalization: preferences.get("enableLoudnessNormalization"),
            silenceTrimming: preferences.get("enableSilenceTrimming"),
            effects: this.effectPreferencesBindingContext.getAudioPlayerEffects(),
            crossfadeDuration: this.crossfadeDuration,
            sab,
            baseLatency: this.baseLatency,
            outputLatency: this.outputLatency,
            backgroundSab,
            channelCount: this.channelCount,
            sampleRate: this.sampleRate,
            sustainedBufferedAudioSeconds: this.totalSustainedAudioSeconds,
            bufferTime: this.bufferLengthSeconds,
        });
        dbg(
            "Initialization",
            "audio player backend initialized channelCount=",
            channelCount,
            "sampleRate=",
            sampleRate
        );
    }

    _getAudioContextCurrentTime() {
        return this._audioContext!.currentTime;
    }

    _getAudioContextTimeScheduledAhead() {
        return this._getAudioContextCurrentTime();
    }

    _muteRequested() {
        if (this._maybeFadeOut(MUTE_UNMUTE_FADE_TIME)) {
            return this._fadeOutEnded;
        } else {
            return this._getAudioContextCurrentTime();
        }
    }

    _unmuteRequested() {
        const scheduledStartTime = Math.max(this._fadeOutEnded, this._getAudioContextTimeScheduledAhead());
        if (this._maybeFadeIn(MUTE_UNMUTE_FADE_TIME, scheduledStartTime)) {
            return this._fadeInStarted;
        } else {
            return scheduledStartTime;
        }
    }

    _emitPlaybackProgress(currentTime: number, duration: number) {
        this._duration = duration;
        this._currentTime = currentTime;
        this.emit("playbackProgressed", currentTime, duration);
    }

    _decodingLatency(decodingLatency: number) {
        this.applicationPreferencesBindingContext.decodingLatencyValue(decodingLatency);
    }

    _maybeFadeOut(time: number, ctxTime: number = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const param = this._fadeInOutNode!.gain;
            let startValue = param.value;
            if (startValue < 1) {
                const t0 = this._fadeInStarted;
                const t1 = t0 + this._fadeInStartedWithLength;
                const t = ctxTime;
                if (t0 < t && t < t1) {
                    const v0 = FADE_MINIMUM_VOLUME;
                    const v1 = 1;
                    startValue = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
                }
            }
            cancelAndHold(param, ctxTime);
            const curve = getFadeOutCurve(startValue);
            try {
                param.setValueCurveAtTime(curve, ctxTime, time);
            } catch (e) {
                return false;
            }
            this._fadeOutEnded = ctxTime + time;
            return true;
        }
        return false;
    }

    _maybeFadeIn(time: number, ctxTime: number = this._getAudioContextCurrentTime()) {
        if (time > 0) {
            const curve = getFadeInCurve();
            try {
                this._fadeInOutNode!.gain.setValueCurveAtTime(curve, ctxTime, time);
            } catch (e) {
                return false;
            }
            this._fadeInStarted = ctxTime;
            this._fadeInStartedWithLength = time;
            return true;
        }
        return false;
    }

    _error({ message }: { message: string }) {
        this.emit("errored", { message });
    }

    postMessageToAudioBackend = <T extends string & keyof AudioPlayerBackendActions<unknown>>(
        action: T,
        ...args: Parameters<AudioPlayerBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args);
    };
}

interface AudioPlayerEventsMap {
    playbackStateChanged: () => void;
    playbackProgressed: (currentTime: number, duration: number) => void;
    preloadedTrackPlaybackStarted: () => void;
    errored: (error: { message: string }) => void;
    audioContextDidReset: () => void;
}

export default interface AudioPlayerFrontend extends EventEmitterInterface<AudioPlayerEventsMap> {}
