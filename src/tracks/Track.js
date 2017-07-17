import EventEmitter from "events";
import {inherits} from "util";
import {getSearchTerm} from "search/searchUtil";
import {URL} from "platform/platform";
import {getFileCacheKey} from "audio/backend/MetadataParser";

export const DECODE_ERROR = `The file could not be decoded. Check that the codec is supported and the file is not corrupted.`;
export const FILESYSTEM_ACCESS_ERROR = `Access to the file was denied. It has probably been moved or altered after being added to the playlist.`;
export const UNKNOWN_ERROR = `Unknown error`;
export const WAV = 0;
export const MP3 = 1;
export const AAC = 2;
export const WEBM = 3;
export const OGG = 4;
export const UNKNOWN_FORMAT = 9999;
const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/;

const FORMATS = [
    [/^(audio\/vnd.wave|audio\/wav|audio\/wave|audio\/x-wav)$/, WAV],
    [/^(audio\/mpeg|audio\/mp3)$/, MP3],
    [/^(audio\/aac|audio\/aacp|audio\/3gpp|audio\/3gpp2|audio\/mp4|audio\/MP4A-LATM|audio\/mpeg4-generic)$/, AAC],
    [/^(audio\/webm)$/, WEBM],
    [/^(audio\/ogg|application\/ogg|audio\/x-ogg|application\/x-ogg)$/, OGG]
];

const ONE_HOUR_MS = 60 * 60 * 1000;
const QUARTER_HOUR_MS = 15 * 60 * 1000;

const transientIdToTrack = Object.create(null);
let nextTransientId = 10000;

const tracksWithWeightDeadline = new Set();

export function timerTick(now) {
    for (const track of tracksWithWeightDeadline) {
        if (now > track._weightDeadline) {
            track._weightChanged();
        }
    }
}

export default function Track(audioFile) {
    EventEmitter.call(this);
    this.file = audioFile;
    this.tagData = null;
    this.index = -1;
    this._error = null;
    this._uid = null;
    this._transientId = ++nextTransientId;
    this._generatedImage = null;
    this._isBeingAnalyzed = false;
    this._isDisplayedAsSearchResult = false;
    this._searchTerm = null;
    this._weight = 3;
    this._weightDeadline = -1;
}
inherits(Track, EventEmitter);

Track.prototype.transientId = function() {
    return this._transientId;
};

Track.prototype.getArtistAndTitle = function() {
    if (!this.tagData) {
        return {artist: `Unknown artist`, title: `Unknown title`};
    } else {
        return {artist: this.tagData.getArtist(), title: this.tagData.getTitle()};
    }
};

Track.prototype.shouldDisplayAsSearchResult = function() {
    return !this.isDetachedFromPlaylist() && this.tagData && !this._isDisplayedAsSearchResult;
};

Track.prototype.matches = function(matchers) {
    if (!this.tagData) return false;

    if (!this._searchTerm) {
        this._searchTerm = getSearchTerm(this.tagData, this.file);
    }
    for (let i = 0; i < matchers.length; ++i) {
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
        } catch (e) {
            // NOOP
        }
        this._generatedImage = null;
    }
};

Track.prototype.stageRemoval = function() {
    this.unsetError();
    this.setIndex(-1);
    this.emit(`viewUpdate`, `viewUpdateDestroyed`);
    this.emit(`destroy`, this);
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
    this.unsetError();
    this.setIndex(-1);
    this.emit(`viewUpdate`, `viewUpdateDestroyed`);
    this.emit(`destroy`, this);

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

Track.prototype.getImage = async function(pictureManager) {
    let image;
    if (this.tagData) {
        image = this.tagData.getImage();
    }
    if (!image) {
        image = this._generatedImage;
    }
    if (!image) {
        if (!this.tagData) {
            return pictureManager.defaultImage();
        }
        const result = await pictureManager.generateImageForTrack(this);
        this._generatedImage = result;
        result.tag = await this.uid();
        return result;
    }

    if (image.promise) {
        try {
            await image.promise;
            return image;
        } catch (e) {
            image.src = ``;
            if (image.blob) {
                image.blob.close();
                image.blob = null;
            }
            const result = await pictureManager.generateImageForTrack(this);
            this._generatedImage = result;
            result.tag = await this.uid();
            return this._generatedImage;
        }
    }
    return image;
};

Track.prototype.isDetachedFromPlaylist = function() {
    return this.index === -1;
};

Track.prototype.getIndex = function() {
    return this.index;
};

Track.prototype.setIndex = function(index) {
    if (this.index === index) return;
    this.index = index;
    this.emit(`viewUpdate`, `viewUpdatePositionChange`);
    this.emit(`indexChange`);
};

Track.prototype.stopPlaying = function() {
    this.emit(`viewUpdate`, `viewUpdatePlayingStatusChange`, false);
};

Track.prototype.startPlaying = function() {
    this.emit(`viewUpdate`, `viewUpdatePlayingStatusChange`, true);
};

Track.prototype.unsetError = function() {
    this._error = null;
    this.emit(`viewUpdate`, `viewUpdateHideErrorStatus`);
    this._weightChanged();
};

Track.prototype.setError = function(message) {
    if (this._error) {
        this._error = null;
        this.emit(`viewUpdate`, `viewUpdateHideErrorStatus`);
    }
    this._error = message;
    this.emit(`viewUpdate`, `viewUpdateShowErrorStatus`);
    this._weightChanged();
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
    if (this.tagData !== null) throw new Error(`cannot set tagData again`);
    this.tagData = tagData;
    transientIdToTrack[this.transientId()] = this;
    this.tagDataUpdated();
};

Track.prototype.formatFullName = function() {
    let name = this.formatName();
    if (this.tagData && this.tagData.getAlbum()) {
        const {albumIndex, trackCount} = this.tagData;
        let position = ``;
        if (albumIndex !== -1 && trackCount === -1) {
            position = ` #${albumIndex}`;
        } else if (albumIndex !== -1 && trackCount !== -1) {
            position = ` #${albumIndex}/${trackCount}`;
        }

        name = `${name} [${this.tagData.getAlbum()}${position}]`;
    }
    return name;
};

Track.prototype.formatName = function() {
    const {artist, title} = this.getArtistAndTitle();
    return `${artist} - ${title}`;
};

Track.prototype.formatTime = function() {
    if (this.tagData !== null) {
        return this.tagData.formatTime();
    }
    return ``;
};

Track.prototype.needsParsing = function() {
    return (this.tagData === null || !this.tagData.hasBeenAnalyzed()) && !this._error;
};

Track.prototype.getDuration = function() {
    return this.tagData ? this.tagData.duration : 0;
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
    this.emit(`tagDataUpdate`, this);
    this.emit(`viewUpdate`, `viewUpdateTagDataChange`);
    this._weightChanged();
};

Track.prototype.uid = async function() {
    if (this._uid) return this._uid;
    this._uid = await getFileCacheKey(this.file);
    return this._uid;
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
    const thisTagData = this.getTagData();
    const otherTagData = otherTrack.getTagData();

    if (!thisTagData || !otherTagData) {
        return false;
    }

    const thisAlbum = thisTagData.getAlbum();
    const otherAlbum = otherTagData.getAlbum();

    if (!thisAlbum || !otherAlbum) {
        return false;
    }

    return thisAlbum === otherAlbum &&
           thisTagData.albumArtist === otherTagData.albumArtist;
};

Track.prototype.getSkipCount = function() {
    if (this.tagData) {
        return this.tagData.skipCounter;
    }
    return 0;
};

Track.prototype.recordSkip = function() {
    if (this.tagData) {
        this.tagData.recordSkip();
        this._weightChanged();
    }
};

Track.prototype.triggerPlaythrough = function() {
    if (this.hasError()) {
        this.unsetError();
    }
    if (this.tagData) {
        this.tagData.triggerPlaythrough();
        this._weightChanged();
    }
};

Track.prototype.getPlaythroughCount = function() {
    if (!this.tagData) return false;
    return this.tagData.playthroughCounter;
};

Track.prototype.getLastPlayed = function() {
    if (!this.tagData) return 0;
    return this.tagData.lastPlayed;
};

Track.prototype.hasBeenPlayedWithin = function(time) {
    return this.getLastPlayed() >= time;
};

Track.prototype.shouldRetrieveAcoustIdImage = function() {
    return !!(this.tagData && this.tagData.shouldRetrieveAcoustIdImage());
};

Track.prototype.getFormat = function(initialBytes) {
    const type = this.file.type.toLowerCase();
    let matches;
    if (type) {
        matches = FORMATS.filter(v => v[0].test(type));
    }

    if (type && matches.length) {
        return matches[0][1];
    } else if (!type) {
        const match = rType.exec(initialBytes);

        if (match) {
            for (let i = 0; i < FORMATS.length; ++i) {
                if (match[FORMATS[i][1] + 1] !== undefined) {
                    return FORMATS[i][1];
                }
            }
        }

        return UNKNOWN_FORMAT;
    } else {
        return UNKNOWN_FORMAT;
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

Track.prototype._weightChanged = function() {
    if (this.hasError()) {
        this._weight = 0;
    } else {
        const rating = this.isRated() ? this.getRating() : 3;
        let weight = Math.pow(1.5, rating - 1) * 3;
        const now = Date.now();

        if (this.hasBeenPlayedWithin(now - QUARTER_HOUR_MS)) {
            weight = 0;
            this._weightDeadline = this.getLastPlayed() + QUARTER_HOUR_MS;
            tracksWithWeightDeadline.add(this);
        } else if (this.hasBeenPlayedWithin(now - ONE_HOUR_MS)) {
            weight /= 9;
            this._weightDeadline = this.getLastPlayed() + ONE_HOUR_MS;
            tracksWithWeightDeadline.add(this);
        } else {
            this._weightDeadline = -1;
            tracksWithWeightDeadline.delete(this);
        }
        this._weight = Math.ceil(weight);
    }
};

Track.prototype.getWeight = function(currentTrack, nextTrack) {
    if (this === currentTrack || this === nextTrack) {
        return 0;
    }

    return this._weight;
};

export const byTransientId = function(transientId) {
    return transientIdToTrack[transientId];
};
