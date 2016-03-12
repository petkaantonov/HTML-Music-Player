"use strict";
import Promise from "lib/bluebird";
import { IDBPromisify, assign } from "lib/util";
const VERSION = 3;
const NAME = "TagDatabase";
const KEY_NAME = "trackUid";
const ALBUM_KEY_NAME = "album";
const TABLE_NAME = "trackInfo";
const COVERART_TABLE_NAME = "coverart";
const READ_WRITE = "readwrite";
const READ_ONLY = "readonly";

const indexedDB = self.indexedDB || self.mozIndexedDB || self.msIndexedDB;

function TagDatabase() {
    var request = indexedDB.open(NAME, VERSION);
    this.db = IDBPromisify(request);
    this.db.suppressUnhandledRejections();

    this._onUpgradeNeeded = this._onUpgradeNeeded.bind(this);
    request.onupgradeneeded = this._onUpgradeNeeded;
}

TagDatabase.prototype._onUpgradeNeeded = function(event) {
    var db = event.target.result;
    var objectStore = Promise.resolve();
    var albumStore = Promise.resolve();

    try {
        objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
        objectStore = IDBPromisify(objectStore.transaction);
    } catch (e) {}

    try {
        albumStore = db.createObjectStore(COVERART_TABLE_NAME, { keyPath: ALBUM_KEY_NAME});
        albumStore = IDBPromisify(albumStore.transaction);
    } catch (e) {}

    this.db = Promise.all([objectStore, albumStore]).thenReturn(db);
};

TagDatabase.prototype.query = function(trackUid) {
    return this.db.then(function(db) {
        return IDBPromisify(db.transaction(TABLE_NAME).objectStore(TABLE_NAME).get(trackUid));
    });
};

TagDatabase.prototype.getAlbumImage = function(album) {
    if (!album) return Promise.resolve(null);
    return this.db.then(function(db) {
        return IDBPromisify(db.transaction(COVERART_TABLE_NAME).objectStore(COVERART_TABLE_NAME).get(album));
    });
};

TagDatabase.prototype.setAlbumImage = function(album, url) {
    if (!album) return Promise.resolve(null);
    album = album.toLowerCase();
    return this.db.then(function(db) {
        var store = db.transaction(COVERART_TABLE_NAME, READ_WRITE).objectStore(COVERART_TABLE_NAME);
        var obj = {
            album: album,
            url: url
        };
        return IDBPromisify(store.put(obj));
    });
};

TagDatabase.prototype.insert = function(trackUid, data) {
    data.trackUid = trackUid;
    var self = this;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return IDBPromisify(store.get(trackUid));
    }).then(function(previousData) {
        var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        var newData = assign({}, previousData || {}, data);
        return IDBPromisify(store.put(newData));
    });
};

const fieldUpdater = function(fieldName) {
    return function(trackUid, value) {
        var self = this;
        return this.db.then(function(db) {
            var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
            return IDBPromisify(store.get(trackUid));
        }).then(function(data) {
            var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
            data = Object(data);
            data.trackUid = trackUid;
            data[fieldName] = value;
            return IDBPromisify(store.put(data));
        });
    };
};

TagDatabase.prototype.updateAcoustId = fieldUpdater("acoustId");
TagDatabase.prototype.updateRating = fieldUpdater("rating");
TagDatabase.prototype.updateHasCoverArt = fieldUpdater("hasCoverArt");


self.removeTrackInfo = function(trackUid) {
    return ret.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        store.delete(trackUid);
    });
};

var ret = new TagDatabase();
module.exports = ret;
