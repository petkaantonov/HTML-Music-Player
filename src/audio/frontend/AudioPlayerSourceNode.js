import {throttle} from "util";
import {Float32Array, Blob, File, console, performance} from "platform/platform";
import EventEmitter from "events";
import {cancelAndHold} from "audio/frontend/AudioPlayer";
import SourceDescriptor, {decibelToGain} from "audio/frontend/SourceDescriptor";
import {SUSTAINED_BUFFER_COUNT,
        TARGET_BUFFER_LENGTH_SECONDS,
        MIN_BUFFERS_TO_REQUEST} from "audio/frontend/buffering";
import {BUFFER_FILL_TYPE_SEEK,
        BUFFER_FILL_TYPE_REPLACEMENT} from "audio/backend/AudioSource";

const NO_THROTTLE = {};
const EXPENSIVE_CALL_THROTTLE_TIME = 100;

export const FADE_MINIMUM_VOLUME = 0.2;
export const CURVE_LENGTH = 8;
export const CURVE_HOLDER = new Float32Array(CURVE_LENGTH + 1);
export const MAXIMUM_FADE_TIME_SECONDS = TARGET_BUFFER_LENGTH_SECONDS;
export const MINIMUM_FADE_TIME_SECONDS = 0;

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

const MAX_ANALYSER_SIZE = 65536;
export default class AudioPlayerSourceNode extends EventEmitter {
    constructor(player, id, audioContext) {
        super();
        this._id = id;
        this._sourceEndedId = 0;
        this._seekRequestId = 0;
        this._replacementRequestId = 0;

        this._lastExpensiveCall = 0;

        this._player = player;
        this._audioContext = audioContext;
        this._haveBlob = false;
        this._sourceStopped = true;
        this._normalizerNode = audioContext.createGain();
        this._fadeInOutNode = audioContext.createGain();
        this._normalizerNode.connect(this._fadeInOutNode);
        this._volume = 1;
        this._loadingNext = false;

        this._currentTime = 0;
        this._baseTime = 0;
        this._duration = 0;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        this._paused = true;
        this._destroyed = false;
        this._baseGain = 1;

        this._initialPlaythroughEmitted = false;
        this._currentSeekEmitted = false;
        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;

        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;

        this._gaplessPreloadArgs = null;

        this._timeUpdate = this._timeUpdate.bind(this);
        this._sourceEnded = this._sourceEnded.bind(this);
        this._ended = this._ended.bind(this);

        this._timeUpdater = this.page().setInterval(this._timeUpdate, 32);
        this._player._message(-1, `register`, {
            id: this._id
        });

        this._bufferQueue = [];
        this._playedBufferQueue = [];
    }

    page() {
        return this._player.page;
    }

    destroy() {
        if (this._destroyed) return;
        this.removeAllListeners();
        this.page().clearInterval(this._timeUpdater);
        this.unload();
        this._player._sourceNodeDestroyed(this);
        try {
            this._normalizerNode.disconnect();
        } catch (e) {
            // NOOP
        }
        try {
            this._fadeInOutNode.disconnect();
        } catch (e) {
            // NOOP
        }
        this._fadeInOutNode = null;
        this._normalizerNode = null;
        this._audioContext = null;
        this._timeUpdate =
        this._sourceEnded =
        this._ended = null;
        this._destroyed = true;
        this._player._message(this._id, `destroy`);
    }

    adoptNewAudioContext(audioContext) {
        if (!this._sourceStopped) {
            throw new Error(`sources must be stopped while adopting new audio context`);
        }
        this._audioContext = audioContext;
        this._normalizerNode = audioContext.createGain();
        this._fadeInOutNode = audioContext.createGain();
        this._normalizerNode.connect(this._fadeInOutNode);
        this._previousAudioContextTime = -1;
        this._previousHighResTime = -1;
        this._previousCombinedTime = -1;
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;

        if (this._bufferQueue.length > 0) {
            this._bufferQueue[0].started = audioContext.currentTime - this._bufferQueue[0].playedSoFar;
            for (let i = 1; i < this._bufferQueue.length; ++i) {
                const prev = this._bufferQueue[i - 1];
                this._bufferQueue[i].started = prev.started + prev.duration;
            }
        }
    }

    _getCurrentAudioBufferBaseTimeDelta(now) {
        const sourceDescriptor = this._bufferQueue[0];
        if (!sourceDescriptor) return 0;
        if (now === undefined) now = this._player.getCurrentTime();
        const {started} = sourceDescriptor;
        if (now < started || started > (sourceDescriptor.started + sourceDescriptor.duration)) {
            return 0;
        }

        if (this._paused || this._sourceStopped) return 0;
        return Math.min((now - started) + sourceDescriptor.playedSoFar, this._player.getBufferDuration());
    }

    _nullifyPendingRequests() {
        this._seekRequestId++;
        this._replacementRequestId++;
        this._player._message(this._id, `cancelAllOperations`);
    }

    _timeUpdate() {
        if (this._destroyed || this._loadingNext) return;
        const currentBufferPlayedSoFar = this._getCurrentAudioBufferBaseTimeDelta();
        const currentTime = this._baseTime + currentBufferPlayedSoFar;
        this._currentTime = this._haveBlob ? Math.min(this._duration, currentTime) : currentTime;
        this._emitTimeUpdate(this._currentTime, this._duration);
    }

    _ended() {
        if (this._endedEmitted || this._destroyed || this._loadingNext) return;

        this._player.playbackStopped();
        this._endedEmitted = true;

        if (this.hasGaplessPreload()) {
            this._currentTime = this._duration;
            this._emitTimeUpdate(this._currentTime, this._duration, true);
            this.emit(`ended`, true);
            return;
        }
        this._nullifyPendingRequests();
        this._currentTime = this._duration;
        this._stopSources();

        let sourceDescriptor;
        while (sourceDescriptor = this._bufferQueue.shift()) {
            this._destroySourceDescriptor(sourceDescriptor);
        }

        this._emitTimeUpdate(this._currentTime, this._duration, true);
        this.emit(`ended`, false);
    }

    _destroySourceDescriptor(sourceDescriptor, stopTime = -1) {
        if (sourceDescriptor.buffer === null) return;
        sourceDescriptor._sourceNode = null;
        const src = sourceDescriptor.source;
        if (src) {
            src.descriptor = null;
            src.onended = null;

            if (stopTime !== -1) {
                try {
                    src.stop(stopTime);
                } catch (e) {
                    // NOOP
                }
            }

            try {
                src.disconnect();
            } catch (e) {
                // NOOP
            }
            sourceDescriptor.source = null;
        }
        this._player._freeAudioBuffer(sourceDescriptor.buffer);
        for (let i = 0; i < sourceDescriptor.channelData.length; ++i) {
            this._player._freeArrayBuffer(sourceDescriptor.channelData[i]);
        }
        sourceDescriptor.buffer = null;
        sourceDescriptor.channelData = null;
    }

    _sourceEnded(descriptor, source) {
        try {
            if (!descriptor) {
                self.uiLog(new Date().toISOString(), `!descriptor`,
                                `ended emitted`, this._endedEmitted,
                                `length`, this._bufferQueue.length);
                return;
            }

            const {length} = this._bufferQueue;
            let sourceDescriptor = null;
            if (length > 0 && this._bufferQueue[0] === descriptor) {
                sourceDescriptor = this._bufferQueue.shift();
            } else {
                for (let i = 0; i < this._playedBufferQueue.length; ++i) {
                    if (this._playedBufferQueue[i] === descriptor) {
                        for (let j = i; j < this._playedBufferQueue.length; ++j) {
                            this._destroySourceDescriptor(this._playedBufferQueue[j]);
                        }
                        this._playedBufferQueue.length = i;
                        return;
                    }
                }
            }

            if (!sourceDescriptor) {
                this._destroySourceDescriptor(descriptor);
                self.uiLog(new Date().toISOString(), `!sourceDescriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._bufferQueue.length,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
                this._ended();
                return;
            }

            if (sourceDescriptor !== descriptor) {
                self.uiLog(new Date().toISOString(), `sourceDescriptor !== descriptor`,
                             `ended emitted`, this._endedEmitted,
                             `prelen`, length,
                             `postlen`, this._bufferQueue.length,
                             `queuedStart`, sourceDescriptor.startTime,
                             `queuedEnd`, sourceDescriptor.endTime,
                             `referencedStart`, descriptor.startTime,
                             `referencedEnd`, descriptor.endTime);
                this._destroySourceDescriptor(descriptor);
                this._destroySourceDescriptor(sourceDescriptor);
                this._ended();
                return;
            }
            this._baseTime += sourceDescriptor.duration;

            source.descriptor = null;
            source.onended = null;
            sourceDescriptor.source = null;
            this._playedBufferQueue.push(sourceDescriptor);
            while (this._playedBufferQueue.length > this._player._playedAudioBuffersNeededForVisualization) {
                this._destroySourceDescriptor(this._playedBufferQueue.shift());
            }

            if (this._baseTime >= this._duration ||
                (sourceDescriptor.isLastForTrack && this._bufferQueue.length === 0)) {
                this._ended();
                return;
            }
        } finally {
            this._player.ping();
            this._requestMoreBuffers();
            if (this._timeUpdate) {
                this._timeUpdate();
            }
        }
    }

    _lastSourceEnds() {
        if (this._sourceStopped) throw new Error(`sources are stopped`);
        if (this._bufferQueue.length === 0) return this._player.getCurrentTime();
        const sourceDescriptor = this._bufferQueue[this._bufferQueue.length - 1];
        return sourceDescriptor.started + sourceDescriptor.getRemainingDuration();
    }

    _startSource(sourceDescriptor, when) {
        if (this._destroyed) return -1;
        const {buffer} = sourceDescriptor;
        const duration = sourceDescriptor.getRemainingDuration();
        const src = this._audioContext.createBufferSource();
        let endedEmitted = false;
        sourceDescriptor.source = src;
        sourceDescriptor.started = when;
        sourceDescriptor.stopped = when + duration;
        src.buffer = buffer;
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
        if (this._destroyed || this._paused) return;
        if (!this._sourceStopped) throw new Error(`sources are not stopped`);
        this._sourceStopped = false;
        for (let i = 0; i < this._bufferQueue.length; ++i) {
            when = this._startSource(this._bufferQueue[i], when);
        }

        if (!this._initialPlaythroughEmitted) {
            this._initialPlaythroughEmitted = true;
            this.emit(`initialPlaythrough`);
        }
    }

    _stopSources(when = this._player.getCurrentTime(),
                                                            destroyDescriptorsThatWillNeverPlay = false) {
        if (this._destroyed || this._sourceStopped) return;
        this._player.playbackStopped();

        this._sourceStopped = true;
        try {
            this._normalizerNode.gain.cancelScheduledValues(when);
        } catch (e) {
            self.uiLog(e.stack);
        }

        for (let i = 0; i < this._bufferQueue.length; ++i) {
            const sourceDescriptor = this._bufferQueue[i];
            if (destroyDescriptorsThatWillNeverPlay && (sourceDescriptor.started === -1 ||
                sourceDescriptor.started > when)) {
                for (let j = i; j < this._bufferQueue.length; ++j) {
                    this._destroySourceDescriptor(this._bufferQueue[j], when);
                }
                this._bufferQueue.length = i;
                return;
            }
            const src = sourceDescriptor.source;
            if (!src) continue;
            if (when >= sourceDescriptor.started &&
                when < sourceDescriptor.started + sourceDescriptor.duration) {
                sourceDescriptor.playedSoFar += (when - sourceDescriptor.started);
            }
            src.onended = null;

            try {
                src.stop(when);
            } catch (e) {
                // NOOP
            }
        }
    }

    getUpcomingSamples(input) {
        if (this._destroyed) return false;
        if (!(input instanceof Float32Array)) throw new Error(`need Float32Array`);
        let samplesNeeded = Math.min(MAX_ANALYSER_SIZE, input.length);
        const inputBuffer = input.buffer;

        if (!this._sourceStopped) {
            const timestamp = this._player.getOutputTimestamp();
            let now = timestamp.contextTime;
            const hr = timestamp.performanceTime;
            const prevHr = this._previousHighResTime;

            // Workaround for bad values from polyfill
            if (now === this._previousAudioContextTime) {
                const reallyElapsed = Math.round(((hr - prevHr) * 1000)) / 1e6;
                now += reallyElapsed;
                this._previousCombinedTime = now;
            } else {
                this._previousAudioContextTime = now;
                this._previousHighResTime = hr;
            }

            if (now < this._previousCombinedTime) {
                now = this._previousCombinedTime + Math.round(((hr - prevHr) * 1000)) / 1e6;
            }

            let samplesIndex = 0;
            const bufferQueue = this._bufferQueue;
            const playedBufferQueue = this._playedBufferQueue;

            if (bufferQueue.length === 0) {
                return false;
            }

            const buffers = [bufferQueue[0]];
            const {sampleRate} = this._audioContext;
            const offsetInCurrentBuffer = this._getCurrentAudioBufferBaseTimeDelta(now);

            if (Math.ceil((offsetInCurrentBuffer + (samplesNeeded / sampleRate)) * sampleRate) > buffers[0].length &&
                bufferQueue.length < 2) {
                return false;
            } else {
                buffers.push(bufferQueue[1]);
            }

            if (playedBufferQueue.length === 0) {
                return false;
            } else {
                buffers.unshift(playedBufferQueue.length > 0 ? playedBufferQueue[0] : null);
            }

            const bufferIndex = offsetInCurrentBuffer >= 0 ? 1 : 0;
            let bufferDataIndex = bufferIndex === 0 ? (buffers[0].length + ((offsetInCurrentBuffer * sampleRate) | 0))
                                                    : ((offsetInCurrentBuffer) * sampleRate) | 0;

            for (let i = bufferIndex; i < buffers.length; ++i) {
                const j = bufferDataIndex;
                const buffer = buffers[i];
                const samplesRemainingInBuffer = Math.max(0, buffer.length - j);
                if (samplesRemainingInBuffer <= 0) {
                    bufferDataIndex = 0;
                    continue;
                }
                const byteLength = buffer.channelData[0].buffer.byteLength - j * 4;
                const fillCount = Math.min(samplesNeeded, samplesRemainingInBuffer, (byteLength / 4) | 0);
                const {channelData, gain} = buffer;
                const sampleViews = new Array(channelData.length);
                for (let ch = 0; ch < sampleViews.length; ++ch) {
                    sampleViews[ch] = new Float32Array(channelData[ch].buffer, j * 4, fillCount);
                }
                const dst = new Float32Array(inputBuffer, samplesIndex * 4, samplesNeeded);

                if (sampleViews.length === 2) {
                    for (let k = 0; k < fillCount; ++k) {
                        dst[k] = Math.fround((sampleViews[0][k] + sampleViews[1][k]) / 2 * gain);
                    }
                } else if (sampleViews.length === 1) {
                    const src = sampleViews[0];
                    for (let k = 0; k < fillCount; ++k) {
                        dst[k] = Math.fround(src[k] * gain);
                    }
                } else {
                    // TODO Support more than 2 channels.
                    return false;
                }
                samplesIndex += fillCount;
                samplesNeeded -= fillCount;

                if (samplesNeeded <= 0) {
                    return true;
                }
                bufferDataIndex = 0;
            }
            return false;
        } else {
            for (let i = 0; i < input.length; ++i) {
                input[i] = 0;
            }
            return true;
        }
    }

    _getBuffersForTransferList(count) {
        const buffers = new Array(this._audioContext.destination.channelCount * count);
        const size = this._audioContext.sampleRate * this._player._audioBufferTime;
        for (let i = 0; i < buffers.length; ++i) {
            buffers[i] = this._player._allocArrayBuffer(size);
        }
        return buffers;
    }

    _requestMoreBuffers() {
        if (!this._haveBlob || this._destroyed) return;
        if (this._bufferQueue.length < SUSTAINED_BUFFER_COUNT) {
            const count = SUSTAINED_BUFFER_COUNT - this._bufferQueue.length;
            if (count >= MIN_BUFFERS_TO_REQUEST) {
                this._player._message(this._id, `fillBuffers`, {
                    count
                }, this._getBuffersForTransferList(count));
            }
        }
    }

    _userSeekCompleted(scheduledStartTime) {
        this.emit(`seekComplete`, scheduledStartTime);
        this._maybeFadeIn(this._player.getSeekFadeTime(), scheduledStartTime);
    }

    _firstBufferFromDifferentTrackLoaded(scheduledStartTime) {
        this.emit(`replacementLoaded`, scheduledStartTime);
    }

    getCurrentTimeScheduledAhead() {
        return this._player.getScheduleAheadTime() + this._player.getCurrentTime();
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
        for (let i = 0; i < this._bufferQueue.length; ++i) {
            try {
                const sourceDescriptor = this._bufferQueue[i];
                let {duration} = sourceDescriptor;
                if (sourceDescriptor.playedSoFar > 0) {
                    duration = sourceDescriptor.getRemainingDuration() - this._player.getScheduleAheadTime();
                    if (duration < 0) {
                        continue;
                    }
                }
                this._normalizerNode.gain.setValueAtTime(sourceDescriptor.gain, when);
                when += duration;
            } catch (e) {
                self.uiLog(e.stack);
            }
        }
    }

    _emitTimeUpdate(currentTime, duration, willEmitEnded = false) {
        this.emit(`timeUpdate`, currentTime, duration, willEmitEnded, this._endedEmitted);
    }

    _bufferFilled({descriptor, isLastBuffer, bufferFillType}, transferList) {
        try {
            if (!descriptor || this._destroyed) {
                return;
            }

            let currentSourcesShouldBeStopped = false;
            let scheduledStartTime = 0;
            const afterScheduleKnownCallbacks = [];

            if (bufferFillType === BUFFER_FILL_TYPE_SEEK) {
                const {requestId, baseTime, isUserSeek} = descriptor.fillTypeData;

                if (requestId !== this._seekRequestId) {
                    return;
                }
                currentSourcesShouldBeStopped = true;
                this._applySeek(baseTime);
                afterScheduleKnownCallbacks.push(isUserSeek
                        ? this._userSeekCompleted
                        : this._firstBufferFromDifferentTrackLoaded);
                if (isUserSeek) {
                    scheduledStartTime = this._fadeOutEnded;
                }
            } else if (bufferFillType === BUFFER_FILL_TYPE_REPLACEMENT) {
                const {metadata, gaplessPreload, requestId, baseTime} = descriptor.fillTypeData;

                if (requestId !== this._replacementRequestId) {
                    return;
                }
                this._loadingNext = false;

                if (gaplessPreload) {
                    afterScheduleKnownCallbacks.push(() => {
                        this._gaplessPreloadArgs = {scheduledStartTime, metadata, baseTime};
                    });
                } else {
                    currentSourcesShouldBeStopped = true;
                    this._applyReplacementLoaded({metadata, baseTime});
                    afterScheduleKnownCallbacks.push(this._firstBufferFromDifferentTrackLoaded);
                }
            }

            this._player.playbackStarted();
            this._player.resume();
            const channelCount = this._player._outputChannelCount;
            const audioBuffer = this._player._allocAudioBuffer();
            const channelData = new Array(channelCount);

            for (let ch = 0; ch < channelCount; ++ch) {
                const data = new Float32Array(transferList.shift(), 0, descriptor.length);
                audioBuffer.copyToChannel(data, ch);
                channelData[ch] = data;
            }

            const sourceDescriptor = new SourceDescriptor(this, audioBuffer, descriptor, channelData, isLastBuffer);

            if (sourceDescriptor.isLastForTrack &&
                sourceDescriptor.endTime < this._duration - this._player.getBufferDuration()) {
                this._duration = sourceDescriptor.endTime;
                this._emitTimeUpdate(this._currentTime, this._duration);
                this.emit(`durationChange`, this._duration);
            }

            if (this._baseGain === 1 && !isNaN(descriptor.loudness)) {
                this._baseGain = decibelToGain(descriptor.loudness);
                if (!currentSourcesShouldBeStopped && !this._sourceStopped) {
                    this._rescheduleLoudness();
                }
            }

            const now = performance.now();
            if (currentSourcesShouldBeStopped) {
                scheduledStartTime = Math.max(scheduledStartTime, this.getCurrentTimeScheduledAhead());
                if (!this._sourceStopped) {
                    this._stopSources(scheduledStartTime, true);
                }

                this._playedBufferQueue.push(...this._bufferQueue);
                this._bufferQueue.length = 0;
                this._bufferQueue.push(sourceDescriptor);

                if (this._sourceStopped) {
                    this._startSources(scheduledStartTime);
                } else {
                    this._startSource(sourceDescriptor, scheduledStartTime);
                }
            } else if (this._sourceStopped) {
                this._bufferQueue.push(sourceDescriptor);
                scheduledStartTime = Math.max(scheduledStartTime, this.getCurrentTimeScheduledAhead());
                if (!this._paused) {
                    this._startSources(scheduledStartTime);
                }
            } else {
                scheduledStartTime = Math.max(scheduledStartTime, this._lastSourceEnds());
                this._bufferQueue.push(sourceDescriptor);
                this._startSource(sourceDescriptor, scheduledStartTime);
            }

            for (let i = 0; i < afterScheduleKnownCallbacks.length; ++i) {
                afterScheduleKnownCallbacks[i].call(this, scheduledStartTime);
            }

            this._player.recordSchedulingTime(performance.now() - now);

            if (isLastBuffer && !this._lastBufferLoadedEmitted) {
                this._lastBufferLoadedEmitted = true;
                this.emit(`lastBufferQueued`);
            }
        } finally {
            this._freeTransferList(transferList);
        }
    }

    _printQueue() {
        const s = this._player._outputSampleRate;
        for (let i = 0; i < this._bufferQueue.length; ++i) {
            const b = this._bufferQueue[i];
            self.uiLog(`${i} (${b.startTime} -> ${b.endTime}): started ${b.started} (${b.started * s}) stopped ${b.stopped} (${b.stopped * s})`);
        }
    }

    receiveMessage(event) {
        const {nodeId, methodName, args, transferList} = event.data;
        if (this._destroyed) return;
        if (nodeId === this._id) {
            this[methodName](args, transferList);
        }
    }

    muteRequested() {
        if (this._maybeFadeOut(this._player.getMuteUnmuteFadeTime())) {
            return this._fadeOutEnded;
        } else {
            return this._player.getCurrentTime();
        }
    }

    unmuteRequested() {
        const scheduledStartTime = Math.max(this._fadeOutEnded, this.getCurrentTimeScheduledAhead());
        if (this._maybeFadeIn(this._player.getMuteUnmuteFadeTime(), scheduledStartTime)) {
            return this._fadeInStarted;
        } else {
            return scheduledStartTime;
        }
    }

    pause() {
        if (this._destroyed || this._paused) return;
        if (this._maybeFadeOut(this._player.getPauseResumeFadeTime())) {
            this._stopSources(this._fadeOutEnded);
        } else {
            this._stopSources();
        }
        this._paused = true;
    }

    play() {
        if (this._destroyed || !this._paused) return;
        if (this._duration > 0 &&
            this._currentTime > 0 &&
            this._currentTime >= this._duration) {
            return;
        }
        this._paused = false;
        if (this._bufferQueue.length > 0 && this._sourceStopped && this._haveBlob) {
            this._player.playbackStarted();
            this._player.resume();
            const scheduledStartTime = Math.max(this.getCurrentTimeScheduledAhead(), this._fadeOutEnded);
            this._startSources(scheduledStartTime);
            this._maybeFadeIn(this._player.getSeekFadeTime(), scheduledStartTime);
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

    _freeTransferList(transferList) {
        this._player._freeTransferList(null, transferList);
    }

    _seek(time, isUserSeek) {
        if (!this.isSeekable()) return;
        const requestId = ++this._seekRequestId;
        this._player._message(this._id, `seek`, {
            requestId,
            count: SUSTAINED_BUFFER_COUNT,
            time,
            isUserSeek
        }, this._getBuffersForTransferList(SUSTAINED_BUFFER_COUNT));
        if (!this._currentSeekEmitted && isUserSeek) {
            this._currentSeekEmitted = true;
            this.emit(`seeking`, this._currentTime);
        }
    }

    _resetAudioBuffers() {
        this._fadeOutEnded = 0;
        this._fadeInStarted = 0;
        this._fadeInStartedWithLength = 0;
        if (this.isSeekable() && this._haveBlob) {
            this.setCurrentTime(this._currentTime, true);
        } else {
            this.destroy();
        }
    }

    _maybeFadeOut(time, ctxTime = this._player.getCurrentTime()) {
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
            param.setValueCurveAtTime(curve, ctxTime, time);
            this._fadeOutEnded = ctxTime + time;
            return true;
        }
        return false;
    }

    _maybeFadeIn(time, ctxTime = this._player.getCurrentTime()) {
        if (time > 0) {
            const curve = getFadeInCurve();
            this._fadeInOutNode.gain.setValueCurveAtTime(curve, ctxTime, time);
            this._fadeInStarted = ctxTime;
            this._fadeInStartedWithLength = time;
            return true;
        }
        return false;
    }

    setCurrentTime(time, noThrottle) {
        if (!this.isSeekable()) {
            return;
        }

        time = +time;
        if (!isFinite(time)) {
            throw new Error(`time is not finite`);
        }
        time = Math.max(0, time);
        if (this._haveBlob) {
            time = Math.min(this._player.getMaximumSeekTime(this._duration), time);
        }

        this._currentTime = time;
        this._baseTime = this._currentTime - this._getCurrentAudioBufferBaseTimeDelta();
        this._timeUpdate();

        if (!this._haveBlob || !this.isSeekable()) {
            return;
        }

        this._nullifyPendingRequests();

        if (noThrottle === NO_THROTTLE) {
            this._seek(this._currentTime, false);
        } else {
            this._maybeFadeOut(this._player.getSeekFadeTime());
            const now = performance.now();
            if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
                this._seek(this._currentTime, true);
            } else {
                this._throttledSeek(this._currentTime);
            }
            this._lastExpensiveCall = now;
        }
    }

    unload() {
        if (this._destroyed) return;
        this._gaplessPreloadArgs = null;
        this._nullifyPendingRequests();
        this._currentTime = this._duration = this._baseTime = 0;
        this._haveBlob = false;
        this._seeking = false;
        this._initialPlaythroughEmitted = false;
        this._currentSeekEmitted = false;
        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;
        this._stopSources();

        let sourceDescriptor;
        while (sourceDescriptor = this._bufferQueue.shift()) {
            this._destroySourceDescriptor(sourceDescriptor);
        }

        while (sourceDescriptor = this._playedBufferQueue.shift()) {
            this._destroySourceDescriptor(sourceDescriptor);
        }
    }

    isSeekable() {
        return !(this._destroyed || this._lastBufferLoadedEmitted) && !this._loadingNext;
    }

    _error(args, transferList) {
        if (this._destroyed) {
            this._freeTransferList(transferList);
            return;
        }
        this._freeTransferList(transferList);
        const e = new Error(args.message);
        e.name = args.name;
        e.stack = args.stack;
        if (this._player.env.isDevelopment()) {
            console.error(e.stack);
        }
        this.unload();
        this.emit(`error`, e);
    }

    _blobLoaded(args) {
        if (this._destroyed) return;
        if (this._replacementRequestId !== args.requestId) return;
        const {metadata} = args;
        this._loadingNext = false;
        this._haveBlob = true;
        this._duration = metadata.duration;
        this._baseGain = typeof metadata.establishedGain === `number` ? metadata.establishedGain : 1;
        this._currentTime = Math.min(this._player.getMaximumSeekTime(this._duration), Math.max(0, this._currentTime));
        this._seek(this._currentTime, false);
        this._emitTimeUpdate(this._currentTime, this._duration);
        this.emit(`canPlay`);
    }

    hasGaplessPreload() {
        return this._gaplessPreloadArgs !== null;
    }

    replaceUsingGaplessPreload() {
        if (this._destroyed) return -1;
        if (!this.hasGaplessPreload()) throw new Error(`no gapless preload`);
        const args = this._gaplessPreloadArgs;
        this._gaplessPreloadArgs = null;
        this._applyReplacementLoaded(args);
        return args.scheduledStartTime;
    }

    _applySeek(baseTime) {
        if (this._destroyed) return;
        this._baseTime = baseTime;
        this._currentSeekEmitted = false;
        this._lastBufferLoadedEmitted = false;
        this._endedEmitted = false;
        this._timeUpdate();
    }

    _applyReplacementLoaded({metadata, baseTime}) {
        if (this._destroyed) return;
        this._duration = metadata.duration;
        this._baseGain = typeof metadata.establishedGain === `number` ? metadata.establishedGain : 1;
        this._applySeek(baseTime);
    }

    _actualReplace(blob, seekTime, gaplessPreload, metadata) {
        if (this._destroyed) return;
        if (!this._haveBlob) {
            this.load(blob, seekTime, metadata);
            return;
        }

        this._gaplessPreloadArgs = null;
        this._endedEmitted = false;

        if (seekTime === undefined) {
            seekTime = 0;
        }
        const requestId = ++this._replacementRequestId;
        this._player._message(this._id, `loadReplacement`, {
            blob,
            requestId,
            seekTime,
            count: SUSTAINED_BUFFER_COUNT,
            gaplessPreload: !!gaplessPreload,
            metadata
        }, this._getBuffersForTransferList(SUSTAINED_BUFFER_COUNT));
    }

    replace(blob, seekTime, gaplessPreload, metadata) {
        if (this._destroyed) return;
        if (seekTime === undefined) seekTime = 0;
        this._loadingNext = true;
        const now = performance.now();
        if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
            this._actualReplace(blob, seekTime, gaplessPreload, metadata);
        } else {
            this._replaceThrottled(blob, seekTime, gaplessPreload, metadata);
        }
        this._lastExpensiveCall = now;
    }

    _actualLoad(blob, seekTime, metadata) {
        if (this._destroyed) return;
        if (seekTime === undefined) {
            seekTime = 0;
        }

        this.unload();
        this._currentTime = this._baseTime = seekTime;
        const fillRequestId = ++this._replacementRequestId;
        this._player._message(this._id, `loadBlob`, {
            blob,
            requestId: fillRequestId,
            metadata
        });
    }

    load(blob, seekTime, metadata) {
        if (this._destroyed) return;
        if (seekTime === undefined) seekTime = 0;
        if (!(blob instanceof Blob) && !(blob instanceof File)) {
            throw new Error(`blob must be a blob`);
        }
        this._nullifyPendingRequests();
        const now = performance.now();
        this._loadingNext = true;
        if (now - this._lastExpensiveCall > EXPENSIVE_CALL_THROTTLE_TIME) {
            this._actualLoad(blob, seekTime, metadata);
        } else {
            this._loadThrottled(blob, seekTime, metadata);
        }
        this._lastExpensiveCall = now;
    }

    _throttledSeek(time) {
        this._seek(time, true);
    }

    _replaceThrottled(blob, seekTime, gaplessPreload, metadata) {
        this._actualReplace(blob, seekTime, gaplessPreload, metadata);
    }

    _loadThrottled(blob, seekTime, metadata) {
        this._actualLoad(blob, seekTime, metadata);
    }

}

AudioPlayerSourceNode.prototype._throttledSeek = throttle(AudioPlayerSourceNode.prototype._throttledSeek,
        EXPENSIVE_CALL_THROTTLE_TIME);
AudioPlayerSourceNode.prototype._loadThrottled = throttle(AudioPlayerSourceNode.prototype._loadThrottled,
        EXPENSIVE_CALL_THROTTLE_TIME);
AudioPlayerSourceNode.prototype._replaceThrottled = throttle(AudioPlayerSourceNode.prototype._replaceThrottled,
        EXPENSIVE_CALL_THROTTLE_TIME);

