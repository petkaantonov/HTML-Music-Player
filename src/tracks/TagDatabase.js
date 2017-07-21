import {iDbPromisify, promisifyKeyCursorContinue, promisifyCursorContinuePrimaryKey, iDbPromisifyCursor} from "util";
import {indexedDB, IDBKeyRange, ArrayBuffer, File} from "platform/platform";

const VERSION = 22;
const DATA_WIPE_VERSION = 19;
const NAME = `TagDatabase`;
const TRACK_INFO_PRIMARY_KEY_NAME = `trackUid`;
const TRACK_INFO_OBJECT_STORE_NAME = `trackInfo`;

const ACOUST_ID_JOB_OBJECT_STORE_NAME = `acoustIdJobs`;
const ACOUST_ID_JOB_PRIMARY_KEY_NAME = `jobId`;

const ALBUM_ART_OBJECT_STORE_NAME = `albumArt`;

const TRACK_PAYLOAD_OBJECT_STORE_NAME = `trackPayload`;

const TRACK_SEARCH_INDEX_OBJECT_STORE_NAME = `trackSearchIndex`;
const TRACK_SEARCH_INDEX_PRIMARY_KEY_NAME = `searchId`;

export const trackSearchIndexCmp = new Function(`a`, `b`, `
    return a.${TRACK_SEARCH_INDEX_PRIMARY_KEY_NAME} - b.${TRACK_SEARCH_INDEX_PRIMARY_KEY_NAME};
`);

export const stopWords = new Set([`a`, `an`, `and`, `are`, `as`, `at`, `be`, `by`, `for`, `has`, `in`, `is`, `it`, `its`, `of`, `on`, `that`, `the`, `to`, `was`, `will`, `with`]);

const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

const CONSTRAINT_ERROR = `ConstraintError`;

const objectStoreSpec = {
    [TRACK_INFO_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            album: {
                unique: false,
                multiEntry: false,
                keyPath: `album`
            },
            albumArtist: {
                unique: false,
                multiEntry: false,
                keyPath: `albumArtist`
            },
            artist: {
                unique: false,
                multiEntry: false,
                keyPath: `artist`
            },
            genres: {
                unique: false,
                multiEntry: true,
                keyPath: `genres`
            },
            year: {
                unique: false,
                multiEntry: false,
                keyPath: `year`
            },
            lastPlayed: {
                unique: false,
                multiEntry: false,
                keyPath: `lastPlayed`
            },
            playthroughCounter: {
                unique: false,
                multiEntry: false,
                keyPath: `playthroughCounter`
            },
            rating: {
                unique: false,
                multiEntry: false,
                keyPath: `rating`
            },
            skipCounter: {
                unique: false,
                multiEntry: false,
                keyPath: `skipCounter`
            },
            title: {
                unique: false,
                multiEntry: false,
                keyPath: `title`
            }
        }
    },
    [ACOUST_ID_JOB_OBJECT_STORE_NAME]: {
        keyPath: ACOUST_ID_JOB_PRIMARY_KEY_NAME,
        autoIncrement: true,
        indexSpec: {
            [TRACK_INFO_PRIMARY_KEY_NAME]: {
                unique: true,
                multiEntry: false,
                keyPath: TRACK_INFO_PRIMARY_KEY_NAME
            },
            lastTried: {
                unique: false,
                multiEntry: false,
                keyPath: `lastTried`
            }
        }
    },
    [ALBUM_ART_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            artistAlbum: {
                unique: false,
                multiEntry: false,
                keyPath: [`album`, `artist`]
            }
        }
    },
    [TRACK_PAYLOAD_OBJECT_STORE_NAME]: {
        keyPath: TRACK_INFO_PRIMARY_KEY_NAME,
        indexSpec: {
            payloadType: {
                unique: false,
                multiEntry: false,
                keyPath: `payloadType`
            }
        }
    },
    [TRACK_SEARCH_INDEX_OBJECT_STORE_NAME]: {
        keyPath: TRACK_SEARCH_INDEX_PRIMARY_KEY_NAME,
        autoIncrement: true,
        indexSpec: {
            [TRACK_INFO_PRIMARY_KEY_NAME]: {
                unique: false,
                multiEntry: false,
                keyPath: TRACK_INFO_PRIMARY_KEY_NAME
            },
            suffixMulti: {
                unique: false,
                multiEntry: true,
                keyPath: `keywordsReversed`
            },
            prefixMulti: {
                unique: false,
                multiEntry: true,
                keyPath: `keywords`
            }
        }
    }
};

function applyIndexSpecToStore(store, indexSpec) {
    const indexNames = new Set([].slice.call(store.indexNames));

    for (const indexName of Object.keys(indexSpec)) {
        if (!indexNames.has(indexName)) {
            const spec = indexSpec[indexName];
            store.createIndex(indexName, spec.keyPath, spec);
        }
    }

    for (const indexName of indexNames) {
        if (!indexSpec.hasOwnProperty(indexName)) {
            store.deleteIndex(indexName);
        }
    }
}

export function applyStoreSpec(transaction, storeSpec) {
    const {db} = transaction;
    const storeNames = new Set([].slice.call(transaction.objectStoreNames));
    const ret = {};

    for (const storeName of Object.keys(storeSpec)) {
        const spec = storeSpec[storeName];
        if (!storeNames.has(storeName)) {
            ret[storeName] = db.createObjectStore(storeName, spec);
        } else {
            ret[storeName] = transaction.objectStore(storeName);
        }
        if (spec.indexSpec) {
            applyIndexSpecToStore(ret[storeName], spec.indexSpec);
        }
    }

    for (const storeName of storeNames) {
        if (!storeSpec.hasOwnProperty(storeName)) {
            db.deleteObjectStore(storeName);
        }
    }

    return ret;
}


export default class TagDatabase {
    constructor() {
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = (event) => {
            const {target} = event;
            const {transaction} = target;
            const stores = applyStoreSpec(transaction, objectStoreSpec);
            if (event.oldVersion < DATA_WIPE_VERSION) {
                for (const key of Object.keys(stores)) {
                    stores[key].clear();
                }
            }
        };
    }

    async _getTrackInfoByCursor(onlyKeys, keyName,
                                {before = null, after = null, limit}) {
        const db = await this.db;
        const store = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_ONLY).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        const index = store.index(keyName);

        let range = null;
        if (after && before) {
            range = IDBKeyRange.bound(after, before, true, true);
        } else if (after) {
            range = IDBKeyRange.lowerBound(after, true);
        } else if (before) {
            range = IDBKeyRange.upperBound(before, true);
        }

        const opts = limit ? {limit} : {};
        if (onlyKeys) {
            const cursor = index.openKeyCursor(range, `nextunique`);
            return promisifyKeyCursorContinue(cursor, opts);
        } else {
            throw new Error(`only keys`);
        }
    }

    async _getTrackInfosHavingKey(keyValue, indexName, opts = {}) {
        const db = await this.db;
        let primaryKeyValue = null;
        const {limit} = opts;

        if (opts.after) {
            primaryKeyValue = opts.after;
        }

        const store = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_ONLY).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        const index = store.index(indexName);
        const keyRange = IDBKeyRange.only(keyValue);
        const cursor = index.openCursor(keyRange, `next`);
        const result = await promisifyCursorContinuePrimaryKey(cursor, {keyValue, primaryKeyValue, limit});
        return result;
    }

    _getTrackInfoKeys(keyName, opts) {
        return this._getTrackInfoByCursor(true, keyName, opts);
    }

    getAlbums(opts = {}) {
        return this._getTrackInfoKeys(`album`, opts);
    }

    getArtists(opts = {}) {
        return this._getTrackInfoKeys(`artist`, opts);
    }

    getGenres(opts = {}) {
        return this._getTrackInfoKeys(`genres`, opts);
    }

    getTrackInfosHavingAlbum(album, opts = {}) {
        return this._getTrackInfosHavingKey(album, `album`, opts);
    }

    getTrackInfosHavingArtist(artist, opts = {}) {
        return this._getTrackInfosHavingKey(artist, `artist`, opts);
    }

    getTrackInfosHavingGenre(genre, opts) {
        return this._getTrackInfosHavingKey(genre, `genres`, opts);
    }

    async getTrackInfoByTrackUid(trackUid) {
        const db = await this.db;
        const store = db.transaction(TRACK_INFO_OBJECT_STORE_NAME).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        return iDbPromisify(store.get(trackUid));
    }

    async replaceTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE).objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        return iDbPromisify(tx.put(trackInfo));
    }

    async addTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const transaction = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE);
        const store = transaction.objectStore(TRACK_INFO_OBJECT_STORE_NAME);
        const previousTrackInfo = await iDbPromisify(store.get(trackUid));
        const newTrackInfo = Object.assign({}, previousTrackInfo || {}, trackInfo);
        await iDbPromisify(store.put(newTrackInfo));
        return newTrackInfo;
    }

    async completeAcoustIdFetchJob(jobId) {
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

    async setAcoustIdFetchJobError(jobId, error) {
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const job = await iDbPromisify(store.get(IDBKeyRange.only(jobId)));
        job.lastTried = new Date();
        job.lastError = {
            message: error && error.message || `${error}`
        };
        return iDbPromisify(store.put(job));
    }

    async getAcoustIdFetchJob() {
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const index = store.index(`lastTried`);
        return iDbPromisify(index.get(IDBKeyRange.lowerBound(new Date(0))));
    }

    async updateAcoustIdFetchJobState(trackUid, data) {
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

    async addAcoustIdFetchJob(trackUid, fingerprint, duration, state) {
        const db = await this.db;
        const tx = db.transaction(ACOUST_ID_JOB_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ACOUST_ID_JOB_OBJECT_STORE_NAME);
        const uidIndex = store.index(`trackUid`);
        const key = await iDbPromisify(uidIndex.getKey(IDBKeyRange.only(trackUid)));

        if (key) {
            return;
        }

        await iDbPromisify(store.add({
            trackUid, created: new Date(),
            fingerprint, duration, lastError: null,
            lastTried: new Date(0), state
        }));
    }

    async getAlbumArtData(trackUid, artist, album) {
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

    async addAlbumArtData(trackUid, albumArtData) {
        const db = await this.db;
        const tx = db.transaction(ALBUM_ART_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(ALBUM_ART_OBJECT_STORE_NAME);
        const storedData = await iDbPromisify(store.get(IDBKeyRange.only(trackUid)));

        if (storedData && storedData.images && storedData.images.length > 0) {
            const storedImages = storedData.images;
            const newImages = albumArtData.images;

            for (let i = 0; i < newImages.length; ++i) {
                const newImage = newImages[i];
                const {imageType, image} = newImage;
                let shouldBeAdded = true;
                for (let j = 0; j < storedImages.length; ++j) {
                    const storedImage = storedImages[j];
                    if (storedImage.imageType === imageType &&
                        storedImage.image === image) {
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

    async fileByFileReference(fileReference) {
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
            return result.file;
        } else {
            throw new Error(`invalid fileReference`);
        }
    }

    async ensureFileStored(trackUid, fileReference) {
        if (fileReference instanceof ArrayBuffer) {
            return false;
        } else if (fileReference instanceof File) {
            const db = await this.db;
            const tx = db.transaction(TRACK_PAYLOAD_OBJECT_STORE_NAME, READ_WRITE);
            const store = tx.objectStore(TRACK_PAYLOAD_OBJECT_STORE_NAME);
            const data = {
                payloadType: `localFile`,
                trackUid,
                file: fileReference
            };
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

    async searchPrefixes(firstPrefixKeyword) {
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const index = store.index(`prefixMulti`);
        const key = IDBKeyRange.bound(firstPrefixKeyword, `${firstPrefixKeyword}\uffff`, false, false);
        return iDbPromisify(index.getAll(key));
    }

    async searchSuffixes(firstSuffixKeyword) {
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_ONLY);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const index = store.index(`suffixMulti`);
        const key = IDBKeyRange.bound(firstSuffixKeyword, `${firstSuffixKeyword}\uffff`, false, false);
        return iDbPromisify(index.getAll(key));
    }

    async removeSearchEntriesForTrackUid(trackUid) {
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        const index = store.index(TRACK_INFO_PRIMARY_KEY_NAME);
        const key = IDBKeyRange.only(trackUid);
        const cursor = index.openCursor(key, `next`);
        await iDbPromisifyCursor(cursor, async (result) => {
            console.log(`deleting ${result.primaryKey} ${result.value.value}`);
            await iDbPromisify(result.delete());
            console.log(`delete complete`);
            result.continue(key);
        });
    }

    async addToSearchIndex(entry) {
        const db = await this.db;
        const tx = db.transaction(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME, READ_WRITE);
        const store = tx.objectStore(TRACK_SEARCH_INDEX_OBJECT_STORE_NAME);
        await store.add(entry);
    }
}

const fieldUpdater = function(...fieldNames) {
    return {
        async method(trackUid, ...values) {
            const db = await this.db;
            const tx = db.transaction(TRACK_INFO_OBJECT_STORE_NAME, READ_WRITE);
            const store = tx.objectStore(TRACK_INFO_OBJECT_STORE_NAME);
            let data = await iDbPromisify(store.get(trackUid));
            data = Object(data);
            data.trackUid = trackUid;
            for (let i = 0; i < fieldNames.length; ++i) {
                const name = fieldNames[i];
                const value = values[i];
                data[name] = value;
            }
            return iDbPromisify(store.put(data));
        }
    };
};

TagDatabase.prototype.updateHasBeenFingerprinted = fieldUpdater(`hasBeenFingerprinted`).method;
TagDatabase.prototype.updateEstablishedGain = fieldUpdater(`establishedGain`).method;
TagDatabase.prototype.updateRating = fieldUpdater(`rating`).method;
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater(`playthroughCounter`, `lastPlayed`).method;
TagDatabase.prototype.updateSkipCounter = fieldUpdater(`skipCounter`, `lastPlayed`).method;
