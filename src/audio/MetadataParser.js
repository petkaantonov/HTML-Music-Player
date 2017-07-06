import getCodecName from "audio/sniffer";
import FileView from "platform/FileView";
import parseMp3Metadata from "metadata/mp3_metadata";
import {sha1Binary} from "util";

const codecNotSupportedError = function() {
    const e = new Error(`codec not supported`);
    e.name = `CodecNotSupportedError`;
    return e;
};

export const getFileCacheKey = async function(file) {
    return sha1Binary(`${file.lastModified}-${file.name}-${file.size}-${file.type}`);
};

export default class MetadataParser {
    constructor(tagDatabase) {
        this._tagDatabase = tagDatabase;
        this._maxActive = 8;
        this._queue = [];
        this._active = 0;
    }

    _next() {
        this._active--;
        if (this._queue.length > 0) {
            const item = this._queue.shift();
            this._active++;
            this._parse(item.file, item.resolve, item.transientId);
        }
    }

    async _parse(file, resolve, transientId) {
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

    async parse(file, transientId) {
        try {
            const ret = await new Promise((resolve) => {
                if (this._active >= this._maxActive) {
                    this._queue.push({
                        file,
                        transientId,
                        resolve
                    });
                } else {
                    this._active++;
                    this._parse(file, resolve, transientId);
                }
            });
            return ret;
        } finally {
            this._next();
        }
    }

    async fetchAnalysisData(uid, albumKey) {
        const db = this._tagDatabase;
        const [data, albumImage] = await Promise.all([db.query(uid), db.getAlbumImage(albumKey)]);

        if (data) {
            const {trackGain, trackPeak, silence} = data;
            if (!data.loudness && (trackGain || trackPeak || silence)) {
                data.loudness = {trackPeak, trackGain, silence};
            }

            if (albumImage) {
                data.albumImage = albumImage;
            }
        }
        return data;
    }
}
