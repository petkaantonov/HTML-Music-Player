import { DatabaseClosedError } from "shared/errors";
import { applyStoreSpec, iDbPromisify } from "shared/idb/indexedDbUtil";
import { DatabaseClosedEmitterTrait, DatabaseEventsMap } from "shared/platform/DatabaseClosedEmitterTrait";
import { PreferenceArray, StoredKVValues } from "shared/preferences";
import { decode, EventEmitterInterface, LogFunction, typedKeys } from "shared/types/helpers";
import EventEmitter from "vendor/events";

const VERSION = 2;
const NAME = `AppDatabase`;
const KEY_VALUE_PAIRS_KEY_NAME = `key`;
const KEY_VALUE_PAIRS_OBJECT_STORE_NAME = `keyValuePairs`;
const READ_WRITE = `readwrite`;
const READ_ONLY = `readonly`;

const LOG_OBJECT_STORE_NAME = `logs`;
const LOG_PRIMARY_KEY_NAME = `id`;

const TMP_FILES_OBJECT_STORE_NAME = `tmpFiles`;
const TMP_FILE_KEY_NAME = `tmpFileId`;
const SOURCE_KEY = `source`;

interface TmpFile {
    created: Date;
    file: File;
    source: string;
}

const objectStoreSpec = {
    [KEY_VALUE_PAIRS_OBJECT_STORE_NAME]: {
        keyPath: KEY_VALUE_PAIRS_KEY_NAME,
    },
    [LOG_OBJECT_STORE_NAME]: {
        keyPath: LOG_PRIMARY_KEY_NAME,
        autoIncrement: true,
    },
    [TMP_FILES_OBJECT_STORE_NAME]: {
        keyPath: TMP_FILE_KEY_NAME,
        autoIncrement: true,
        indexSpec: {
            [SOURCE_KEY]: {
                unique: false,
                multiEntry: false,
                keyPath: SOURCE_KEY,
            },
        },
    },
};

class KeyValueDatabase extends EventEmitter {
    private _closed: boolean;
    private _uiLogRef: LogFunction;
    private _lastLog: null | string;
    private db: Promise<IDBDatabase>;
    private initialValues: Promise<StoredKVValues>;
    private keySetters: Record<string, (this: KeyValueDatabase, value: any) => void>;

    constructor(uiLog: LogFunction) {
        super();
        this._closed = false;
        /* eslint-disable no-undef */
        const request = indexedDB.open(NAME, VERSION);
        /* eslint-enable no-undef */
        this.db = iDbPromisify(request);
        request.onupgradeneeded = () => {
            applyStoreSpec(request.transaction!, objectStoreSpec);
        };
        this.initialValues = this.getAll();
        this.keySetters = Object.create(null);

        this._uiLogRef = uiLog;
        this._lastLog = null;
        void this._setHandlers();
    }

    async _setHandlers() {
        const db = await this.db;
        db.onversionchange = () => {
            this._closed = true;
            db.close();
            this.databaseClosed();
        };
        db.onclose = () => {
            this._closed = true;
            this.databaseClosed();
        };
    }

    _checkClosed() {
        if (this._closed) {
            throw new DatabaseClosedError();
        }
    }

    async close() {
        const db = await this.db;
        this._closed = true;
        db.close();
        this.databaseClosed();
    }

    getKeySetter(key: string) {
        if (!this.keySetters[key]) {
            const keySetter: { method: (this: KeyValueDatabase, value: any) => void } = {
                async method(value: any) {
                    this._checkClosed();
                    const db = await this.db;
                    const transaction = db.transaction(KEY_VALUE_PAIRS_OBJECT_STORE_NAME, READ_WRITE);
                    const store = transaction.objectStore(KEY_VALUE_PAIRS_OBJECT_STORE_NAME);
                    const existingData = await iDbPromisify(store.get(key));
                    if (existingData) {
                        existingData.value = value;
                        return iDbPromisify(store.put(existingData));
                    } else {
                        const data = { key, value };
                        return iDbPromisify(store.add(data));
                    }
                },
            };
            this.keySetters[key] = keySetter.method;
        }
        return this.keySetters[key];
    }

    getInitialValues() {
        return this.initialValues;
    }

    uiLogOverwrite = (...args: string[]) => {
        const msg = args.join(` `);
        if (msg === this._lastLog) {
            return;
        }
        this._lastLog = msg;
        void this.storeLog(msg);
        this._uiLogRef(...args);
    };

    async storeLog(message: string) {
        if (this.isClosedAndEmit()) return null;
        const date = new Date();
        const db = await this.db;
        const store = db.transaction(LOG_OBJECT_STORE_NAME, READ_WRITE).objectStore(LOG_OBJECT_STORE_NAME);
        return iDbPromisify(store.add({ message, date }));
    }

    async set<T extends keyof StoredKVValues>(key: T, value: Exclude<StoredKVValues[T], undefined>): Promise<void> {
        if (this.isClosedAndEmit()) return;
        return this.getKeySetter(`${key}`)!.call(this, value);
    }

    async get<T extends keyof StoredKVValues>(key: T): Promise<StoredKVValues[T] | null> {
        if (this.isClosedAndEmit()) return null;
        const db = await this.db;
        const store = db
            .transaction(KEY_VALUE_PAIRS_OBJECT_STORE_NAME, READ_ONLY)
            .objectStore(KEY_VALUE_PAIRS_OBJECT_STORE_NAME);
        return iDbPromisify(store.get(key));
    }

    async getAll(): Promise<StoredKVValues> {
        if (this.isClosedAndEmit()) return {};
        const db = await this.db;
        const store = db
            .transaction(KEY_VALUE_PAIRS_OBJECT_STORE_NAME, READ_ONLY)
            .objectStore(KEY_VALUE_PAIRS_OBJECT_STORE_NAME);
        const keyValuePairs = await iDbPromisify(store.getAll());

        const ret = Object.create(null);
        keyValuePairs.forEach(pair => {
            ret[pair.key] = pair.value;
        });
        return decode(StoredKVValues, ret);
    }

    async setAll(preferenceKeyValuePairs: PreferenceArray) {
        if (this.isClosedAndEmit()) return;
        const db = await this.db;
        const store = db
            .transaction(KEY_VALUE_PAIRS_OBJECT_STORE_NAME, READ_WRITE)
            .objectStore(KEY_VALUE_PAIRS_OBJECT_STORE_NAME);

        const ret = Object.create(null);
        for (const pair of preferenceKeyValuePairs) {
            ret[pair.key] = pair.value;
        }
        try {
            decode(StoredKVValues, ret);
        } catch (e) {
            return;
        }

        for (const preferenceKeyValuePair of preferenceKeyValuePairs) {
            await iDbPromisify(store.put(preferenceKeyValuePair));
        }
    }

    async setAllObject(preferencesAny: any) {
        if (this.isClosedAndEmit()) return;
        const db = await this.db;
        const store = db
            .transaction(KEY_VALUE_PAIRS_OBJECT_STORE_NAME, READ_WRITE)
            .objectStore(KEY_VALUE_PAIRS_OBJECT_STORE_NAME);
        const preferences = decode(StoredKVValues, preferencesAny);

        const keys = typedKeys(preferences);

        for (const key of keys) {
            const obj = { key, value: preferences[key] };
            await iDbPromisify(store.put(obj));
        }
    }

    getDb() {
        return this.db;
    }

    async getTmpFiles(): Promise<TmpFile[]> {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_ONLY).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        return iDbPromisify(store.getAll());
    }

    async consumeTmpFileById(tmpFileId: IDBValidKey): Promise<TmpFile> {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_WRITE).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        const ret = await iDbPromisify(store.get(tmpFileId));
        await iDbPromisify(store.delete(tmpFileId));
        return ret;
    }

    async getTmpFileById(tmpFileId: IDBValidKey): Promise<TmpFile> {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_ONLY).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        return iDbPromisify(store.get(tmpFileId));
    }

    async addTmpFile(file: File | Blob, source: string) {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_WRITE).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        const obj: TmpFile = {
            created: new Date(),
            file: file as File,
            [SOURCE_KEY]: source,
        };
        const ret = await iDbPromisify(store.add(obj));
        return ret;
    }

    async clearTmpFiles() {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_WRITE).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        await iDbPromisify(store.clear());
    }

    async deleteTmpFile(tmpFileId: IDBValidKey) {
        this._checkClosed();
        const db = await this.db;
        const store = db.transaction(TMP_FILES_OBJECT_STORE_NAME, READ_WRITE).objectStore(TMP_FILES_OBJECT_STORE_NAME);
        await iDbPromisify(store.delete(tmpFileId));
    }

    isClosed() {
        return this._closed;
    }

    isClosedAndEmit() {
        if (this.isClosed()) {
            this.databaseClosed();
            return true;
        }
        return false;
    }
}

Object.assign(KeyValueDatabase.prototype, DatabaseClosedEmitterTrait);
interface KeyValueDatabase extends EventEmitterInterface<DatabaseEventsMap>, DatabaseClosedEmitterTrait {}
export default KeyValueDatabase;
