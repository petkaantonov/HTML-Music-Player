const RIFF = 1380533830 | 0;
const WAVE = 1463899717 | 0;
const ID3 = 0x494433 | 0;
const OGGS = 0x4f676753 | 0;
const WEBM = 0x1A45DFA3 | 0;
const AAC_1 = 0xFFF1 | 0;
const AAC_2 = 0xFFF9 | 0;

const mimeMap = {
    "audio/mp3": `mp3`,
    "audio/mpeg": `mp3`
};
const extMap = {
    "mp3": `mp3`
};

const probablyMp3Header = function(header) {
    return !(((header & 0xffe00000) !== -2097152) ||
             ((header & (3 << 17)) !== (1 << 17)) ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
};

const rext = /\.([a-z0-9]+)$/i;
const getExtension = function(str) {
    const ret = str.match(rext);
    if (ret) return ret[1].toLowerCase();
    return null;
};

function refine(type, fileView, index) {
    if (type === `wav`) {
        if (index >= fileView.end - 22) {
            return `wav`;
        }
        const fmt = fileView.getUint16(index + 20, true);
        switch (fmt) {
            case 0x0055: return `mp3`;
            case 0x0001: return `wav`;
            case 0x0003: return `wav`;
            default: return `unknown`;
        }

    } else {
        return type;
    }
}

export default async function getCodecName(fileView) {
    await fileView.readBlockOfSizeAt(8192 * 16, 0);
    const {end, file} = fileView;
    for (let i = 0; i < end - 4; ++i) {
        const value = fileView.getInt32(i, false);

        if (value === RIFF &&
            i < end - 12 &&
            fileView.getInt32(i + 8) === WAVE) {
            return refine(`wav`, fileView, i);
        } else if ((value >>> 8) === ID3 || probablyMp3Header(value)) {
            return refine(`mp3`, fileView, i);
        } else if ((value >>> 16) === AAC_1 || (value >>> 16) === AAC_2) {
            return refine(`aac`, fileView, i);
        } else if (value === WEBM) {
            return refine(`webm`, fileView, i);
        } else if (value === OGGS) {
            return refine(`ogg`, fileView, i);
        }
    }

    if (mimeMap[file.type]) {
        return mimeMap[file.type];
    }

    const ext = getExtension(file.name);

    if (ext) return extMap[ext] || null;

    return null;

}
