import {DataView} from "platform/platform";

export const SNIFF_LENGTH = 8192;
export const MIN_AUDIO_FILE_SIZE = 131072;
export const MAX_AUDIO_FILE_SIZE = 1073741824;

const RIFF = 1380533830 | 0;
const WAVE = 1463899717 | 0;
const ID3 = 0x494433 | 0;
const OGGS = 0x4f676753 | 0;
const WEBM = 0x1A45DFA3 | 0;
const AAC_1 = 0xFFF1 | 0;
const AAC_2 = 0xFFF9 | 0;

const supportedAudioFileMimeMap = {
    "audio/mp3": `mp3`,
    "audio/mpeg": `mp3`
};

const supportedOtherFileMimeMap = {
    "application/zip": `zip`
};

export const supportedMimes = Object.keys(supportedAudioFileMimeMap).
    concat(Object.keys(supportedOtherFileMimeMap));

const supportedAudioFileExtMap = {
    "mp3": `mp3`,
    "mpg": `mp3`,
    "mpeg": `mp3`
};

const codecNameToTypeMap = {
    "mp3": `audio/mp3`
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

function refine(type, dataView, index) {
    if (type === `wav`) {
        if (index >= dataView.byteLength - 22) {
            return `wav`;
        }
        const fmt = dataView.getUint16(index + 20, true);
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

export function isZipFile(file) {
    const type = `${file.type}`.toLowerCase();
    return type === `application/zip` || getExtension(file.name) === `zip`;
}

export function isAudioFile(file) {
    if (file.size < MIN_AUDIO_FILE_SIZE || file.size > MAX_AUDIO_FILE_SIZE) {
        return false;
    }

    const ext = getExtension(file.name) || ``;
    if (supportedAudioFileExtMap.hasOwnProperty(ext) ||
        supportedAudioFileMimeMap.hasOwnProperty(file.type)) {
        return true;
    } else if (!ext && !file.type) {
        return true;
    }
    return false;
}


export default async function getCodecName(fileView, cancellationToken) {
    await fileView.readBlockOfSizeAt(SNIFF_LENGTH, 0, cancellationToken);
    const contentResult = getCodecNameFromContents(fileView.block());

    if (contentResult) {
        return contentResult;
    }

    const {file} = fileView;
    if (supportedAudioFileMimeMap[file.type]) {
        return supportedAudioFileMimeMap[file.type];
    }

    return getCodecNameFromFileName(file.name);
}

export function getCodecNameFromContents(buffer) {
    const length = Math.min(buffer.length, SNIFF_LENGTH);
    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    for (let i = 0; i < length - 4; ++i) {
        const value = dataView.getInt32(i, false);

        if (value === RIFF &&
            i < length - 12 &&
            dataView.getInt32(i + 8) === WAVE) {
            return refine(`wav`, dataView, i);
        } else if ((value >>> 16) === AAC_1 || (value >>> 16) === AAC_2) {
            return refine(`aac`, dataView, i);
        } else if (value === WEBM) {
            return refine(`webm`, dataView, i);
        } else if (value === OGGS) {
            return refine(`ogg`, dataView, i);
        } else if ((value >>> 8) === ID3 || probablyMp3Header(value)) {
            return refine(`mp3`, dataView, i);
        }
    }
    return null;
}

export function getCodecNameFromFileName(fileName) {
    const ext = getExtension(fileName);

    if (ext) {
        return supportedAudioFileExtMap[ext] || null;
    }

    return null;
}

export function codecNameToFileType(codecName) {
    return `${codecNameToTypeMap[codecName]}`;
}
