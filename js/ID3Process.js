"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const Track = require("./Track");
const metadataRetriever = require("./MetadataRetriever");
const tagDatabase = require("./TagDatabase");
const TagData = require("./TagData");
const util = require("./util");
const blobPatch = require("../lib/blobpatch");
blobPatch();

const AudioError = require("./AudioError");
const TrackWasRemovedError = require("./TrackWasRemovedError");

function ID3Process(playlist, player, trackAnalyzer) {
    this.trackAnalyzer = trackAnalyzer;
    this.playlist = playlist;
    this.player = player;
    this.concurrentParsers = 8;
    this.queue = [];
    this.queueProcessors = new Array(this.concurrentParsers);
    for (var i = 0; i < this.concurrentParsers; ++i) {
        this.queueProcessors[i] = null;
    }
    this.queueSet = new Set();
    this.jobPollerId = -1;
    playlist.on("lengthChange", this.playlistLengthChanged.bind(this));
    playlist.on("nextTrackChange", this.nextTrackChanged.bind(this));
    playlist.on("trackChange", this.currentTrackChanged.bind(this));
}

function isNull(value) {
    return value === null;
}

var retrieveAcoustIdImage = util.throttle(function(track) {
    if (track && track.shouldRetrieveAcoustIdImage()) {
        track.fetchAcoustIdImage();
    }
}, 100);

ID3Process.prototype.currentTrackChanged = function(track) {
    retrieveAcoustIdImage(track);
};

ID3Process.prototype.nextTrackChanged = function(track) {
    retrieveAcoustIdImage(track);
};

ID3Process.prototype.checkEmpty = function() {
    if (this.queueProcessors.every(isNull)) {
        var tracks = this.playlist.getUnparsedTracks(this.concurrentParsers * 8);
        if (tracks.length) {
            this.placeQueue(tracks);
            return true;
        }
    }
    return false;
};

ID3Process.prototype.playlistLengthChanged = function(newLength, oldLength) {
    var self = this;
    if (newLength > oldLength && this.jobPollerId === -1) {
        this.jobPollerId = setTimeout(function jobPoller() {
            self.jobPollerId = setTimeout(jobPoller, 1);
            if (!self.checkEmpty()) {
                clearTimeout(self.jobPollerId);
                self.jobPollerId = -1;
            }
        }, 1);
    }
};

ID3Process.prototype.placeQueue = function(queue) {
    if (!queue.length) {
        return;
    }

    for (var i = 0; i < queue.length; ++i) {
        var track = queue[i];
        if (this.queueSet.has(track)) {
            continue;
        }

        this.queueSet.add(track);
        this.queue.push(track);
    }

    this.queueProcessors.forEach(function(queueProcess, index) {
        var self = this;
        if (!queueProcess) {
            this.queueProcessors[index] = this.loadNext().reflect().then(function(result) {
                self.queueProcessors[index] = null;
                self.checkEmpty();
                if (result.isRejected()) {
                    throw result.reason();
                }
                return null;
            });
        }
    }, this);
};

ID3Process.prototype.fillInAcoustId = function(track, duration, fingerprint) {
    var self = this;
    metadataRetriever.getAcoustIdDataForTrack(track, duration, fingerprint).then(function(acoustId) {
        if (!track.isDetachedFromPlaylist()) {
            track.tagData.setAcoustId(acoustId);
            tagDatabase.updateAcoustId(track.getUid(), acoustId);

            if (self.playlist.isTrackHighlyRelevant(track) &&
                track.shouldRetrieveAcoustIdImage()) {
                track.fetchAcoustIdImage();
            }
        }
        return null;
    }).catch(function(e) {
        if (e && e.statusText && e.statusText === "timeout") {
            return;
        }
    });

    if (this.playlist.isTrackHighlyRelevant(track)) {
        metadataRetriever.prioritize(track);
    }
};

ID3Process.prototype.loadNext = function() {
    var self = this;
    if (!this.queue.length) {
        return Promise.resolve(false);
    }
    var track = this.queue.shift();
    if (track.isDetachedFromPlaylist() || track.hasError()) {
        this.queueSet.delete(track);
        return Promise.resolve(false);
    }

    var tagData;
    if (track.tagData) {
        tagData = Promise.resolve(track.tagData);
    } else {
        var blob = track.file.slice(0, 1024);
        tagData = util.readAsBinaryString(blob)
            .finally(function() {
                blob.close();
            })
            .then(function(bytes) {
                var format = track.getFormat(bytes);
                if (format === Track.MP3) {
                    return self.parseMpegTagData(bytes, track);
                } else if (format === Track.WAV) {
                    return self.parseWavTagData(bytes, track);
                } else if (format === Track.OGG) {
                    return self.parseOggTagData(bytes, track);
                } else if (format === Track.AAC) {
                    return new TagData(track);
                } else if (format === Track.WEBM) {
                    return new TagData(track);
                } else {
                    throw new AudioError();
                }
            })
            .then(function(result) {
                if (!result|| !result.basicInfo) {
                    return new TagData(track, null, null, {
                        channels: 2,
                        sampleRate: 44100,
                        duration: NaN
                    });
                }
                return result;
            })
            .then(function(tagData) {
                track.setTagData(tagData);
                return tagData;
            });
    }

    return tagData.then(function(tagData) {
        var id = track.getUid();

        var coverArt = Promise.resolve(null);
        if (tagData.album) {
            coverArt = tagDatabase.getAlbumImage(tagData.album.toLowerCase());
        }

        Promise.join(tagDatabase.query(id), coverArt, function(value, coverArt) {
            if (coverArt && value) value.coverArt = coverArt;

            var shouldAnalyzeLoudness = !value || value.trackGain === undefined;
            var shouldCalculateFingerprint = !value || value.fingerprint === undefined;
            var shouldRetrieveAcoustIdMetaData = (shouldCalculateFingerprint ||
                                                 (value && value.acoustId === undefined));

            if (shouldRetrieveAcoustIdMetaData && value && value.fingerprint && value.duration) {
                self.fillInAcoustId(track, value.duration, value.fingerprint);
            }

            if (shouldAnalyzeLoudness || shouldCalculateFingerprint) {
                var analyzerOptions = {
                    loudness: shouldAnalyzeLoudness,
                    fingerprint: shouldCalculateFingerprint
                };
                track.setAnalysisStatus(analyzerOptions);
                return self.trackAnalyzer.analyzeTrack(track, analyzerOptions).finally(function() {
                    track.unsetAnalysisStatus();
                }).then(function(result) {
                    var duration = value && value.duration ? value.duration : result.duration;

                    if (result.fingerprint && result.fingerprint.fingerprint && shouldRetrieveAcoustIdMetaData) {
                        self.fillInAcoustId(track, duration, result.fingerprint.fingerprint);
                    }

                    return $.extend({},
                                    value || {},
                                    {duration: duration},
                                    result.loudness || {},
                                    result.fingerprint || {});
                });
            } else if (value) {
                tagData.setDataFromTagDatabase(value);
                return null;
            }
        }).then(function(value) {
            if (value) {
                tagData.setDataFromTagDatabase(value);
                return tagDatabase.insert(id, value);
            }
        }).then(function() {
            if (track.needsParsing()) {
                debugger;
            }
        })
        .catch(function() {});
        return tagData;
    })
    .catch(AudioError, function(e) {
        track.setTagData(new TagData(track, null, null, {
            channels: 2,
            sampleRate: 44100,
            duration: NaN
        }));
    })
    .catch(function(e) {
        if (e instanceof Error) {
            if (e.name === "NotFoundError" || e.name === "NotReadableError") {
                track.setError(Track.FILESYSTEM_ACCESS_ERROR);
                return;
            }
        }
        throw e;
    })
    .finally(function() {
        self.queueSet.delete(track);
        return self.loadNext();
    });
};

ID3Process.prototype.parseOggTagData = function(bytes, track) {
    var oggsIndex = bytes.indexOf("OggS");
    if (oggsIndex === -1) return null;
    var segmentDescriptors = bytes.charCodeAt(oggsIndex + 26);
    var totalSize = 0;
    var index = oggsIndex + 27;
    for (var i = 0; i < segmentDescriptors; ++i) {
        totalSize += bytes.charCodeAt(index);
        index++;
    }

    var self = this;
    var blob = track.file.slice(index, index + totalSize);
    return util.readAsBinaryString(blob).finally(function() {
        blob.close();
    }).then(function(bytes) {
        if (bytes.indexOf("vorbis") === 1) {
            var basicInfo = self.getVorbisBasicInfo(bytes, track.file.size);
            return new TagData(track, null, null, basicInfo);
        } else {
            return new TagData(track);
        }
    });
};

ID3Process.prototype.parseWavTagData = function(bytes, track) {
    var riffIndex = bytes.indexOf("RIFF");
    var fmtIndex = bytes.indexOf("fmt ");
    if (riffIndex !== 0 || fmtIndex !== 12) {
        return new TagData(track);
    }
    var basicInfo = this.getWavBasicInfo(bytes);
    return new TagData(track, null, null, basicInfo);
};

ID3Process.prototype.getVorbisBasicInfo = function(bytes, fileSize) {
    var bitrateUpper = util.int32LE(bytes, 16) >>> 0;
    var bitrateNominal = util.int32LE(bytes, 20) >>> 0;
    var bitrateLower = util.int32LE(bytes, 24) >>> 0;

    var duration = NaN;
    if (bitrateNominal) {
        duration = Math.floor(fileSize * 8 / bitrateNominal);
    } else if (bitrateLower && bitrateUpper) {
        duration = Math.floor(fileSize * 8 / ((bitrateLower + bitrateUpper) / 2));
    }

    var sampleRate = util.int32LE(bytes, 12) >>> 0;

    return {
        channels: bytes.charCodeAt(11),
        sampleRate: sampleRate,
        duration: duration
    };
};

ID3Process.prototype.getWavBasicInfo = function(bytes) {
    var channels = util.int16LE(bytes, 22);
    var sampleRate = util.int32LE(bytes, 24);
    var byteRate = util.int32LE(bytes, 28);
    var chunkType = bytes.substr(36, 4);
    var duration = NaN;

    if (chunkType === "data") {
        var chunkSize = util.int32LE(bytes, 40) >>> 0;
        duration = chunkSize / byteRate;
    }

    return {
        duration: Math.floor(duration),
        sampleRate: sampleRate,
        channels: channels
    };
};



module.exports = ID3Process;
