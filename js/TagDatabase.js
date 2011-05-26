var tagDatabase = (function() {"use strict";
const VERSION = 2;
const NAME = "TagDatabase";
const KEY_NAME = "trackUid";
const TABLE_NAME = "trackInfo";
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
    var objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
    this.db = util.IDBPromisify(objectStore.transaction).thenReturn(db);
};

TagDatabase.prototype.query = function(trackUid) {
    return this.db.then(function(db) {
        return util.IDBPromisify(db.transaction(TABLE_NAME).objectStore(TABLE_NAME).get(trackUid));
    });
};

TagDatabase.prototype.insert = function(trackUid, data) {
    data.trackUid = trackUid;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        return util.IDBPromisify(store.add(data));
    });
};

TagDatabase.prototype.updateRating = function(trackUid, rating) {
    var self = this;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return util.IDBPromisify(store.get(trackUid));
    }).then(function(data) {
        var store = self.db.value().transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
        data = Object(data);
        data.trackUid = trackUid;
        data.rating = rating;
        return util.IDBPromisify(store.put(data));
    });
};


return new TagDatabase();})();
