import { BufferDescriptor } from "shared/src/audio";

import AudioPlayerFrontend from "./AudioPlayerFrontend";

export interface AudioBufferSourceNodeExt extends AudioBufferSourceNode {
    descriptor?: SourceDescriptor | null;
}

export default class SourceDescriptor {
    _audioManager: AudioPlayerFrontend | null;
    _descriptor: BufferDescriptor;
    _audioBuffer: any;
    started: number;
    stopped: number;
    playedSoFar: number;
    source: AudioBufferSourceNodeExt | null;
    _backgrounded: boolean;
    _gain: any;
    constructor(
        audioManager: AudioPlayerFrontend,
        channelDataAsArrayBuffers: ArrayBuffer[],
        descriptor: BufferDescriptor
    ) {
        this._audioManager = audioManager;
        this._descriptor = descriptor;
        this._audioBuffer = this._createAudioBuffer(channelDataAsArrayBuffers);

        this.started = -1;
        this.stopped = -1;
        this.playedSoFar = 0;
        this.source = null;
        this._backgrounded = false;
    }

    _createAudioBuffer(channelDataAsArrayBuffers: ArrayBuffer[]) {
        const { channelCount, sampleRate, length } = this._descriptor;
        const audioBuffer = this._audioManager!.createAudioBuffer(channelCount, length, sampleRate);

        for (let ch = 0; ch < channelCount; ++ch) {
            const data = new Float32Array(channelDataAsArrayBuffers[ch]!, 0, length);
            audioBuffer.copyToChannel(data, ch);
        }

        return audioBuffer;
    }

    get isLastForTrack() {
        return this._descriptor.isLastBuffer;
    }

    get startTime() {
        return this._descriptor.startTime;
    }

    get endTime() {
        return this._descriptor.endTime;
    }

    get length() {
        return this._descriptor.length;
    }

    get sampleRate() {
        return this._descriptor.sampleRate;
    }

    get channelCount() {
        return this._descriptor.channelCount;
    }

    get duration() {
        return this.length / this.sampleRate;
    }

    get audioBuffer() {
        return this._audioBuffer;
    }

    readjustTime(timeDiff: number, lowestOriginalTime: number) {
        if (this.started !== -1 && this.stopped !== -1) {
            if (this.started + timeDiff < 0) {
                this.started -= lowestOriginalTime;
            } else {
                this.started += timeDiff;
            }
            this.started = Math.max(0, this.started);
            this.started = Math.round(this.started * 1e9) / 1e9;
            this.stopped = this.started + this.getRemainingDuration();
        }
    }

    getRemainingDuration() {
        return this.duration - this.playedSoFar;
    }

    print() {
        uiLog(`.audioBuffer=${this.audioBuffer}
                    .playedSoFar=${this.playedSoFar}
                    .startTime=${this.startTime}
                    .endTime=${this.endTime}
                    .length=${this.length}
                    .sampleRate=${this.sampleRate}
                    .channelCount=${this.channelCount}
                    .duration=${this.duration}
                    ._gain=${this._gain}
                    .started=${this.started}
                    .stopped=${this.stopped}
                    .source=${this.source}
                    .isLastForTrack=${this.isLastForTrack}`);
    }

    isDestroyed() {
        return this._audioBuffer === null;
    }

    setBackground() {
        this._backgrounded = true;
    }

    isInBackground() {
        return this._backgrounded;
    }

    destroy(stopTime: number = -1) {
        if (this.isDestroyed()) return;
        this._audioManager!.freeAudioBuffer(this._audioBuffer);
        this._audioBuffer = null;
        this._audioManager = null;
        const src = this.source;
        if (src !== null) {
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
            this.source = null;
        }
    }
}
