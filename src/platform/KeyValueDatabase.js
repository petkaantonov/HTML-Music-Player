"use strict";

import { iDbPromisify, throttle } from "util";
import { indexedDB } from "platform/platform";

const VERSION = 2;
const NAME = "KeyValueDatabase2";
const KEY_NAME = "key";
const TABLE_NAME = "keyValueDatabase2";
const READ_WRITE = "readwrite";
const READ_ONLY = "readonly";

export default function KeyValueDatabase() {
    var request = indexedDB.open(NAME, VERSION);
    this.db = iDbPromisify(request);
    this._onUpgradeNeeded = this._onUpgradeNeeded.bind(this);
    request.onupgradeneeded = this._onUpgradeNeeded;
    this.initialValues = this.getAll();
    this.keySetters = Object.create(null);
}

KeyValueDatabase.prototype.getKeySetter = function(key) {
    if (!this.keySetters[key]) {
        this.keySetters[key] = throttle(function(value) {
            var self = this;
            var db;
            return this.db.then(function(_db) {
                db = _db;
                var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
                return iDbPromisify(store.get(key));
            }).then(function(existingData) {
                var store = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
                if (existingData) {
                    existingData.value = value;
                    return iDbPromisify(store.put(existingData));
                } else {
                    var data = {
                        key: key,
                        value: value
                    };
                    return iDbPromisify(store.add(data));
                }
            });
        }, 1000);
    }
    return this.keySetters[key];
};

KeyValueDatabase.prototype.getInitialValues = function() {
    return this.initialValues;
};

KeyValueDatabase.prototype._onUpgradeNeeded = function(event) {
    var db = event.target.result;
    var objectStore = db.createObjectStore(TABLE_NAME, { keyPath: KEY_NAME });
    objectStore.createIndex("key", "key", {unique: true});
    this.db = iDbPromisify(objectStore.transaction).thenReturn(db);
};

KeyValueDatabase.prototype.set = function(key, value) {
    key = key + "";
    return this.getKeySetter(key).call(this, value);
};

KeyValueDatabase.prototype.get = function(key) {
    key = "" + key;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return iDbPromisify(store.get(key));
    });
};

KeyValueDatabase.prototype.getAll = function(_tries) {
    if (_tries === undefined) _tries = 0;
    var self = this;
    return this.db.then(function(db) {
        var store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        var index = store.index(KEY_NAME);
        var ret = [];
        return new Promise(function(resolve, reject) {
            var cursor = index.openCursor();

            cursor.onsuccess = function(event) {
                var cursor = event.target.result;
                if (!cursor) return resolve(ret);
                ret.push(cursor.value);
                cursor.continue();
            };

            cursor.onerror = reject;
        });
    }).then(function(keyValuePairs) {
        var ret = Object.create(null);
        keyValuePairs.forEach(function(pair) {
            ret[pair.key] = pair.value;
        });
        return ret;
    }).catch(function(e) {
        if (_tries > 5) throw e;
        return Promise.delay(500).then(function() {
            return self.getAll(_tries + 1);
        });
    });
};
