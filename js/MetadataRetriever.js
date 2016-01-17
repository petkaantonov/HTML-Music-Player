"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const AcoustIdApiError = require("./AcoustIdApiError");
const TrackAnalyzer = require("./TrackAnalyzer");
const TrackWasRemovedError = require("./TrackWasRemovedError");
const util = require("./util");

function getBestRecordingGroup(recordings) {
    recordings.reverse();
    var groups = [];

    for (var i = 0; i < recordings.length; ++i) {
        var recording = recordings[i];
        if (!recording || !recording.releasegroups) {
            continue;
        }
        var releasegroups = recording.releasegroups;
        if (!releasegroups) {
            continue;
        }
        for (var j = 0; j < releasegroups.length; ++j) {
            var releasegroup = releasegroups[j];
            if (!releasegroup) {
                continue;
            }

            if (!releasegroup.type) {
                releasegroup.type = "crap";
            }

            var secondarytypes = releasegroup.secondarytypes;
            groups.push({
                indexI: i,
                indexJ: j,
                recording: recording,
                type: releasegroup.type.toLowerCase(),
                album: releasegroups[j],
                secondarytypes: secondarytypes ? secondarytypes.map(function(v) {
                    return v.toLowerCase();
                }) : null
            });
        }
    }

    groups.sort(function(a, b) {
        if (a.type === "album" && b.type === "album") {
            var aSec = a.secondarytypes;
            var bSec = b.secondarytypes;

            if (aSec && bSec) {
                var aCompilation = aSec.indexOf("compilation") >= 0;
                var bCompilation = bSec.indexOf("compilation") >= 0;

                if (aCompilation && bCompilation) {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                } else if (aCompilation && !bCompilation) {
                    return 1;
                } else if (!aCompilation && bCompilation) {
                    return -1;
                } else {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                }
            } else if (aSec && !bSec) {
                return 1;
            } else if (!aSec && bSec) {
                return -1;
            } else {
                var diff = a.indexI - b.indexI;
                if (diff !== 0) return diff;
                return a.indexJ - b.indexJ;
            }
        } else if (a.type === "album") {
            return -1;
        } else {
            return 1;
        }
    });

    if (!groups.length) {
        return {
            recording: recordings[0],
            album: null
        };
    }

    return groups[0];
}

function formatArtist(artists) {
    if (artists.length === 1) {
        return artists[0].name;
    } else {
        var ret = "";
        for (var i = 0; i < artists.length - 1; ++i) {
            ret += artists[i].name + artists[i].joinphrase;
        }
        ret += artists[i].name;
        return ret;
    }
}

function parseAcoustId(data) {
    if (!data) {
        throw new AcoustIdApiError("Invalid JSON response", -1);
    }

    if (data.status === "error") {
        throw new AcoustIdApiError(data.error.message, data.error.code);
    }

    var result = data.results && data.results[0] || null;

    if (!result) return null;
    if (!result.recordings || result.recordings.length === 0) return null;
    var bestRecordingGroup = getBestRecordingGroup(result.recordings);
    if (!bestRecordingGroup) return null;
    var recording = bestRecordingGroup.recording;

    var title = {
        name: recording.title,
        mbid: recording.id,
        type: "release"
    };
    var album = null;

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: "release-group"
        };
    }

    var artist = null;
    if (recording.artists && recording.artists.length) {
        artist = {
            name: formatArtist(recording.artists),
            mbid: recording.artists[0].id,
            type: "artist"
        };
    }

    return {
        title: title,
        album: album,
        artist: artist
    };
}

function MetadataRetriever() {
    this._lastAcoustIdRequest = 0;
    this._queue = [];
    this._currentRequest = null;
    this.trackDestroyed = this.trackDestroyed.bind(this);
}

MetadataRetriever.prototype.prioritize = TrackAnalyzer.prototype.prioritize;
MetadataRetriever.prototype.trackDestroyed = TrackAnalyzer.prototype.trackDestroyed;


MetadataRetriever.prototype.processNextInQueue = function() {
    if (this._queue.length > 0 && this.canQuery()) {
        var spec = this._queue.shift();
        spec.track.removeListener("destroy", this.trackDestroyed);
        if (spec.track.isDetachedFromPlaylist()) {
            spec.reject(new TrackWasRemovedError());
        } else {
            spec.resolve(this.acoustIdQuery(spec.track, spec.duration, spec.fingerprint));
        }
    }
};

MetadataRetriever.prototype.canQuery = function() {
    return !!(navigator.onLine &&
           !this._currentRequest &&
           Date.now() - this._lastAcoustIdRequest > 500);
};

MetadataRetriever.prototype._queuedRequest = function(track, duration, fingerprint) {
    var self = this;
    return new Promise(function(resolve, reject) {
        track.once("destroy", self.trackDestroyed);
        self._queue.push({
            resolve: resolve,
            reject: reject,
            track: track,
            duration: duration,
            fingerprint: fingerprint
        });
    });
};

MetadataRetriever.prototype.acoustIdQuery = function(track, duration, fingerprint, _retries) {
    var self = this;
    if (!_retries) _retries = 0;

    if (!this.canQuery()) {
        return this._queuedRequest(track, duration, fingerprint);
    }

    this._lastAcoustIdRequest = Date.now();

    var jqXhr = $.ajax({
        dataType: "json",
        url: "https://api.acoustId.org/v2/lookup",
        timeout: 5000,
        // jQuery escaping is not supported by acoustid
        data: util.queryString({
            client: "djbbrJFK",
            format: "json",
            duration: duration,
            meta: "recordings+releasegroups+compress",
            fingerprint: fingerprint
        })
    });

    this._currentRequest = Promise.resolve(jqXhr)
        .then(parseAcoustId)
        .catch(AcoustIdApiError, function(e) {
            if (e.isRetryable() && _retries <= 5) {
                return Promise.delay(1000).then(function() {
                    self._currentRequest = null;
                    return self.acoustIdQuery(track, duration, fingerprint, _retries + 1);
                });
            }
            throw e;
        })
        .finally(function() {
            self._currentRequest = null;
        })
        .catch(function() {
            // Went offline during request, try later.
            if (!navigator.onLine || jqXhr.statusText === "timeout") {
                return self._queuedRequest(track, duration, fingerprint);
            }
        });

    return this._currentRequest;
};

MetadataRetriever.prototype.getAcoustIdDataForTrack = function(track, duration, fingerprint) {
    duration = Math.floor(duration);
    return this.acoustIdQuery(track, duration, fingerprint);
};

MetadataRetriever.prototype.getImage = function(acoustId) {
    if (!navigator.onLine) return Promise.reject(new Promise.TimeoutError());

    var imagesToTry = [];

    if (acoustId.album) imagesToTry.push(acoustId.album);

    if (!imagesToTry.length) {
        return Promise.resolve(null);
    }

    return (function loop(value) {
        if (value) return value;
        var cur = imagesToTry.shift();
        if (!cur) return null;

        return new Promise(function(resolve, reject) {
            var timerId = -1;
            var img = new Image();
            img.src = "https://coverartarchive.org/" + cur.type + "/" + cur.mbid + "/front-250";

            function clearTimer() {
                if (timerId !== -1) {
                    timerId = -1;
                    clearTimeout(timerId);
                }
            }

            function success() {
                clearTimer();
                img.onerror = img.onload = null;
                resolve({
                    image: img,
                    url: img.src,
                    acoustId: cur
                });
            }

            img.onerror = function() {
                clearTimer();
                resolve();
            };

            img.onload = success;

            timerId = setTimeout(function() {
                timerId = -1;
                reject(new Promise.TimeoutError());
            }, 5000);

            if (img.complete) success();
        }).then(loop);
    })();
};


var ret = new MetadataRetriever();

setInterval(function() {
    ret.processNextInQueue();
}, 1000);

module.exports = ret;
