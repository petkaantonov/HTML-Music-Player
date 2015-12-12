const LoudnessCalculator = (function() {"use strict";

// Chrome likes to hold on to malloced arrays even when the tab will crash from running out of memory
// so just use the same preallocated array for everything.
// There is one trick that will release all malloced memory from typed arrays: opening developer tools or
// reopening it if it was already open.
const PREALLOCATION_SIZE = 882000; //4410000;

function LoudnessCalculator(pool) {
    this._worker = pool.reserveWorker();
    this._buffers = new Array(5);
    this._buffers.length = 0;
    this._onTransferList = this._onTransferList.bind(this);
    this._worker.on("transferList", this._onTransferList);
}

LoudnessCalculator.prototype._getBuffer = function(index) {
    var value = this._buffers[index];
    if (!value) {
        value = this._buffers[index] = new Float32Array(PREALLOCATION_SIZE);
    }
    return value;
};

LoudnessCalculator.prototype._onTransferList = function(transferList) {
    for (var i = 0; i < transferList.length; ++i) {
        this._buffers[i] = new Float32Array(transferList[i]);
    }
};

LoudnessCalculator.prototype.calculateLoudnessForTrack = function(track, audioBuffer) {
    var self = this;
    var channels = Math.min(5, audioBuffer.numberOfChannels);
    var sampleRate = audioBuffer.sampleRate;
    var length = audioBuffer.length;
    var index = 0;

    return self._worker.invokeInWorkerThread("initializeEbur128Calculation", [{
        channels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate
    }]).then(function loop() {
        var frameCount = Math.min(length - index, PREALLOCATION_SIZE);

        for (var i = 0; i < channels; ++i) {
            var buffer = self._getBuffer(i);
            audioBuffer.copyFromChannel(buffer, i, index);
        }
        index += frameCount;
        return self._worker.invokeInWorkerThread("addFrames", [{
            length: frameCount
        }], self._buffers.map(function(v) {
            return v.buffer;
        })).then(function() {
            if (index < length) {
                return loop();
            } else {
                var album = track.getTagData().getAlbum();
                return self._worker.invokeInWorkerThread("getEbur128", [{album: album}]);
            }
        });
    }).tap(function(response) {
        response.duration = audioBuffer.duration;
    }).catch(function(e) {
        return self._worker.invokeInWorkerThread("cancelEbur128Calculation").thenThrow(e);
    }).finally(function() {
        audioBuffer = null;
    });
};

return LoudnessCalculator; })();
