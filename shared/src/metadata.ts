import * as io from "io-ts";

import { DatabaseClosedResult } from "./platform/DatabaseClosedEmitterTrait";
import FileView from "./platform/FileView";
import { QuotaExceededResult } from "./platform/QuotaExceededEmitterTrait";
import { typedKeys } from "./types/helpers";
import { hexDecode, sha1Binary } from "./util";
import { CancellationToken } from "./utils/CancellationToken";

export const ALBUM_ART_PREFERENCE_SMALLEST = `smallest`;
export const ALBUM_ART_PREFERENCE_BIGGEST = `biggest`;
export const ALBUM_ART_PREFERENCE_ALL = `all`;

export const AlbumArtPreference = io.union([
    io.literal(ALBUM_ART_PREFERENCE_SMALLEST),
    io.literal(ALBUM_ART_PREFERENCE_BIGGEST),
    io.literal(ALBUM_ART_PREFERENCE_ALL),
]);
export type AlbumArtPreference = io.TypeOf<typeof AlbumArtPreference>;

export interface BaseMetaDataResult {
    type: string;
}

export interface AlbumArtResult extends BaseMetaDataResult {
    type: "albumArt";
    albumArt: string | string[] | null;
    preference: AlbumArtPreference;
    requestReason: string;
    trackUid: ArrayBuffer;
}

export interface AcoustIdResult extends BaseMetaDataResult {
    type: "acoustId";
    trackInfo: TrackInfo;
    trackInfoUpdated: boolean;
}

export interface TrackMetadataResult extends BaseMetaDataResult {
    type: "trackMetadata";
    trackInfo?: TrackInfo;
    trackUid: ArrayBuffer;
    error?: {
        message: string;
    };
}

export interface MediaLibraryFetchedResult extends BaseMetaDataResult {
    type: "mediaLibraryFetched";
    trackUids: ArrayBuffer[];
}

export interface TrackInfoBatchResult extends BaseMetaDataResult {
    type: "trackInfoBatch";
    trackInfos: TrackInfo[];
}

export interface AllFilesPersistedResult extends BaseMetaDataResult {
    type: "allFilesPersisted";
}

export interface MediaLibrarySizeResult extends BaseMetaDataResult {
    type: "mediaLibrarySizeCount";
    count: number;
}

export interface UidsMappedToFilesResult extends BaseMetaDataResult {
    type: "uidsMappedToFiles";
    files: File[];
}

export interface NewTrackFromTmpFileResult extends BaseMetaDataResult {
    type: "newTrackFromTmpFile";
    trackInfo: TrackInfo;
}

export interface FileReferenceUnavailableResult extends BaseMetaDataResult {
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
    | MediaLibraryFetchedResult
    | QuotaExceededResult
    | DatabaseClosedResult;

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

export type FileReference = File | ArrayBuffer;

export interface BaseMetadataOpts {
    trackUid: ArrayBuffer;
}
export interface CounterOpts extends BaseMetadataOpts {
    counter: number;
    lastPlayed: number;
}
export interface RatingOpts extends BaseMetadataOpts {
    rating: number;
}
export interface AlbumArtOptions extends BaseMetadataOpts {
    artist: string;
    album: string;
    preference: AlbumArtPreference;
    requestReason: string;
}

export interface MetadataManagerBackendActions<T> {
    fetchMediaLibrary: (this: T) => void;
    setRating: (this: T, o: RatingOpts) => void;
    setSkipCounter: (this: T, o: CounterOpts) => void;
    setPlaythroughCounter: (this: T, o: CounterOpts) => void;
    getAlbumArt: (this: T, o: AlbumArtOptions) => void;
    parseMetadata: (this: T, o: { fileReference: FileReference }) => void;
    getTrackInfoBatch: (this: T, o: { batch: ArrayBuffer[] }) => void;
    mapTrackUidsToFiles: (this: T, o: { trackUids: ArrayBuffer[] }) => void;
    parseTmpFile: (this: T, o: { tmpFileId: string }) => void;
}

export type CodecName = "mp3" | "wav" | "aac" | "webm" | "ogg" | "unknown";

export const codecPaths: Partial<Record<CodecName, string>> = { mp3: process.env.MP3_CODEC_PATH };

export const ChannelCount = io.number;
export type ChannelCount = number;

interface CriticalDemuxData {
    duration: number;
    sampleRate: number;
    channels: ChannelCount;
}

const pictureKindMap = {
    Other: null,
    "32x32 pixels 'file icon'": null,
    "Other file icon": null,
    "Cover (front)": null,
    "Cover (back)": null,
    "Leaflet page": null,
    "Media (e.g. lable side of CD)": null,
    "Lead artist/lead performer/soloist": null,
    "Artist/performer": null,
    Conductor: null,
    "Band/Orchestra": null,
    Composer: null,
    "Lyricist/text writer": null,
    "Recording Location": null,
    "During recording": null,
    "During performance": null,
    "Movie/video screen capture": null,
    "A bright coloured fish": null,
    Illustration: null,
    "Band/artist logotype": null,
    "Publisher/Studio logotype": null,
};

export const PictureKind = io.keyof(pictureKindMap);
export type PictureKind = io.TypeOf<typeof PictureKind>;

export const pictureKinds = typedKeys(pictureKindMap) as PictureKind[];

export interface MetadataStoredPicture {
    image: Blob;
    pictureKind: PictureKind;
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
    fillUntil: (time: number, metadata: TrackMetadata, fileView: FileView, t?: CancellationToken<any>) => Promise<void>;
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

export interface ITrack {
    getFileReference: () => FileReference;
}
