"use strict";
const Promise = require("../lib/bluebird.js");

const util = require("./util");
const tagDatabase = require("./TagDatabase");
const features = require("./features");

const UNKNOWN = "Unknown";

const INITIAL = 1;
const NO_IMAGE_FOUND = 2;
const PENDING_IMAGE = 3;
const HAS_IMAGE = 4;

var preferAcoustIdData = true;
var tagDatasRetainingBlobUrls = [];

const albumNameToCoverArtUrlMap = Object.create(null);


function TagData(track, data) {
    this.track = track;

    this.title = data.title || null;
    this.artist = data.artist || null;
    this.album = data.album || null;
    this.taggedArtist = this.artist;
    this.taggedTitle = this.title;
    this.taggedAlbum = this.album;
    this.albumArtist = data.albumArtist || (data.compilationFlag ? "Various Artists" : null);

    this.basicInfo = data.basicInfo;
    this.basicInfo.channels = this.basicInfo.channels || 2;
    this.basicInfo.sampleRate = this.basicInfo.sampleRate || 44100;
    this.basicInfo.channels = Math.min(Math.max(1, this.basicInfo.channels));

    this.year = data.year || -1;
    this.genres = data.genres || null;
    this.bpm = data.beatsPerMinute || -1;
    this.mood = data.mood || null;

    this.encoderDelay = data.encoderDelay || -1;
    this.encoderPadding = data.encoderPadding || -1;

    this.discNumber = data.discNumber || -1;
    this.discCount = data.discCount || -1;
    this.trackNumber = data.trackNumber || -1;
    this.trackCount = data.trackCount || -1;

    this.trackGain = 0;
    this.albumGain = 0;
    this.trackPeak = 1;
    this.albumPeak = 1;
    this.rating = -1;
    this.acoustId = null;

    // Image embedded in the audio file.
    this._embeddedImage = data.pictures && data.pictures[0];
    this._embeddedImageUrl = null;
    this._embeddedImageBlob = null;

    this._formattedTime = null;
    this._formattedName = null;
    this._coverArtImageState = INITIAL;

    this._hasBeenAnalyzed = false;

    this.beginSilenceLength = 0;
    this.endSilenceLength = 0;
}

TagData.prototype.formatTime = function() {
    if (this._formattedTime !== null) return this._formattedTime;
    if (!this.basicInfo.duration) {
        return this._formattedTime = "";
    }
    var duration = Math.max(0, this.basicInfo.duration - this.getTotalSilenceLength());
    return (this._formattedTime = util.toTimeString(duration));
};

var stripExtensionPattern = new RegExp("\\.(?:" + features.allowExtensions.join("|") + ")$", "i");
var separatorPattern = /(.+)\s*-\s*(.+)/;
TagData.stripExtensionPattern = stripExtensionPattern;
TagData.trackInfoFromFileName = function(fileName) {
    var fileName = fileName.replace(stripExtensionPattern, "");
    var matches = fileName.match(separatorPattern);
    var artist, title;

    if (!matches) {
        title = util.capitalize(fileName);
        artist = UNKNOWN;
    } else {
        artist = util.capitalize(matches[1]) || UNKNOWN;
        title = util.capitalize(matches[2]) || UNKNOWN;
    }

    return {
        artist: artist,
        title: title
    };
};

TagData.prototype.ensureArtistAndTitle = function() {
    if (!this.title || !this.artist) {
        var artistAndTitle = TagData.trackInfoFromFileName(this.track.getFileName());
        this.artist = this.artist || artistAndTitle.artist || UNKNOWN;
        this.title = this.title || artistAndTitle.title || UNKNOWN;
    }
};

TagData.prototype.formatName = function() {
    if (this._formattedName !== null) return this._formattedName;
    this.ensureArtistAndTitle();
    return (this._formattedName = this.artist + " - " + this.title);
};

TagData.prototype.getTrackGain = function() {
    return this.trackGain;
};

TagData.prototype.getAlbumGain = function() {
    return this.albumGain;
};

TagData.prototype.getTrackPeak = function() {
    return this.trackPeak;
};

TagData.prototype.getAlbumPeak = function() {
    return this.albumPeak;
};

TagData.prototype.getAlbum = function() {
    return this.album;
};

TagData.prototype.getTitle = function() {
    this.ensureArtistAndTitle();
    return this.title;
};

TagData.prototype.getArtist = function() {
    this.ensureArtistAndTitle();
    return this.artist;
};

TagData.prototype.isRated = function() {
    return this.rating !== -1;
};

TagData.prototype.getRating = function() {
    return this.rating;
};

TagData.prototype.setRating = function(val) {
    this.rating = Math.min(5, Math.max(1, +val));
    tagDatabase.updateRating(this.track.getUid(), this.rating);
};

TagData.prototype.unsetRating = function() {
    this.rating = -1;
    tagDatabase.updateRating(this.track.getUid(), this.rating);
};

TagData.prototype.albumNameKey = function() {
    return (this.album + " " + this.albumArtist).toLowerCase();
};

TagData.prototype.maybeCoverArtImage = function() {
    if (!this.album) return null;
    var mapped = albumNameToCoverArtUrlMap[this.albumNameKey()];
    if (mapped) {
        var ret = new Image();
        ret.src = mapped;
        return ret;
    }
    return null;
};

var NULL_STRING = "\x00";

TagData.prototype.getImage = function() {
    if (this._embeddedImageUrl) {
        var ret = new Image();
        ret.src = this._embeddedImageUrl;
        return ret;
    }
    var img = this.maybeCoverArtImage();

    if (img) return img;

    if (!this._embeddedImage) return null;

    var blob = this.track.getFile().slice(this._embeddedImage.start,
                                          this._embeddedImage.start + this._embeddedImage.length,
                                          this._embeddedImage.type);
    var url = URL.createObjectURL(blob);
    this._embeddedImageUrl = url;
    this._embeddedImageBlob = blob;
    tagDatasRetainingBlobUrls.push(this);
    checkTagDatasRetainingBlobUrls();
    return this.getImage();
};

TagData.prototype.clearBlobUrl = function() {
    try {
        URL.revokeObjectURL(this._embeddedImageUrl.src);
    } catch (e) {}
    try {
        this._embeddedImageBlob.close();
    } catch (e) {}
    this._embeddedImageBlob = null;
    this._embeddedImageUrl = null;
};

TagData.prototype.destroy = function() {
    if (this._embeddedImageUrl) {
        tagDatasRetainingBlobUrls.splice(tagDatasRetainingBlobUrls.indexOf(this), 1);
        this.clearBlobUrl();
    }
};

TagData.prototype.getTitleForSort = function() {
    this.ensureArtistAndTitle();
    return this.title;
};

TagData.prototype.getAlbumArtistForSort = function() {    
    if (this.albumArtist === null) return NULL_STRING;
    return this.albumArtist;
};

TagData.prototype.getAlbumForSort = function() {
    return this.albumNameKey();
};

TagData.prototype.getArtistForSort = function() {
    this.ensureArtistAndTitle();
    return this.artist;
};

TagData.prototype.getDiscNumberForSort = function() {
    return this.discNumber;
};

TagData.prototype.getAlbumIndexForSort = function() {
    return this.albumIndex;
};

TagData.prototype.getTotalSilenceLength = function() {
    return this.beginSilenceLength + this.endSilenceLength;
};

TagData.prototype.getBeginSilenceLength = function() {
    return this.beginSilenceLength;
};

TagData.prototype.updateFieldsFromAcoustId = function(acoustId) {
    if (acoustId && preferAcoustIdData) {
        if (acoustId.album && !this.taggedAlbum) this.album = util.formatTagString(acoustId.album.name);
        if (acoustId.artist && !this.taggedArtist) this.artist = util.formatTagString(acoustId.artist.name);
        if (acoustId.title && !this.taggedTitle) this.title = util.formatTagString(acoustId.title.name);
    }
};

TagData.prototype.fetchAcoustIdImage = function() {
    const metadataRetriever = require("./MetadataRetriever");
    if (this.hasAcoustIdImage()) throw new Error("already has acoust id image");
    this._coverArtImageState = PENDING_IMAGE;
    var self = this;

    return Promise.join(tagDatabase.getAlbumImage(this.albumNameKey()),
                 tagDatabase.query(this.track.getUid()), function(coverArt, trackData) {
        if (coverArt && coverArt.url) {
            albumNameToCoverArtUrlMap[self.albumNameKey()] = coverArt.url;
            self.track.tagDataUpdated();
            self._coverArtImageState = HAS_IMAGE;
        } else if (trackData && trackData.hasCoverArt === false) {
            self._coverArtImageState = NO_IMAGE_FOUND;
        } else {
            return metadataRetriever.getImage(self.acoustId).then(function(info) {
                if (info) {
                    tagDatabase.setAlbumImage(self.albumNameKey(), info.url);
                    albumNameToCoverArtUrlMap[self.albumNameKey()] = info.url;
                    self._coverArtImageState = HAS_IMAGE;
                } else {
                    var failedBecauseOffline = !navigator.onLine;
                    if (!failedBecauseOffline) {
                        tagDatabase.updateHasCoverArt(self.track.getUid(), false);
                        self._coverArtImageState = NO_IMAGE_FOUND;
                    }
                }
                self.track.tagDataUpdated();
                return null;
            }).catch(Promise.TimeoutError, function ignore() {});
        }
    });
};

TagData.prototype.hasAcoustIdImage = function() {
    return albumNameToCoverArtUrlMap[this.albumNameKey()] ||
            typeof this._coverArtImageState === HAS_IMAGE;
};

TagData.prototype.shouldRetrieveAcoustIdImage = function() {
    return this.acoustId &&
           !this._embeddedImage &&
           this._coverArtImageState === INITIAL &&
           !albumNameToCoverArtUrlMap[this.albumNameKey()];
};

TagData.prototype.setAcoustId = function(acoustId) {
    this.acoustId = acoustId;
    this.updateFieldsFromAcoustId(acoustId);
    this.track.tagDataUpdated();
};

TagData.prototype.hasBeenAnalyzed = function() {
    return this._hasBeenAnalyzed;
};

TagData.prototype.setDataFromTagDatabase = function(data) {
    this._hasBeenAnalyzed = true;
    this.beginSilenceLength = data.silence && data.silence.beginSilenceLength ||
                              this.beginSilenceLength ||
                              0;
    this.endSilenceLength = data.silence && data.silence.endSilenceLength ||
                            this.endSilenceLength ||
                            0;
    this.acoustId = data.acoustId || this.acoustId|| null;
    if (this.acoustId) this.updateFieldsFromAcoustId(this.acoustId);
    if (data.coverArt && !this._embeddedImage) {
        albumNameToCoverArtUrlMap[this.albumNameKey()] = data.coverArt.url;
        this._coverArtImageState = HAS_IMAGE;
    }
    this.trackGain = data.trackGain;
    this.trackPeak = data.trackPeak || 1;
    this.albumGain = data.albumGain;
    this.albumPeak = data.albumPeak || 1;
    this._formattedTime = null;
    this.basicInfo.duration = data.duration || this.duration || NaN;
    this.rating = data.rating || -1;
    this.track.tagDataUpdated();
};

function checkTagDatasRetainingBlobUrls() {
    if (tagDatasRetainingBlobUrls.length > 100) {
        for (var i = 0; i < 35; ++i) {
            tagDatasRetainingBlobUrls[i].clearBlobUrl();
        }
        tagDatasRetainingBlobUrls = tagDatasRetainingBlobUrls.slice(35);
    }
}

module.exports = TagData;
