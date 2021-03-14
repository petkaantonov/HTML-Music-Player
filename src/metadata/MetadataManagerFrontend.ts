import { SelectDeps } from "Application";
import * as io from "io-ts";
//@ts-ignore
import EventEmitter from "jsevents";
import {
    DatabaseClosedEmitterTrait,
    DatabaseClosedResult,
    DatabaseEventsMap,
} from "platform/DatabaseClosedEmitterTrait";
import Page from "platform/dom/Page";
import Env from "platform/Env";
import FileView from "platform/FileView";
import {
    QuotaExceededEmitterTrait,
    QuotaExceededEventsMap,
    QuotaExceededResult,
} from "platform/QuotaExceededEmitterTrait";
import { EventEmitterInterface } from "types/helpers";
import PermissionPrompt from "ui/PermissionPrompt";
import { CancellationToken } from "utils/CancellationToken";
import WorkerFrontend from "WorkerFrontend";
import ZipperFrontend from "zip/ZipperFrontend";

import { delay, hexDecode, hexString, ownPropOr, sha1Binary, toTimeString } from "../util";

export type FileReference = File | ArrayBuffer;

export const ALBUM_ART_RESULT_MESSAGE = `albumArtResult`;
export const ACOUST_ID_DATA_RESULT_MESSAGE = `acoustIdDataFetched`;
export const TRACKINFO_BATCH_RESULT_MESSAGE = `trackInfoBatchResult`;
export const ALL_FILES_PERSISTED_MESSAGE = `allFilesPersisted`;
export const MEDIA_LIBRARY_SIZE_COUNTED_MESSAGE = `mediaLibrarySizeCounted`;
export const UIDS_MAPPED_TO_FILES_MESSAGE = `uidsMappedToFiles`;
export const METADATA_RESULT_MESSAGE = `metadataResult`;
export const NEW_TRACK_FROM_TMP_FILE_MESSAGE = `newTrackFromTmpFile`;
export const FILE_REFERENCE_UNAVAILABLE_MESSAGE = `fileReferenceUnavailable`;
export const QUOTA_EXCEEDED_MESSAGE = `quotaExceeded`;
export const VIEW_UPDATE_EVENT = `viewUpdate`;
export const TAG_DATA_UPDATE_EVENT = `tagDataUpdate`;
export const ALL_FILES_PERSISTED_EVENT = `allFilesPersisted`;
export const MEDIA_LIBRARY_SIZE_CHANGE_EVENT = `mediaLibrarySizeChange`;
export const NEW_TRACK_FROM_TMP_FILE_EVENT = `newTrackFromTmpFile`;
export const TRACK_BACKING_FILE_REMOVED_EVENT = `TRACK_BACKING_FILE_REMOVED_EVENT`;

interface BaseMetaDataResult {
    type: string;
}

interface AlbumArtResult extends BaseMetaDataResult {
    type: "albumArt";
    albumArt: string | string[] | null;
    preference: AlbumArtPreference;
    requestReason: string;
    trackUid: ArrayBuffer;
}

interface AcoustIdResult extends BaseMetaDataResult {
    type: "acoustId";
    trackInfo: TrackInfo;
    trackInfoUpdated: boolean;
}

interface TrackMetadataResult extends BaseMetaDataResult {
    type: "trackMetadata";
    trackInfo?: TrackInfo;
    trackUid: ArrayBuffer;
    error?: {
        message: string;
    };
}

interface TrackInfoBatchResult extends BaseMetaDataResult {
    type: "trackInfoBatch";
    trackInfos: TrackInfo[];
}

interface AllFilesPersistedResult extends BaseMetaDataResult {
    type: "allFilesPersisted";
}

interface MediaLibrarySizeResult extends BaseMetaDataResult {
    type: "mediaLibrarySizeCount";
    count: number;
}

interface UidsMappedToFilesResult extends BaseMetaDataResult {
    type: "uidsMappedToFiles";
    files: File[];
}

interface NewTrackFromTmpFileResult extends BaseMetaDataResult {
    type: "newTrackFromTmpFile";
    trackInfo: TrackInfo;
}

interface FileReferenceUnavailableResult extends BaseMetaDataResult {
    type: "fileReferenceUnavailable";
    trackUid: ArrayBuffer;
}

export type MetadataResult =
    | AlbumArtResult
    | AcoustIdResult
    | TrackMetadataResult
    | TrackInfoBatchResult
    | AllFilesPersistedResult
    | MediaLibrarySizeResult
    | UidsMappedToFilesResult
    | NewTrackFromTmpFileResult
    | FileReferenceUnavailableResult
    | QuotaExceededResult
    | DatabaseClosedResult;

export const ALBUM_ART_PREFERENCE_SMALLEST = `smallest`;
export const ALBUM_ART_PREFERENCE_BIGGEST = `biggest`;
export const ALBUM_ART_PREFERENCE_ALL = `all`;

export const AlbumArtPreference = io.union([
    io.literal(ALBUM_ART_PREFERENCE_SMALLEST),
    io.literal(ALBUM_ART_PREFERENCE_BIGGEST),
    io.literal(ALBUM_ART_PREFERENCE_ALL),
]);
export type AlbumArtPreference = io.TypeOf<typeof AlbumArtPreference>;

interface BaseMetadataOpts {
    trackUid: ArrayBuffer;
}
interface CounterOpts extends BaseMetadataOpts {
    counter: number;
    lastPlayed: number;
}
interface RatingOpts extends BaseMetadataOpts {
    rating: number;
}
interface AlbumArtOptions extends BaseMetadataOpts {
    artist: string;
    album: string;
    preference: AlbumArtPreference;
    requestReason: string;
}

export interface MetadataManagerBackendActions<T> {
    setRating: (this: T, o: RatingOpts) => void;
    setSkipCounter: (this: T, o: CounterOpts) => void;
    setPlaythroughCounter: (this: T, o: CounterOpts) => void;
    getAlbumArt: (this: T, o: AlbumArtOptions) => void;
    parseMetadata: (this: T, o: { fileReference: FileReference }) => void;
    getTrackInfoBatch: (this: T, o: { batch: ArrayBuffer[] }) => void;
    mapTrackUidsToFiles: (this: T, o: { trackUids: ArrayBuffer[] }) => void;
    parseTmpFile: (this: T, o: { tmpFileId: string }) => void;
}

const NULL_STRING = `\x00`;
const ONE_HOUR_MS = 60 * 60 * 1000;
const QUARTER_HOUR_MS = 15 * 60 * 1000;
const tracksWithWeightDeadline = new Set<Track>();
const DEFAULT_ARTIST = `Unknown Artist`;
const DEFAULT_TITLE = `Unknown Title`;
const DEFAULT_ALBUM = `Unknown Album`;

export function timerTick(now: number) {
    for (const track of tracksWithWeightDeadline) {
        if (now > track._weightDeadline) {
            track._weightChanged();
        }
    }
}

export type CodecName = "mp3" | "wav" | "aac" | "webm" | "ogg" | "unknown";

export const ChannelCount = io.union([io.literal(1), io.literal(2), io.literal(3), io.literal(4), io.literal(5)]);
export type ChannelCount = io.TypeOf<typeof ChannelCount>;

interface CriticalDemuxData {
    duration: number;
    sampleRate: number;
    channels: ChannelCount;
}

export interface MetadataStoredPicture {
    image: Blob;
    picturetype: string;
    description: string;
}

export interface TagData {
    artist?: string;
    title?: string;
    album?: string;
    mood?: string;
    albumArtist?: string;
    albumIndex?: number;
    trackCount?: number;
    discNumber?: number;
    discCount?: number;
    compilationFlag?: boolean;
    beatsPerMinute?: number;
    year?: number;
    genres?: string[];
    pictures?: MetadataStoredPicture[];
    encoderDelay?: number;
    encoderPadding?: number;
}
export interface TagDataWithCriticalDemuxData extends TagData {
    demuxData: CriticalDemuxData;
}

export interface Mp3SeekTableI {
    isFromMetaData: boolean;
    framesPerEntry: number;
    tocFilledUntil: number;
    frames: number;
    table: number[];
    lastFrameSize: number;
    fillUntil: (time: number, metadata: TrackMetadata, fileView: FileView, t?: CancellationToken<any>) => void;
    closestFrameOf: (f: number) => number;
    offsetOfFrame: (f: number) => number;
}

export interface TrackMetadata {
    frames: number;
    encoderDelay: number;
    encoderPadding: number;
    paddingStartFrame: number;
    lsf: boolean;
    sampleRate: number;
    channels: ChannelCount;
    bitRate: number;
    dataStart: number;
    dataEnd: number;
    averageFrameSize: number;
    vbr: boolean;
    duration: number;
    samplesPerFrame: number;
    maxByteSizePerAudioFrame: number;
    seekTable: Mp3SeekTableI | null;
    toc: Uint8Array | null;
}

export interface TrackInfo extends TagData, CriticalDemuxData {
    albumIndex: number;
    trackCount: number;
    genres: string[];
    lastPlayed: Date;
    rating: number;
    playthroughCounter: number;
    skipCounter: number;
    hasBeenFingerprinted: boolean;
    hasInitialLoudnessInfo: boolean;
    trackUid: ArrayBuffer;
    codecName: null | CodecName;
    autogenerated: boolean;
    demuxData: Partial<TrackMetadata>;
}

export function fileReferenceToTrackUid(fileReference: FileReference) {
    if (fileReference instanceof File) {
        const file = fileReference;
        const maybeTrackUid = trackUidFromFile(file);
        if (maybeTrackUid) {
            return maybeTrackUid;
        }
        return sha1Binary(`${file.lastModified}-${file.name}-${file.size}-${file.type}`);
    } else if (fileReference instanceof ArrayBuffer) {
        return fileReference;
    } else {
        throw new Error(`invalid fileReference`);
    }
}

const TRACK_FILE_NAME_PREFIX = `trackUid-`;
const rTrackUid = new RegExp(String.raw`${TRACK_FILE_NAME_PREFIX}([a-fA-F0-9]{40})`);
export function trackUidFromFile(file: File) {
    const matches = rTrackUid.exec(file.name);
    if (matches) {
        return hexDecode(matches[1]!);
    }
    return null;
}

export class Track extends EventEmitter {
    _weightDeadline: number;
    _uid: ArrayBuffer;
    _fileReference: FileReference;
    _error: null | string;
    _isPlaying: boolean;
    _offline: boolean;
    _weight: number;
    _metadataManager: MetadataManagerFrontend;
    _title?: string | null;
    _artist?: string | null;
    _album?: string | null;
    _albumArtist?: string | null;
    _autogenerated: boolean;
    _duration: number;
    _sampleRate: number;
    _channels: number;
    _year: null | number;
    _genres: null | string[];
    _albumIndex: number;
    _trackCount: number;
    _rating: number;
    _skipCounter: number;
    _playthroughCounter: number;
    _lastPlayed: Date;
    _albumForSort: null | string;
    _discNumber: number;
    _discCount: number;
    _formattedName: null | string;
    _formattedFullName: null | string;
    _formattedTime: null | string;

    constructor(fileReference: FileReference, uid: ArrayBuffer, metadataManager: MetadataManagerFrontend) {
        super();
        this._uid = uid;
        this._fileReference = fileReference;
        this._error = null;
        this._isPlaying = false;
        this._offline = true;
        this._weight = 3;
        this._weightDeadline = -1;
        this._metadataManager = metadataManager;
        this._title = DEFAULT_TITLE;
        this._artist = DEFAULT_ARTIST;
        this._album = DEFAULT_ALBUM;
        this._albumArtist = this._artist;
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

    updateFields(trackInfo: TrackInfo) {
        this._title = trackInfo.title;
        this._artist = trackInfo.artist;
        this._album = trackInfo.album;
        this._albumArtist = trackInfo.albumArtist;
        this._autogenerated = trackInfo.autogenerated;
        this._duration = trackInfo.duration;
        this._sampleRate = trackInfo.sampleRate;
        this._channels = trackInfo.channels;
        this._year = trackInfo.year!;
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

    get fileReference() {
        return this._fileReference;
    }

    get sampleRate() {
        return this._sampleRate;
    }

    get duration() {
        return this._duration;
    }

    get artist() {
        return this._artist || DEFAULT_ARTIST;
    }

    get title() {
        return this._title || DEFAULT_TITLE;
    }

    get album() {
        return this._album || DEFAULT_ALBUM;
    }

    isAvailableOffline() {
        return this._offline;
    }

    stopPlaying() {
        this._isPlaying = false;
        this.emit("viewUpdated", `viewUpdatePlayingStatusChange`);
    }

    startPlaying() {
        this._isPlaying = true;
        this.emit("viewUpdated", `viewUpdatePlayingStatusChange`);
    }

    isPlaying() {
        return this._isPlaying;
    }

    unsetError() {
        this._error = null;
        this.emit("viewUpdated", `viewUpdateErrorStatusChange`);
        this._weightChanged();
    }

    setError(message: string) {
        this._error = message;
        this.emit("viewUpdated", `viewUpdateErrorStatusChange`);
        this._weightChanged();
    }

    hasError() {
        return !!this._error;
    }

    getFileReference() {
        return this._fileReference;
    }

    formatFullName() {
        if (this._formattedFullName) {
            return this._formattedFullName;
        }
        let name = this.formatName();
        if (this._album) {
            const { _albumIndex: albumIndex, _trackCount: trackCount } = this;
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
        const { _artist, _title } = this;
        const ret = `${_artist} - ${_title}`;
        this._formattedName = ret;
        return ret;
    }

    formatTime() {
        if (this._formattedTime !== null) {
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
        this.emit("tagDataUpdated", this);
        this.emit("viewUpdated", `viewUpdateTagDataChange`);
        this._weightChanged();
    }

    uidEquals(uid: ArrayBuffer) {
        return indexedDB.cmp(this.uid(), uid) === 0;
    }

    uid() {
        return this._uid;
    }

    comesBeforeInSameAlbum(otherTrack: Track) {
        return this.isFromSameAlbumAs(otherTrack) && this._albumIndex === otherTrack._albumIndex - 1;
    }

    comesAfterInSameAlbum(otherTrack: Track) {
        return this.isFromSameAlbumAs(otherTrack) && this._albumIndex === otherTrack._albumIndex + 1;
    }

    isFromSameAlbumAs(otherTrack: Track) {
        if (!otherTrack) return false;
        if (otherTrack === this) return true;
        if (!otherTrack._album || !this._album) return false;

        return this._album === otherTrack._album && this._albumArtist === otherTrack._albumArtist;
    }

    rate(value: number) {
        if (value === -1) {
            this._rating = -1;
            this._metadataManager._unrate(this);
        } else {
            value = Math.max(1, Math.min(+value, 5));
            this._rating = value;
            this._metadataManager._rate(this, value);
        }
        this.tagDataUpdated();
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
        this._metadataManager._recordSkip(this);
        this._weightChanged();
    }

    triggerPlaythrough() {
        if (this.hasError()) {
            this.unsetError();
        }
        this._playthroughCounter++;
        this._lastPlayed = new Date();
        this._metadataManager._recordPlaythrough(this);
        this._weightChanged();
    }

    getPlaythroughCount() {
        return this._playthroughCounter;
    }

    getLastPlayed() {
        return this._lastPlayed;
    }

    hasBeenPlayedWithin(time: number) {
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
                this._weightDeadline = this.getLastPlayed().valueOf() + QUARTER_HOUR_MS;
                tracksWithWeightDeadline.add(this);
            } else if (this.hasBeenPlayedWithin(now - ONE_HOUR_MS)) {
                weight /= 9;
                this._weightDeadline = this.getLastPlayed().valueOf() + ONE_HOUR_MS;
                tracksWithWeightDeadline.add(this);
            } else {
                this._weightDeadline = -1;
                tracksWithWeightDeadline.delete(this);
            }
            this._weight = Math.ceil(weight);
        }
    }

    getWeight(currentTrack: Track, nextTrack: Track) {
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

export interface TrackEventsMap {
    tagDataUpdated: (track: Track) => void;
    viewUpdated: (
        type: "viewUpdateTagDataChange" | "viewUpdateErrorStatusChange" | "viewUpdatePlayingStatusChange"
    ) => void;
}

export interface Track extends EventEmitterInterface<TrackEventsMap> {}

type Deps = SelectDeps<"permissionPrompt" | "workerWrapper" | "env" | "page" | "zipper">;

export default class MetadataManagerFrontend extends WorkerFrontend<MetadataResult> {
    _permissionPrompt: PermissionPrompt;
    _env: Env;
    _page: Page;
    _zipper: ZipperFrontend;
    _allFilesPersisted: boolean;
    _persistentPermissionAsked: boolean;
    _mediaLibrarySize: number;
    _uidsToTrack: Map<string, Track>;

    constructor(deps: Deps) {
        super("metadata", deps.workerWrapper);
        this._permissionPrompt = deps.permissionPrompt;
        this._env = deps.env;
        this._page = deps.page;
        this._zipper = deps.zipper;

        this._allFilesPersisted = true;
        this._persistentPermissionAsked = false;
        this._mediaLibrarySize = 0;
        this._uidsToTrack = new Map<string, Track>();
        this._zipper.on("audioFileExtracted", this._audioFileExtracted);
    }

    _fileReferenceUnavailable = (trackUid: ArrayBuffer) => {
        const key = hexString(trackUid);
        const track = this._uidsToTrack.get(key);
        if (track) {
            track.setError(`backing file has been deleted`);
            this.emit("trackBackingFileRemoved", track);
            this._uidsToTrack.delete(key);
        }
    };

    _uidsMappedToFiles = (files: File[]) => {
        void this._zipper.archiveFiles(files);
    };

    _exportTracks = (tracks: Track[]) => {
        const trackUids = tracks.map(track => track.uid());
        this.postMessageToMetadataBackend("mapTrackUidsToFiles", { trackUids });
    };

    _newTrackFromTmpFile = (trackInfo: TrackInfo) => {
        const { trackUid } = trackInfo;
        const key = hexString(trackUid);

        let track = this._uidsToTrack.get(key);
        if (!track) {
            track = new Track(trackUid, trackUid, this);
            this._uidsToTrack.set(key, track);
            track.updateFields(trackInfo);
        }
        this.emit("newTrackFromTmpFileReceived", track);
    };

    receiveMessageFromBackend = (result: MetadataResult) => {
        switch (result.type) {
            case "acoustId":
                return this._acoustIdDataFetched(result.trackInfo, result.trackInfoUpdated);
            case "albumArt":
                return this._albumArtResultReceived(result.trackUid, result.albumArt, result.requestReason);
            case "allFilesPersisted":
                return this._allFilesHaveBeenPersisted();
            case "databaseClosed":
                return this.databaseClosed();
            case "fileReferenceUnavailable":
                return this._fileReferenceUnavailable(result.trackUid);
            case "mediaLibrarySizeCount":
                return this._mediaLibrarySizeCounted(result.count);
            case "newTrackFromTmpFile":
                return this._newTrackFromTmpFile(result.trackInfo);
            case "quotaExceeded":
                return this.quotaExceeded();
            case "trackInfoBatch":
                return this._trackInfoBatchRetrieved(result.trackInfos);
            case "trackMetadata":
                return this._trackMetadataParsed(result.trackUid, result.trackInfo, result.error);
            case "uidsMappedToFiles":
                return this._uidsMappedToFiles(result.files);
        }
    };

    getAlbumArt = (track: Track, { artist, album, preference, requestReason }: AlbumArtOptions) => {
        const trackUid = track.uid();
        this.postMessageToMetadataBackend("getAlbumArt", { trackUid, artist, album, preference, requestReason });
    };

    mapTrackUidsToTracks = async (trackUids: ArrayBuffer[]) => {
        await this.ready();
        const tracks = new Array(trackUids.length);
        const trackUidsNeedingTrackInfo = [];

        for (let i = 0; i < tracks.length; ++i) {
            const trackUid = trackUids[i]!;
            const key = hexString(trackUid);
            const cached = this._uidsToTrack.get(key);
            if (cached) {
                tracks[i] = cached;
            } else {
                const track = new Track(trackUid, trackUid, this);
                tracks[i] = track;
                this._uidsToTrack.set(key, track);
                trackUidsNeedingTrackInfo.push(trackUid);
            }
        }

        void this._fetchTrackInfoForTracks(trackUidsNeedingTrackInfo);
        return tracks;
    };

    getTrackByTrackUid = (trackUid: ArrayBuffer) => {
        return this._uidsToTrack.get(hexString(trackUid));
    };

    areAllFilesPersisted = () => {
        return this._allFilesPersisted;
    };

    getTrackByFileReferenceAsync = async (fileReference: FileReference) => {
        if (!this._persistentPermissionAsked) {
            this._persistentPermissionAsked = true;
            void this._persistStorage();
        }

        const trackUid = await fileReferenceToTrackUid(fileReference);
        const key = hexString(trackUid);
        const cached = this._uidsToTrack.get(key);
        if (cached) {
            return cached;
        }
        this._allFilesPersisted = false;
        const track = new Track(fileReference, trackUid, this);
        this._parseMetadata(fileReference);
        this._uidsToTrack.set(key, track);
        return track;
    };

    getMediaLibrarySize = () => {
        return this._mediaLibrarySize;
    };

    _mediaLibrarySizeCounted = (count: number) => {
        this._mediaLibrarySize = count;
        this.emit("mediaLibrarySizeChanged", count);
    };

    _albumArtResultReceived = (trackUid: ArrayBuffer, albumArt: string | string[] | null, requestReason: string) => {
        if (albumArt) {
            const track = this.getTrackByTrackUid(trackUid);
            if (track) {
                this.emit("albumArtReceived", track, albumArt, requestReason);
            }
        }
    };

    _acoustIdDataFetched = (trackInfo: TrackInfo, trackInfoUpdated: boolean) => {
        const { trackUid } = trackInfo;
        const track = this.getTrackByTrackUid(trackUid);
        if (trackInfoUpdated && track) {
            track.updateFields(trackInfo);
        }
    };

    _trackInfoBatchRetrieved = (trackInfos: TrackInfo[]) => {
        for (let i = 0; i < trackInfos.length; ++i) {
            const trackInfo = trackInfos[i]!;
            const track = this._uidsToTrack.get(hexString(trackInfo.trackUid))!;
            track.updateFields(trackInfo);
        }
    };

    _trackMetadataParsed = (trackUid: ArrayBuffer, trackInfo?: TrackInfo, error?: { message: string }) => {
        const track = this.getTrackByTrackUid(trackUid);
        if (track) {
            if (error) {
                track.setError(error.message);
            } else {
                track.updateFields(trackInfo!);
            }
        }
    };

    _parseMetadata = (fileReference: FileReference) => {
        this.postMessageToMetadataBackend("parseMetadata", { fileReference });
    };

    _allFilesHaveBeenPersisted = () => {
        this._allFilesPersisted = true;
        this.emit("allFilesPersisted");
    };

    _rate = (track: Track, rating: number) => {
        this.postMessageToMetadataBackend("setRating", { trackUid: track.uid(), rating });
    };

    _unrate = (track: Track) => {
        this.postMessageToMetadataBackend("setRating", { trackUid: track.uid(), rating: -1 });
    };

    _recordSkip = (track: Track) => {
        this.postMessageToMetadataBackend("setSkipCounter", {
            trackUid: track.uid(),
            counter: track._skipCounter,
            lastPlayed: track._lastPlayed.valueOf(),
        });
    };

    _recordPlaythrough = (track: Track) => {
        this.postMessageToMetadataBackend("setPlaythroughCounter", {
            trackUid: track.uid(),
            counter: track._playthroughCounter,
            lastPlayed: track._lastPlayed.valueOf(),
        });
    };

    _audioFileExtracted = (tmpFileId: string) => {
        this.postMessageToMetadataBackend("parseTmpFile", { tmpFileId });
    };

    _persistStorage = async () => {
        const { storage } = this._page.navigator();
        if (storage && storage.persist && storage.persisted) {
            const isStoragePersisted = await storage.persisted();
            if (!isStoragePersisted) {
                await this._permissionPrompt.prompt(storage.persist.bind(storage));
            }
        }
    };

    _fetchTrackInfoForTracks = async (trackUidsNeedingTrackInfo: ArrayBuffer[]) => {
        const BATCH_SIZE = 250;
        let i = 0;

        do {
            await delay(16);
            const batch = trackUidsNeedingTrackInfo.slice(i, i + BATCH_SIZE);
            i += BATCH_SIZE;
            this.postMessageToMetadataBackend("getTrackInfoBatch", { batch });
        } while (i < trackUidsNeedingTrackInfo.length);
    };

    postMessageToMetadataBackend = <T extends string & keyof MetadataManagerBackendActions<unknown>>(
        action: T,
        ...args: Parameters<MetadataManagerBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args);
    };
}

interface MetadataManagerEventsMap {
    trackBackingFileRemoved: (track: Track) => void;
    newTrackFromTmpFileReceived: (track: Track) => void;
    mediaLibrarySizeChanged: (count: number) => void;
    albumArtReceived: (track: Track, albumArt: string | string[] | null, requestReason: string) => void;
    allFilesPersisted: () => void;
}

export default interface MetadataManagerFrontend
    extends QuotaExceededEmitterTrait,
        DatabaseClosedEmitterTrait,
        EventEmitterInterface<DatabaseEventsMap & QuotaExceededEventsMap & MetadataManagerEventsMap> {}

Object.assign(MetadataManagerFrontend.prototype, QuotaExceededEmitterTrait, DatabaseClosedEmitterTrait);
