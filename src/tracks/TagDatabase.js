import {iDbPromisify, promisifyKeyCursorContinue, promisifyCursorContinuePrimaryKey} from "util";
import {indexedDB, IDBKeyRange} from "platform/platform";

const VERSION = 11;
const NAME = `TagDatabase`;
const TRACK_INFO_PRIMARY_KEY_NAME = `trackUid`;
const ALBUM_KEY_NAME = `album`;
const TRACK_INFO_TABLE_NAME = `trackInfo`;
const COVERART_TABLE_NAME = `coverart`;

const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

const trackInfoIndexSpec = {
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
};

export default class TagDatabase {
    constructor() {
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = (event) => {
            const expectedStoreNames = new Set([TRACK_INFO_TABLE_NAME, COVERART_TABLE_NAME]);
            const {target} = event;
            const {transaction} = target;
            const {db} = transaction;

            const storeNames = [].slice.call(transaction.objectStoreNames);

            for (const storeName of storeNames) {
                if (!expectedStoreNames.has(storeName)) {
                    db.deleteObjectStore(storeName);
                }
            }

            let trackInfoStore;
            if (storeNames.indexOf(TRACK_INFO_TABLE_NAME) === -1) {
                trackInfoStore = db.createObjectStore(TRACK_INFO_TABLE_NAME, {keyPath: TRACK_INFO_PRIMARY_KEY_NAME});
            } else {
                trackInfoStore = transaction.objectStore(TRACK_INFO_TABLE_NAME);
            }

            const indexNames = new Set([].slice.call(trackInfoStore.indexNames));

            for (const indexName of Object.keys(trackInfoIndexSpec)) {
                if (!indexNames.has(indexName)) {
                    const spec = trackInfoIndexSpec[indexName];
                    trackInfoStore.createIndex(indexName, spec.keyPath, spec);
                }
            }

            for (const indexName of indexNames) {
                if (!trackInfoIndexSpec.hasOwnProperty(indexName)) {
                    trackInfoStore.deleteIndex(indexName);
                }
            }

            if (storeNames.indexOf(COVERART_TABLE_NAME) === -1) {
                db.createObjectStore(COVERART_TABLE_NAME, {keyPath: ALBUM_KEY_NAME});
            }

            const wipeOutTrackInfo = event.oldVersion < 11;
            if (wipeOutTrackInfo) {
                trackInfoStore.clear();
            }
        };
    }

    async _getTrackInfoByCursor(onlyKeys, keyName,
                                {before = null, after = null, limit}) {
        const db = await this.db;
        const store = db.transaction(TRACK_INFO_TABLE_NAME, READ_ONLY).objectStore(TRACK_INFO_TABLE_NAME);
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

        const store = db.transaction(TRACK_INFO_TABLE_NAME, READ_ONLY).objectStore(TRACK_INFO_TABLE_NAME);
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
        const store = db.transaction(TRACK_INFO_TABLE_NAME).objectStore(TRACK_INFO_TABLE_NAME);
        return iDbPromisify(store.get(trackUid));
    }

    async getAlbumImage(album) {
        if (!album) return null;
        const db = await this.db;
        const store = db.transaction(COVERART_TABLE_NAME, READ_ONLY).objectStore(COVERART_TABLE_NAME);
        return iDbPromisify(store.get(album));
    }

    async setAlbumImage(album, url) {
        if (!album) return null;
        album = album.toLowerCase();
        const db = await this.db;
        const store = db.transaction(COVERART_TABLE_NAME, READ_WRITE).objectStore(COVERART_TABLE_NAME);
        const obj = {album, url};
        return iDbPromisify(store.put(obj));
    }

    async replaceTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx = db.transaction(TRACK_INFO_TABLE_NAME, READ_WRITE).objectStore(TRACK_INFO_TABLE_NAME);
        return iDbPromisify(tx.put(trackInfo));
    }

    async addTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx1 = db.transaction(TRACK_INFO_TABLE_NAME, READ_ONLY).objectStore(TRACK_INFO_TABLE_NAME);
        const previousTrackInfo = await iDbPromisify(tx1.get(trackUid));
        const tx2 = db.transaction(TRACK_INFO_TABLE_NAME, READ_WRITE).objectStore(TRACK_INFO_TABLE_NAME);
        const newTrackInfo = Object.assign({}, previousTrackInfo || {}, trackInfo);
        await iDbPromisify(tx2.put(newTrackInfo));
        return newTrackInfo;
    }
}

const fieldUpdater = function(...fieldNames) {
    return {
        async method(trackUid, ...values) {
            const db = await this.db;
            const tx1 = db.transaction(TRACK_INFO_TABLE_NAME, READ_ONLY).objectStore(TRACK_INFO_TABLE_NAME);
            const data = Object(await iDbPromisify(tx1.get(trackUid)));
            const tx2 = db.transaction(TRACK_INFO_TABLE_NAME, READ_WRITE).objectStore(TRACK_INFO_TABLE_NAME);
            data.trackUid = trackUid;
            for (let i = 0; i < fieldNames.length; ++i) {
                const name = fieldNames[i];
                const value = values[i];
                data[name] = value;
            }
            return iDbPromisify(tx2.put(data));
        }
    };
};

TagDatabase.prototype.setAcoustIdResponse = fieldUpdater(`acoustIdFullResponse`).method;
TagDatabase.prototype.updateRating = fieldUpdater(`rating`).method;
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater(`playthroughCounter`, `lastPlayed`).method;
TagDatabase.prototype.updateSkipCounter = fieldUpdater(`skipCounter`, `lastPlayed`).method;
