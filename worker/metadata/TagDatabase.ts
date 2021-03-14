import AcoustIdApiError from "AcoustIdApiError";
import { FileReference } from "src/metadata/MetadataManagerFrontend";
import { CONSTRAINT_ERROR, DatabaseClosedError } from "src/platform/platform";
import { applyStoreSpec, getIndexedDbStorageInfo, iDbPromisify, iDbPromisifyCursor } from "src/utils/indexedDbUtil";

import { typedKeys } from "../../src/types/helpers";

const VERSION = 28;
const DATA_WIPE_VERSION = 24;
const NAME = `TagDatabase`;
const TRACK_INFO_PRIMARY_KEY_NAME = `trackUid`;
const TRACK_INFO_OBJECT_STORE_NAME = `trackInfo`;

const ACOUST_ID_JOB_OBJECT_STORE_NAME = `acoustIdJobs`;
const ACOUST_ID_JOB_PRIMARY_KEY_NAME = `jobId`;

const ALBUM_ART_OBJECT_STORE_NAME = `albumArt`;

const TRACK_PAYLOAD_OBJECT_STORE_NAME = `trackPayload`;

const TRACK_SEARCH_INDEX_OBJECT_STORE_NAME = `trackSearchIndex2`;

const PAYLOAD_TYPE_INDEXED_DB_FILE = `indexedDBFile`;

const LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME = `loudnessInfo`;

interface HasTrackUid {
    trackUid: ArrayBuffer;
}
export const trackSearchIndexCmp = function (a: HasTrackUid, b: HasTrackUid) {
    return indexedDB.cmp(a.trackUid, b.trackUid);
};

const indexedDBCmp = function (a: any, b: any) {
    return indexedDB.cmp(a, b);
};

export const stopWords = new Set([
    `a`,
    `an`,
    `and`,
    `are`,
    `as`,
    `at`,
    `be`,
    `by`,
    `for`,
    `has`,
    `in`,
    `is`,
    `it`,
    `its`,
    `of`,
    `on`,
    `that`,
    `the`,
    `to`,
    `was`,
    `will`,
    `with`,
]);

const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

const objectStoreSpec = {
    [TRACK_INFO_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            album: {
                unique: false,
                multiEntry: false,
                keyPath: `album`,
            },
            albumArtist: {
                unique: false,
                multiEntry: false,
                keyPath: `albumArtist`,
            },
            artist: {
                unique: false,
                multiEntry: false,
                keyPath: `artist`,
            },
            genres: {
                unique: false,
                multiEntry: true,
                keyPath: `genres`,
            },
            year: {
                unique: false,
                multiEntry: false,
                keyPath: `year`,
            },
            lastPlayed: {
                unique: false,
                multiEntry: false,
                keyPath: `lastPlayed`,
            },
            playthroughCounter: {
                unique: false,
                multiEntry: false,
                keyPath: `playthroughCounter`,
            },
            rating: {
                unique: false,
                multiEntry: false,
                keyPath: `rating`,
            },
            skipCounter: {
                unique: false,
                multiEntry: false,
                keyPath: `skipCounter`,
            },
            title: {
                unique: false,
                multiEntry: false,
                keyPath: `title`,
            },
        },
    },
    [ACOUST_ID_JOB_OBJECT_STORE_NAME]: {
        keyPath: ACOUST_ID_JOB_PRIMARY_KEY_NAME,
        autoIncrement: true,
        indexSpec: {
            [TRACK_INFO_PRIMARY_KEY_NAME]: {
                unique: true,
                multiEntry: false,
                keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
            },
            lastTried: {
                unique: false,
                multiEntry: false,
                keyPath: `lastTried`,
            },
        },
    },
    [ALBUM_ART_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            artistAlbum: {
                unique: false,
                multiEntry: false,
                keyPath: [`album`, `artist`],
            },
        },
    },
    [TRACK_PAYLOAD_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            payloadType: {
                unique: false,
                multiEntry: false,
                keyPath: `payloadType`,
            },
        },
    },
    [TRACK_SEARCH_INDEX_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            suffixMulti: {
                unique: false,
                multiEntry: true,
                keyPath: `keywordsReversed`,
            },
            prefixMulti: {
                unique: false,
                multiEntry: true,
                keyPath: `keywords`,
            },
        },
    },
    [LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
    },
};

export default class TagDatabase {
    _closed: boolean;
    db: Promise<IDBDatabase>;
    _usageAndQuota: { db: { used: number; total: number }; lastRetrieved: Date } | null;
    constructor() {
        this._closed = false;
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
            const { transaction } = request;
            const stores = applyStoreSpec(transaction!, objectStoreSpec);
            if (event.oldVersion < DATA_WIPE_VERSION) {
                for (const key of typedKeys(stores)) {
                    stores[key]!.clear();
                }
            }
        };
        void this._setHandlers();
        this._usageAndQuota = null;
    }

    async _initUsageAndQuota() {
        if (this._usageAndQuota) {
            return;
        }
        this._usageAndQuota = await this._queryUsageAndQuota();
    }

    async _queryUsageAndQuota() {
        const db = await getIndexedDbStorageInfo();
        return { db, lastRetrieved: new Date() };
    }

    async _setHandlers() {
        const db = await this.db;
        db.onversionchange = () => {
            this._closed = true;
            db.close();
        };
        db.onclose = () => {
            this._closed = true;
        };
    }

    _checkClosed() {
        if (this._closed) {
            throw new DatabaseClosedError();
        }
    }

    isClosed() {
        return this._closed;
    }

    async getTrackInfoCount() {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_ONLY).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        return iDbPromisify(store.count());
    }

    async _primaryOrUniqueKeyInArrayQuery(storeName: string, listOfPrimaryKeys: ArrayBuffer[], missing: ArrayBuffer[]) {
        this._checkClosed();
        const ret = new Array(listOfPrimaryKeys.length);
        ret.length = 0;
        listOfPrimaryKeys.sort(indexedDBCmp);
        let i = 0;
        const db = await this.db;
        const store = db.transaction(storeName, READ_ONLY).objectStore(storeName);
        const { length } = listOfPrimaryKeys;
        let completelyEmpty = true;

        if (i >= length) {
            return ret;
        }

        const query = IDBKeyRange.bound(listOfPrimaryKeys[0], listOfPrimaryKeys[length - 1]);
        await iDbPromisifyCursor(store.openCursor(query), async (cursor: IDBCursorWithValue) => {
            completelyEmpty = false;
            const { key } = cursor;
            let cmp = indexedDB.cmp(key, listOfPrimaryKeys[i]);
            while (cmp > 0) {
                if (missing) {
                    missing.push(listOfPrimaryKeys[i]!);
                }
                ++i;
                if (i >= length) {
                    return true;
                }
                cmp = indexedDB.cmp(key, listOfPrimaryKeys[i]);
            }

            while (cmp === 0) {
                ret.push(cursor.value);
                i++;
                if (i >= length) {
                    return true;
                }
                cmp = indexedDB.cmp(key, listOfPrimaryKeys[i]);
            }

            cursor.continue(listOfPrimaryKeys[i]);
            return false;
        });

        if (missing && completelyEmpty) {
            missing.push(...listOfPrimaryKeys);
        }

        return ret;
    }

    async trackUidsToFiles(trackUids: ArrayBuffer[], missing: ArrayBuffer[]) {
        this._checkClosed();
        const result = await this._primaryOrUniqueKeyInArrayQuery(TRACK_PAYLOAD_OBJECT_STORE_NAME, trackUids, missing);
        return result.map(obj => obj.file);
    }

    trackUidsToTrackInfos(trackUids: ArrayBuffer[], missing: ArrayBuffer[]) {
        this._checkClosed();
        return this._primaryOrUniqueKeyInArrayQuery(TRACK_INFO_OBJECT_STORE_NAME, trackUids, missing);
    }

    async getTrackInfoByTrackUid(trackUid: ArrayBuffer) {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_ONLY).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        return iDbPromisify(store.get(trackUid));
    }

    async replaceTrackInfo(trackUid: ArrayBuffer, trackInfo: HasTrackUid) {
        this._checkClosed();
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        return iDbPromisify(tx.put(trackInfo));
    }

    async addTrackInfo(trackUid: ArrayBuffer, trackInfo: HasTrackUid) {
        this._checkClosed();
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const transaction = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE);
        const store = transaction.objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        const previousTrackInfo = await iDbPromisify(store.get(trackUid));
        const newTrackInfo = Object.assign({}, previousTrackInfo || {}, trackInfo);
        await iDbPromisify(store.put(newTrackInfo));
        return newTrackInfo;
    }

    async completeAcoustIdFetchJob(jobId: string) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction([ACOUST_ID_JOB_OBJECT_STORE_NAME], READ_WRITE);
        const acoustIdStore = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const job = await iDbPromisify(acoustIdStore.get(IDBKeyRange.only(jobId)));
        if (!job) {
            return;
        }
        const jobDeleted = iDbPromisify(acoustIdStore.delete(IDBKeyRange.only(jobId)));
        await jobDeleted;
    }

    async setAcoustIdFetchJobError(jobId: string, error: AcoustIdApiError) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const job = await iDbPromisify(store.get(IDBKeyRange.only(jobId)));
        job.lastTried = new Date();
        job.lastError = {
            message: (error && error.message) || `${error}`,
            stack: (error && error.stack) || null,
        };
        return iDbPromisify(store.put(job));
    }

    async getAcoustIdFetchJob() {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const index = store.index(`lastTried`);
        return iDbPromisify(index.get(IDBKeyRange.lowerBound(new Date(0))));
    }

    async updateAcoustIdFetchJobState(trackUid: ArrayBuffer, data: any) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const uidIndex = store.index(`trackUid`);
        const job = await iDbPromisify(uidIndex.get(IDBKeyRange.only(trackUid)));

        if (!job) {
            return;
        }
        Object.assign(job, data);
        await iDbPromisify(store.put(job));
    }

    async addAcoustIdFetchJob(trackUid: ArrayBuffer, fingerprint: string, duration: number, state: any) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const uidIndex = store.index(`trackUid`);
        const key = await iDbPromisify(uidIndex.getKey(IDBKeyRange.only(trackUid)));

        if (key) {
            return;
        }

        await iDbPromisify(
            store.add({
                trackUid,
                created: new Date(),
                fingerprint,
                duration,
                lastError: null,
                lastTried: new Date(0),
                state,
            })
        );
    }

    async getAlbumArtData(trackUid: ArrayBuffer, artist: string, album: string) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ALBUM_ART_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(ALBUM_ART_OBJECT_STORE_NAME);
        const result = await iDbPromisify(store.get(IDBKeyRange.only(trackUid)));

        if (result) {
            return result;
        }

        if (artist && album) {
            const index = store.index(`artistAlbum`);
            return iDbPromisify(index.get(IDBKeyRange.only([artist, album])));
        }
        return null;
    }

    async addAlbumArtData(trackUid: ArrayBuffer, albumArtData: any) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(ALBUM_ART_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ALBUM_ART_OBJECT_STORE_NAME);
        const storedData = await iDbPromisify(store.get(IDBKeyRange.only(trackUid)));

        if (storedData && storedData.images && storedData.images.length > 0) {
            const storedImages = storedData.images;
            const newImages = albumArtData.images;

            for (let i = 0; i < newImages.length; ++i) {
                const newImage = newImages[i];
                const { imageType, image } = newImage;
                let shouldBeAdded = true;
                for (let j = 0; j < storedImages.length; ++j) {
                    const storedImage = storedImages[j];
                    if (storedImage.imageType === imageType && storedImage.image === image) {
                        shouldBeAdded = false;
                        break;
                    }
                }

                if (shouldBeAdded) {
                    storedImages.push(newImage);
                }
            }
            storedData.images = storedImages;
            return iDbPromisify(store.put(storedData));
        } else {
            albumArtData.trackUid = trackUid;
            return iDbPromisify(store.put(albumArtData));
        }
    }

    async getLoudnessAnalyzerStateForTrack(trackUid: ArrayBuffer) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME);
        return iDbPromisify(store.get(trackUid));
    }

    async setLoudnessAnalyzerStateForTrack(trackUid: ArrayBuffer, serializedState: any) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(LOUDNESS_ANALYZER_SERIALIZED_STATE_STORE_NAME);
        return iDbPromisify(store.put({ trackUid, serializedState }));
    }

    async fileByFileReference(fileReference: FileReference) {
        this._checkClosed();
        if (fileReference instanceof File) {
            return fileReference;
        } else if (fileReference instanceof ArrayBuffer) {
            const trackUid = fileReference;
            const db = await this.db;
            const tx = db.transaction(TRACK_PAYLOAD_OBJECT_STORE_NAME, READ_ONLY);
            const store = tx.objectStore(TRACK_PAYLOAD_OBJECT_STORE_NAME);
            const result = await iDbPromisify(store.get(IDBKeyRange.only(trackUid)));

            if (!result) {
                return result;
            }

            return result.file ? result.file : null;
        } else {
            throw new Error(`invalid fileReference`);
        }
    }

    async ensureFileStored(trackUid: ArrayBuffer, fileReference: FileReference) {
        this._checkClosed();
        if (fileReference instanceof ArrayBuffer) {
            return false;
        } else if (fileReference instanceof File) {
            const db = await this.db;
            let tx = db.transaction(TRACK_PAYLOAD_OBJECT_STORE_NAME, READ_ONLY);
            let store = tx.objectStore(TRACK_PAYLOAD_OBJECT_STORE_NAME);
            const result = await iDbPromisify(store.get(trackUid));

            if (result) {
                return false;
            }

            const data = {
                payloadType: PAYLOAD_TYPE_INDEXED_DB_FILE,
                file: fileReference,
                trackUid,
            };

            tx = db.transaction(TRACK_PAYLOAD_OBJECT_STORE_NAME, READ_WRITE);
            store = tx.objectStore(TRACK_PAYLOAD_OBJECT_STORE_NAME);

            try {
                await iDbPromisify(store.add(data));
                return true;
            } catch (e) {
                if (e.name !== CONSTRAINT_ERROR) {
                    throw e;
                }
                return false;
            }
        } else {
            throw new Error(`invalid fileReference`);
        }
    }

    async searchPrefixes(firstPrefixKeyword: string) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const index = store.index(`prefixMulti`);
        const key = IDBKeyRange.bound(firstPrefixKeyword, `${firstPrefixKeyword}\uffff`, false, false);
        return iDbPromisify(index.getAll(key));
    }

    async searchSuffixes(firstSuffixKeyword: string) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const index = store.index(`suffixMulti`);
        const key = IDBKeyRange.bound(firstSuffixKeyword, `${firstSuffixKeyword}\uffff`, false, false);
        return iDbPromisify(index.getAll(key));
    }

    async addSearchIndexEntryForTrackIfNotPresent(entry: HasTrackUid) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const { trackUid } = entry;
        const key = IDBKeyRange.only(trackUid);

        const result = await iDbPromisify(store.getKey(key));

        if (result) {
            return;
        }

        await iDbPromisify(store.add(entry));
    }

    async updateSearchIndexEntryForTrack(entry: HasTrackUid) {
        this._checkClosed();
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        await iDbPromisify(store.put(entry));
    }
}

export default interface TagDatabase {
    updateHasInitialLoudnessInfo: (trackUid: ArrayBuffer, hasInitialLoudnessInfo: boolean) => Promise<IDBValidKey>;
    updateHasBeenFingerprinted: (trackUid: ArrayBuffer, hasBeenFingerprinted: boolean) => Promise<IDBValidKey>;
    updateRating: (trackUid: ArrayBuffer, rating: number) => Promise<IDBValidKey>;
    updatePlaythroughCounter: (trackUid: ArrayBuffer, counter: number, lastPlayed: number) => Promise<IDBValidKey>;
    updateSkipCounter: (trackUid: ArrayBuffer, counter: number, lastPlayed: number) => Promise<IDBValidKey>;
}

const fieldUpdater = function (
    ...fieldNames: string[]
): { method: (trackUid: ArrayBuffer, ...args: any[]) => Promise<IDBValidKey> } {
    return {
        async method(this: TagDatabase, trackUid: ArrayBuffer, ...values: (string | number | boolean)[]) {
            this._checkClosed();
            const db = await this.db;
            const tx = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE);
            const store = tx.objectStore(TRACK_INFO_OBJECT_STORE_NAME);
            let data = await iDbPromisify(store.get(trackUid));
            data = Object(data);
            data.trackUid = trackUid;
            for (let i = 0; i < fieldNames.length; ++i) {
                const name = fieldNames[i]!;
                const value = values[i];
                data[name] = value;
            }
            return iDbPromisify(store.put(data));
        },
    };
};

TagDatabase.prototype.updateHasInitialLoudnessInfo = fieldUpdater(`hasInitialLoudnessInfo`).method;
TagDatabase.prototype.updateHasBeenFingerprinted = fieldUpdater(`hasBeenFingerprinted`).method;
TagDatabase.prototype.updateRating = fieldUpdater(`rating`).method;
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater(`playthroughCounter`, `lastPlayed`).method;
TagDatabase.prototype.updateSkipCounter = fieldUpdater(`skipCounter`, `lastPlayed`).method;
