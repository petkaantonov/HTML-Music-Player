"use strict";

import { iDbPromisify, assign } from "util";
import { indexedDB } from "platform/platform";

const VERSION = 3;
const NAME = "TagDatabase";
const KEY_NAME = "trackUid";
const ALBUM_KEY_NAME = "album";
const TABLE_NAME = "trackInfo";
const COVERART_TABLE_NAME = "coverart";
const READ_WRITE = "readwrite";
const READ_ONLY = "readonly";


export default function TagDatabase() {
    var request = indexedDB.open(NAME, VERSION);
    this.db = iDbPromisify(request);
    this._onUpgradeNeeded = this._onUpgradeNeeded.bind(this);
    request.onupgradeneeded = this._onUpgradeNeeded;
}

TagDatabase.prototype._onUpgradeNeeded = function(event) {
    var db = event.target.result;
    var objectStore = Promise.resolve();
    var albumStore = Promise.resolve();

    try {
        objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
        objectStore = iDbPromisify(objectStore.transaction);
    } catch (e) {}

    try {
        albumStore = db.createObjectStore(COVERART_TABLE_NAME, { keyPath: ALBUM_KEY_NAME});
        albumStore = iDbPromisify(albumStore.transaction);
    } catch (e) {}

    this.db = Promise.all([objectStore, albumStore]).thenReturn(db);
};

TagDatabase.prototype.query = function(trackUid) {
    return this.db.then(function(db) {
        return iDbPromisify(db.transaction(TABLE_NAME).objectStore(TABLE_NAME).get(trackUid));
    });
};

TagDatabase.prototype.getAlbumImage = function(album) {
    if (!album) return Promise.resolve(null);
    return this.db.then(function(db) {
        return iDbPromisify(db.transaction(COVERART_TABLE_NAME).objectStore(COVERART_TABLE_NAME).get(album));
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
        return iDbPromisify(store.put(obj));
    });
};

TagDatabase.prototype.insert = function(trackUid, data) {
    data.trackUid = trackUid;
    var db;
    return this.db.then(function(_db) {
        db = _db;
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return iDbPromisify(store.get(trackUid));
    }).then(function(previousData) {
        var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        var newData = assign({}, previousData || {}, data);
        return iDbPromisify(store.put(newData));
    });
};

const fieldUpdater = function() {
    var fieldNames = new Array(arguments.length);
    for (var i = 0; i < fieldNames.length; ++i) fieldNames[i] = arguments[i];

    return function(trackUid) {
        var values = new Array(arguments.length - 1);
        for (var i = 1; i < arguments.length; ++i) values[i - 1] = arguments[i];

        var db;
        return this.db.then(function(_db) {
            db = _db;
            var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
            return iDbPromisify(store.get(trackUid));
        }).then(function(data) {
            var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
            data = Object(data);
            data.trackUid = trackUid;

            for (var i = 0; i < fieldNames.length; ++i) {
                var name = fieldNames[i];
                var value = values[i];
                data[name] = value;
            }
            return iDbPromisify(store.put(data));
        });
    };
};

TagDatabase.prototype.updateAcoustId = fieldUpdater("acoustId");
TagDatabase.prototype.updateRating = fieldUpdater("rating");
TagDatabase.prototype.updateHasCoverArt = fieldUpdater("hasCoverArt");
TagDatabase.prototype.updatePlaythroughCounter = fieldUpdater("playthroughCounter", "lastPlayed");
TagDatabase.prototype.updateSkipCounter = fieldUpdater("skipCounter", "lastPlayed");
