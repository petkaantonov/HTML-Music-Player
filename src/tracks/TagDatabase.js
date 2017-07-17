import {iDbPromisify} from "util";
import {indexedDB} from "platform/platform";

const VERSION = 5;
const NAME = `TagDatabase`;
const KEY_NAME = `trackUid`;
const ALBUM_KEY_NAME = `album`;
const TABLE_NAME = `trackInfo`;
const COVERART_TABLE_NAME = `coverart`;

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


        this.db = (async () => {
            await Promise.all([objectStore, albumStore]);
            return db;
        })();
    }

    async getTrackInfoByTrackUid(trackUid) {
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

    async replaceTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        return iDbPromisify(tx.put(trackInfo));
    }

    async addTrackInfo(trackUid, trackInfo) {
        trackInfo.trackUid = trackUid;
        const db = await this.db;
        const tx1 = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        const previousTrackInfo = await iDbPromisify(tx1.get(trackUid));
        const tx2 = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        const newTrackInfo = Object.assign({}, previousTrackInfo || {}, trackInfo);
        await iDbPromisify(tx2.put(newTrackInfo));
        return newTrackInfo;
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

TagDatabase.prototype.setAcoustIdResponse = fieldUpdater(`acoustIdFullResponse`).method;
TagDatabase.prototype.updateRating = fieldUpdater(`rating`).method;
TagDatabase.prototype.updateHasCoverArt = fieldUpdater(`hasCoverArt`).method;
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater(`playthroughCounter`, `lastPlayed`).method;
TagDatabase.prototype.updateSkipCounter = fieldUpdater(`skipCounter`, `lastPlayed`).method;
