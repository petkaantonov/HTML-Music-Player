"use strict";
import $ from "lib/jquery";

const PlayerPictureManager = require("ui/PlayerPictureManager");
import EventEmitter from "lib/events";
const util = require("lib/util");
const TagData = require("TagData");
const sha1 = require("lib/sha1");
import Promise from "lib/bluebird";
const domUtil = require("lib/DomUtil");
const searchUtil = require("searchUtil");

Track.DECODE_ERROR = "<p>The file could not be decoded. Check that the codec is supported and the file is not corrupted.</p>";
Track.FILESYSTEM_ACCESS_ERROR = "<p>Access to the file was denied. It has probably been moved or altered after being added to the playlist.</p>";
Track.UNKNOWN_ERROR = "<p>Unknown error</p>";

const transientIdToTrack = Object.create(null);
var nextTransientId = 10000;

function Track(audioFile) {
    EventEmitter.call(this);
    this.file = audioFile;
    this.tagData = null;
    this.index = -1;
    this._error = null;
    this._lastPlayed = 0;
    this._uid = null;
    this._transientId = ++nextTransientId;
    this._generatedImage = null;
    this._isBeingAnalyzed = false;
    this._isDisplayedAsSearchResult = false;
    this._searchTerm = null;
}
util.inherits(Track, EventEmitter);

Track.prototype.transientId = function() {
    return this._transientId;
};

Track.prototype.getTrackInfo = function() {
    var artist, title;
    if (!this.tagData) {
        var artistAndTitle = TagData.trackInfoFromFileName(this.getFileName());
        artist = artistAndTitle.artist;
        title = artistAndTitle.title;
    } else {
        artist = this.tagData.getArtist();
        title = this.tagData.getTitle();
    }

    return {
        artist: artist,
        title: title
    };
};

Track.prototype.shouldDisplayAsSearchResult = function() {
    return !this.isDetachedFromPlaylist() && this.tagData && !this._isDisplayedAsSearchResult;
};

Track.prototype.matches = function(matchers) {
    if (!this.tagData) return false;

    if (!this._searchTerm) {
        this._searchTerm = searchUtil.getSearchTerm(this.tagData, this.file);
    }
    for (var i = 0; i < matchers.length; ++i) {
        if (!matchers[i].test(this._searchTerm)) {
            return false;
        }
    }
    return true;
};

Track.prototype.isAvailableOffline = function() {
    return true;
};

Track.prototype.isSyncedToCloud = function() {
    return false;
};

Track.prototype.getTrackGain = function() {
    if (!this.tagData) return 0;
    return this.tagData.getTrackGain();
};

Track.prototype.getAlbumGain = function() {
    if (!this.tagData) return 0;
    return this.tagData.getAlbumGain();
};

Track.prototype.getTrackPeak = function() {
    if (!this.tagData) return 1;
    return this.tagData.getTrackPeak();
};

Track.prototype.getAlbumPeak = function() {
    if (!this.tagData) return 1;
    return this.tagData.getAlbumPeak();
};

Track.prototype.willBeReplaced = function() {
    if (this._generatedImage) {
        try {
            URL.revokeObjectURL(this._generatedImage.src);
        } catch (e) {}
        this._generatedImage = null;
    }
};

Track.prototype.stageRemoval = function() {
    this.unsetAnalysisStatus();
    this.unsetError();
    this.setIndex(-1);
    this.emit("viewUpdate", "viewUpdateDestroyed");
    this.emit("destroy", this);
    if (this.tagData) {
        delete transientIdToTrack[this.transientId()];
    }
};

Track.prototype.unstageRemoval = function() {
    if (this.tagData) {
        transientIdToTrack[this.transientId()] = this;
    }
};

Track.prototype.destroy = function() {
    this.unsetAnalysisStatus();
    this.unsetError();
    this.setIndex(-1);
    this.emit("viewUpdate", "viewUpdateDestroyed");
    this.emit("destroy", this);

    if (this._generatedImage) {
        URL.revokeObjectURL(this._generatedImage.src);
        this._generatedImage = null;
    }

    if (this.tagData) {
        delete transientIdToTrack[this.transientId()];
        this.tagData.destroy();
        this.tagData = null;
    }

    if (this.file) {
        this.file.close();
        this.file = null;
    }

    this.removeAllListeners();
};

Track.prototype.getImage = Promise.method(function() {
    var image;
    if (this.tagData) {
        image = this.tagData.getImage();
    }
    if (!image) {
        image = this._generatedImage;
    }
    if (!image) {
        if (!this.tagData) {
            return PlayerPictureManager.getDefaultImage();
        }
        return PlayerPictureManager.generateImageForTrack(this).bind(this).tap(function(result) {
            this._generatedImage = result;
            result.tag = this.uid();
        });
    }

    if (image.promise) {
        var self = this;
        return image.promise.then(function() {
            return image;
        }).catch(function(e) {
            image.src = "";
            if (image.blob) {
                image.blob.close();
                image.blob = null;
            }
            return PlayerPictureManager.generateImageForTrack(self).tap(function(result) {
                self._generatedImage = result;
                result.tag = self.uid();
                return self._generatedImage;
            });
        });
    }
    return image;
});

Track.prototype.isDetachedFromPlaylist = function() {
    return this.index === -1;
};

Track.prototype.getIndex = function() {
    return this.index;
};

Track.prototype.setIndex = function(index) {
    if (this.index === index) return;
    this.index = index;
    this.emit("viewUpdate", "viewUpdatePositionChange");
    this.emit("indexChange");
};

Track.prototype.stopPlaying = function() {
    this.emit("viewUpdate", "viewUpdatePlayingStatusChange", false);
};

Track.prototype.startPlaying = function() {
    this.emit("viewUpdate", "viewUpdatePlayingStatusChange", true);
};

Track.prototype.analysisEstimate = function(analysisEstimate) {
    this.emit("viewUpdate", "viewUpdateAnalysisEstimate", analysisEstimate);
};

Track.prototype.unsetAnalysisStatus = function() {
    this._isBeingAnalyzed = false;
    this.emit("viewUpdate", "viewUpdateHideAnalysisStatus");
};

Track.prototype.isBeingAnalyzed = function() {
    return this._isBeingAnalyzed;
};

Track.prototype.setAnalysisStatus = function() {
    this._isBeingAnalyzed = true;
    this.emit("viewUpdate", "viewUpdateShowAnalysisStatus");
};

Track.prototype.unsetError = function() {
    this._error = null;
    this.emit("viewUpdate", "viewUpdateHideErrorStatus");
};

Track.prototype.setError = function(message) {
    if (this._error) {
        this._error = null;
        this.emit("viewUpdate", "viewUpdateHideErrorStatus");
    }
    this._error = message;
    this.emit("viewUpdate", "viewUpdateShowErrorStatus");
};

Track.prototype.hasError = function() {
    return !!this._error;
};

Track.prototype.getFileName = function() {
    return this.file.name;
};

Track.prototype.getFileSize = function() {
    return this.file.size;
};

Track.prototype.getFile = function() {
    return this.file;
};

Track.prototype.getTagData = function() {
    return this.tagData;
};

Track.prototype.setTagData = function(tagData) {
    if (this.tagData !== null) throw new Error("cannot set tagData again");
    this.tagData = tagData;
    transientIdToTrack[this.transientId()] = this;
    this.tagDataUpdated();
};

Track.prototype.formatFullName = function() {
    var name = this.formatName();
    if (this.tagData && this.tagData.getAlbum()) {
        var albumIndex = this.tagData.albumIndex;
        var trackCount = this.tagData.trackCount;
        var position = "";
        if (albumIndex !== -1 && trackCount === -1) {
            position = " #" + albumIndex;
        } else if (albumIndex !== -1 && trackCount !== -1) {
            position = " #" + albumIndex + "/" + trackCount;
        }

        name = name + " [" + this.tagData.getAlbum() + position + "]";
    }
    return name;
};

Track.prototype.formatName = function() {
    if (this.tagData !== null) {
        return this.tagData.formatName();
    }
    var artistAndTitle = TagData.trackInfoFromFileName(this.getFileName());
    return artistAndTitle.artist + " - " + artistAndTitle.title;
};

Track.prototype.formatTime = function() {
    if (this.tagData !== null) {
        return this.tagData.formatTime();
    }
    return "";
};

Track.prototype.needsParsing = function() {
    return (this.tagData === null || !this.tagData.hasBeenAnalyzed()) && !this._error;
};

Track.prototype.getBasicInfo = function() {
    return this.tagData ? this.tagData.basicInfo : {
        channels: 2,
        sampleRate: 44100,
        duration: NaN
    };
};

Track.prototype.rate = function(value) {
    if (!this.tagData) return;
    if (value === -1) {
        if (this.isRated()) {
            this.tagData.unsetRating();
            this.tagDataUpdated();
        }
        return;
    }
    value = Math.max(1, Math.min(+value, 5));
    if (!value) return;
    this.tagData.setRating(value);
    this.tagDataUpdated();
};

Track.prototype.getRating = function() {
    if (!this.tagData) return -1;
    return this.tagData.getRating();
};

Track.prototype.isRated = function() {
    if (!this.tagData) return false;
    return this.tagData.isRated();
};

Track.prototype.tagDataUpdated = function() {
    this.emit("tagDataUpdate", this);
    this.emit("viewUpdate", "viewUpdateTagDataChange");
};

Track.prototype.uid = function() {
    if (this.tagData) {
        if (this._uid) return this._uid;
        this._uid = searchUtil.calculateUid(this.file, this.tagData, true);
        return this._uid;
    } else {
        throw new Error("cannot get uid before having tagData");
    }
};

Track.prototype.getSilenceAdjustedDuration = function(duration) {
    return Math.max(0, duration - this.getTotalSilenceLength());
};

Track.prototype.convertToSilenceAdjustedTime = function(rawCurrentTime) {
    var total = this.getTotalSilenceLength();
    if (!total || !this.tagData || !this.tagData.basicInfo.duration) return rawCurrentTime;
    return Math.max(0, rawCurrentTime - this.getBeginSilenceLength());
};

Track.prototype.convertFromSilenceAdjustedTime = function(currentTime) {
    var total = this.getTotalSilenceLength();
    if (!total || !this.tagData || !this.tagData.basicInfo.duration) return currentTime;
    var physicalDuration = this.tagData.basicInfo.duration;
    var logicalDuration = physicalDuration - total;
    currentTime = Math.min(logicalDuration, Math.max(0, currentTime));
    var startSilence = this.getBeginSilenceLength();
    currentTime += startSilence;

    if (currentTime >= logicalDuration + startSilence) {
        currentTime = physicalDuration;
    }
    return currentTime;
};

Track.prototype.getTotalSilenceLength = function() {
    if (!this.tagData) return 0;
    return this.tagData.getTotalSilenceLength();
};

Track.prototype.getBeginSilenceLength = function() {
    if (!this.tagData) return 0;
    return this.tagData.getBeginSilenceLength();
};

Track.prototype.comesBeforeInSameAlbum = function(otherTrack) {
    return this.isFromSameAlbumAs(otherTrack) &&
        this.tagData.albumIndex === otherTrack.tagData.albumIndex - 1;
};

Track.prototype.comesAfterInSameAlbum = function(otherTrack) {
    return this.isFromSameAlbumAs(otherTrack) &&
        this.tagData.albumIndex === otherTrack.tagData.albumIndex + 1;
};

Track.prototype.isFromSameAlbumAs = function(otherTrack) {
    if (!otherTrack) return false;
    if (otherTrack === this) return true;
    var thisTagData = this.getTagData();
    var otherTagData = otherTrack.getTagData();

    if (!thisTagData || !otherTagData) {
        return false;
    }

    var thisAlbum = thisTagData.getAlbum();
    var otherAlbum = otherTagData.getAlbum();

    if (!thisAlbum || !otherAlbum) {
        return false;
    }

    return thisAlbum === otherAlbum &&
           thisTagData.albumArtist === otherTagData.albumArtist;
};

Track.prototype.hasSilenceAtEnd = function() {
    if (this.tagData && this.tagData.endSilenceLength > 0) {
        return true;
    }
    return false;
};

Track.prototype.played = function() {
    this._lastPlayed = Date.now();
};

Track.prototype.hasBeenPlayedWithin = function(time) {
    return this._lastPlayed >= time;
};

Track.prototype.shouldRetrieveAcoustIdImage = function() {
    return !!(this.tagData && this.tagData.shouldRetrieveAcoustIdImage());
};

const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/;
Track.WAV = 0;
Track.MP3 = 1;
Track.AAC = 2;
Track.WEBM = 3;
Track.OGG = 4;
Track.UNKNOWN_FORMAT = 9999;

const formats = [
    [/^(audio\/vnd.wave|audio\/wav|audio\/wave|audio\/x-wav)$/, Track.WAV],
    [/^(audio\/mpeg|audio\/mp3)$/, Track.MP3],
    [/^(audio\/aac|audio\/aacp|audio\/3gpp|audio\/3gpp2|audio\/mp4|audio\/MP4A-LATM|audio\/mpeg4-generic)$/, Track.AAC],
    [/^(audio\/webm)$/, Track.WEBM],
    [/^(audio\/ogg|application\/ogg|audio\/x-ogg|application\/x-ogg)$/, Track.OGG],
];

Track.prototype.getFormat = function(initialBytes) {
    var type = this.file.type.toLowerCase();
    var matches;
    if (type) {
        var matches = formats.filter(function(v) {
            return v[0].test(type);
        });
    }

    if (type && matches.length) {
        return matches[0][1];
    } else if (!type) {
        var match = rType.exec(initialBytes);

        if (match) {
            for (var i = 0; i < formats.length; ++i) {
                if (match[formats[i][1] + 1] !== undefined) {
                    return formats[i][1];
                }
            }
        }

        return Track.UNKNOWN_FORMAT;
    } else {
        return Track.UNKNOWN_FORMAT;
    }
};

Track.prototype.playerMetadata = function() {
    if (!this.tagData) {
        return null;
    }
    return this.tagData.playerMetadata();
};

Track.prototype.getTagStateId = function() {
    return this.tagData ? this.tagData.getStateId() : -1;
};

Track.byTransientId = function(transientId) {
    return transientIdToTrack[transientId];
};

module.exports = Track;
