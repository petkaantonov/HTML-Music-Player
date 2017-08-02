import {fsPromisify} from "utils/indexedDbUtil";
import {crypto, webkitRequestFileSystem, PERSISTENT, webkitStorageInfo, Uint32Array,
    PATH_EXISTS_ERROR, NOT_FOUND_ERROR} from "platform/platform";
import {hexString} from "util";

const QUOTA_TO_REQUEST = 1024 * 1024 * 1024 * 1024;
const TMP_FILE_DIR_NAME = `tmpFiles`;
const LOCAL_STORAGE_GRANTED_KEY = `fs_granted`;

function tmpIdToFileName(id) {
    return `tmp-file-${id}`;
}

function requestQuota() {
    if (webkitStorageInfo) {
        return fsPromisify(webkitStorageInfo, `requestQuota`, PERSISTENT, QUOTA_TO_REQUEST);
    } else if (self.callMainWindow) {
        return self.callMainWindow(`requestQuota`, [PERSISTENT, QUOTA_TO_REQUEST]);
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
        const trackUidString = await hexString(trackUid);
        const fileName = `trackUid-${trackUidString}`;
        let fileEntry;
        try {
            fileEntry = await fsPromisify(this._fs.root, `getFile`, fileName, {create: false});
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
        const trackUidString = await hexString(trackUid);
        const fileName = `trackUid-${trackUidString}`;
        let fileEntry;
        try {
            fileEntry = await fsPromisify(this._fs.root, `getFile`, fileName, {create: true, exclusive: true});
        } catch (e) {
            if (e.name === PATH_EXISTS_ERROR) {
                return false;
            }
            throw e;
        }
        const writer = await fsPromisify(fileEntry, `createWriter`);
        return new Promise((resolve, reject) => {
            writer.onwriteend = () => {
                resolve(true);
            };
            writer.onerror = (e) => {
                reject(writer.error || e.error || e);
            };
            writer.seek(0);
            writer.write(file);
        });
    }

    async storeTmpFileAsTrack(trackUid, tmpFileId) {
        await this._initFs();
        if (this._spaceAvailable === 0) return false;
        const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, TMP_FILE_DIR_NAME, {create: true});
        const trackUidString = await hexString(trackUid);
        const newFileName = `trackUid-${trackUidString}`;
        const oldFileName = tmpIdToFileName(tmpFileId);
        const fileEntry = await fsPromisify(dirEntry, `getFile`, oldFileName);
        await fsPromisify(fileEntry, `moveTo`, this._fs.root, newFileName);
        return true;
    }

    async createTmpFile(file) {
        await this._initFs();
        if (this._spaceAvailable === 0) return -1;
        const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, TMP_FILE_DIR_NAME, {create: true});
        const randomHolder = new Uint32Array(1);
        let tmpFileId, fileEntry;
        while (true) {
            crypto.getRandomValues(randomHolder);
            const id = randomHolder[0];
            const fileName = tmpIdToFileName(id);
            try {
                fileEntry = await fsPromisify(dirEntry, `getFile`, fileName, {create: true, exclusive: true});
                tmpFileId = id;
                break;
            } catch (e) {
                if (e.name === PATH_EXISTS_ERROR) {
                    continue;
                }
                throw e;
            }
        }

        if (!fileEntry) {
            return -1;
        }

        const writer = await fsPromisify(fileEntry, `createWriter`);
        return new Promise((resolve, reject) => {
            writer.onwriteend = () => {
                resolve(tmpFileId);
            };
            writer.onerror = (e) => {
                reject(writer.error || e.error || e);
            };
            writer.seek(0);
            writer.write(file);
        });
    }

    async deleteTmpFile(tmpFileId) {
        await this._initFs();
        if (this._spaceAvailable === 0) return false;
        try {
            const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, TMP_FILE_DIR_NAME, {create: true});
            const fileEntry = await fsPromisify(dirEntry, `getFile`, tmpIdToFileName(tmpFileId), {create: false});
            await fsPromisify(fileEntry, `remove`);
            return true;
        } catch (e) {
            if (e.name === PATH_EXISTS_ERROR || e.name === NOT_FOUND_ERROR) {
                return true;
            }
            throw e;
        }
    }

    async clearTmpFiles() {
        await this._initFs();
        if (this._spaceAvailable === 0) return false;
        try {
            const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, TMP_FILE_DIR_NAME, {create: true});
            await fsPromisify(dirEntry, `removeRecursively`);
            return true;
        } catch (e) {
            if (e.name === PATH_EXISTS_ERROR || e.name === NOT_FOUND_ERROR) {
                return true;
            }
            throw e;
        }
    }

    async getTmpFiles() {
        await this._initFs();
        if (this._spaceAvailable === 0) return [];
        try {
            const dirEntry = await fsPromisify(this._fs.root, `getDirectory`, TMP_FILE_DIR_NAME, {create: true});
            const allEntries = [];
            const reader = dirEntry.createReader();
            while (true) {
                const results = await fsPromisify(reader, `readEntries`);
                if (!results.length) {
                    break;
                }
                allEntries.push(...results);
            }
            const files = [];
            for (let i = 0; i < allEntries.length; ++i) {
                const entry = allEntries[i];
                if (entry.isFile) {
                    const file = await fsPromisify(entry, `file`);
                    files.push(file);
                }
            }
            return files;
        } catch (e) {
            if (e.name === PATH_EXISTS_ERROR || e.name === NOT_FOUND_ERROR) {
                return [];
            }
            throw e;
        }
    }
}
