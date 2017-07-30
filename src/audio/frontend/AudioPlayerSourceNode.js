import {Float32Array} from "platform/platform";
import EventEmitter from "events";
import {cancelAndHold} from "audio/frontend/AudioPlayer";
import SourceDescriptor, {decibelToGain} from "audio/frontend/SourceDescriptor";
import {BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER,
        BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER} from "audio/backend/AudioPlayerBackend";


export const FADE_MINIMUM_VOLUME = 0.2;
export const CURVE_LENGTH = 8;
export const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);

export const LAST_BUFFER_LOADED_EVENT = `lastBufferLoaded`;
export const DECODING_LATENCY_EVENT = `decodingLatency`;
export const ENDED_EVENT = `ended`;
export const ERROR_EVENT = `error`;
export const TIME_UPDATE_EVENT = `timeUpdate`;

const getCurve = function(v0, v1) {
    const t0 = 0;
    const t1 = CURVE_LENGTH;
    const ret = CURVE_HOLDER;
    for (let t = t0; t <= t1; ++t) {
        const value = v0 * Math.pow(v1 / v0, (t - t0) / (t1 - t0));
        ret[t] = value;
    }
    return ret;
};

const getFadeOutCurve = function(startValue) {
    return getCurve(startValue, FADE_MINIMUM_VOLUME);
};

const getFadeInCurve = function() {
    return getCurve(FADE_MINIMUM_VOLUME, 1);
};

// TODO: Remove this comment after testing framework is in place and it will become unnecessary.
/* Const WAV_CHANNELS = 2;
const WAV_SR = 48000;
const WAV_DURATION_SECONDS = 5;
const WAV_DURATION = TARGET_BUFFER_LENGTH_SECONDS * WAV_SR * 1 / TARGET_BUFFER_LENGTH_SECONDS * WAV_DURATION_SECONDS;
//const offlineAudioContext = new OfflineAudioContext(WAV_CHANNELS, WAV_DURATION_SECONDS * WAV_SR, WAV_SR);
const wavData = new Int16Array(WAV_CHANNELS * WAV_DURATION + 44 / 2);
let wavLength = 0;
let debugged = false;

function applyWav(planarF32Arrays, frameLength) {
    if (wavLength < WAV_DURATION) {
        const o = wavLength * WAV_CHANNELS + 22;

        for (let i = 0; i < frameLength; ++i) {
            for (let ch = 0; ch < WAV_CHANNELS; ++ch) {
                const j = o + i * WAV_CHANNELS + ch;
                wavData[j] = Math.min(32767, Math.max(-32768, planarF32Arrays[ch][i] * 32768));
            }
        }
        wavLength += frameLength;
    } else if (!debugged) {
        debugged = true;
        const buf = new Uint8Array(wavData.buffer);
        const dataV = new DataView(wavData.buffer);
        dataV.setUint32(0, 0x52494646 >>> 0, false);
        dataV.setUint32(4, wavData.byteLength - 8, true);
        dataV.setUint32(8, 0x57415645 >>> 0, false);
        dataV.setUint32(12, 0x666d7420 >>> 0, false);
        dataV.setUint32(16, 16, true);
        dataV.setUint16(20, 1, true);
        dataV.setUint16(22, WAV_CHANNELS, true);
        dataV.setUint32(24, WAV_SR, true);
        dataV.setUint32(28, WAV_SR * 2 * WAV_CHANNELS, true);
        dataV.setUint16(32, 2 * WAV_CHANNELS, true);
        dataV.setUint16(34, 16, true);
        dataV.setUint32(36, 0x64617461 >>> 0, false);
        dataV.setUint32(40, wavData.byteLength - 44, true);


        const a = new Blob([wavData], {type: `audio/wav`});
        // Just listen to the wav file to see if decoding/channelmixing/resampling was done correctly...
        const b = URL.createObjectURL(a);
        console.log(b);
        debugger;
    }
}*/

export default class AudioPlayerSourceNode extends EventEmitter {
    constructor(audioPlayerFrontend) {
        super();

        this._audioPlayerFrontend = audioPlayerFrontend;
        this._sourceStopped = true;
        this._normalizerNode = null;
        this._fadeInOutNode = null;
        this._volume = 1;
        this._loadingNext = false;

        this._currentTime = 0;
        this._baseTime = 0;
        this._duration = 0;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        this._paused = true;
        this._baseGain = 1;

        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;

        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._previousUpcomingSamplesTime = -1;
        this._timeUpdateEmittedCurrentTime = -1;
        this._timeUpdateEmittedDuration = -1;

        this._preloadedNextTrackArgs = null;

        this._timeUpdate = this._timeUpdate.bind(this);
        this._sourceEnded = this._sourceEnded.bind(this);
        this._ended = this._ended.bind(this);

        this._timeUpdater = this.page().setInterval(this._timeUpdate, 100);
        this._sourceDescriptorQueue = [];
        this._playedSourceDescriptors = [];
        this._backgroundSourceDescriptors = [];
        this._initialize();
    }

    get _audioContext() {
        return this._audioPlayerFrontend._audioContext;
    }

    async _initialize() {
        await this._audioPlayerFrontend.ready();
    }

    page() {
        return this._audioPlayerFrontend.page;
    }

    getAudioPlayerFrontend() {
        return this._audioPlayerFrontend;
    }

    adoptNewAudioContext(audioContext, oldAudioContextTime) {
        if (!this._sourceStopped) {
            throw new Error(`sources must be stopped while adopting new audio context`);
        }
        this._normalizerNode = audioContext.createGain();
        this._fadeInOutNode = audioContext.createGain();
        this._normalizerNode.connect(this._fadeInOutNode);
        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._previousUpcomingSamplesTime = -1;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        const timeDiff = audioContext.currentTime - oldAudioContextTime;

        const sourceDescriptors = this._sourceDescriptorQueue;

        let lowestOriginalTime = Infinity;
        for (let i = 0; i < sourceDescriptors.length; ++i) {
            const sourceDescriptor = sourceDescriptors[i];
            if (sourceDescriptor.started !== -1) {
                lowestOriginalTime = Math.min(sourceDescriptor.started, lowestOriginalTime, sourceDescriptor.stopped);
            }
        }

        for (let i = 0; i < sourceDescriptors.length; ++i) {
            sourceDescriptors[i].readjustTime(timeDiff, lowestOriginalTime);
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            this._playedSourceDescriptors[i].started = this._playedSourceDescriptors[i].stopped = -1;
        }
    }

    get baseGain() {
        const ret = this._baseGain;
        if (isFinite(ret) && ret >= 0) {
            return ret;
        }
        return 1;
    }

    getBufferDuration() {
        return this._audioPlayerFrontend.getBufferDuration();
    }

    getAudioLatency() {
        return this._audioPlayerFrontend.getAudioLatency();
    }

    getTargetBufferLengthSeconds() {
        return this._audioPlayerFrontend.getTargetBufferLengthSeconds();
    }

    getSustainedBufferedAudioSeconds() {
        return this._audioPlayerFrontend.getSustainedBufferedAudioSeconds();
    }

    getSustainedBufferCount() {
        return this._audioPlayerFrontend.getSustainedBufferCount();
    }

    getMinBuffersToRequest() {
        return this._audioPlayerFrontend.getMinBuffersToRequest();
    }

    getCrossfadeDuration() {
        return this._audioPlayerFrontend.getCrossfadeDuration();
    }

    _getCurrentAudioBufferBaseTimeDelta(now) {
        const sourceDescriptor = this._sourceDescriptorQueue[0];
        if (!sourceDescriptor) return 0;
        if (now === undefined) now = this._audioPlayerFrontend.getCurrentTime();
        const {started} = sourceDescriptor;
        if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
            return 0;
        }

        if (this._paused || this._sourceStopped) return 0;
        return Math.min((now - started) + sourceDescriptor.playedSoFar, this.getBufferDuration());
    }

    _nullifyPendingRequests() {
        this._audioPlayerFrontend._message(`cancelAllOperations`);
    }

    _timeUpdate() {
        if (this._loadingNext) return;
        const currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
        const currentTime = this._baseTime + currentBufferPlayedSoFar;
        this._currentTime = Math.min(this._duration, currentTime);
        this._emitTimeUpdate(this._currentTime, this._duration);
        if (currentTime > 0 && this._duration > 0 && currentTime >= (this._duration - this.getCrossfadeDuration())) {
            this._ended();
        }
    }

    _ended() {
        if (this._endedEmitted || this._loadingNext) return;

        this._audioPlayerFrontend.playbackStopped();
        this._endedEmitted = true;

        if (this.hasPreloadedNextTrack()) {
            this._currentTime = this._duration;
            this._emitTimeUpdate(this._currentTime, this._duration, true);
            this.emit(ENDED_EVENT, true);
            return;
        }
        this._nullifyPendingRequests();
        this._currentTime = this._duration;
        this._stopSources();

        let sourceDescriptor;
        while (sourceDescriptor = this._sourceDescriptorQueue.shift()) {
            sourceDescriptor.destroy();
        }

        this._emitTimeUpdate(this._currentTime, this._duration, true);
        this.emit(ENDED_EVENT, false);
    }

    _sourceEnded(descriptor, source) {
        if (descriptor.isInBackground()) {
            const index = this._backgroundSourceDescriptors.indexOf(descriptor);
            if (index >= 0) {
                this._backgroundSourceDescriptors.splice(index, 1);
            }
            descriptor.destroy();
            return;
        }
        const duration = descriptor && descriptor.duration || -1;
        const wasLastBuffer = !!(descriptor && descriptor.isLastForTrack);
        try {
            if (!descriptor) {
                self.uiLog(new Date().toISOString(), `!descriptor`,
                                `ended emitted`, this._endedEmitted,
                                `length`, this._sourceDescriptorQueue.length);
                return;
            }

            const {length} = this._sourceDescriptorQueue;
            let sourceDescriptor = null;
            if (length > 0 && this._sourceDescriptorQueue[0] === descriptor) {
                sourceDescriptor = this._sourceDescriptorQueue.shift();
            } else {
                for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
                    if (this._playedSourceDescriptors[i] === descriptor) {
                        for (let j = i; j < this._playedSourceDescriptors.length; ++j) {
                            this._playedSourceDescriptors[j].destroy();
                        }
                        this._playedSourceDescriptors.length = i;
                        return;
                    }
                }
            }

            if (!sourceDescriptor) {
                self.uiLog(new Date().toISOString(), `!sourceDescriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._sourceDescriptorQueue.length,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
                sourceDescriptor = descriptor;
            }

            if (sourceDescriptor !== descriptor) {
                sourceDescriptor = descriptor;
                self.uiLog(new Date().toISOString(), `sourceDescriptor !== descriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._sourceDescriptorQueue.length,
                             `queuedStart`, sourceDescriptor.startTime,
                             `queuedEnd`, sourceDescriptor.endTime,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
            }
            source.descriptor = null;
            source.onended = null;
            sourceDescriptor.source = null;
            this._playedSourceDescriptors.push(sourceDescriptor);
            while (this._playedSourceDescriptors.length > this._audioPlayerFrontend._playedAudioBuffersNeededForVisualization) {
                this._playedSourceDescriptors.shift().destroy();
            }
        } finally {
            this._sourceEndedUpdate(duration, wasLastBuffer);
        }
    }

    _sourceEndedUpdate(sourceDuration, wasLastBuffer) {
        try {
            if (sourceDuration !== -1 && !this._endedEmitted) {
                this._baseTime += sourceDuration;
            }
            if (this._baseTime >= this._duration ||
                (wasLastBuffer && this._sourceDescriptorQueue.length === 0)) {
                this._ended();
            }
        } finally {
            this._audioPlayerFrontend.ping();
            if (!this._endedEmitted) {
                this._requestMoreBuffers();
            }
            if (this._timeUpdate) {
                this._timeUpdate();
            }
        }
    }

    _lastSourceEnds() {
        if (this._sourceStopped) throw new Error(`sources are stopped`);
        if (this._sourceDescriptorQueue.length === 0) return this._audioPlayerFrontend.getCurrentTime();
        const sourceDescriptor = this._sourceDescriptorQueue[this._sourceDescriptorQueue.length - 1];
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _lastBackgroundSourceEnds() {
        if (!this._backgroundSourceDescriptors.length) {
            return this._lastSourceEnds();
        }
        const sourceDescriptor = this._backgroundSourceDescriptors[this._backgroundSourceDescriptors.length - 1];
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _startSource(sourceDescriptor, when) {
        const {audioBuffer} = sourceDescriptor;
        const duration = sourceDescriptor.getRemainingDuration();
        const src = this._audioContext.createBufferSource();
        let endedEmitted = false;
        sourceDescriptor.source = src;
        sourceDescriptor.started = when;
        sourceDescriptor.stopped = when + duration;
        src.buffer = audioBuffer;
        src.connect(this.node());
        try {
            this._normalizerNode.gain.setValueAtTime(sourceDescriptor.gain, when);
        } catch (e) {
            self.uiLog(e.stack);
        }
        src.start(when, sourceDescriptor.playedSoFar);
        src.stop(when + duration);
        src.onended = () => {
            if (endedEmitted) return;
            endedEmitted = true;
            src.onended = null;
            this._sourceEnded(sourceDescriptor, src);
        };

        return when + duration;
    }

    _startSources(when) {
        if (this._paused) return;
        if (!this._sourceStopped) throw new Error(`sources are not stopped`);
        this._sourceStopped = false;
        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            when = this._startSource(this._sourceDescriptorQueue[i], when);
        }
    }

    _stopBackgroundSources() {
        for (let i = 0; i < this._backgroundSourceDescriptors.length; ++i) {
            this._backgroundSourceDescriptors[i].destroy();
        }
        this._backgroundSourceDescriptors.length = 0;
    }

    _stopSources(when = this._audioPlayerFrontend.getCurrentTime(),
                 destroyDescriptorsThatWillNeverPlay = false) {
        if (this._sourceStopped) return;
        this._audioPlayerFrontend.playbackStopped();

        this._sourceStopped = true;
        try {
            this._normalizerNode.gain.cancelScheduledValues(when);
        } catch (e) {
            self.uiLog(e.stack);
        }

        this._stopBackgroundSources();

        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            const sourceDescriptor = this._sourceDescriptorQueue[i];
            if (destroyDescriptorsThatWillNeverPlay && (sourceDescriptor.started === -1 ||
                sourceDescriptor.started > when)) {
                for (let j = i; j < this._sourceDescriptorQueue.length; ++j) {
                    this._sourceDescriptorQueue[j].destroy(when);
                }
                this._sourceDescriptorQueue.length = i;
                return;
            }
            const src = sourceDescriptor.source;
            if (!src) continue;
            if (when >= sourceDescriptor.started &&
                when < sourceDescriptor.started + sourceDescriptor.duration) {
                sourceDescriptor.playedSoFar = (when - sourceDescriptor.started);
            }
            src.onended = null;
            try {
                src.stop(when);
            } catch (e) {
                // NOOP
            }
        }
    }

    getSamplesScheduledAtOffsetRelativeToNow(channelData, offsetSeconds = 0) {
        const ret = {
            sampleRate: 44100,
            channelCount: channelData.length,
            channelDataFilled: false,
            gain: 1
        };

        if (this._sourceStopped) {
            return ret;
        }
        const timestamp = this._audioPlayerFrontend.getOutputTimestamp();
        let currentTime = timestamp.contextTime;
        const hr = timestamp.performanceTime;
        const prevHr = this._previousHighResTime;

        // Workaround for bad values from polyfill
        if (currentTime === this._previousAudioContextTime) {
            const reallyElapsed = Math.round(((hr - prevHr) * 1000)) / 1e6;
            currentTime += reallyElapsed;
            this._previousCombinedTime = currentTime;
        } else {
            this._previousAudioContextTime = currentTime;
            this._previousHighResTime = hr;
        }

        if (currentTime < this._previousCombinedTime) {
            currentTime = this._previousCombinedTime + Math.round(((hr - prevHr) * 1000)) / 1e6;
        }

        if (!this._sourceDescriptorQueue.length) {
            return ret;
        }

        const targetStartTime = currentTime + offsetSeconds;
        if (targetStartTime < 0) {
            return ret;
        }

        const [nextSourceDescriptor] = this._sourceDescriptorQueue;
        const {sampleRate, channelCount} = nextSourceDescriptor;
        const duration = channelData[0].length / sampleRate;
        let lowerBoundSourceDescriptor, upperBoundSourceDescriptor;

        // Assume `duration` is always less than bufferDuration. Which it is.
        if (duration > this.getBufferDuration()) {
            self.uiLog(`duration > this.getBufferDuration() ${duration} ${this.getBufferDuration()}`);
            return ret;
        }

        for (let i = 0; i < this._playedSourceDescriptors.length; ++i) {
            const sourceDescriptor = this._playedSourceDescriptors[i];
            if (sourceDescriptor.started <= targetStartTime && targetStartTime <= sourceDescriptor.stopped) {
                lowerBoundSourceDescriptor = sourceDescriptor;

                if (targetStartTime + duration <= sourceDescriptor.stopped) {
                    upperBoundSourceDescriptor = sourceDescriptor;
                } else if (i + 1 < this._playedSourceDescriptors.length) {
                    upperBoundSourceDescriptor = this._playedSourceDescriptors[i + 1];
                }
                break;
            }
        }

        if (!lowerBoundSourceDescriptor || !upperBoundSourceDescriptor) {
            for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
                const sourceDescriptor = this._sourceDescriptorQueue[i];
                if (!lowerBoundSourceDescriptor &&
                    sourceDescriptor.started <= targetStartTime && targetStartTime <= sourceDescriptor.stopped) {
                    lowerBoundSourceDescriptor = sourceDescriptor;
                    if (targetStartTime + duration <= sourceDescriptor.stopped) {
                        upperBoundSourceDescriptor = lowerBoundSourceDescriptor;
                    } else if (i + 1 < this._sourceDescriptorQueue.length) {
                        upperBoundSourceDescriptor = this._sourceDescriptorQueue[i + 1];
                    } else {
                        return ret;
                    }
                    break;
                }

                if (lowerBoundSourceDescriptor && !upperBoundSourceDescriptor) {
                    upperBoundSourceDescriptor = this._sourceDescriptorQueue[i];
                    break;
                }
            }
        }

        if (!lowerBoundSourceDescriptor || !upperBoundSourceDescriptor) {
            return ret;
        }

        ret.sampleRate = sampleRate;
        ret.channelCount = channelCount;
        ret.gain = lowerBoundSourceDescriptor.gain;

        const length = duration * sampleRate | 0;
        const bufferLength = lowerBoundSourceDescriptor.duration * sampleRate | 0;
        let offset;
        if (lowerBoundSourceDescriptor === upperBoundSourceDescriptor) {
            offset = (targetStartTime - lowerBoundSourceDescriptor.started) * sampleRate | 0;
            const {audioBuffer} = lowerBoundSourceDescriptor;

                for (let ch = 0; ch < channelData.length; ++ch) {
                    audioBuffer.copyFromChannel(channelData[ch], ch, offset);
                }

        } else {
            offset = (lowerBoundSourceDescriptor.duration -
                            (lowerBoundSourceDescriptor.stopped - targetStartTime)) * sampleRate | 0;
            let {audioBuffer} = lowerBoundSourceDescriptor;

            for (let ch = 0; ch < channelData.length; ++ch) {
                audioBuffer.copyFromChannel(channelData[ch], ch, offset);
            }
            ({audioBuffer} = upperBoundSourceDescriptor);
            const samplesCopied = bufferLength - offset;
            const remainingLength = length - samplesCopied;
            for (let ch = 0; ch < channelData.length; ++ch) {
                const dst = new Float32Array(channelData[ch].buffer,
                                             samplesCopied * 4,
                                             remainingLength);
                audioBuffer.copyFromChannel(dst, ch, 0);
            }
        }

        ret.channelDataFilled = true;
        return ret;
    }

    _requestMoreBuffers() {
        if (this._sourceDescriptorQueue.length < this.getSustainedBufferCount()) {
            const bufferFillCount = this.getSustainedBufferCount() - this._sourceDescriptorQueue.length;
            if (bufferFillCount >= this.getMinBuffersToRequest()) {
                this._audioPlayerFrontend._message(`fillBuffers`, {bufferFillCount});
            }
        }
    }

    _seekCompleted(scheduledStartTime) {
        this._maybeFadeIn(this._audioPlayerFrontend.getSeekFadeTime(), scheduledStartTime);
    }

    _firstBufferFromDifferentTrackLoaded(scheduledStartTime) {
        this._maybeFadeIn(this._audioPlayerFrontend.getTrackChangeFadeTime(), scheduledStartTime);
    }

    getCurrentTimeScheduledAhead() {
        return this._audioPlayerFrontend.getScheduleAheadTime() + this._audioPlayerFrontend.getCurrentTime();
    }

    _idle() {
        this._requestMoreBuffers();
    }

    _rescheduleLoudness() {
        let when = this.getCurrentTimeScheduledAhead();
        try {
            this._normalizerNode.gain.cancelScheduledValues(when);
        } catch (e) {
            self.uiLog(e.stack);
        }
        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            const sourceDescriptor = this._sourceDescriptorQueue[i];
            try {
                let {duration} = sourceDescriptor;
                if (sourceDescriptor.playedSoFar > 0) {
                    duration = sourceDescriptor.getRemainingDuration() - this._audioPlayerFrontend.getScheduleAheadTime();
                    if (duration < 0) {
                        continue;
                    }
                }
                this._normalizerNode.gain.setValueAtTime(sourceDescriptor.gain, when);
                when += duration;
            } catch (e) {
                self.uiLog(`when=${when}`);
                sourceDescriptor.print();
                self.uiLog(e.message);
            }
        }
    }

    _lastBufferQueued(descriptor) {
        if (!this._lastBufferLoadedEmitted) {
            if (descriptor.endTime < this._duration - this.getBufferDuration() - this.getCrossfadeDuration()) {
                this._duration = descriptor.endTime;
                this._emitTimeUpdate(this._currentTime, this._duration);
            }
            this._lastBufferLoadedEmitted = true;
            this.emit(LAST_BUFFER_LOADED_EVENT);
        }
    }

    _emitTimeUpdate(currentTime, duration) {
        if (this._timeUpdateEmittedCurrentTime === currentTime &&
            this._timeUpdateEmittedDuration === duration) {
            return;
        }
        this._timeUpdateEmittedDuration = duration;
        this._timeUpdateEmittedCurrentTime = currentTime;
        this.emit(TIME_UPDATE_EVENT, currentTime, duration);
    }

    _bufferFilled({descriptor, bufferFillType, extraData}, transferList) {
        if (!descriptor) {
            return;
        }
        const {loudnessInfo} = descriptor;
        this.emit(DECODING_LATENCY_EVENT, descriptor.decodingLatency);

        if (descriptor.isBackgroundBuffer) {
            if (!this._paused) {
                const sourceDescriptor = new SourceDescriptor(this, transferList, descriptor);
                sourceDescriptor.setBackground();
                this._startSource(sourceDescriptor, this._lastBackgroundSourceEnds());
                this._backgroundSourceDescriptors.push(sourceDescriptor);
            }

            this._lastBufferQueued(descriptor);
            return;
        }

        const skipBuffer = loudnessInfo.isEntirelySilent;
        let currentSourcesShouldBeStopped = false;
        let scheduledStartTime = 0;
        const afterScheduleKnownCallbacks = [];

        if (bufferFillType === BUFFER_FILL_TYPE_FIRST_SEEK_BUFFER) {
            const {baseTime} = extraData;

            currentSourcesShouldBeStopped = true;
            this._applySeekInfo(baseTime);
            afterScheduleKnownCallbacks.push(this._seekCompleted);
            if (this._audioPlayerFrontend.getSeekFadeTime() > 0) {
                scheduledStartTime = this._fadeOutEnded;
        }
        } else if (bufferFillType === BUFFER_FILL_TYPE_FIRST_LOAD_BUFFER) {
            const {demuxData, isPreloadForNextTrack, baseTime} = extraData;
            this._loadingNext = false;
            if (isPreloadForNextTrack) {
                this._preloadedNextTrackArgs = {demuxData, baseTime};
            } else {
                currentSourcesShouldBeStopped = true;
                this._applyTrackInfo({demuxData, baseTime});
                afterScheduleKnownCallbacks.push(this._firstBufferFromDifferentTrackLoaded);
                if (this._audioPlayerFrontend.getTrackChangeFadeTime() > 0) {
                    scheduledStartTime = this._fadeOutEnded;
                }
            }
        }

        this._audioPlayerFrontend.playbackStarted();
        this._audioPlayerFrontend.resume();

        let sourceDescriptor;

        if (!skipBuffer) {
            if (transferList.length !== descriptor.channelCount) {
                throw new Error(`transferList.length (${transferList.length}) !== channelCount (${descriptor.channelCount})`);
            }

            sourceDescriptor = new SourceDescriptor(this, transferList, descriptor);
        }

        if (!skipBuffer &&
            this._baseGain === 1 && !isNaN(loudnessInfo.loudness)) {
            this._baseGain = decibelToGain(loudnessInfo.loudness);
            if (!currentSourcesShouldBeStopped && !this._sourceStopped) {
                this._rescheduleLoudness();
            }
        }

        if (currentSourcesShouldBeStopped) {
            scheduledStartTime = Math.max(scheduledStartTime, this.getCurrentTimeScheduledAhead());
            if (!this._sourceStopped) {
                this._stopSources(scheduledStartTime, true);
            }

            this._playedSourceDescriptors.push(...this._sourceDescriptorQueue);
            this._sourceDescriptorQueue.length = 0;

            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                if (this._sourceStopped) {
                    this._startSources(scheduledStartTime);
                } else {
                    this._startSource(sourceDescriptor, scheduledStartTime);
                }
            }
        } else if (this._sourceStopped) {
            scheduledStartTime = Math.max(scheduledStartTime, this.getCurrentTimeScheduledAhead());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                if (!this._paused) {
                    this._startSources(scheduledStartTime);
                }
            }
        } else {
            scheduledStartTime = Math.max(scheduledStartTime, this._lastSourceEnds());
            if (!skipBuffer) {
                this._sourceDescriptorQueue.push(sourceDescriptor);
                this._startSource(sourceDescriptor, scheduledStartTime);

            }
        }

        for (let i = 0; i < afterScheduleKnownCallbacks.length; ++i) {
            afterScheduleKnownCallbacks[i].call(this, scheduledStartTime);
        }

        if (descriptor.isLastBuffer) {
            this._lastBufferQueued(descriptor);
        }

        if (skipBuffer) {
            this._sourceEndedUpdate(descriptor.length / descriptor.sampleRate, descriptor.isLastBuffer);
        }
    }

    _printQueue() {
        for (let i = 0; i < this._sourceDescriptorQueue.length; ++i) {
            const b = this._sourceDescriptorQueue[i];
            const s = b.sampleRate;
            self.uiLog(`${i} (${b.startTime} -> ${b.endTime}): started ${b.started} (${b.started * s}) stopped ${b.stopped} (${b.stopped * s})`);
        }
    }

    muteRequested() {
        if (this._maybeFadeOut(this._audioPlayerFrontend.getMuteUnmuteFadeTime())) {
            return this._fadeOutEnded;
        } else {
            return this._audioPlayerFrontend.getCurrentTime();
        }
    }

    unmuteRequested() {
        const scheduledStartTime = Math.max(this._fadeOutEnded, this.getCurrentTimeScheduledAhead());
        if (this._maybeFadeIn(this._audioPlayerFrontend.getMuteUnmuteFadeTime(), scheduledStartTime)) {
            return this._fadeInStarted;
        } else {
            return scheduledStartTime;
        }
    }

    pause() {
        if (this._paused) return;
        if (this._maybeFadeOut(this._audioPlayerFrontend.getPauseResumeFadeTime())) {
            this._stopSources(this._fadeOutEnded);
        } else {
            this._stopSources();
        }
        this._paused = true;
    }

    play() {
        if (!this._paused) return;
        if (this._duration > 0 &&
            this._currentTime > 0 &&
            this._currentTime >= this._duration) {
            return;
        }
        this._paused = false;
        if (this._sourceDescriptorQueue.length > 0 && this._sourceStopped) {
            this._audioPlayerFrontend.playbackStarted();
            this._audioPlayerFrontend.resume();
            const scheduledStartTime = Math.max(this.getCurrentTimeScheduledAhead(), this._fadeOutEnded);
            this._startSources(scheduledStartTime);
            this._maybeFadeIn(this._audioPlayerFrontend.getSeekFadeTime(), scheduledStartTime);
        }
        this._emitTimeUpdate(this._currentTime, this._duration);
    }

    resume() {
        return this.play();
    }

    isPaused() {
        return this._paused;
    }

    node() {
        return this._fadeInOutNode;
    }

    getCurrentTime() {
        return this._currentTime;
    }

    getDuration() {
        return this._duration;
    }

    _maybeFadeOut(time, ctxTime = this._audioPlayerFrontend.getCurrentTime()) {
        if (time > 0) {
            const param = this._fadeInOutNode.gain;
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

    _maybeFadeIn(time, ctxTime = this._audioPlayerFrontend.getCurrentTime()) {
        if (time > 0) {
            const curve = getFadeInCurve();
            try {
                this._fadeInOutNode.gain.setValueCurveAtTime(curve, ctxTime, time);
            } catch (e) {
                return false;
            }
            this._fadeInStarted = ctxTime;
            this._fadeInStartedWithLength = time;
            return true;
        }
        return false;
    }

    _seek(time) {
        if (!this.isSeekable()) return;
        const bufferFillCount = this.getSustainedBufferCount();
        this._audioPlayerFrontend._message(`seek`, {bufferFillCount, time});
    }

    unload() {
        this._preloadedNextTrackArgs = null;
        this._nullifyPendingRequests();
        this._currentTime = this._duration = this._baseTime = 0;
        this._seeking = false;
        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;
        this._stopSources();

        const sourceDescriptors = this._sourceDescriptorQueue.concat(this._playedSourceDescriptors,
                                                                     this._backgroundSourceDescriptors);
        for (const sourceDescriptor of sourceDescriptors) {
            sourceDescriptor.destroy();
        }
        this._sourceDescriptorQueue.length =
        this._playedSourceDescriptors.length =
        this._backgroundSourceDescriptors.length = 0;
    }

    isSeekable() {
        return !this._lastBufferLoadedEmitted && !this._loadingNext;
    }

    _error({message}) {
        this.unload();
        this.emit(ERROR_EVENT, {message});
    }

    _applySeekInfo(baseTime) {
        this._baseTime = baseTime;
        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;
        this._timeUpdate();
    }

    _applyTrackInfo({demuxData, baseTime}) {
        this._duration = demuxData.duration;
        this._baseGain = typeof demuxData.establishedGain === `number` ? demuxData.establishedGain : 1;
        this._applySeekInfo(baseTime);
    }

    hasPreloadedNextTrack() {
        return this._preloadedNextTrackArgs !== null;
    }

    replaceWithPreloadedTrack() {
        if (!this.hasPreloadedNextTrack()) throw new Error(`no track has been preloaded`);
        const args = this._preloadedNextTrackArgs;
        this._preloadedNextTrackArgs = null;
        this._applyTrackInfo(args);
        return args.scheduledStartTime;
    }

    _load(fileReference, isPreloadForNextTrack, progress = 0) {
        this._loadingNext = true;
        this._preloadedNextTrackArgs = null;
        this._endedEmitted = false;
        const bufferFillCount = this.getSustainedBufferCount();

        this._audioPlayerFrontend._message(`load`, {
            fileReference,
            isPreloadForNextTrack,
            bufferFillCount,
            progress
        });
    }

    setCurrentTime(time) {
        if (!this.isSeekable()) {
            return;
        }
        time = Math.max(0, time);
        time = Math.min(this._audioPlayerFrontend.getMaximumSeekTime(this._duration), time);

        this._currentTime = time;
        this._baseTime = this._currentTime - this._getCurrentAudioBufferBaseTimeDelta();
        this._timeUpdate();
        this._seek(this._currentTime);
    }

    preload(fileReference) {
        this._load(fileReference, true);
    }

    load(fileReference, progress) {
        this._load(fileReference, false, progress);
    }
}
