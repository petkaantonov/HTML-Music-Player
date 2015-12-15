var tagDatabase = (function() {"use strict";
const VERSION = 3;
const NAME = "TagDatabase";
const KEY_NAME = "trackUid";
const ALBUM_KEY_NAME = "album";
const TABLE_NAME = "trackInfo";
const COVERART_TABLE_NAME = "coverart";
const READ_WRITE = "readwrite";
const READ_ONLY = "readonly";

const indexedDB = window.indexedDB || window.mozIndexedDB || window.msIndexedDB;
const IDBTransaction = window.IDBTransaction ||  window.msIDBTransaction || {READ_WRITE: "readwrite"}; // This line should only be needed if it is needed to support the object's constants for older browsers
const IDBKeyRange = window.IDBKeyRange || window.msIDBKeyRange;


function TagDatabase() {
    var request = indexedDB.open(NAME, VERSION);
    this.db = util.IDBPromisify(request);
    this.db.suppressUnhandledRejections();

    this._onUpgradeNeeded = $.proxy(this._onUpgradeNeeded, this);
    request.onupgradeneeded = this._onUpgradeNeeded;
}

TagDatabase.prototype._onUpgradeNeeded = function(event) {
    var db = event.target.result;
    var objectStore = Promise.resolve();
    var albumStore = Promise.resolve();

    try {
        objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
    } catch (e) {}

    try {
        albumStore = db.createObjectStore(COVERART_TABLE_NAME, { keyPath: ALBUM_KEY_NAME});
    } catch (e) {}

    this.db = Promise.all([util.IDBPromisify(objectStore.transaction),
                           util.IDBPromisify(albumStore.transaction)]).thenReturn(db);
};

TagDatabase.prototype.query = function(trackUid) {
    return this.db.then(function(db) {
        return util.IDBPromisify(db.transaction(TABLE_NAME).objectStore(TABLE_NAME).get(trackUid));
    });
};

TagDatabase.prototype.getAlbumImage = function(album) {
    if (!album) return Promise.resolve(null);
    return this.db.then(function(db) {
        return util.IDBPromisify(db.transaction(COVERART_TABLE_NAME).objectStore(COVERART_TABLE_NAME).get(album));
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
        return util.IDBPromisify(store.put(obj));
    });
};

TagDatabase.prototype.insert = function(trackUid, data) {
    data.trackUid = trackUid;
    var self = this;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return util.IDBPromisify(store.get(trackUid));
    }).then(function(previousData) {
        var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        var newData = $.extend({}, previousData || {}, data);
        return util.IDBPromisify(store.put(newData));
    });
};

const fieldUpdater = function(fieldName) {
    return function(trackUid, value) {
        var self = this;
        return this.db.then(function(db) {
            var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
            return util.IDBPromisify(store.get(trackUid));
        }).then(function(data) {
            var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
            data = Object(data);
            data.trackUid = trackUid;
            data[fieldName] = value;
            return util.IDBPromisify(store.put(data));
        });
    };
};

TagDatabase.prototype.updateAcoustId = fieldUpdater("acoustId");
TagDatabase.prototype.updateRating = fieldUpdater("rating");
TagDatabase.prototype.updateCoverArtImageUrl = fieldUpdater("coverArtImageUrl");

return new TagDatabase();})();
