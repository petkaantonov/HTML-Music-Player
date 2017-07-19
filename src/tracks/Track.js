import EventEmitter from "events";
import {getSearchTerm} from "search/searchUtil";
import {indexedDB} from "platform/platform";
import {getFileCacheKey} from "metadata/MetadataManager";
import {hexString} from "util";

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

const uidsToTrack = new Map();
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

export default class Track extends EventEmitter {
    constructor(audioFile) {
        super();
        this.file = audioFile;
        this.tagData = null;
        this.index = -1;
        this._error = null;
        this._uid = null;
        this._transientId = ++nextTransientId;
        this._isDisplayedAsSearchResult = false;
        this._searchTerm = null;
        this._weight = 3;
        this._weightDeadline = -1;
    }


    transientId() {
        return this._transientId;
    }

    getArtistAndTitle() {
        if (!this.tagData) {
            return {artist: `Unknown artist`, title: `Unknown title`};
        } else {
            return {artist: this.tagData.getArtist(), title: this.tagData.getTitle()};
        }
    }

    shouldDisplayAsSearchResult() {
        return !this.isDetachedFromPlaylist() && this.tagData && !this._isDisplayedAsSearchResult;
    }

    matches(matchers) {
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
    }

    isAvailableOffline() {
        return true;
    }

    isSyncedToCloud() {
        return false;
    }

    willBeReplaced() {
        // NOOP
    }

    stageRemoval() {
        this.unsetError();
        this.setIndex(-1);
        this.emit(`viewUpdate`, `viewUpdateDestroyed`);
        this.emit(`destroy`, this);
        if (this.tagData) {
            delete transientIdToTrack[this.transientId()];
        }
    }

    unstageRemoval() {
        if (this.tagData) {
            transientIdToTrack[this.transientId()] = this;
        }
    }

    destroy() {
        this.unsetError();
        this.setIndex(-1);
        this.emit(`viewUpdate`, `viewUpdateDestroyed`);
        this.emit(`destroy`, this);

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

        if (this._uid) {
            const key = hexString(this._uid);
            const entry = uidsToTrack.get(key);
            if (!Array.isArray(entry)) {
                uidsToTrack.delete(entry);
            } else {
                const i = entry.indexOf(this);
                if (i >= 0) {
                    entry.splice(i, 1);
                }
                if (entry.length === 0) {
                    uidsToTrack.delete(key);
                }
            }
            this._uid = null;
        }
    }

    isDetachedFromPlaylist() {
        return this.index === -1;
    }

    getIndex() {
        return this.index;
    }

    setIndex(index) {
        if (this.index === index) return;
        this.index = index;
        this.emit(`viewUpdate`, `viewUpdatePositionChange`);
        this.emit(`indexChange`);
    }

    stopPlaying() {
        this.emit(`viewUpdate`, `viewUpdatePlayingStatusChange`, false);
    }

    startPlaying() {
        this.emit(`viewUpdate`, `viewUpdatePlayingStatusChange`, true);
    }

    unsetError() {
        this._error = null;
        this.emit(`viewUpdate`, `viewUpdateHideErrorStatus`);
        this._weightChanged();
    }

    setError(message) {
        this._error = message;
        this.emit(`viewUpdate`, `viewUpdateShowErrorStatus`);
        this._weightChanged();
    }

    hasError() {
        return !!this._error;
    }

    getFileName() {
        return this.file.name;
    }

    getFileSize() {
        return this.file.size;
    }

    getFile() {
        return this.file;
    }

    getTagData() {
        return this.tagData;
    }

    setTagData(tagData) {
        if (this.tagData !== null) {
            return;
        }
        this.tagData = tagData;
        transientIdToTrack[this.transientId()] = this;
        this.tagDataUpdated();
    }

    formatFullName() {
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
    }

    formatName() {
        const {artist, title} = this.getArtistAndTitle();
        return `${artist} - ${title}`;
    }

    formatTime() {
        if (this.tagData !== null) {
            return this.tagData.formatTime();
        }
        return ``;
    }

    needsParsing() {
        return (this.tagData === null && !this._error);
    }

    getDuration() {
        return this.tagData ? this.tagData.duration : 0;
    }

    rate(value) {
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
    }

    getRating() {
        if (!this.tagData) return -1;
        return this.tagData.getRating();
    }

    isRated() {
        if (!this.tagData) return false;
        return this.tagData.isRated();
    }

    tagDataUpdated() {
        this.emit(`tagDataUpdate`, this);
        this.emit(`viewUpdate`, `viewUpdateTagDataChange`);
        this._weightChanged();
    }

    async uidEquals(uid) {
        const thisUid = await this.uid();
        return indexedDB.cmp(thisUid, uid) === 0;
    }

    async uid() {
        if (this._uid) return this._uid;
        this._uid = await getFileCacheKey(this.file);
        const key = hexString(this._uid);
        const entry = uidsToTrack.get(key);
        if (!entry) {
            uidsToTrack.set(key, this);
        } else if (!Array.isArray(entry)) {
            uidsToTrack.set(key, [entry, this]);
        } else {
            entry.push(this);
        }
        return this._uid;
    }

    comesBeforeInSameAlbum(otherTrack) {
        return this.isFromSameAlbumAs(otherTrack) &&
            this.tagData.albumIndex === otherTrack.tagData.albumIndex - 1;
    }

    comesAfterInSameAlbum(otherTrack) {
        return this.isFromSameAlbumAs(otherTrack) &&
            this.tagData.albumIndex === otherTrack.tagData.albumIndex + 1;
    }

    isFromSameAlbumAs(otherTrack) {
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
    }

    getSkipCount() {
        if (this.tagData) {
            return this.tagData.skipCounter;
        }
        return 0;
    }

    recordSkip() {
        if (this.tagData) {
            this.tagData.recordSkip();
            this._weightChanged();
        }
    }

    triggerPlaythrough() {
        if (this.hasError()) {
            this.unsetError();
        }
        if (this.tagData) {
            this.tagData.triggerPlaythrough();
            this._weightChanged();
        }
    }

    getPlaythroughCount() {
        if (!this.tagData) return false;
        return this.tagData.playthroughCounter;
    }

    getLastPlayed() {
        if (!this.tagData) return 0;
        return this.tagData.lastPlayed;
    }

    hasBeenPlayedWithin(time) {
        return this.getLastPlayed() >= time;
    }

    getFormat(initialBytes) {
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
    }

    _weightChanged() {
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
    }

    getWeight(currentTrack, nextTrack) {
        if (this === currentTrack || this === nextTrack) {
            return 0;
        }

        return this._weight;
    }
}

export const byTransientId = function(transientId) {
    return transientIdToTrack[transientId];
};

export const tracksByUid = function(uid) {
    const entry = uidsToTrack.get(hexString(uid));
    if (!entry) {
        return [];
    } else if (!Array.isArray(entry)) {
        return [entry];
    } else {
        return entry;
    }
};
