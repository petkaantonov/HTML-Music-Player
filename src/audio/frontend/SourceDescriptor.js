export const decibelToGain = function(loudness) {
    return Math.pow(10, (loudness / 20));
};

export default class SourceDescriptor {
    constructor(sourceNode, buffer, descriptor, channelData, isLastForTrack) {
        this._sourceNode = sourceNode;
        this.buffer = buffer;
        this.playedSoFar = 0;
        this.startTime = descriptor.startTime;
        this.endTime = descriptor.endTime;
        this.length = descriptor.length;
        this.duration = descriptor.length / buffer.sampleRate;
        this._gain = isNaN(descriptor.loudness) ? NaN : decibelToGain(descriptor.loudness);
        this.started = -1;
        this.stopped = -1;
        this.source = null;
        this.channelData = channelData;
        this.isLastForTrack = isLastForTrack;
    }

    get gain() {
        return isNaN(this._gain) ? this._sourceNode._baseGain : this._gain;
    }

    getRemainingDuration() {
        return this.duration - this.playedSoFar;
    }
}
