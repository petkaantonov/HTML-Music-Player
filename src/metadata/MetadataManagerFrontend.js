import {METADATA_MANAGER_READY_EVENT_NAME,
            ALBUM_ART_RESULT_MESSAGE,
            ACOUST_ID_DATA_RESULT_MESSAGE,
            METADATA_RESULT_MESSAGE,
        fileReferenceToTrackUid} from "metadata/MetadataManagerBackend";
import EventEmitter from "events";
import {indexedDB} from "platform/platform";
import {hexString, toTimeString, ownPropOr} from "util";
import WorkerFrontend from "WorkerFrontend";

const NULL_STRING = `\x00`;
const ONE_HOUR_MS = 60 * 60 * 1000;
const QUARTER_HOUR_MS = 15 * 60 * 1000;
const tracksWithWeightDeadline = new Set();

export function timerTick(now) {
    for (const track of tracksWithWeightDeadline) {
        if (now > track._weightDeadline) {
            track._weightChanged();
        }
    }
}

export const VIEW_UPDATE_EVENT = `viewUpdate`;
export const TAG_DATA_UPDATE_EVENT = `tagDataUpdate`;

class Track extends EventEmitter {
    constructor(fileReference, uid, metadataManager) {
        super();
        this._uid = uid;
        this._fileReference = fileReference;
        this._error = null;
        this._offline = true;
        this._weight = 3;
        this._weightDeadline = -1;
        this._metadataManager = metadataManager;
        this._title = `Unknown title`;
        this._artist = `Unknown artist`;
        this._album = null;
        this._albumArtist = null;
        this._autogenerated = false;
        this._duration = 0;
        this._sampleRate = 44100;
        this._channels = 2;
        this._year = null;
        this._genres = null;
        this._albumIndex = 0;
        this._trackCount = 1;
        this._rating = -1;
        this._skipCounter = 0;
        this._playthroughCounter = 0;
        this._lastPlayed = new Date(0);
        this._albumForSort = null;
        this._discNumber = 0;
        this._discCount = 1;

        this._formattedName = null;
        this._formattedFullName = null;
        this._formattedTime = null;
    }

    updateFields(trackInfo) {
        this._title = trackInfo.title;
        this._artist = trackInfo.artist;
        this._album = trackInfo.album;
        this._albumArtist = trackInfo.albumArtist;
        this._autogenerated = trackInfo.autogenerated;
        this._duration = trackInfo.duration;
        this._sampleRate = trackInfo.sampleRate;
        this._channels = trackInfo.channels;
        this._year = trackInfo.year;
        this._genres = trackInfo.genres;
        this._albumIndex = trackInfo.albumIndex;
        this._trackCount = trackInfo.trackCount;
        this._rating = trackInfo.rating;
        this._skipCounter = trackInfo.skipCounter;
        this._playthroughCounter = trackInfo.playthroughCounter;
        this._lastPlayed = trackInfo.lastPlayed;
        this._albumForSort = `${this._album} ${this._albumArtist}`.toLowerCase();

        this._discNumber = ownPropOr(trackInfo, `discNumber`, this._discNumber);
        this._discCount = ownPropOr(trackInfo, `discCount`, this._discCount);

        this._formattedName = null;
        this._formattedFullName = null;
        this._formattedTime = null;
        this.tagDataUpdated();
    }

    isAvailableOffline() {
        return this._offline;
    }

    stopPlaying() {
        this.emit(VIEW_UPDATE_EVENT, `viewUpdatePlayingStatusChange`, false);
    }

    startPlaying() {
        this.emit(VIEW_UPDATE_EVENT, `viewUpdatePlayingStatusChange`, true);
    }

    unsetError() {
        this._error = null;
        this.emit(VIEW_UPDATE_EVENT, `viewUpdateHideErrorStatus`);
        this._weightChanged();
    }

    setError(message) {
        this._error = message;
        this.emit(VIEW_UPDATE_EVENT, `viewUpdateShowErrorStatus`);
        this._weightChanged();
    }

    hasError() {
        return !!this._error;
    }

    getFileReference() {
        return this._fileReference;
    }

    getSampleRate() {
        return this._sampleRate;
    }

    formatFullName() {
        if (this._formattedFullName) {
            return this._formattedFullName;
        }
        let name = this.formatName();
        if (this._album) {
            const {_albumIndex: albumIndex, _trackCount: trackCount} = this;
            let position = ``;
            if (albumIndex !== -1 && trackCount === -1) {
                position = ` #${albumIndex}`;
            } else if (albumIndex !== -1 && trackCount !== -1) {
                position = ` #${albumIndex}/${trackCount}`;
            }
            name = `${name} [${this._album}${position}]`;
        }
        this._formattedFullName = name;
        return name;
    }

    formatName() {
        if (this._formattedName) {
            return this._formattedName;
        }
        const {_artist, _title} = this;
        const ret = `${_artist} - ${_title}`;
        this._formattedName = ret;
        return ret;
    }

    formatTime() {
        if (this._formattedTime === null) {
            return this._formattedTime;
        }

        let result;

        if (this._duration === 0) {
            result = ``;
        } else {
            result = toTimeString(this._duration);
        }
        this._formattedTime = result;
        return result;
    }

    getDuration() {
        return this._duration;
    }

    tagDataUpdated() {
        this.emit(TAG_DATA_UPDATE_EVENT, this);
        this.emit(VIEW_UPDATE_EVENT, `viewUpdateTagDataChange`);
        this._weightChanged();
    }

    uidEquals(uid) {
        return indexedDB.cmp(this.uid(), uid) === 0;
    }

    uid() {
        return this._uid;
    }

    comesBeforeInSameAlbum(otherTrack) {
        return this.isFromSameAlbumAs(otherTrack) && this._albumIndex === otherTrack._albumIndex - 1;
    }

    comesAfterInSameAlbum(otherTrack) {
        return this.isFromSameAlbumAs(otherTrack) && this._albumIndex === otherTrack._albumIndex + 1;
    }

    isFromSameAlbumAs(otherTrack) {
        if (!otherTrack) return false;
        if (otherTrack === this) return true;
        if (!otherTrack._album || !this._album) return false;

        return this._album === otherTrack._album &&
               this._albumArtist === otherTrack._albumArtist;
    }

    rate(value) {
        if (value === -1) {
            this._rating = -1;
            this._metadataManager.unrate(this);
        } else {
            value = Math.max(1, Math.min(+value, 5));
            this._rating = value;
            this._metadataManager.rate(this, value);
        }
    }

    getRating() {
        return this._rating;
    }

    isRated() {
        return this._rating !== -1;
    }

    getSkipCount() {
        return this._skipCounter;
    }

    recordSkip() {
        this._skipCounter++;
        this._lastPlayed = new Date();
        this._metadataManager.recordSkip(this);
        this._weightChanged();
    }

    triggerPlaythrough() {
        if (this.hasError()) {
            this.unsetError();
        }
        this._playthroughCounter++;
        this._lastPlayed = new Date();
        this._metadataManager.recordPlaythrough(this);
        this._weightChanged();
    }

    getPlaythroughCount() {
        return this._playthroughCounter;
    }

    getLastPlayed() {
        return this._lastPlayed;
    }

    hasBeenPlayedWithin(time) {
        return +this.getLastPlayed() >= +time;
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

    getTitleForSort() {
        return this._title;
    }

    getAlbumArtistForSort() {
        if (this._albumArtist === null) return NULL_STRING;
        return this._albumArtist;
    }

    getAlbumForSort() {
        return this._albumForSort;
    }

    getArtistForSort() {
        return this._artist;
    }

    getDiscNumberForSort() {
        return this._discNumber;
    }

    getAlbumIndexForSort() {
        return this._albumIndex;
    }
}

export default class MetadataManagerFrontend extends WorkerFrontend {
    constructor(deps) {
        super(METADATA_MANAGER_READY_EVENT_NAME, deps.workerWrapper);
        this._env = deps.env;
        this._tagDataContext = deps.tagDataContext;
        this._uidsToTrack = new Map();
    }

    receiveMessage(event) {
        if (!event.data) return;
        const {result, type} = event.data;

        if (type === ALBUM_ART_RESULT_MESSAGE) {
            this.albumArtResultReceived(result);
        } else if (type === ACOUST_ID_DATA_RESULT_MESSAGE) {
            this.acoustIdDataFetched(result);
        } else if (type === METADATA_RESULT_MESSAGE) {
            this.trackMetadataParsed(result);
        }
    }

    albumArtResultReceived(albumArtResult) {
        const {trackUid, albumArt, requestReason} = albumArtResult;
        if (albumArt) {
            const track = this.getTrackByTrackUid(trackUid);
            this.emit(`albumArt`, track, albumArt, requestReason);
        }
    }

    acoustIdDataFetched(acoustIdResult) {
        const {trackInfo, trackInfoUpdated} = acoustIdResult;
        const {trackUid} = trackInfo;
        const track = this.getTrackByTrackUid(trackUid);

        if (trackInfoUpdated) {
            track.updateFields(trackInfo);
        }
    }

    trackMetadataParsed(metadataResult) {
        const {trackInfo, trackUid, error} = metadataResult;
        const track = this.getTrackByTrackUid(trackUid);

        if (error) {
            track.setError(error && error.message || `${error}`);
        } else {
            track.updateFields(trackInfo);
        }
    }

    getAlbumArt(track, {artist, album, preference, requestReason}) {
        const trackUid = track.uid();
        this.postMessage({
            action: `getAlbumArt`,
            args: {trackUid, artist, album, preference, requestReason}
        });
    }

    parseMetadata(fileReference) {
        this.postMessage({action: `parseMetadata`, args: {fileReference}});
    }

    rate(track, rating) {
        this.postMessage({action: `setRating`, args: {trackUid: track.uid(), rating}});
    }

    unrate(track) {
        this.postMessage({action: `setRating`, args: {trackUid: track.uid(), rating: -1}});
    }

    recordSkip(track) {
        this.postMessage({action: `setSkipCounter`, args: {trackUid: track.uid(), counter: track._skipCounter, lastPlayed: track._lastPlayed}});
    }

    recordPlaythrough(track) {
        this.postMessage({action: `setPlaythroughCounter`, args: {trackUid: track.uid(), counter: track._playthroughCounter, lastPlayed: track._lastPlayed}});
    }

    async getTrackByFileReference(fileReference) {
        const trackUid = await fileReferenceToTrackUid(fileReference);
        const key = hexString(trackUid);
        const cached = this._uidsToTrack.get(key);
        if (cached) {
            return cached;
        }
        const track = new Track(fileReference, trackUid, this);
        this.parseMetadata(fileReference);
        this._uidsToTrack.set(key, track);
        return track;
    }

    getTrackByTrackUid(trackUid) {
        return this._uidsToTrack.get(hexString(trackUid));
    }
}
