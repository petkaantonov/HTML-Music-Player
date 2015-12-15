const TagData = (function() { "use strict";

const UNKNOWN = "Unknown";
const NO_ACOUSTID_IMAGE = {};
const PENDING_ACOUSTID_IMAGE = {};
var preferAcoustIdData = true;

const urlImgMap = Object.create(null);

function TagData(track, title, artist, basicInfo, album, albumIndex, picture) {
    this.track = track;
    this.title = title || null;
    if (this.title) this.title = util.formatTagString(this.title);
    this.artist = artist || null;
    if (this.artist) this.artist = util.formatTagString(this.artist);

    this.basicInfo = basicInfo || {
        duration: NaN,
        sampleRate: 44100,
        channels: 2
    };
    this.basicInfo.channels = this.basicInfo.channels || 2;
    this.basicInfo.sampleRate = this.basicInfo.sampleRate || 44100;
    this.basicInfo.channels = Math.min(Math.max(1, this.basicInfo.channels));
    this.album = album || null;
    if (this.album) this.album = util.formatTagString(this.album);
    this.albumIndex = albumIndex || -1;
    this.trackGain = 0;
    this.albumGain = 0;
    this.trackPeak = 1;
    this.albumPeak = 1;
    this.rating = -1;
    this.picture = picture;
    this.acoustId = null;

    this._formattedTime = null;
    this._formattedName = null;
    this._image = null;
    this._acoustIdImage = null;

    this.beginSilenceLength = this.basicInfo.encoderDelay || 0;
    this.endSilenceLength = this.basicInfo.encoderPadding || 0;

    this.taggedArtist = this.artist;
    this.taggedTitle = this.title;
    this.taggedAlbum = this.album;
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

var NULL_STRING = "\x00";

TagData.prototype.hasPicture = function() {
    return !!this.picture;
};

TagData.prototype.getImage = function() {
    if (this._image) return this._image;
    var mapped = urlImgMap[this.album.toLowerCase()];
    if (mapped) return mapped;

    if (this.hasAcoustIdImage()) {
        this._image = new Image();
        this._image.src = this._acoustIdImage;
        return this._image;
    }

    // TODO change this field name lol.
    if (!this.picture) return null;
    var blob = this.track.getFile().slice(this.picture.start,
                                          this.picture.start + this.picture.length,
                                          this.picture.type);
    var url = URL.createObjectURL(blob);
    this._image = new Image();
    this._image.src = url;
    return this._image;
};

TagData.prototype.getImageUrl = function() {
    if (!this._image) return null;
    return this._image.src;
};

TagData.prototype.destroy = function() {
    if (this._image) {
        try {
            URL.revokeObjectURL(this._image.src);
        } catch (e) {}
        this._image = null;
    }
};

TagData.prototype.getTitleForSort = function() {
    this.ensureArtistAndTitle();
    return this.title;
};

TagData.prototype.getAlbumForSort = function() {
    if (this.album === null) return NULL_STRING;
    return this.album;
};

TagData.prototype.getArtistForSort = function() {
    this.ensureArtistAndTitle();
    return this.artist;
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
        if (acoustId.album && !this.taggedAlbum) this.album = acoustId.album.name;
        if (acoustId.artist && !this.taggedArtist) this.artist = acoustId.artist.name;
        if (acoustId.title && !this.taggedTitle) this.title = acoustId.title.name;
    }
};

TagData.prototype.fetchAcoustIdImage = function() {
    if (this.hasAcoustIdImage()) throw new Error("already has acoust id image");
    this._acoustIdImage = PENDING_ACOUSTID_IMAGE;
    var self = this;

    return Promise.join(tagDatabase.getAlbumImage(this.album.toLowerCase()),
                 tagDatabase.query(this.track.getUid()), function(coverArt, trackData) {
        if (coverArt && coverArt.url) {
            self._acoustIdImage = coverArt.url;
            var image = new Image();
            image.src = coverArt.url;
            urlImgMap[self.album.toLowerCase()] = image;
            self.track.tagDataUpdated();
        } else if (trackData && trackData.coverArtImageUrl !== undefined) {
            self._acoustIdImage = trackData.coverArtImageUrl === null ? NO_ACOUSTID_IMAGE
                                                                      : trackData.coverArtImageUrl;
            self.track.tagDataUpdated();
        } else {
            return metadataRetriever.getImage(self.acoustId).then(function(info) {
                if (info) {
                    if (info.acoustId.type === "release") {
                        tagDatabase.updateCoverArtImageUrl(self.track.getUid(), info.url);
                        self._image = info.image;
                    } else if (info.acoustId.type === "release-group") {
                        tagDatabase.setAlbumImage(self.album, info.url);
                        urlImgMap[self.album.toLowerCase()] = info.image;
                    }
                    self._acoustIdImage = info.url;
                } else {
                    var failedBecauseOffline = !navigator.onLine;
                    if (!failedBecauseOffline) {
                        tagDatabase.updateCoverArtImageUrl(self.track.getUid(), null);
                        self._acoustIdImage = NO_ACOUSTID_IMAGE;
                    }
                }
                self.track.tagDataUpdated();
                return null;
            }).catch(Promise.TimeoutError, function ignore() {});
        }
    });
};

TagData.prototype.hasAcoustIdImage = function() {
    return urlImgMap[this.album.toLowerCase()] ||
            typeof this._acoustIdImage === "string";
};

TagData.prototype.shouldRetrieveAcoustIdImage = function() {
    return this.acoustId && this._acoustIdImage === null && !urlImgMap[this.album.toLowerCase()];
};

TagData.prototype.setAcoustId = function(acoustId) {
    this.acoustId = acoustId;
    this.updateFieldsFromAcoustId(acoustId);
    this.track.tagDataUpdated();
};

TagData.prototype.setDataFromTagDatabase = function(data) {
    this.beginSilenceLength = data.silence && data.silence.beginSilenceLength ||
                              this.beginSilenceLength ||
                              0;
    this.endSilenceLength = data.silence && data.silence.endSilenceLength ||
                            this.endSilenceLength ||
                            0;
    this.acoustId = data.acoustId || this.acoustId|| null;
    if (this.acoustId) this.updateFieldsFromAcoustId(this.acoustId);
    this.trackGain = data.trackGain;
    this.trackPeak = data.trackPeak || 1;
    this.albumGain = data.albumGain;
    this.albumPeak = data.albumPeak || 1;
    this._formattedTime = null;
    this.basicInfo.duration = data.duration || this.duration || NaN;
    this.rating = data.rating || -1;
    this.track.tagDataUpdated();
};

return TagData; })();
