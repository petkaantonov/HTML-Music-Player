import getCodecName from "audio/backend/sniffer";
import FileView from "platform/FileView";
import parseMp3Metadata from "metadata/mp3_metadata";
import parseAcoustId from "metadata/acoustId";
import {sha1Binary, queryString} from "util";
import {XMLHttpRequest} from "platform/platform";
import AcoustIdApiError, {ERROR_TIMEOUT, ERROR_INVALID_RESPONSE_SYNTAX} from "metadata/AcoustIdApiError";

const codecNotSupportedError = function() {
    const e = new Error(`codec not supported`);
    e.name = `CodecNotSupportedError`;
    return e;
};

const ajaxGet = function(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 5000;

        function error() {
            reject(new AcoustIdApiError(`request timed out`, ERROR_TIMEOUT));
        }

        xhr.addEventListener(`load`, () => {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(e);
            }
        }, false);

        xhr.addEventListener(`abort`, error);
        xhr.addEventListener(`timeout`, error);
        xhr.addEventListener(`error`, () => {
            reject(new AcoustIdApiError(`Response status: ${xhr.status}`, ERROR_INVALID_RESPONSE_SYNTAX));
        });

        xhr.open(`GET`, url);
        xhr.send(null);
    });
};

export const getFileCacheKey = function(file) {
    return sha1Binary(`${file.lastModified}-${file.name}-${file.size}-${file.type}`);
};

export default class MetadataParser {
    constructor(tagDatabase) {
        this._tagDatabase = tagDatabase;
        this._maxParsersActive = 8;
        this._parserQueue = [];
        this._parsersActive = 0;
        this._imageFetchQueue = [];
        this._currentlyFetchingImage = false;
    }

    _nextParse() {
        this._parsersActive--;
        if (this._parserQueue.length > 0) {
            const item = this._parserQueue.shift();
            this._parsersActive++;
            this._parse(item.file, item.resolve);
        }
    }

    _nextImageFetch() {
        if (this._imageFetchQueue.length > 0) {
            const {acoustId, albumKey, resolve} = this._imageFetchQueue.shift();
            resolve(this._fetchAcoustIdImage(acoustId, albumKey));
        } else {
            this._currentlyFetchingImage = false;
        }
    }

    async _fetchAcoustIdImage(acoustId, albumKey) {
        const image = await this._tagDatabase.getAlbumImage(albumKey);
        if (image) {
            return image;
        }

        if (acoustId && acoustId.album) {
            const {type, mbid} = acoustId.album;
            const url = `https://coverartarchive.org/${type}/${mbid}/front-250`;
            const ret = {url};
            this._tagDatabase.setAlbumImage(albumKey, url);
            return ret;
        } else {
            return null;
        }
    }

    async _parse(file, resolve) {
        const cacheKey = await getFileCacheKey(file);
        const cachedResult = await this._tagDatabase.getCachedMetadata(cacheKey);

        if (cachedResult) {
            resolve(cachedResult);
            return;
        }

        const data = {
            basicInfo: {
                duration: NaN,
                sampleRate: 44100,
                channels: 2
            }
        };
        const fileView = new FileView(file);
        const codecName = await getCodecName(fileView);
        if (!codecName) {
            throw codecNotSupportedError();
        }

        switch (codecName) {
            case `wav`:
            case `webm`:
            case `aac`:
            case `ogg`:
                throw codecNotSupportedError();
            case `mp3`:
                await parseMp3Metadata(data, fileView);
                break;
            default: break;
        }

        await this._tagDatabase.setCachedMetadata(cacheKey, data);
        resolve(data);
    }

    async getCachedMetadata(file) {
        const cacheKey = await getFileCacheKey(file);
        return this._tagDatabase.getCachedMetadata(cacheKey);
    }

    async updateCachedMetadata(file, metadata) {
        const cacheKey = await getFileCacheKey(file);
        const cachedResult = await this._tagDatabase.getCachedMetadata(cacheKey);

        let dataToSave = metadata;
        if (cachedResult) {
            dataToSave = Object.assign({}, cachedResult, metadata);
        }

        await this._tagDatabase.setCachedMetadata(cacheKey, dataToSave);
    }

    async fetchAcoustId(uid, fingerprint, duration) {
        const data = queryString({
            client: `djbbrJFK`,
            format: `json`,
            duration: duration | 0,
            meta: `recordings+releasegroups+compress`,
            fingerprint
        });
        const url = `https://api.acoustId.org/v2/lookup?${data}`;

        let result;
        let retries = 0;
        while (retries < 5) {
            try {
                const response = await ajaxGet(url);
                result = parseAcoustId(response);
                break;
            } catch (e) {
                if (!e.isRetryable()) {
                    throw e;
                }
                retries++;
            }
        }
        this._tagDatabase.updateAcoustId(uid, result);
        return result;

    }

    async parse(file) {
        try {
            const ret = await new Promise((resolve) => {
                if (this._parsersActive >= this._maxParsersActive) {
                    this._parserQueue.push({
                        file,
                        resolve
                    });
                } else {
                    this._parsersActive++;
                    this._parse(file, resolve);
                }
            });
            return ret;
        } finally {
            this._nextParse();
        }
    }

    async fetchAnalysisData(uid, albumKey) {
        const db = this._tagDatabase;
        const [data, albumImage] = await Promise.all([db.query(uid), db.getAlbumImage(albumKey)]);

        if (data) {
            if (albumImage) {
                data.albumImage = albumImage;
            }
        }
        return data;
    }

    async fetchAcoustIdImage(acoustId, albumKey) {
        const ret = new Promise((resolve) => {
            if (!this._currentlyFetchingImage) {
                this._currentlyFetchingImage = true;
                resolve(this._fetchAcoustIdImage(acoustId, albumKey));
            } else {
                this._imageFetchQueue.push({
                    acoustId, albumKey, resolve
                });
            }
        });

        try {
            await ret;
            return ret;
        } finally {
            this._nextImageFetch();
        }
    }
}
