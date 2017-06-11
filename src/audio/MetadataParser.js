

import getCodecName from "audio/sniffer";
import FileView from "platform/FileView";
import parseMp3Metadata from "metadata/mp3_metadata";

const maxActive = 8;
const queue = [];
let active = 0;

const codecNotSupportedError = function() {
    const e = new Error(`codec not supported`);
    e.name = `CodecNotSupportedError`;
    return e;
};

const next = function() {
    active--;
    if (queue.length > 0) {
        const item = queue.shift();
        const parser = new MetadataParser(item.file, item.resolve, item.transientId);
        active++;
        parser.parse();
    }
};

function MetadataParser(file, resolve, transientId) {
    this.file = file;
    this.resolve = resolve;
    this.transientId = transientId;
    this.fileView = new FileView(file);
}

MetadataParser.prototype.parse = function() {
    const data = {
        basicInfo: {
            duration: NaN,
            sampleRate: 44100,
            channels: 2
        }
    };
    const done = (async () => {
        const codecName = await getCodecName(this.fileView);
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
                await parseMp3Metadata(data, this.fileView);
                break;
            default: break;
        }

        return data;
    })();

    this.resolve(done);
};

export const parse = async function(file, transientId) {
    try {
        const ret = await new Promise((resolve) => {
            if (active >= maxActive) {
                queue.push({
                    file,
                    transientId,
                    resolve
                });
            } else {
                const parser = new MetadataParser(file, resolve, transientId);
                active++;
                parser.parse();
            }
        });
        return ret;
    } finally {
        next();
    }
};

export const fetchAnalysisData = async function(db, uid, albumKey) {
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
};
