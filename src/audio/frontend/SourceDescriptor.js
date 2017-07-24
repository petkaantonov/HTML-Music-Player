export const decibelToGain = function(loudness) {
    return Math.pow(10, (loudness / 20));
};

export default class SourceDescriptor {
    constructor(sourceNode, buffer, descriptor, isLastForTrack) {
        this._sourceNode = sourceNode;
        this.buffer = buffer;
        this.playedSoFar = 0;
        this.startTime = descriptor.startTime;
        this.endTime = descriptor.endTime;
        this.length = descriptor.length;
        this.sampleRate = descriptor.sampleRate;
        this.channelCount = descriptor.channelCount;
        this.duration = this.length / this.sampleRate;
        const {loudnessInfo} = descriptor;
        this._gain = isNaN(loudnessInfo.loudness) ? NaN : decibelToGain(loudnessInfo.loudness);
        this.started = -1;
        this.stopped = -1;
        this.source = null;
        this.isLastForTrack = isLastForTrack;
    }

    get audioBuffer() {
        return this.buffer;
    }

    get gain() {
        return !isFinite(this._gain) ? this._sourceNode.baseGain : this._gain;
    }

    getRemainingDuration() {
        return this.duration - this.playedSoFar;
    }

    print() {
        self.uiLog(`.buffer=${this.buffer}
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

    destroy(stopTime = -1) {
        if (this.buffer === null) return;
        this._sourceNode = null;
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
        this.buffer = null;
    }
}
