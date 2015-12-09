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

    this._formattedTime = null;
    this._formattedName = null;
    this._image = null;

    this.beginSilenceLength = this.basicInfo.encoderDelay || 0;
    this.endSilenceLength = this.basicInfo.encoderPadding || 0;
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
TagData.prototype.formatName = function() {
    if (this._formattedName !== null) return this._formattedName;
    if (!this.title && !this.artist) {
        var fileName = this.track.getFileName().replace(stripExtensionPattern, "");
        var matches = fileName.match(separatorPattern);
        var trackTitle;
        if (!matches) {
            trackTitle = util.capitalize(fileName);
        } else {
            trackTitle = util.capitalize(matches[1]) + " - " + util.capitalize(matches[2]);
        }

        return (this._formattedName = trackTitle);
    }
    var separator = this.artist && this.title ? " - " : "";
    var artist = this.artist ? this.artist : "";
    var title = this.title ? this.title : "";
    return (this._formattedName = artist + separator + title);
};

TagData.prototype.shouldCalculateReplayGain = function() {
    return this.getTrackGain() === 0;
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

TagData.prototype.getArtist = function() {
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
    if (!this.picture) return null;
    if (this._image) return this._image.cloneNode();

    var blob = this.track.getFile().slice(this.picture.start,
                                          this.picture.start + this.picture.length,
                                          this.picture.type);
    var url = URL.createObjectURL(blob);
    this._image = new Image();
    this._image.src = url;
    return this._image.cloneNode();
};

TagData.prototype.getImageUrl = function() {
    var ret = this.getImage();
    if (!ret) return null;
    return ret.src;
};

TagData.prototype.destroy = function() {
    if (this._image) {
        URL.revokeObjectURL(this._image.src);
        this._image = null;
    }
};

TagData.prototype.getTitleForSort = function() {
    if (this.title === null) return NULL_STRING;
    return this.title;
};

TagData.prototype.getAlbumForSort = function() {
    if (this.album === null) return NULL_STRING;
    return this.album;
};

TagData.prototype.getArtistForSort = function() {
    if (this.artist === null) return NULL_STRING;
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

TagData.prototype.setDataFromTagDatabase = function(data) {
    this.beginSilenceLength = data.silence && data.silence.beginSilenceLength ||
                              this.beginSilenceLength ||
                              0;
    this.endSilenceLength = data.silence && data.silence.endSilenceLength ||
                            this.endSilenceLength ||
                            0;
    this.trackGain = data.trackGain;
    this.trackPeak = data.trackPeak || 1;
    this.albumGain = data.albumGain;
    this.albumPeak = data.albumPeak || 1;
    this._formattedTime = null;
    this.basicInfo.duration = data.duration || this.duration || NaN;
    this.rating = data.rating || -1;
    this.track.tagDataUpdated();
};
