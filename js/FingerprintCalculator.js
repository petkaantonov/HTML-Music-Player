const FingerprintCalculator = (function() {"use strict";

const DURATION = 120;
const SAMPLE_RATE = 11025;
const MIN_DURATION = 7;
const MIN_FRAMES = MIN_DURATION * SAMPLE_RATE;
const FRAMES = SAMPLE_RATE * DURATION;
const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;


function FingerprintCalculator(pool) {
    this._worker = pool.reserveWorker();
    this._onTransferList = this._onTransferList.bind(this);
    this._worker.on("transferList", this._onTransferList);
    this._buffer = null;
}

FingerprintCalculator.prototype._onTransferList = function(transferList) {
    this._buffer = new Float32Array(transferList[0]);
};

FingerprintCalculator.prototype.calculateFingerprintForTrack = function(track, audioBuffer) {
    if (!this._buffer) this._buffer = new Float32Array(FRAMES);
    var self = this;
    return new Promise(function(resolve, reject) {
        var duration = Math.min(audioBuffer.duration, DURATION);

        if (duration < MIN_DURATION) {
            return resolve({fingerprint: null});
        }

        var frames = duration * SAMPLE_RATE;
        var resampler = new OfflineAudioContext(1, frames, SAMPLE_RATE);
        var source = resampler.createBufferSource();
        source.buffer = audioBuffer;
        audioBuffer = null;
        source.connect(resampler.destination);
        source.start(0);
        resampler.oncomplete = function(event) {
            var resampledBuffer = event.renderedBuffer;
            var frames = resampledBuffer.length;
            resampledBuffer.copyFromChannel(self._buffer, 0);
            var result = self._worker.invokeInWorkerThread("getAcoustId", [{
                length: frames
            }], [self._buffer.buffer]);
            resolve(result);
        };
        resampler.onerror = function() {
            reject(new AudioError());
        };
        resampler.startRendering();

    }).catch(function(e) {
        // TODO: LOg
        return {fingerprint: undefined};
    });
};

return FingerprintCalculator; })();
