import {iDbPromisify, throttle} from "util";
import {indexedDB, self} from "platform/platform";
import {applyStoreSpec} from "tracks/TagDatabase";

const VERSION = 4;
const NAME = `KeyValueDatabase2`;
const KEY_NAME = `key`;
const TABLE_NAME = `keyValueDatabase2`;
const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

const LOG_TABLE = `logTable`;

const objectStoreSpec = {
    [TABLE_NAME]: {
        keyPath: KEY_NAME
    },
    [LOG_TABLE]: {
        keyPath: `id`,
        autoIncrement: true
    }
};

export default class KeyValueDatabase {
    constructor() {
        const request = indexedDB.open(NAME, VERSION);
        this.db = iDbPromisify(request);
        request.onupgradeneeded = (event) => {
            applyStoreSpec(event.target.transaction, objectStoreSpec);
        };
        this.initialValues = this.getAll();
        this.keySetters = Object.create(null);

        this._uiLogRef = self.uiLog;
        self.uiLog = this.uiLogOverwrite.bind(this);
    }

    getKeySetter(key) {
        if (!this.keySetters[key]) {
            const keySetter = {
                async method(value) {
                    const db = await this.db;
                    const transaction = db.transaction(TABLE_NAME, READ_WRITE);
                    const store = transaction.objectStore(TABLE_NAME);
                    const existingData = await iDbPromisify(store.get(key));
                    if (existingData) {
                        existingData.value = value;
                        return iDbPromisify(store.put(existingData));
                    } else {
                        const data = {key, value};
                        return iDbPromisify(store.add(data));
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

    uiLogOverwrite(...args) {
        this.storeLog(args.join(` `));
        this._uiLogRef(...args);
    }

    async storeLog(message) {
        const date = new Date();
        const db = await this.db;
        const store = db.transaction(LOG_TABLE, READ_WRITE).objectStore(LOG_TABLE);
        return iDbPromisify(store.add({message, date}));
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
        const keyValuePairs = await iDbPromisify(store.getAll());

        const ret = Object.create(null);
        keyValuePairs.forEach((pair) => {
            ret[pair.key] = pair.value;
        });
        return ret;
    }

}
