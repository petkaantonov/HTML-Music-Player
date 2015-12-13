var TrackAnalyzer = (function() {"use strict";

const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

Promise.promisifyAll(OfflineAudioContext.prototype, {
    promisifier: function DOMPromisifier(originalMethod) {
        // return a function
        return function promisified() {
            var args = [].slice.call(arguments);
            // Needed so that the original method can be called with the correct receiver
            var self = this;
            // which returns a promise
            return new Promise(function(resolve, reject) {
                args.push(resolve, reject);
                originalMethod.apply(self, args);
            });
        };
    }
});

function TrackAnalyzer(loudnessCalculator, fingerprintCalculator, playlist) {
    this.loudnessCalculator = loudnessCalculator;
    this.fingerprintCalculator = fingerprintCalculator;
    this._queue = [];
    this._longQueue = [];
    this._currentlyAnalysing = false;
    this._playlist = playlist;

    this._playlist.on("nextTrackChange", this.nextTrackChanged.bind(this));
    this.trackDestroyed = this.trackDestroyed.bind(this);
}

TrackAnalyzer.prototype.trackDestroyed = function(track) {
    for (var i = 0; i < this._queue.length; ++i) {
        var spec = this._queue[i];
        if (spec.track === track) {
            this._queue.splice(i, 1);
            break;
        }
    }
};

TrackAnalyzer.prototype._next = function() {
    var q = this._queue;

    while (this._queue.length) {
        var spec = this._queue.shift();
        spec.track.removeListener("destroy", this.trackDestroyed);
        if (spec.track.isDetachedFromPlaylist()) {
            spec.reject(new TrackWasRemovedError());
        } else {
            this._currentlyAnalysing = false;
            return spec.resolve(this.analyzeTrack(spec.track, spec.opts));
        }
    }
    this._currentlyAnalysing = false;
};

TrackAnalyzer.prototype._createDecoder = function(channels, sampleRate) {
    return new OfflineAudioContext(channels, 1024, sampleRate);
};

TrackAnalyzer.prototype.nextTrackChanged = function(track) {
    this.prioritize(track);
};

TrackAnalyzer.prototype.prioritize = function(track) {
    if (track instanceof Track && track.isBeingAnalyzed() && this._queue.length) {
        var q = this._queue;
        for (var i = 0; i < q.length; ++i) {
            var spec = q[i];

            if (spec.track === track) {
                for (var j = i; j >= 1; --j) {
                    q[j] = q[j - 1];
                }
                q[0] = spec;
                break;
            }
        }
    }
};

TrackAnalyzer.prototype.analyzeTrack = function(track, opts) {
    var self = this;
    if (this._currentlyAnalysing) {
        track.once("destroy", this.trackDestroyed);
        return new Promise(function(resolve, reject) {
            self._queue.push({
                track: track,
                opts: opts,
                resolve: resolve,
                reject: reject
            });
        });
    }

    var audioBuffer = null;
    this._currentlyAnalysing = true;

    return util.readAsArrayBuffer(track.file).then(function(result) {
        if (track.isDetachedFromPlaylist()) {
            throw new TrackWasRemovedError();
        }

        var basicInfo = track.getBasicInfo();
        var decoder = self._createDecoder(basicInfo.channels, basicInfo.sampleRate);

        return decoder.decodeAudioDataAsync(result).catch(function(e) {
            throw new AudioError(MediaError.MEDIA_ERR_DECODE)
        });
    }).then(function(audioBuffer) {
        if (track.isDetachedFromPlaylist()) {
            throw new TrackWasRemovedError();
        }

        var fingerprint = Promise.resolve(null);
        var loudness = Promise.resolve(null);

        if (opts.fingerprint) {
            fingerprint = self.fingerprintCalculator.calculateFingerprintForTrack(track, audioBuffer);
        }

        if (opts.loudness) {
            loudness = self.loudnessCalculator.calculateLoudnessForTrack(track, audioBuffer);
        }

        return Promise.props({
            loudness: loudness,
            fingerprint: fingerprint
        });
    }).finally(function() {
        self._next();
        return null;
    });
}

return TrackAnalyzer; })();
