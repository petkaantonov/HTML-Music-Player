import {iDbPromisify, assign} from "util";
import {indexedDB} from "platform/platform";

const VERSION = 4;
const NAME = `TagDatabase`;
const KEY_NAME = `trackUid`;
const ALBUM_KEY_NAME = `album`;
const TABLE_NAME = `trackInfo`;
const COVERART_TABLE_NAME = `coverart`;
const METADATA_CACHE_TABLE_NAME = `metadataCache`;
const METADATA_CACHE_KEY = `cacheKey`;

const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

export default class TagDatabase {
    constructor() {
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = event => this._onUpgradeNeeded(event);
    }

    _onUpgradeNeeded(event) {
        const db = event.target.result;
        let objectStore = Promise.resolve();
        let albumStore = Promise.resolve();
        let metadataCache = Promise.resolve();

        try {
            objectStore = db.createObjectStore(TABLE_NAME, {keyPath: KEY_NAME});
            objectStore = iDbPromisify(objectStore.transaction);
        } catch (e) {
            // NOOP
        }

        try {
            albumStore = db.createObjectStore(COVERART_TABLE_NAME, {keyPath: ALBUM_KEY_NAME});
            albumStore = iDbPromisify(albumStore.transaction);
        } catch (e) {
            // NOOP
        }

        try {
            metadataCache = db.createObjectStore(METADATA_CACHE_TABLE_NAME, {keyPath: METADATA_CACHE_KEY});
            metadataCache = iDbPromisify(metadataCache.transaction);
        } catch (e) {
            // NOOP
        }

        this.db = (async () => {
            await Promise.all([objectStore, albumStore, metadataCache]);
            return db;
        })();
    }

    async getCachedMetadata(cacheKey) {
        const db = await this.db;
        const store = db.transaction(METADATA_CACHE_TABLE_NAME).objectStore(METADATA_CACHE_TABLE_NAME);
        return iDbPromisify(store.get(cacheKey));
    }

    async setCachedMetadata(cacheKey, data) {
        const db = await this.db;
        data.cacheKey = cacheKey;
        const tx = db.transaction(METADATA_CACHE_TABLE_NAME, READ_WRITE).objectStore(METADATA_CACHE_TABLE_NAME);
        return iDbPromisify(tx.put(data));
    }

    async query(trackUid) {
        const db = await this.db;
        const store = db.transaction(TABLE_NAME).objectStore(TABLE_NAME);
        return iDbPromisify(store.get(trackUid));
    }

    async getAlbumImage(album) {
        if (!album) return null;
        const db = await this.db;
        const store = db.transaction(COVERART_TABLE_NAME).objectStore(COVERART_TABLE_NAME);
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

    async insert(trackUid, data) {
        data.trackUid = trackUid;
        const db = await this.db;
        const tx1 = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        const previousData = await iDbPromisify(tx1.get(trackUid));
        const tx2 = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        const newData = assign({}, previousData || {}, data);
        return iDbPromisify(tx2.put(newData));
    }
}

const fieldUpdater = function(...fieldNames) {
    return {
        async method(trackUid, ...values) {
            const db = await this.db;
            const tx1 = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
            const data = Object(await iDbPromisify(tx1.get(trackUid)));
            const tx2 = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
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

TagDatabase.prototype.updateAcoustId = fieldUpdater(`acoustId`, `acoustIdFullResponse`).method;
TagDatabase.prototype.updateRating = fieldUpdater(`rating`).method;
TagDatabase.prototype.updateHasCoverArt = fieldUpdater(`hasCoverArt`).method;
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater(`playthroughCounter`, `lastPlayed`).method;
TagDatabase.prototype.updateSkipCounter = fieldUpdater(`skipCounter`, `lastPlayed`).method;
