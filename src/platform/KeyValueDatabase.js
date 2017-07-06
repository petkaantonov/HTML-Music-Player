import {delay, iDbPromisify, throttle} from "util";
import {indexedDB} from "platform/platform";

const VERSION = 2;
const NAME = `KeyValueDatabase2`;
const KEY_NAME = `key`;
const TABLE_NAME = `keyValueDatabase2`;
const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

export default class KeyValueDatabase {
    constructor() {
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = event => this._onUpgradeNeeded(event);
        this.initialValues = this.getAll();
        this.keySetters = Object.create(null);
    }

    getKeySetter(key) {
        if (!this.keySetters[key]) {
            const keySetter = {
                async method(value) {
                    const db = await this.db;
                    const tx1 = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
                    const existingData = await iDbPromisify(tx1.get(key));
                    const tx2 = db.transaction(TABLE_NAME, READ_WRITE).objectStore(TABLE_NAME);
                    if (existingData) {
                        existingData.value = value;
                        return iDbPromisify(tx2.put(existingData));
                    } else {
                        const data = {key, value};
                        return iDbPromisify(tx2.add(data));
                    }
                }
            };
            this.keySetters[key] = throttle(keySetter.method, 1000);
        }
        return this.keySetters[key];
    }

    getInitialValues() {
        return this.initialValues;
    }

    _onUpgradeNeeded(event) {
        const db = event.target.result;
        const objectStore = db.createObjectStore(TABLE_NAME, {keyPath: KEY_NAME});
        objectStore.createIndex(`key`, `key`, {unique: true});
        this.db = (async () => {
            await iDbPromisify(objectStore.transaction);
            return db;
        })();
    }

    set(key, value) {
        return this.getKeySetter(`${key}`).call(this, value);
    }

    async get(key) {
        key = `${key}`;
        const db = await this.db;
        const store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        return iDbPromisify(store.get(key));
    }

    async getAll() {
        const db = await this.db;
        const store = db.transaction(TABLE_NAME, READ_ONLY).objectStore(TABLE_NAME);
        const index = store.index(KEY_NAME);
        let tries = 0;
        let keyValuePairs;
        while (tries < 5) {
            try {
                keyValuePairs = await new Promise((resolve, reject) => {
                    const items = [];
                    const cursor = index.openCursor();
                    cursor.onsuccess = function(event) {
                        const {result} = event.target;
                        if (!result) {
                            resolve(items);
                            return;
                        }
                        items.push(result.value);
                        result.continue();
                    };
                    cursor.onerror = reject;
                });
                break;
            } catch (e) {
                tries++;
                await delay(500);
            }
        }

        const ret = Object.create(null);
        keyValuePairs.forEach((pair) => {
            ret[pair.key] = pair.value;
        });
        return ret;
    }

}
