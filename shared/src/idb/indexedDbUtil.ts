interface IndexSpecProps {
    unique: boolean;
    multiEntry: boolean;
    keyPath: string | string[];
}

interface IndexSpec {
    [indexName: string]: IndexSpecProps;
}

interface Spec {
    keyPath: string;
    autoIncrement?: boolean;
    indexSpec?: IndexSpec;
}

export interface StoreSpec {
    [objectStoreName: string]: Spec;
}

export function iDbPromisify<T extends any>(ee: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        ee.onerror = function (_event) {
            reject(ee.transaction!.error || ee.error);
        };
        ee.onsuccess = function (_event) {
            resolve(ee.result);
        };
    });
}

export function iDbPromisifyCursor<T>(cursor: IDBRequest<T>, callback: (arg: Exclude<T, null>) => Promise<boolean>) {
    return new Promise((resolve, reject) => {
        cursor.onerror = function (_event) {
            reject(cursor.transaction!.error || cursor.error);
        };

        cursor.onsuccess = async function (_event) {
            if (!cursor.result) {
                resolve(undefined);
            } else {
                try {
                    const finished = await callback(cursor.result as Exclude<T, null>);
                    if (finished === true) {
                        resolve(undefined);
                    }
                } catch (e) {
                    reject(e);
                }
            }
        };
    });
}

function applyIndexSpecToStore(store: IDBObjectStore, indexSpec: IndexSpec) {
    const indexNames = new Set<string>([].slice.call(store.indexNames));

    for (const indexName of Object.keys(indexSpec)) {
        if (!indexNames.has(indexName)) {
            const spec = indexSpec[indexName]!;
            store.createIndex(indexName, spec.keyPath, spec);
        }
    }

    for (const indexName of indexNames) {
        // eslint-disable-next-line no-prototype-builtins
        if (!indexSpec.hasOwnProperty(indexName)) {
            store.deleteIndex(indexName);
        }
    }
}

export function applyStoreSpec(transaction: IDBTransaction, storeSpec: StoreSpec) {
    const { db } = transaction;
    const storeNames = new Set<string>([].slice.call(transaction.objectStoreNames));
    const ret: Record<string, IDBObjectStore> = {};

    for (const storeName of Object.keys(storeSpec)) {
        const spec = storeSpec[storeName]!;
        if (!storeNames.has(storeName)) {
            ret[storeName] = db.createObjectStore(storeName, spec);
        } else {
            ret[storeName] = transaction.objectStore(storeName);
        }

        applyIndexSpecToStore(ret[storeName]!, spec.indexSpec || {});
    }

    for (const storeName of storeNames) {
        // eslint-disable-next-line no-prototype-builtins
        if (!storeSpec.hasOwnProperty(storeName)) {
            db.deleteObjectStore(storeName);
        }
    }

    return ret;
}

export async function getIndexedDbStorageInfo() {
    const ret = { used: 0, total: 0 };
    if (!self.navigator) {
        return ret;
    }
    if (self.navigator.storage && self.navigator.storage.estimate) {
        const { usage, quota } = await self.navigator.storage.estimate();
        ret.used = usage ?? 0;
        ret.total = quota ?? 0;
    }
    return ret;
}
