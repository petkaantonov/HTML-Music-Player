import {capitalize, formatTagString, toTimeString} from "util";
import {URL, Image} from "platform/platform";

const separatorPattern = /(.+)\s*-\s*(.+)/;
const UNKNOWN = `Unknown`;
const INITIAL = 1;
const NO_IMAGE_FOUND = 2;
const PENDING_IMAGE = 3;
const HAS_IMAGE = 4;
const albumNameToCoverArtUrlMap = Object.create(null);

export const stripExtensionPattern = new RegExp(`\\.(?:[a-z0-9_\\-]{1,8})$`, `i`);
export const trackInfoFromFileName = function(inputFileName) {
    const fileName = inputFileName.replace(stripExtensionPattern, ``);
    const matches = fileName.match(separatorPattern);
    let artist, title;

    if (!matches) {
        title = capitalize(fileName);
        artist = UNKNOWN;
    } else {
        artist = capitalize(matches[1]) || UNKNOWN;
        title = capitalize(matches[2]) || UNKNOWN;
    }

    return {
        artist,
        title
    };
};

function TagData(track, data, context) {
    this.track = track;

    this.title = data.title || null;
    this.artist = data.artist || null;
    this.album = data.album || null;
    this.taggedArtist = this.artist;
    this.taggedTitle = this.title;
    this.taggedAlbum = this.album;
    this.albumArtist = data.albumArtist || (data.compilationFlag ? `Various Artists` : null);

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

    this.skipCounter = 0;
    this.playthroughCounter = 0;
    this.lastPlayed = 0;
    this.pictures = data.pictures || [];

    this._formattedTime = null;
    this._formattedName = null;
    this._coverArtImageState = INITIAL;

    this._hasBeenAnalyzed = false;

    this.beginSilenceLength = 0;
    this.endSilenceLength = 0;

    this._context = context;
    this._stateId = 1;
}

TagData.prototype._stateUpdate = function() {
    // NOOP
};

TagData.prototype.hasSufficientMetadata = function() {
    return this.taggedArtist !== null &&
            this.taggedTitle !== null &&
            this.pictures.length > 0;
};

TagData.prototype.getStateId = function() {
    return this._stateId;
};

TagData.prototype.playerMetadata = function() {
    const {encoderDelay, encoderPadding} = this;
    return {encoderDelay, encoderPadding};
};

TagData.prototype.formatTime = function() {
    if (this._formattedTime !== null) return this._formattedTime;
    if (!this.basicInfo.duration) {
        this._formattedTime = ``;
        return ``;
    }
    const duration = Math.max(0, this.basicInfo.duration - this.getTotalSilenceLength());
    return (this._formattedTime = toTimeString(duration));
};

TagData.prototype.ensureArtistAndTitle = function() {
    if (!this.title || !this.artist) {
        const artistAndTitle = trackInfoFromFileName(this.track.getFileName());
        this.artist = this.artist || artistAndTitle.artist || UNKNOWN;
        this.title = this.title || artistAndTitle.title || UNKNOWN;
    }
};

TagData.prototype.formatName = function() {
    if (this._formattedName !== null) return this._formattedName;
    this.ensureArtistAndTitle();
    return (this._formattedName = `${this.artist} - ${this.title}`);
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
    this._context.usageData.rateTrack(this.track, this.rating);
};

TagData.prototype.unsetRating = function() {
    this.rating = -1;
    this._context.usageData.rateTrack(this.track, this.rating);
};

TagData.prototype.albumNameKey = function() {
    return (`${this.album} ${this.albumArtist}`).toLowerCase();
};

TagData.prototype.maybeCoverArtImage = function() {
    if (!this.album) return null;
    const mapped = albumNameToCoverArtUrlMap[this.albumNameKey()];
    if (mapped) {
        const ret = new Image();
        ret.src = mapped;
        ret.tag = this.albumNameKey();
        ret.promise = new Promise((resolve, reject) => {
            ret.addEventListener(`load`, resolve, false);
            ret.addEventListener(`error`, () => {
                albumNameToCoverArtUrlMap[ret.tag] = null;
                reject(new Error(`invalid image`));
            }, false);
        });
        return ret;
    }
    return null;
};

const NULL_STRING = `\x00`;

const clearPicture = function(picture) {
    if (picture.blobUrl) {
        URL.revokeObjectURL(picture.blobUrl);
    }

    if (picture.blob) {
        picture.blob.close();
    }

    picture.blobUrl = picture.blob = picture.image = null;
};

const tagDatasHoldingPictures = [];

const addPictureHoldingTagData = function(tagData) {
    tagDatasHoldingPictures.push(tagData);

    if (tagDatasHoldingPictures.length > 50) {
        while (tagDatasHoldingPictures.length > 25) {
            tagDatasHoldingPictures.shift().reclaimPictures();
        }
    }
};

const removePictureHoldingTagData = function(tagData) {
    const i = tagDatasHoldingPictures.indexOf(tagData);
    if (i >= 0) {
        tagDatasHoldingPictures.splice(i, 1);
    }
};

TagData.prototype.reclaimPictures = function() {
    for (let i = 0; i < this.pictures.length; ++i) {
        const picture = this.pictures[i];
        if (picture.blobUrl) {
            URL.revokeObjectURL(picture.blobUrl);
        }
        picture.blobUrl = picture.image = null;
    }
};

TagData.prototype._getEmbeddedImage = function() {
    let clear, error;
    const picture = this.pictures[0];
    if (picture.image) {
        return picture.image;
    }

    addPictureHoldingTagData(this);
    const img = new Image();
    picture.image = img;
    img.tag = picture.tag;
    let blobUrl;

    clear = () => {
        img.removeEventListener(`load`, clear, false);
        img.removeEventListener(`error`, error, false);
        if (!clear) {
            return;
        }
        clear = error = picture.blobUrl = null;
        URL.revokeObjectURL(blobUrl);

    };

    error = () => {
        clear();
        const i = this.pictures.indexOf(picture);
        if (i >= 0) {
            this.pictures.splice(i, 1);
        }
        clearPicture(picture);
    };

    img.addEventListener(`load`, clear, false);
    img.addEventListener(`error`, error, false);

    if (picture.blobUrl) {
        img.src = picture.blobUrl;
        img.blob = picture.blob;
        blobUrl = img.src;
        if (img.complete) {
            clear();
        }
        return img;
    }

    const url = URL.createObjectURL(picture.blob);
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
    this._context.search.removeFromSearchIndex(this.track);
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
        let searchTermsUpdated = false;
        if (acoustId.artist && acoustId.artist.name && !this.taggedArtist) {
            this.artist = formatTagString(acoustId.artist.name);
            searchTermsUpdated = true;
        }

        if (acoustId.title && acoustId.title.name && !this.taggedTitle) {
            this.title = formatTagString(acoustId.title.name);
            searchTermsUpdated = true;
        }
        if (acoustId.album && acoustId.album.name &&!this.taggedAlbum) {
            this.album = formatTagString(acoustId.album.name);
            searchTermsUpdated = true;
        }

        if (searchTermsUpdated) {
            this._context.search.updateSearchIndex(this.track, {
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

TagData.prototype.recordSkip = function() {
    this.skipCounter++;
    this.lastPlayed = Date.now();
    this._context.usageData.setSkipCounter(this.track, this.skipCounter);
};

TagData.prototype.triggerPlaythrough = function() {
    this.playthroughCounter++;
    this.lastPlayed = Date.now();
    this._context.usageData.setPlaythroughCounter(this.track, this.playthroughCounter);
};

TagData.prototype.setLoudness = function(data, noUpdate = false) {
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

    if (!noUpdate) {
        this.track.tagDataUpdated();
    }
};

TagData.prototype.setDataFromTagDatabase = function(data) {
    this._stateUpdate();
    this._hasBeenAnalyzed = true;
    this.acoustId = data.acoustId || this.acoustId || null;
    if (this.acoustId) {
        this.updateFieldsFromAcoustId(this.acoustId);
    }
    this.skipCounter = +data.skipCounter || this.skipCounter || 0;
    this.playthroughCounter = +data.playthroughCounter || this.playthroughCounter || 0;
    this.lastPlayed = +data.lastPlayed || this.lastPlayed || 0;
    this._formattedTime = null;
    this.basicInfo.duration = data.duration || this.duration || NaN;
    this.rating = data.rating === undefined ? -1 : data.rating;
    if (data.loudness) {
        this.setLoudness(data.loudness, true);
    }
    this.track.tagDataUpdated();
};

export default class TagDataContext {
    constructor() {
        this.usageData = null;
        this.search = null;
    }

    setDeps(deps) {
        this.usageData = deps.usageData;
        this.search = deps.search;

    }
    create(track, data) {
        return new TagData(track, data, this);
    }
}
