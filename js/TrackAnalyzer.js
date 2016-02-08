"use strict";
const Promise = require("../lib/bluebird.js");

const util = require("./util");
const TrackWasRemovedError = require("./TrackWasRemovedError");
const Track = require("./Track");
const AudioError = require("./AudioError");
const TagData = require("./TagData");

var instances = false;
function TrackAnalyzer(playlist) {
    if (instances) throw new Error("only 1 TrackAnalyzer instance can be made");
    instances = true;
    this._worker = new Worker("worker/TrackAnalyzerWorker.js");
    this._analyzerJobs = [];
    this._nextJobId = 0;
    this._queue = [];
    this._longQueue = [];
    this._currentlyAnalysing = false;
    this._playlist = playlist;
    this._metadataParsingTracks = {};

    this._worker.addEventListener("message", this._messaged.bind(this), false);
    this._playlist.on("nextTrackChange", this.nextTrackChanged.bind(this));
    this._playlist.on("trackChange", this.currentTrackChanged.bind(this));
    this._playlist.on("unparsedTracksAvailable", this.unparsedTracksAvailable.bind(this));
    this.trackDestroyed = this.trackDestroyed.bind(this);
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
}

TrackAnalyzer.prototype.unparsedTracksAvailable = function() {
    var tracks = this._playlist.getUnparsedTracks();
    for (var i = 0; i < tracks.length; ++i) {
        var track = tracks[i];

        if (!track.isDetachedFromPlaylist() && !track.hasError()) {
            if (track.tagData) {
                // ??
            } else {
                this.parseMetadata(track);
            }
        }
    }
};

TrackAnalyzer.prototype.trackMetadataParsed = function(track, data) {
    if (!track.isDetachedFromPlaylist()) {
        track.setTagData(new TagData(track, data));
    }
};

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

var retrieveAcoustIdImage = util.throttle(function(track) {
    if (track && track.shouldRetrieveAcoustIdImage()) {
        track.fetchAcoustIdImage();
    }
}, 100);
TrackAnalyzer.prototype.currentTrackChanged = function(track) {
    this.prioritize(track);
    retrieveAcoustIdImage(track);
};

TrackAnalyzer.prototype.nextTrackChanged = function(track) {
    this.prioritize(track);
    retrieveAcoustIdImage(track);
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

TrackAnalyzer.prototype._messaged = function(event) {
    var id = event.data.id;
    if (event.data.jobType === "metadata") {
        var info = this._metadataParsingTracks[id];
        if (info) {
            var track = info.track;
            track.removeListener("destroy", info.destroyHandler);
            delete this._metadataParsingTracks[id];
            var result = event.data.type === "error" ? null : event.data.result;
            this.trackMetadataParsed(track, result);
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
            file: track.getFile()
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
                file: track.getFile()
            }
        });
    }.bind(this)).finally(function() {
        track.removeListener("destroy", self.abortJobForTrack);
        Promise.delay(500).then(function() {
            self._next();
        });
        return null;
    });
};

module.exports = TrackAnalyzer;
