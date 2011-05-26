var ReplayGainProcessor = (function() {"use strict";

// Chrome likes to hold on to malloced arrays even when the tab will crash from running out of memory
// so just use the same preallocated array for everything.
// There is one trick that will release all malloced memory from typed arrays: opening developer tools or
// reopening it if it was already open.
var PREALLOCATION_SIZE = 882000; //4410000;
var OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

function ReplayGainTrackProcessor(replayGainProcessor, audioBuffer) {
    this.replayGainProcessor = replayGainProcessor;
    this.audioBuffer = audioBuffer;
    this.worker = replayGainProcessor._worker;

    this._buffers = replayGainProcessor._buffers;
    this._onTransferList = $.proxy(this._onTransferList, this);
    // The worker will transfer back the pre allocated arrays once it's done
    // with the current chunk.
    this.worker.on("transferList", this._onTransferList);
}

ReplayGainTrackProcessor.prototype._onTransferList = function(transferList) {
    for (var i = 0; i < transferList.length; ++i) {
        this.replayGainProcessor._buffers[i] = this._buffers[i] = new Float32Array(transferList[i]);
    }
};

ReplayGainTrackProcessor.prototype.start = function(track) {
    var self = this;
    var channels = Math.min(5, self.audioBuffer.numberOfChannels);
    var sampleRate = self.audioBuffer.sampleRate;
    var length = self.audioBuffer.length;
    var index = 0;

    return self.worker.invokeInWorkerThread("initializeReplayGainCalculation", [{
        channels: self.audioBuffer.numberOfChannels,
        sampleRate: self.audioBuffer.sampleRate
    }]).then(function loop() {
        var frameCount = Math.min(length - index, PREALLOCATION_SIZE);
        var buffers = self._buffers;

        for (var i = 0; i < channels; ++i) {
            var buffer = buffers[i];
            self.audioBuffer.copyFromChannel(buffer, i, index);
        }
        index += frameCount;
        return self.worker.invokeInWorkerThread("addFrames", [{
            length: frameCount
        }], buffers.map(function(v) {
            return v.buffer;
        })).then(function() {
            if (index < length) {
                return loop();
            } else {
                var album = track.getTagData().getAlbum();
                return self.worker.invokeInWorkerThread("getReplayGain", [{album: album}]);
            }
        });
    }).tap(function(response) {
        response.duration = self.audioBuffer.duration;
    }).catch(function(e) {
        return self.worker.invokeInWorkerThread("cancelReplayGainCalculation").thenThrow(e);
    }).finally(function() {
        self.worker.removeListener("transferList", self._onTransferList);
        self.audioBuffer = self.replayGainProcessor = self.worker = self._buffers = null;
    });
};

function ReplayGainProcessor(workerPool) {
    this._worker = workerPool.reserveWorker();
    this._buffers = [
        new Float32Array(PREALLOCATION_SIZE),
        new Float32Array(PREALLOCATION_SIZE),
        new Float32Array(PREALLOCATION_SIZE),
        new Float32Array(PREALLOCATION_SIZE),
        new Float32Array(PREALLOCATION_SIZE)
    ];
}

ReplayGainProcessor.prototype._createDecoder = function(channels, sampleRate) {
    return new OfflineAudioContext(channels, 1024, sampleRate);
};

ReplayGainProcessor.prototype.getReplayGainForTrack = function(track) {
    var url;
    var self = this;
    var audioBuffer = null;
    return this._worker.invokeInMainThread(function(release) {
        return new Promise(function(resolve, reject) {
            if (track.isDetachedFromPlaylist()) {
                return reject(new TrackWasRemovedError());
            }
            url = URL.createObjectURL(track.file);
            var request = new XMLHttpRequest();

            request.open('GET', url, true);
            request.responseType = 'arraybuffer';
            request.onload = function() {
                var basicInfo = track.getBasicInfo();
                self._createDecoder(basicInfo.channels,
                                    basicInfo.sampleRate).decodeAudioData(request.response, function(_audioBuffer) {
                    audioBuffer = _audioBuffer;
                    resolve();
                }, function() {
                    reject(new AudioError(MediaError.MEDIA_ERR_DECODE));
                });
                request = null;
            };

            request.onerror = function(e) {
                request = null;
                reject(new Error("invalid audio file"));
            };
            request.send();
        }).then(function() {
            var replayGainTrackProcessor = new ReplayGainTrackProcessor(self, audioBuffer);
            audioBuffer = null;
            return replayGainTrackProcessor.start(track).finally(function() {
                if (url) {
                    URL.revokeObjectURL(url);
                    url = null;
                }
            });
        })
    });
}

return ReplayGainProcessor; })();
