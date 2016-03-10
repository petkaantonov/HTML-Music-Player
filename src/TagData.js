"use strict";
const Promise = require("lib/bluebird");

const util = require("lib/util");
const features = require("features");
const blobPatch = require("lib/blobpatch");
blobPatch();

const UNKNOWN = "Unknown";

const INITIAL = 1;
const NO_IMAGE_FOUND = 2;
const PENDING_IMAGE = 3;
const HAS_IMAGE = 4;

const albumNameToCoverArtUrlMap = Object.create(null);

function TagData(track, data, trackAnalyzer) {
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
    this.albumIndex = data.albumIndex || -1;
    this.trackCount = data.trackCount || -1;

    this.trackGain = 0;
    this.albumGain = 0;
    this.trackPeak = 1;
    this.albumPeak = 1;
    this.rating = -1;
    this.acoustId = null;

    this.pictures = data.pictures || [];

    this._formattedTime = null;
    this._formattedName = null;
    this._coverArtImageState = INITIAL;

    this._hasBeenAnalyzed = false;

    this.beginSilenceLength = 0;
    this.endSilenceLength = 0;

    this._trackAnalyzer = trackAnalyzer;
    this._stateId = 1;
}

TagData.prototype._stateUpdate = function() {};

TagData.prototype.getStateId = function() {
    return this._stateId;
};

TagData.prototype.playerMetadata = function() {
    return {
        encoderDelay: this.encoderDelay,
        encoderPadding: this.encoderPadding
    };
};

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
    this._trackAnalyzer.rateTrack(this.track, this.rating);
};

TagData.prototype.unsetRating = function() {
    this.rating = -1;
    this._trackAnalyzer.rateTrack(this.track, this.rating);
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
        ret.tag = this.albumNameKey();
        ret.promise = new Promise(function(resolve, reject) {
            ret.addEventListener("load", resolve, false);
            ret.addEventListener("error", function() {
                albumNameToCoverArtUrlMap[ret.tag] = null;
                reject(new Error("invalid image"));
            }, false);
        });
        return ret;
    }
    return null;
};

var NULL_STRING = "\x00";

const clearPicture = function(picture) {
    if (picture.blobUrl) {
        URL.revokeObjectURL(picture.blobUrl);
    }

    if (picture.blob) {
        picture.blob.close();
    }

    if (picture.image) {
        picture.image.src = "";
    }
    picture.blobUrl = picture.blob = picture.image = null;
};

const tagDatasHoldingPictures = [];

const addPictureHoldingTagData = function(tagData) {
    tagDatasHoldingPictures.push(tagData);

    if (tagDatasHoldingPictures.length > 50) {
        while (tagDatasHoldingPictures.length > 25) {
            var tagData = tagDatasHoldingPictures.shift();
            tagData.reclaimPictures();
        }
    }
};

const removePictureHoldingTagData = function(tagData) {
    var i = tagDatasHoldingPictures.indexOf(tagData);
    if (i >= 0) {
        tagDatasHoldingPictures.splice(i, 1);
    }
};

TagData.prototype.reclaimPictures = function() {
    for (var i = 0; i < this.pictures.length; ++i) {
        var picture = this.pictures[i];
        if (picture.blobUrl) {
            URL.revokeObjectURL(picture.blobUrl);
        }
        picture.blobUrl = picture.image = null;
    }
};

TagData.prototype._getEmbeddedImage = function() {
    var picture = this.pictures[0];
    if (picture.image) {
        return picture.image;
    }

    addPictureHoldingTagData(this);
    var img = new Image();
    picture.image = img;
    img.tag = picture.tag;
    var blobUrl;

    var clear = function() {
        picture.blobUrl = null;
        URL.revokeObjectURL(blobUrl);
        img.removeEventListener("load", success, false);
        img.removeEventListener("error", error, false);
    };

    var self = this;

    var success = clear;
    var error = function() {
        clear();
        var i = self.pictures.indexOf(picture);
        if (i >= 0) {
            self.pictures.splice(i, 1);
        }
        clearPicture(picture);
    };

    img.addEventListener("load", success, false);
    img.addEventListener("error", error, false);

    if (picture.blobUrl) {
        img.src = picture.blobUrl;
        img.blob = picture.blob;
        blobUrl = picture.blobUrl;
        if (img.complete) {
            clear();
        }
        return img;
    }

    var url = URL.createObjectURL(picture.blob);
    picture.blobUrl = url;
    img.src = url;
    img.blob = picture.blob;
    if (img.complete) {
        clear();
    }
    return img;
};

TagData.prototype.getImage = function() {
    if (this.pictures.length) {
        return this._getEmbeddedImage();
    }
    return this.maybeCoverArtImage();
};

TagData.prototype.destroy = function() {
    this._trackAnalyzer.removeFromSearchIndex(this.track);
    while (this.pictures.length) {
        clearPicture(this.pictures.shift());
    }
    removePictureHoldingTagData(this);
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
    if (acoustId) {
        var searchTermsUpdated = false;
        if (acoustId.artist && !this.taggedArtist) {
            this.artist = util.formatTagString(acoustId.artist.name);
            searchTermsUpdated = true;
        }
        if (acoustId.title && !this.taggedTitle) {
            this.title = util.formatTagString(acoustId.title.name);
            searchTermsUpdated = true;
        }
        if (acoustId.album && !this.taggedAlbum) {
            this.album = util.formatTagString(acoustId.album.name);
            searchTermsUpdated = true;
        }

        if (searchTermsUpdated) {
            this._trackAnalyzer.updateSearchIndex(this.track, {
                artist: this.artist,
                title: this.title,
                album: this.album,
                genres: this.genres
            });
        }
    }
};

TagData.prototype.hasAcoustIdImage = function() {
    return albumNameToCoverArtUrlMap[this.albumNameKey()] ||
            typeof this._coverArtImageState === HAS_IMAGE;
};

TagData.prototype.fetchAcoustIdImageStarted = function() {
    this._coverArtImageState = PENDING_IMAGE;
};

TagData.prototype.fetchAcoustIdImageEnded = function(image, error) {
    if (error || !image) {
        this._coverArtImageState = NO_IMAGE_FOUND;
    } else {
        this._coverArtImageState = HAS_IMAGE;
        albumNameToCoverArtUrlMap[this.albumNameKey()] = image.url;
        this._stateUpdate();
        this.track.tagDataUpdated();
    }
};

TagData.prototype.shouldRetrieveAcoustIdImage = function() {
    return this.acoustId &&
           !this.pictures.length &&
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

TagData.prototype.setLoudness = function(data) {
    this.trackGain = data.trackGain;
    this.trackPeak = data.trackPeak || 1;
    this.albumGain = data.albumGain;
    this.albumPeak = data.albumPeak || 1;
    this.beginSilenceLength = data.silence && data.silence.beginSilenceLength ||
                              this.beginSilenceLength ||
                              0;
    this.endSilenceLength = data.silence && data.silence.endSilenceLength ||
                            this.endSilenceLength ||
                            0;
    if (this.endSilenceLength < 1) this.endSilenceLength = 0;
    this.track.tagDataUpdated();
};

TagData.prototype.setDataFromTagDatabase = function(data) {
    this._stateUpdate();
    this._hasBeenAnalyzed = true;
    this.acoustId = data.acoustId || this.acoustId || null;
    if (this.acoustId) {
        this.updateFieldsFromAcoustId(this.acoustId);
    }
    this._formattedTime = null;
    this.basicInfo.duration = data.duration || this.duration || NaN;
    this.rating = data.rating === undefined ? -1 : data.rating;
    this.setLoudness(data);
};

module.exports = TagData;
