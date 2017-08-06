import {fsPromisify} from "utils/indexedDbUtil";
import {webkitRequestFileSystem, PERSISTENT, webkitPersistentStorage,
    PATH_EXISTS_ERROR, NOT_FOUND_ERROR,
 INVALID_MODIFICATION_ERROR} from "platform/platform";
import {hexString, hexDecode} from "util";

const QUOTA_TO_REQUEST = 1024 * 1024 * 1024 * 1024;
const LOCAL_STORAGE_GRANTED_KEY = `fs_granted`;
const TRACK_FILE_NAME_PREFIX = `trackUid-`;

const rTrackUid = new RegExp(String.raw`${TRACK_FILE_NAME_PREFIX}([a-fA-F0-9]{40})`);
export function trackUidFromFile(file) {
    const matches = rTrackUid.exec(file.name);
    if (matches) {
        return hexDecode(matches[1]);
    }
    return null;
}

function dirNameFromFileName(fileName) {
    return rTrackUid.exec(fileName)[1].charAt(0);
}

function trackUidToFileName(trackUid) {
    const trackUidString = hexString(trackUid);
    return `${TRACK_FILE_NAME_PREFIX}${trackUidString}`;
}

function requestQuota() {
    if (webkitPersistentStorage) {
        return fsPromisify(webkitPersistentStorage, `requestQuota`, QUOTA_TO_REQUEST);
    } else if (self.callMainWindow) {
        return self.callMainWindow(`requestPersistentQuota`, [QUOTA_TO_REQUEST]);
    } else {
        return 0;
    }
}

function getGranted() {
    if (self.localStorage) {
        return self.localStorage.getItem(LOCAL_STORAGE_GRANTED_KEY);
    } else {
        return self.callMainWindow(`getLocalStorageItem`, [LOCAL_STORAGE_GRANTED_KEY]);
    }
}

function setGranted(value) {
    if (self.localStorage) {
        return self.localStorage.setItem(LOCAL_STORAGE_GRANTED_KEY, value);
    } else {
        return self.callMainWindow(`setLocalStorageItem`, [LOCAL_STORAGE_GRANTED_KEY, value]);
    }
}

export default class FileSystemWrapper {
    constructor() {
        this._fs = null;
        this._spaceAvailable = 0;
        this._initAttempted = false;
    }

    _initFs() {
        if (this._initAttempted) return this._fs;
        this._initAttempted = true;
        if (webkitRequestFileSystem) {
            this._fs = (async () => {
                try {
                    let granted = await getGranted();
                    granted = +granted;
                    if (!granted) {
                        granted = await requestQuota();
                        await setGranted(granted);
                    }
                    this._spaceAvailable = granted;
                    if (!granted) {
                        return null;
                    }
                    return fsPromisify(self, `webkitRequestFileSystem`, PERSISTENT, granted);
                } catch (e) {
                    this._spaceAvailable = 0;
                    self.uiLog(`FileSystemWrapper constructor`, e.name, e.message);
                    return null;
                }
            })();

            this._fs = this._fs.then((fs) => {
                this._fs = fs;
            });
        }
        return this._fs;
    }

    async spaceAvailable() {
        await this._initFs();
        return this._spaceAvailable;
    }

    async getFileByTrackUid(trackUid) {
        await this._initFs();
        if (this._spaceAvailable === 0) return null;
        const fileName = trackUidToFileName(trackUid);
        const dirName = dirNameFromFileName(fileName);
        let fileEntry;
        try {
            const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, dirName, {create: true});
            fileEntry = await fsPromisify(dirEntry, `getFile`, fileName, {create: false});
        } catch (e) {
            if (e.name === NOT_FOUND_ERROR) {
                return null;
            }
            throw e;
        }

        return fsPromisify(fileEntry, `file`);
    }

    async storeFileByTrackUid(trackUid, file) {
        await this._initFs();
        if (this._spaceAvailable === 0) {
            throw new Error(`file system not available`);
        }
        const fileName = trackUidToFileName(trackUid);
        const dirName = dirNameFromFileName(fileName);
        const path = `${dirName}/${fileName}`;
        let fileEntry;
        try {
            const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, dirName, {create: true});
            fileEntry = await fsPromisify(dirEntry, `getFile`, fileName, {create: true, exclusive: true});
        } catch (e) {
            if (e.name === PATH_EXISTS_ERROR || e.name === INVALID_MODIFICATION_ERROR) {
                return null;
            }
            throw e;
        }
        const writer = await fsPromisify(fileEntry, `createWriter`);
        return new Promise((resolve, reject) => {
            writer.onwriteend = () => {
                resolve(path);
            };
            writer.onerror = (e) => {
                reject(writer.error || e.error || e);
            };
            writer.seek(0);
            writer.write(file);
        });
    }

    async _walkDir(dir, callback) {
        const reader = dir.createReader();
        while (true) {
            const results = await fsPromisify(reader, `readEntries`);
            if (!results.length) {
                break;
            }
            for (const entry of results) {
                if (entry.isFile) {
                    const file = await fsPromisify(entry, `file`);
                    await callback(file, entry);
                } else if (entry.isDirectory) {
                    await this._walkDir(entry, callback);
                }
            }
        }
    }

    async walkStoredTrackFiles(callback) {
        await this._initFs();
        if (this._spaceAvailable === 0) {
            throw new Error(`file system not available`);
        }
        return this._walkDir(this._fs.root, callback);
    }
}
