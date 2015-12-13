const metadataRetriever = (function() { "use strict";


function formatArtist(artists) {
    if (artists.length === 1) {
        return artists[0];
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
    if (!data || data.status !== "ok") {
        return null;
    }

    var result = data.results && data.results[0] || null;
    if (!result) return null;

    var recording = result.recordings && result.recordings[0] || null;
    if (!recording) return null;

    var title = {
        name: recording.title,
        mbid: recording.id,
        type: "release"
    };
    var album = null;

    if (recording.releasegroups && recording.releasegroups.length) {
        var albumReleasegroup = recording.releasegroups.filter(function(value) {
            return value.type.toLowerCase() === "album";
        });

        if (albumReleasegroup.length) {
            album = {
                name: albumReleasegroup[0].title,
                mbid: albumReleasegroup[0].id,
                type: "release-group"

            };
        }
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


MetadataRetriever.prototype.maybeQuery = function() {
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
    return !this._currentRequest && Date.now() - this._lastAcoustIdRequest > 500;
};

MetadataRetriever.prototype.acoustIdQuery = function(track, duration, fingerprint, _retries) {
    var self = this;
    if (!_retries) _retries = 0;

    if (!this.canQuery()) {
        var self = this;
        return new Promise(function(resolve, reject) {
            track.once("destroy", this.trackDestroyed);
            self.push({
                resolve: resolve,
                reject: reject,
                track: track,
                duration: duration,
                fingerprint: fingerprint
            });
        });
    }

                                                                // Jquery escapes wrong.
    var jqXhr = $.getJSON("http://api.acoustId.org/v2/lookup", util.queryString({
        client: "ULjKruIg",
        duration: duration,
        meta: "recordings+releasegroups+compress",
        fingerprint: fingerprint
    }));

    this._currentRequest = Promise.resolve(jqXhr).then(parseAcoustId).catch(function(e) {
        if (jqXhr.status >= 500 && _retries <= 5) {
            return Promise.delay(1000).then(function() {
                self._currentRequest = null;
                return self.acoustIdQuery(track, duration, fingerprint, _retries + 1);
            });
        } else {
            var response = JSON.parse(jqXhr.responseText);

            if (response.status === "error") {
                throw new AcoustIdApiError(response.error.message, response.error.code);
            } else {
                throw new SyntaxError();
            }
        }
    }).catch(SyntaxError, function(){
        throw new AcoustIdApiError("Invalid JSON response", -1);
    }).finally(function() {
        self._currentRequest = null;
    });

    return this._currentRequest;
};

MetadataRetriever.prototype.getAcoustIdDataForTrack = function(track, duration, fingerprint) {
    duration = Math.floor(duration);
    return this.acoustIdQuery(track, duration, fingerprint);
};

MetadataRetriever.prototype.getImage = function(acoustId) {
    var imagesToTry = [acoustId.title];

    if (acoustId.album) imagesToTry.push(acoustId.album);

    return (function loop(value) {
        if (value) return value;
        var cur = imagesToTry.shift();
        if (!cur) return null;

        return new Promise(function(resolve) {
            var img = new Image();
            img.src = "http://coverartarchive.org/" + cur.type + "/" + cur.mbid + "/front-250";

            function success() {
                img.onerror = img.onload = null;
                resolve({
                    image: img,
                    url: img.src,
                    acoustId: cur
                });
            }

            img.onerror = function() {
                resolve();
            };

            img.onload = success;

            if (img.complete) success();
        }).then(loop);
    })();
};


var ret = new MetadataRetriever();

setInterval(function() {
    ret.maybeQuery();
}, 1000);

return ret; })();
