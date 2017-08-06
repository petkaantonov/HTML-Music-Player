import getCodecName from "audio/backend/sniffer";
import FileView from "platform/FileView";
import parseMp3Metadata from "metadata/mp3_metadata";
import parseAcoustId from "metadata/acoustId";
import DatabaseUsingBackend from "DatabaseUsingBackend";
import JobProcessor, {JOB_COMPLETE_EVENT,
                      ALL_JOBS_COMPLETE_EVENT} from "utils/JobProcessor";
import {delay, sha1Binary, queryString,
        toCorsUrl, _, trackInfoFromFileName, ajaxGet} from "util";
import getCodec from "audio/backend/codec";
import {URL, File, Blob, ArrayBuffer, isOutOfMemoryError} from "platform/platform";
import {allocResampler, freeResampler} from "audio/backend/pool";
import ChannelMixer from "audio/backend/ChannelMixer";
import AudioProcessingPipeline from "audio/backend/AudioProcessingPipeline";
import Fingerprinter from "audio/backend/Fingerprinter";
import {MAX_BUFFER_LENGTH_SECONDS as BUFFER_DURATION} from "audio/frontend/buffering";
import KeyValueDatabase from "platform/KeyValueDatabase";
import FileReferenceDeletedError from "errors/FileReferenceDeletedError";
import {trackUidFromFile} from "platform/FileSystemWrapper";
import LoudnessAnalyzer from "audio/backend/LoudnessAnalyzer";

export const METADATA_MANAGER_READY_EVENT_NAME = `metadataManagerReady`;

export const JOB_STATE_INITIAL = `initial`;
export const JOB_STATE_DATA_FETCHED = `dataFetched`;

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

export const ALBUM_ART_PREFERENCE_SMALLEST = `smallest`;
export const ALBUM_ART_PREFERENCE_BIGGEST = `biggest`;
export const ALBUM_ART_PREFERENCE_ALL = `all`;

export const METADATA_UPDATE_EVENT = `metadataUpdate`;

export function fileReferenceToTrackUid(fileReference) {
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

const NO_JOBS_FOUND_TOKEN = {};
const JOBS_FOUND_TOKEN = {};

const MAX_BLOB_URL_SIZE = 1024 * 1024 * 2;

const IMAGE_TYPE_KEY = `imageType`;
const IMAGE_TYPE_COVERARTARCHIVE = `coverartarchive`;
const IMAGE_TYPE_BLOB = `blob`;

const imageTypeKeyWeights = {
    [IMAGE_TYPE_BLOB]: 0,
    [IMAGE_TYPE_COVERARTARCHIVE]: 1
};

const codecNotSupportedError = function() {
    const e = new Error(`codec not supported`);
    e.name = `CodecNotSupportedError`;
    return e;
};

const runknown = /^[\s<{[(]*unknown[}\])>\s]*$/i;
const isUnknown = function(value) {
    if (!value) {
        return true;
    }
    return runknown.test(`${value}`);
};

const imageDescriptionWeights = {
    Front: 0,
    Back: 1,
    Tray: 2,
    Booklet: 3,
    Medium: 4
};

function getDescriptionWeight(image) {
    if (image.description) {
        const weight = imageDescriptionWeights[image.description];
        if (typeof weight !== `number`) {
            return -1;
        }
        return weight;
    } else if (Array.isArray(image.types)) {
        const weight = imageDescriptionWeights[image.types.join(``)];
        if (typeof weight !== `number`) {
            return imageDescriptionWeights.Booklet + 1;
        }
        return weight;
    } else {
        return -1;
    }
}



function buildTrackInfo(metadata, demuxData) {
    const {title = null, album = null, artist = null, albumArtist = null,
           year = null, albumIndex = 0, trackCount = 1,
           genres = []} = metadata;
    return Object.assign({}, metadata, {
        lastPlayed: new Date(0),
        rating: -1,
        playthroughCounter: 0,
        skipCounter: 0,
        hasBeenFingerprinted: false,
        hasInitialLoudnessInfo: false,
        title, album, artist, albumArtist, year, albumIndex, trackCount, genres
    }, {
        sampleRate: demuxData.sampleRate,
        channels: demuxData.channels,
        duration: demuxData.duration
    });
}

export default class MetadataManagerBackend extends DatabaseUsingBackend {
    constructor(wasm, database, searchBackend) {
        super(METADATA_MANAGER_READY_EVENT_NAME, database);
        this._searchBackend = searchBackend;
        this._wasm = wasm;
        this._blobUrls = [];
        this._blobUrlSize = 0;
        this._trackInfoEntriesCount = 0;
        this._kvdb = null;

        this._loudnessAnalyzerStateSerializer = new JobProcessor({jobCallback: this._loudnessAnalysisJob.bind(this)});
        this._acoustIdDataFetcher = new JobProcessor({delay: 1000, jobCallback: this._fetchAcoustIdDataJob.bind(this)});
        this._fingerprinter = new JobProcessor({jobCallback: this._fingerprintJob.bind(this)});
        this._metadataParser = new JobProcessor({jobCallback: this._parseMetadataJob.bind(this), parallelJobs: 8});
        this._coverArtDownloader = new JobProcessor({
            async jobCallback({cancellationToken}, url) {
                while (!cancellationToken.isCancelled()) {
                    try {
                        const result = await ajaxGet(toCorsUrl(url), cancellationToken, {responseType: `blob`});
                        return result;
                    } catch (e) {
                        await delay(10000);
                    }
                }
                return null;
            },
            parallelJobs: 3
        });


        this.actions = {
            setRating({trackUid, rating}) {
                if (!this.canUseDatabase()) return;
                this.database.updateRating(trackUid, rating);
            },

            setSkipCounter({trackUid, counter, lastPlayed}) {
                if (!this.canUseDatabase()) return;
                this.database.updateSkipCounter(trackUid, counter, lastPlayed);
            },

            setPlaythroughCounter({trackUid, counter, lastPlayed}) {
                if (!this.canUseDatabase()) return;
                this.database.updatePlaythroughCounter(trackUid, counter, lastPlayed);
            },

            async getAlbumArt({trackUid, artist, album, preference, requestReason}) {
                if (!this.canUseDatabase()) return;
                const albumArt = await this._getAlbumArt(trackUid, artist, album, preference);
                const result = {albumArt, trackUid, preference, requestReason};
                this.postMessage({type: ALBUM_ART_RESULT_MESSAGE, result});
            },

            async parseMetadata({fileReference}) {
                if (!this.canUseDatabase()) return;
                const trackUid = await fileReferenceToTrackUid(fileReference);
                const result = await this._parseMetadata(trackUid, fileReference);
                if (!result) {
                    return;
                }
                this.postMessage({type: METADATA_RESULT_MESSAGE, result});

                if (result.trackInfo) {
                    if (!result.trackInfo.hasBeenFingerprinted) {
                        this._fingerprinter.postJob(trackUid, fileReference);
                    }

                    if (!result.trackInfo.hasInitialLoudnessInfo) {
                        this._loudnessAnalyzerStateSerializer.postJob(trackUid, fileReference);
                    }
                }

            },

            async getTrackInfoBatch({batch}) {
                if (!this.canUseDatabase()) return;
                const missing = [];
                const trackInfos = await this.database.trackUidsToTrackInfos(batch, missing);
                for (let i = 0; i < trackInfos.length; ++i) {
                    const trackInfo = trackInfos[i];
                    const {trackUid} = trackInfo;
                    if (!trackInfo.hasBeenFingerprinted) {
                        this._fingerprinter.postJob(trackUid, trackUid);
                    }

                    if (!trackInfo.hasInitialLoudnessInfo) {
                        this._loudnessAnalyzerStateSerializer.postJob(trackUid, trackUid);
                    }
                }

                for (let i = 0; i < missing.length; ++i) {
                    this.actions.parseMetadata.call(this, {fileReference: missing[i]});
                }

                this.postMessage({type: TRACKINFO_BATCH_RESULT_MESSAGE, result: {trackInfos}});
            },

            async mapTrackUidsToFiles({trackUids}) {
                if (!this.canUseDatabase()) return;
                const missing = [];
                const files = await this.database.trackUidsToFiles(trackUids, missing);
                this.postMessage({type: UIDS_MAPPED_TO_FILES_MESSAGE, result: {files}});

                for (let i = 0; i < missing.length; ++i) {
                    const trackUid = missing[i];
                    this.postMessage({
                        type: FILE_REFERENCE_UNAVAILABLE_MESSAGE,
                        result: {trackUid}
                    });
                }
            },

            async parseTmpFile({tmpFileId}) {
                if (!this.canUseDatabase()) return;
                await this._checkKvdb();
                const tmpFile = await this._kvdb.consumeTmpFileById(tmpFileId);
                if (!tmpFile) {
                    return;
                }

                const {file} = tmpFile;
                const trackUid = await fileReferenceToTrackUid(file);
                const trackInfo = await this.getTrackInfoByTrackUid(trackUid);
                if (!trackInfo) {
                    const result = await this._parseMetadata(trackUid, file);
                    if (result && result.trackInfo) {
                        if (!result.trackInfo.hasBeenFingerprinted) {
                            this._fingerprinter.postJob(trackUid, trackUid);
                        }

                        if (!result.trackInfo.hasInitialLoudnessInfo) {
                            this._loudnessAnalyzerStateSerializer.postJob(trackUid, trackUid);
                        }
                        this.postMessage({type: NEW_TRACK_FROM_TMP_FILE_MESSAGE, result: {
                            trackInfo: result.trackInfo
                        }});
                    }
                } else {
                    try {
                        await this.database.ensureFileStored(trackUid, file);
                    } catch (e) {
                        if (!this._checkStorageError(e)) {
                            throw e;
                        }
                    }
                }
            }
        };
        this._acoustIdDataFetcher.on(JOB_COMPLETE_EVENT, async (job) => {
            const result = await job.promise;
            if (result !== NO_JOBS_FOUND_TOKEN) {
                this._acoustIdDataFetcher.postJob();
            }
        });
        this._acoustIdDataFetcher.postJob();
        this._metadataParser.on(ALL_JOBS_COMPLETE_EVENT, () => {
            this.postMessage({type: ALL_FILES_PERSISTED_MESSAGE});
        });
        this._updateMediaLibrarySize();
    }

    _trackInfoEntriesCountUpdated() {
        this.postMessage({
            type: MEDIA_LIBRARY_SIZE_COUNTED_MESSAGE,
            result: this._trackInfoEntriesCount
        });
    }

    async _updateMediaLibrarySize() {
        const count = await this.database.getTrackInfoCount();
        this._trackInfoEntriesCount = count;
        this._trackInfoEntriesCountUpdated();
    }

    async _parseMetadata(trackUid, fileReference) {
        try {
            const trackInfo = await this._metadataParser.postJob(trackUid, fileReference).promise;
            if (!trackInfo) {
                return null;
            }
            return {trackInfo, trackUid};
        } catch (e) {
            if (e instanceof FileReferenceDeletedError) {
                this.postMessage({
                    type: FILE_REFERENCE_UNAVAILABLE_MESSAGE,
                    result: {trackUid}
                });
                return null;
            } else {
                return {trackUid, error: {message: e.message}};
            }
        }
    }

    async getLoudnessAnalyzerStateForTrack(trackUid) {
        const ret = await this.database.getLoudnessAnalyzerStateForTrack(trackUid);
        if (ret) {
            return ret.serializedState;
        }
        return null;
    }

    async fileReferenceToFileView(fileReference) {
        if (fileReference instanceof File) {
            return new FileView(fileReference);
        } else if (fileReference instanceof ArrayBuffer) {
            const file = await this.database.fileByFileReference(fileReference);
            if (!(file instanceof File)) {
                throw new FileReferenceDeletedError();
            }
            return new FileView(file);
        } else {
            throw new Error(`invalid fileReference`);
        }
    }

    async _loudnessAnalysisJob({cancellationToken}, trackUid, fileReference) {
        let decoder, loudnessAnalyzer;
        const {_wasm: wasm} = this;
        try {
            const trackInfo = await this.getTrackInfoByTrackUid(trackUid);

            if (!trackInfo || trackInfo.hasInitialLoudnessInfo) {
                return;
            }

            let fileView;
            try {
                fileView = await this.fileReferenceToFileView(fileReference);
            } catch (e) {
                if (e instanceof FileReferenceDeletedError) {
                    this.postMessage({
                        type: FILE_REFERENCE_UNAVAILABLE_MESSAGE,
                        result: {trackUid}
                    });
                    return;
                } else {
                    throw e;
                }
            }

            const DecoderContext = await getCodec(trackInfo.codecName);

            const {sampleRate, duration, channels, demuxData} = trackInfo;
            const sourceSampleRate = sampleRate;
            const sourceChannelCount = channels;
            const {dataStart, dataEnd} = demuxData;

            if (duration >= 15) {
                decoder = new DecoderContext(wasm, {
                    targetBufferLengthAudioFrames: BUFFER_DURATION * sampleRate
                });
                decoder.start(demuxData);

                loudnessAnalyzer = new LoudnessAnalyzer(wasm);
                loudnessAnalyzer.initialize(sourceChannelCount, sourceSampleRate);

                const audioPipeline = new AudioProcessingPipeline(wasm, {
                    sourceSampleRate, sourceChannelCount,
                    destinationSampleRate: sourceSampleRate,
                    destinationChannelCount: sourceChannelCount,
                    decoder,
                    bufferTime: BUFFER_DURATION, duration,
                    bufferAudioFrameCount: sourceSampleRate * BUFFER_DURATION,
                    loudnessAnalyzer
                });

                const fileStartPosition = dataStart;
                let filePosition = fileStartPosition;
                const fileEndPosition = dataEnd;

                while (filePosition < fileEndPosition && !loudnessAnalyzer.isHistoryStateFilled()) {
                    const bytesRead = await audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                     filePosition,
                                                                                     demuxData,
                                                                                     cancellationToken);
                    audioPipeline.consumeFilledBuffer();
                    filePosition += bytesRead;
                }

                const serializedState = loudnessAnalyzer.serialize();
                await this.database.setLoudnessAnalyzerStateForTrack(trackUid, serializedState);
                await this.database.updateHasInitialLoudnessInfo(trackUid, true);
            }
        } finally {
            if (decoder) decoder.destroy();
            if (loudnessAnalyzer) loudnessAnalyzer.destroy();
        }
    }

    async _fingerprintJob({cancellationToken}, trackUid, fileReference) {
        let decoder, resampler, fingerprinter, channelMixer;
        const {_wasm: wasm} = this;
        try {
            const trackInfo = await this.getTrackInfoByTrackUid(trackUid);

            if (!trackInfo || trackInfo.hasBeenFingerprinted) {
                return;
            }

            let fileView;
            try {
                fileView = await this.fileReferenceToFileView(fileReference);
            } catch (e) {
                if (e instanceof FileReferenceDeletedError) {
                    this.postMessage({
                        type: FILE_REFERENCE_UNAVAILABLE_MESSAGE,
                        result: {trackUid}
                    });
                    return;
                } else {
                    throw e;
                }
            }
            const DecoderContext = await getCodec(trackInfo.codecName);

            const {sampleRate, duration, channels, demuxData} = trackInfo;
            const sourceSampleRate = sampleRate;
            const sourceChannelCount = channels;
            const {dataStart, dataEnd} = demuxData;
            let fingerprint = null;

            if (duration >= 15) {
                decoder = new DecoderContext(wasm, {
                    targetBufferLengthAudioFrames: BUFFER_DURATION * sampleRate
                });
                decoder.start(demuxData);

                fingerprinter = new Fingerprinter(wasm);
                const {destinationChannelCount, destinationSampleRate, resamplerQuality} = fingerprinter;
                resampler = allocResampler(wasm,
                                           destinationChannelCount,
                                           sourceSampleRate,
                                           destinationSampleRate,
                                           resamplerQuality);
                channelMixer = new ChannelMixer(wasm, {destinationChannelCount});
                const audioPipeline = new AudioProcessingPipeline(wasm, {
                    sourceSampleRate, sourceChannelCount,
                    destinationSampleRate, destinationChannelCount,
                    decoder, resampler, channelMixer, fingerprinter,
                    bufferTime: BUFFER_DURATION, duration,
                    bufferAudioFrameCount: destinationSampleRate * BUFFER_DURATION
                });

                const fileStartPosition = dataStart;
                let filePosition = fileStartPosition;
                const fileEndPosition = dataEnd;

                while (filePosition < fileEndPosition && fingerprinter.needFrames()) {
                    const bytesRead = await audioPipeline.decodeFromFileViewAtOffset(fileView,
                                                                                     filePosition,
                                                                                     demuxData,
                                                                                     cancellationToken);
                    audioPipeline.consumeFilledBuffer();
                    filePosition += bytesRead;
                }
                fingerprint = fingerprinter.calculateFingerprint();
            }

            if (fingerprint) {
                await this.database.updateHasBeenFingerprinted(trackUid, true);
                await this.database.addAcoustIdFetchJob(trackUid, fingerprint, duration, JOB_STATE_INITIAL);
                this._acoustIdDataFetcher.postJob();
            }
        } finally {
            if (decoder) decoder.destroy();
            if (resampler) freeResampler(resampler);
            if (fingerprinter) fingerprinter.destroy();
            if (channelMixer) channelMixer.destroy();
        }
    }

    async _fetchAcoustIdDataJob({cancellationToken}) {
        const job = await this.database.getAcoustIdFetchJob();
        if (!job) {
            return NO_JOBS_FOUND_TOKEN;
        }

        const {trackUid, fingerprint, duration, jobId} = job;
        let {acoustIdResult, state} = job;
        let trackInfo;
        let trackInfoUpdated = false;
        const waitLongTime = !!job.lastError;

        if (state === JOB_STATE_INITIAL) {
            try {
               const result = await this._fetchAcoustId(cancellationToken, trackUid, fingerprint, duration);
                ({acoustIdResult, trackInfo, trackInfoUpdated} = result);
                state = JOB_STATE_DATA_FETCHED;
                await this.database.updateAcoustIdFetchJobState(jobId, {acoustIdResult, state});

                if (trackInfoUpdated) {
                    this._searchBackend.updateTrackToSearchIndex(trackInfo);
                }
            } catch (e) {
                await this.database.setAcoustIdFetchJobError(jobId, e);
                if (waitLongTime) {
                    await delay(10000);
                }
                return JOBS_FOUND_TOKEN;
            }
        }

        if (state === JOB_STATE_DATA_FETCHED) {
            if (acoustIdResult) {
                if (!trackInfo) {
                    trackInfo = await this.getTrackInfoByTrackUid(trackUid);
                }

                try {
                    const fetchedCoverArt = await this._fetchCoverArtInfo(cancellationToken, acoustIdResult, trackInfo);
                    if (!trackInfoUpdated) {
                        trackInfoUpdated = fetchedCoverArt;
                    }
                } catch (e) {
                    await this.database.setAcoustIdFetchJobError(jobId, e);
                    if (waitLongTime) {
                        await delay(10000);
                    }
                    return JOBS_FOUND_TOKEN;
                }
            }
            await this.database.completeAcoustIdFetchJob(jobId);
        }

        this.postMessage({type: ACOUST_ID_DATA_RESULT_MESSAGE, result: {trackInfo, trackInfoUpdated}});
        if (waitLongTime) {
            await delay(10000);
        }
        return JOBS_FOUND_TOKEN;
    }

    getTrackInfoByTrackUid(trackUid) {
        return this.database.getTrackInfoByTrackUid(trackUid);
    }

    async _parseMetadataJob(job, trackUid, fileReference) {
        try {
            await this.database.ensureFileStored(trackUid, fileReference);
        } catch (e) {
            if (this._checkStorageError(e)) {
                return null;
            }
            throw e;
        }
        let trackInfo = await this.getTrackInfoByTrackUid(trackUid);

        if (trackInfo) {
            this._searchBackend.addTrackToSearchIndexIfNotPresent(trackInfo);
            return trackInfo;
        }

        const data = {
            trackUid,
            codecName: null,
            duration: 0,
            autogenerated: false
        };

        const fileView = await this.fileReferenceToFileView(fileReference);
        const codecName = await getCodecName(fileView);
        if (!codecName) {
            throw codecNotSupportedError();
        }

        switch (codecName) {
            case `wav`:
            case `webm`:
            case `aac`:
            case `ogg`:
                throw codecNotSupportedError();
            case `mp3`:
                await parseMp3Metadata(data, fileView);
                break;
            default: break;
        }
        data.codecName = codecName;
        data.duration = data.demuxData.duration;
        data.trackUid = trackUid;

        if (!data.artist || !data.title) {
            const {artist, title} = trackInfoFromFileName(fileView.file.name);
            data.artist = artist;
            data.title = title;
            data.autogenerated = true;
        }

        if (data.pictures) {
            const {pictures} = data;
            delete data.pictures;
            await this.database.addAlbumArtData(trackUid, {
                trackUid,
                images: pictures.map(i => Object.assign({[IMAGE_TYPE_KEY]: IMAGE_TYPE_BLOB}, i)),
                album: data.album || null,
                artist: data.artist
            });
        }

        trackInfo = buildTrackInfo(data, data.demuxData);
        this._searchBackend.updateTrackToSearchIndex(trackInfo);
        await this.database.replaceTrackInfo(trackUid, trackInfo);
        this._trackInfoEntriesCount++;
        this._trackInfoEntriesCountUpdated();
        return trackInfo;
    }

    async _fetchAcoustId(cancellationToken, uid, fingerprint, duration) {
        const data = queryString({
            client: `djbbrJFK`,
            format: `json`,
            duration: duration | 0,
            meta: `recordings+releasegroups+compress`,
            fingerprint
        });
        const url = `https://api.acoustId.org/v2/lookup?${data}`;

        let result;
        const fullResponse = await ajaxGet(toCorsUrl(url), cancellationToken);
        if (fullResponse.results && fullResponse.results.length > 0) {
            result = parseAcoustId(fullResponse, duration | 0);
        }
        const trackInfo = await this.getTrackInfoByTrackUid(uid);
        const wasAutogenerated = trackInfo.autogenerated;

        let trackInfoUpdated = false;
        if (result) {
            trackInfo.autogenerated = false;
            const {album: albumResult,
                   title: titleResult,
                   artist: artistResult,
                   albumArtist: albumArtistResult} = result;
            const {name: album} = albumResult || {};
            const {name: title} = titleResult || {};
            const {name: artist} = artistResult || {};
            const {name: albumArtist} = albumArtistResult || {};

            if ((isUnknown(trackInfo.title) || wasAutogenerated) && title) {
                trackInfo.title = title;
                trackInfoUpdated = true;
            }

            if ((isUnknown(trackInfo.album) || wasAutogenerated) && album) {
                trackInfo.album = album;
                trackInfoUpdated = true;
            }

            if ((isUnknown(trackInfo.albumArtist) || wasAutogenerated) && albumArtist) {
                trackInfo.albumArtist = albumArtist;
                trackInfoUpdated = true;
            }

            if ((isUnknown(trackInfo.artist) || wasAutogenerated) && artist) {
                trackInfo.artist = artist;
                trackInfoUpdated = true;
            }
        }

        await this.database.replaceTrackInfo(uid, trackInfo);
        return {
            acoustIdResult: result || null,
            trackInfo,
            trackInfoUpdated
        };
    }

    async _fetchCoverArtInfo(cancellationToken, acoustIdResult, trackInfo) {
        const {trackUid} = trackInfo;
        const {album, title} = acoustIdResult;
        let mbid, type;

        if (album && album.mbid) {
            ({mbid, type} = album);
        } else if (title && title.mbid) {
            ({mbid, type} = title);
        } else {
            return false;
        }

        const {artist: taggedArtist,
                album: taggedAlbum} = trackInfo;
        try {
            const response = await ajaxGet(toCorsUrl(`https://coverartarchive.org/${type}/${mbid}`), cancellationToken);
            if (response && response.images && response.images.length > 0) {
                await this.database.addAlbumArtData(trackUid, {
                    trackUid,
                    images: response.images.map(i => Object.assign({[IMAGE_TYPE_KEY]: IMAGE_TYPE_COVERARTARCHIVE}, i)),
                    artist: taggedArtist,
                    album: taggedAlbum
                });
                return true;
            }
        } catch (e) {
            if (e.status !== 404) {
                throw e;
            }
        }
        return false;
    }

    async _maybeDownloadCoverArt(url) {
        if (this._coverArtDownloader.jobsActive >= this._coverArtDownloader.parallelJobs) {
            await this._coverArtDownloader.cancelOldestJob();
        }
        try {
            const result = await this._coverArtDownloader.postJob(url).promise;
            return result;
        } catch (e) {
            return null;
        }
    }

    async _getAlbumArt(trackUid, artist, album, preference = ALBUM_ART_PREFERENCE_SMALLEST) {
        let result = null;

        const albumArtData = await this.database.getAlbumArtData(trackUid, artist, album);
        if (!albumArtData) {
            result = preference === ALBUM_ART_PREFERENCE_ALL ? [] : null;
        } else {
            const images = albumArtData.images || [];

            if (preference !== ALBUM_ART_PREFERENCE_ALL) {
                if (images.length > 0) {
                    images.sort((a, b) => {
                        const cmp = getDescriptionWeight(a) - getDescriptionWeight(b);
                        if (cmp !== 0) {
                            return cmp;
                        }
                        const aTypeWeight = imageTypeKeyWeights[a[IMAGE_TYPE_KEY]];
                        const bTypeWeight = imageTypeKeyWeights[b[IMAGE_TYPE_KEY]];
                        return aTypeWeight - bTypeWeight;
                    });

                    const image = images[0];

                    if (image[IMAGE_TYPE_KEY] === IMAGE_TYPE_BLOB) {
                        result = image.image;
                    } else if (preference === ALBUM_ART_PREFERENCE_SMALLEST) {
                        result = image.thumbnails.small;
                    } else {
                        result = image.image;
                    }

                    let blobResult;
                    if (typeof result === `string`) {
                        blobResult = await this._maybeDownloadCoverArt(result);
                    }

                    if (blobResult) {
                        result = blobResult;
                        await this.database.addAlbumArtData(trackUid, {
                            trackUid,
                            images: [{
                                [IMAGE_TYPE_KEY]: IMAGE_TYPE_BLOB,
                                image: blobResult,
                                description: `${Array.isArray(image.types) ? image.types.join(`, `) : `none`}`
                            }],
                            album,
                            artist
                        });
                    }
                }
            } else {
                result = images.map(_.image);
            }
        }

        if (!result) {
            return result;
        } else if (Array.isArray(result)) {
            return result.map(this._mapToUrl, this);
        } else {
            return this._mapToUrl(result);
        }
    }

    _checkBlobList() {
        if (this._blobUrlSize > MAX_BLOB_URL_SIZE) {
            const target = MAX_BLOB_URL_SIZE / 2 | 0;
            let blobUrlSize = this._blobUrlSize;
            while (blobUrlSize > target) {
                const {url, size} = this._blobUrls.shift();
                blobUrlSize -= size;
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {
                    // NOOP
                }
            }
            this._blobUrlSize = blobUrlSize;
        }
    }

    _mapToUrl(value) {
        if (typeof value === `string`) {
            return value.replace(/^https?:\/\//i, `https://`);
        } else if (value instanceof Blob) {
            const url = URL.createObjectURL(value);
            const {size} = value;
            this._blobUrls.push({url, size});
            this._blobUrlSize += size;
            this._checkBlobList();
            return url;
        } else {
            throw new Error(`unknown value ${value} ${typeof value}`);
        }
    }

    async _checkKvdb() {
        if (!this._kvdb) {
            this._kvdb = new KeyValueDatabase();
            await this._kvdb.getDb();
        }
    }

    _checkStorageError(e) {
        if (isOutOfMemoryError(e)) {
            this.postMessage({type: QUOTA_EXCEEDED_MESSAGE});
            return true;
        } else {
            return false;
        }
    }
}
