"use strict";
import Promise from "lib/bluebird";

import { documentHidden, throttle } from "lib/util";
import TrackWasRemovedError from "TrackWasRemovedError";
import Track from "Track";
import AudioError from "audio/AudioError";
import TagData from "TagData";

const TRACK_ANALYZER_WORKER_SRC = window.DEBUGGING
    ? "dist/worker/TrackAnalyzerWorker.js" : "dist/worker/TrackAnalyzerWorker.min.js";

var instances = false;
function TrackAnalyzer(playlist) {
    if (instances) throw new Error("only 1 TrackAnalyzer instance can be made");
    instances = true;
    this._worker = new Worker(TRACK_ANALYZER_WORKER_SRC);
    this._analyzerJobs = [];
    this._acoustIdJobs = [];
    this._nextJobId = 0;
    this._analysisQueue = [];
    this._acoustIdQueue = [];
    this._currentlyAnalysing = false;
    this._currentlyFetchingAcoustId = false;
    this._playlist = playlist;
    this._metadataParsingTracks = {};
    this._analysisFetchingTracks = {};
    this._acoustIdImageFetchingTracks = {};

    this._worker.addEventListener("message", this._messaged.bind(this), false);
    this._playlist.on("nextTrackChange", this.nextTrackChanged.bind(this));
    this._playlist.on("trackChange", this.currentTrackChanged.bind(this));
    this._playlist.on("unparsedTracksAvailable", this.unparsedTracksAvailable.bind(this));
    this.trackRemovedWhileInQueue = this.trackRemovedWhileInQueue.bind(this);
    this.abortJobForTrack = this.abortJobForTrack.bind(this);

    var self = this;
    this.ready = new Promise(function(resolve) {
        var ready = function(event) {
            self._worker.removeEventListener("message", ready, false);
            resolve();
        };
        self._worker.addEventListener("message", ready, false);
    }).then(function() {
        self.ready = null;
    });

    documentHidden.on("foreground", this._foregrounded.bind(this));
}

TrackAnalyzer.prototype._foregrounded = function() {
    this._worker.postMessage({action: "tick"});
};

TrackAnalyzer.prototype.unparsedTracksAvailable = function() {
    var tracks = this._playlist.getUnparsedTracks();
    for (var i = 0; i < tracks.length; ++i) {
        var track = tracks[i];

        if (!track.isDetachedFromPlaylist() && !track.hasError()) {
            if (track.tagData) {
                this.fetchAnalysisData(track);
            } else {
                this.parseMetadata(track);
            }
        }
    }
};

TrackAnalyzer.prototype.acoustIdImageFetched = function(track, image, error) {
    track.tagData.fetchAcoustIdImageEnded(image, error);
};

TrackAnalyzer.prototype.fetchAcoustIdImage = throttle(function(track) {
    if (track && !track.isDetachedFromPlaylist() &&
        track.tagData && track.shouldRetrieveAcoustIdImage()) {
        track.tagData.fetchAcoustIdImageStarted();
        var albumKey = track.tagData.albumNameKey();
        var acoustId = track.tagData.acoustId;
        var self = this;
        var id = ++self._nextJobId;
        self._acoustIdImageFetchingTracks[id] = {
            track: track,
            destroyHandler: function() {
                delete self._acoustIdImageFetchingTracks[id];
            }
        };

        track.once("destroy", self._acoustIdImageFetchingTracks[id].destroyHandler);
        self._worker.postMessage({
            action: "fetchAcoustIdImage",
            args: {
                id: id,
                uid: track.uid(),
                transientId: track.transientId(),
                albumKey: track.tagData.albumNameKey(),
                acoustId: acoustId
            }
        });
    }
}, 100);

TrackAnalyzer.prototype.fillInAcoustId = function(track, duration, fingerprint, _retries) {
    if (!_retries) _retries = 0;
    var self = this;
    return self.fetchTrackAcoustId(track, {
        duration: duration,
        fingerprint: fingerprint
    }).then(function(acoustId) {
        if (track.isDetachedFromPlaylist()) return;
        track.tagData.setAcoustId(acoustId);
        if (self._playlist.isTrackHighlyRelevant(track)) {
            self.fetchAcoustIdImage(track);
        }
    }).catch(function(e) {
        if (_retries <= 5) {
            Promise.delay(5000).then(function() {
                if (track.isDetachedFromPlaylist()) return;
                self.fillInAcoustId(track, duration, fingerprint, _retries + 1);
            });
        }
    });

    if (this._playlist.isTrackHighlyRelevant(track)) {
        this.prioritize(track);
    }
};

TrackAnalyzer.prototype.trackAnalysisDataFetched = function(track, result, error) {
    if (!track.isDetachedFromPlaylist() && !error) {
        var needFingerprint = true;
        var needLoudness = true;

        if (result) {
            needFingerprint = result.fingerprint === undefined;
            needLoudness = result.trackGain === undefined;
            track.tagData.setDataFromTagDatabase(result);

            if (!needFingerprint && this._playlist.isTrackHighlyRelevant(track)) {
                this.fetchAcoustIdImage(track);
            }
        }

        var acoustIdFilled = null;
        if (result && result.acoustId === undefined && result.fingerprint) {
            acoustIdFilled = this.fillInAcoustId(track, result.duration, result.fingerprint);
        }

        if (needFingerprint || needLoudness) {
            var opts = {
                fingerprint: needFingerprint,
                loudness: needLoudness
            };
            track.setAnalysisStatus(opts);
            var self = this;
            this.analyzeTrack(track, opts).then(function(analysis) {
                if (!result) {
                    track.tagData.setDataFromTagDatabase(analysis);
                    if (!acoustIdFilled) {
                        self.fillInAcoustId(track, analysis.duration, analysis.fingerprint);
                    }
                } else {
                    if (needFingerprint && !acoustIdFilled) {
                        self.fillInAcoustId(track, result.duration, analysis.fingerprint);
                    }

                    if (needLoudness) {
                        track.tagData.setLoudness(result.loudness);
                    }
                }
            }).lastly(function() {
                track.unsetAnalysisStatus();
            }).catch(function(e) {});
        }
    }
};

TrackAnalyzer.prototype.fetchAnalysisData = function(track) {
    if (track.tagData.hasBeenAnalyzed()) return;
    var self = this;
    var id = ++self._nextJobId;
    self._analysisFetchingTracks[id] = {
        track: track,
        destroyHandler: function() {
            delete self._analysisFetchingTracks[id];
        }
    };

    track.once("destroy", self._analysisFetchingTracks[id].destroyHandler);
    self._worker.postMessage({
        action: "fetchAnalysisData",
        args: {
            id: id,
            uid: track.uid(),
            transientId: track.transientId(),
            albumKey: track.tagData.albumNameKey()
        }
    });
};

TrackAnalyzer.prototype.trackMetadataParsed = function(track, data, error) {
    if (!track.isDetachedFromPlaylist() && !error) {
        track.setTagData(new TagData(track, data, this));
        this.fetchAnalysisData(track);
    }
};

const removeFromQueue = function(queue, track) {
    for (var i = 0; i < queue.length; ++i) {
        var spec = queue[i];
        if (spec.track === track) {
            queue.splice(i, 1);
            break;
        }
    }
};

TrackAnalyzer.prototype.trackRemovedWhileInQueue = function(track) {
    removeFromQueue(this._analysisQueue, track);
    removeFromQueue(this._acoustIdQueue, track);
};

TrackAnalyzer.prototype._next = function(queue, statusProp, method) {
    while (queue.length > 0) {
        var spec = queue.shift();
        spec.track.removeListener("destroy", this.trackRemovedWhileInQueue);
        if (spec.track.isDetachedFromPlaylist()) {
            spec.reject(new TrackWasRemovedError());
        } else {
            this[statusProp] = false;
            return spec.resolve(method.call(this, spec.track, spec.opts));
        }
    }
    this[statusProp] = false;
};

TrackAnalyzer.prototype.currentTrackChanged = function(track) {
    this.prioritize(track);
    this.fetchAcoustIdImage(track);
};

TrackAnalyzer.prototype.nextTrackChanged = function(track) {
    this.prioritize(track);
    this.fetchAcoustIdImage(track);
};

const prioritizeQueue = function(track, queue) {
    for (var i = 0; i < queue.length; ++i) {
        var spec = queue[i];

        if (spec.track === track) {
            for (var j = i; j >= 1; --j) {
                queue[j] = queue[j - 1];
            }
            queue[0] = spec;
            break;
        }
    }
};

TrackAnalyzer.prototype.prioritize = function(track) {
    if (track instanceof Track && track.tagData) {
        prioritizeQueue(track, this._analysisQueue);
        prioritizeQueue(track, this._acoustIdQueue);
    }
};

TrackAnalyzer.prototype._messaged = function(event) {
    if (!event.data) return;
    if (!event.data.jobType) return;
    var id = event.data.id;
    if (event.data.jobType === "metadata") {
        var info = this._metadataParsingTracks[id];
        if (info) {
            var track = info.track;
            track.removeListener("destroy", info.destroyHandler);
            delete this._metadataParsingTracks[id];
            var result = event.data.type === "error" ? null : event.data.result;
            this.trackMetadataParsed(track, result, event.data.error);
        }
    } else if (event.data.jobType === "analysisData") {
        var info = this._analysisFetchingTracks[id];
        if (info) {
            var track = info.track;
            track.removeListener("destroy", info.destroyHandler);
            delete this._analysisFetchingTracks[id];
            var result = event.data.type === "error" ? null : event.data.result;
            this.trackAnalysisDataFetched(track, result, event.data.error);
        }
    } else if (event.data.jobType === "acoustIdImage") {
        var info = this._acoustIdImageFetchingTracks[id];
        if (info) {
            var track = info.track;
            track.removeListener("destroy", info.destroyHandler);
            delete this._acoustIdImageFetchingTracks[id];
            var result = event.data.type === "error" ? null : event.data.result;
            this.acoustIdImageFetched(track, result, event.data.error);
        }
    } else if (event.data.jobType === "analyze") {
        for (var i = 0; i < this._analyzerJobs.length; ++i) {
            if (this._analyzerJobs[i].id === id) {
                var job = this._analyzerJobs[i];

                switch (event.data.type) {
                    case "estimate":
                        job.track.analysisEstimate(event.data.value);
                    break;

                    case "error":
                        this._analyzerJobs.splice(i, 1);
                        var e = new Error(event.data.error.message);
                        e.stack = event.data.error.stack;
                        job.reject(e);
                    break;

                    case "abort":
                        this._analyzerJobs.splice(i, 1);
                        job.reject(new TrackWasRemovedError());
                    break;

                    case "success":
                        job.resolve(event.data.result);
                        this._analyzerJobs.splice(i, 1);
                    break;
                }
                return;
            }
        }
    } else if (event.data.jobType === "acoustId") {
        for (var i = 0; i < this._acoustIdJobs.length; ++i) {
            if (this._acoustIdJobs[i].id === id) {
                var job = this._acoustIdJobs[i];

                switch (event.data.type) {
                    case "error":
                        this._acoustIdJobs.splice(i, 1);
                        var e = new Error(event.data.error.message);
                        e.stack = event.data.error.stack;
                        job.reject(e);
                    break;

                    case "success":
                        job.resolve(event.data.result);
                        this._acoustIdJobs.splice(i, 1);
                    break;
                }
                return;
            }
        }
    }
};

TrackAnalyzer.prototype.abortJobForTrack = function(track) {
    for (var i = 0; i < this._analyzerJobs.length; ++i) {
        if (this._analyzerJobs[i].track === track) {
            this._worker.postMessage({
                action: "abort",
                args: {
                    id: this._analyzerJobs[i].id
                }
            });
        }
    }
};

TrackAnalyzer.prototype.parseMetadata = function(track) {
    var self = this;

    if (this.ready && !this.ready.isResolved()) {
        this.ready = this.ready.then(function() {
            if (!track.isDetachedFromPlaylist()) {
                self.parseMetadata(track);
            }
        });
        return;
    }

    var id = ++self._nextJobId;
    self._metadataParsingTracks[id] = {
        track: track,
        destroyHandler: function() {
            delete self._metadataParsingTracks[id];
        }
    };
    track.once("destroy", self._metadataParsingTracks[id].destroyHandler);
    self._worker.postMessage({
        action: "parseMetadata",
        args: {
            id: id,
            file: track.getFile(),
            transientId: track.transientId()
        }
    });
};

TrackAnalyzer.prototype.fetchTrackAcoustId = function(track, opts) {
    var self = this;

    if (this._currentlyFetchingAcoustId) {
        track.once("destroy", this.trackRemovedWhileInQueue);
        return new Promise(function(resolve, reject) {
            self._acoustIdQueue.push({
                track: track,
                resolve: resolve,
                reject: reject,
                opts: opts
            });

            if (self._playlist.isTrackHighlyRelevant(track)) {
                self.prioritize(track);
            }
        });
    }

    this._currentlyFetchingAcoustId = true;
    var id = ++this._nextJobId;
    return new Promise(function(resolve, reject) {
        if (track.isDetachedFromPlaylist()) {
            throw new TrackWasRemovedError();
        }

        self._acoustIdJobs.push({
            id: id,
            track: track,
            resolve: resolve,
            reject: reject
        });

        self._worker.postMessage({
            action: "fetchAcoustId",
            args: {
                id: id,
                duration: opts.duration,
                fingerprint: opts.fingerprint,
                uid: track.uid(),
                transientId: track.transientId()
            }
        });
    }).finally(function() {
        Promise.delay(1000).then(function() {
            self._next(self._acoustIdQueue, "_currentlyFetchingAcoustId", self.fetchTrackAcoustId);
        });
        return null;
    });
};

TrackAnalyzer.prototype.rateTrack = function(track, rating) {
    if (!track.tagData) return;

    this._worker.postMessage({
        action: "rateTrack",
        args: {
            uid: track.uid(),
            transientId: track.transientId(),
            rating: rating,
            id: ++this._nextJobId
        }
    });
};

TrackAnalyzer.prototype.updateSearchIndex = function(track, metadata) {
    this._worker.postMessage({
        action: "updateSearchIndex",
        args: {
            uid: track.uid(),
            transientId: track.transientId(),
            metadata: metadata
        }
    });
};

TrackAnalyzer.prototype.removeFromSearchIndex = function(track, metadata) {
    this._worker.postMessage({
        action: "removeFromSearchIndex",
        args: {
            uid: track.uid(),
            transientId: track.transientId(),
            metadata: metadata
        }
    });
};


TrackAnalyzer.prototype.analyzeTrack = function(track, opts) {
    var self = this;
    if (this.ready && !this.ready.isResolved()) {
        this.ready = this.ready.then(function() {
            return self.analyzeTrack(track, opts);
        });
        return this.ready;
    }

    if (this._currentlyAnalysing) {
        track.once("destroy", this.trackRemovedWhileInQueue);
        return new Promise(function(resolve, reject) {
            self._analysisQueue.push({
                track: track,
                opts: opts,
                resolve: resolve,
                reject: reject
            });

            if (self._playlist.isTrackHighlyRelevant(track)) {
                self.prioritize(track);
            }
        });
    }

    var audioBuffer = null;
    this._currentlyAnalysing = true;
    var id = ++this._nextJobId;
    track.once("destroy", this.abortJobForTrack);
    return new Promise(function(resolve, reject) {
        if (track.isDetachedFromPlaylist()) {
            throw new TrackWasRemovedError();
        }

        this._analyzerJobs.push({
            id: id,
            track: track,
            resolve: resolve,
            reject: reject
        });

        this._worker.postMessage({
            action: "analyze",
            args: {
                id: id,
                fingerprint: !!opts.fingerprint,
                loudness: !!opts.loudness,
                file: track.getFile(),
                uid: track.uid(),
                transientId: track.transientId()
            }
        });
    }.bind(this)).finally(function() {
        track.removeListener("destroy", self.abortJobForTrack);
        self._next(self._analysisQueue, "_currentlyAnalysing", self.analyzeTrack);
        return null;
    });
};

module.exports = TrackAnalyzer;
