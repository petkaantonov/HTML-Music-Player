/* eslint-disable no-prototype-builtins */
import { CodecName } from "shared/metadata";

import { typedKeys } from "./helpers";

export const SNIFF_LENGTH = 8192;
export const MIN_AUDIO_FILE_SIZE = 131072;
export const MAX_AUDIO_FILE_SIZE = 1073741824;

export const supportedAudioFileMimeMap: Record<string, CodecName> = {
    "audio/mp3": `mp3`,
    "audio/mpeg": `mp3`,
};

export const fileExtensionToMime: Map<string, string> = new Map([["mp3", "audio/mp3"]]);

export const supportedOtherFileMimeMap = {
    "application/zip": `zip`,
};

const rext = /\.([a-z0-9]+)$/i;
export const getExtension = function (str: string) {
    const ret = str.match(rext);
    if (ret) return ret[1]!.toLowerCase();
    return null;
};

export const supportedMimes = typedKeys(supportedAudioFileMimeMap).concat(Object.keys(supportedOtherFileMimeMap));

export const supportedAudioFileExtMap: Record<string, CodecName> = {
    mp3: `mp3`,
    mpg: `mp3`,
    mpeg: `mp3`,
};

export const codecNameToTypeMap: Partial<Record<CodecName, string>> = {
    mp3: `audio/mp3`,
};

export function isZipFile(file: File) {
    const type = `${file.type}`.toLowerCase();
    return type === `application/zip` || getExtension(file.name) === `zip`;
}

export function isAudioFile(file: File) {
    if (file.size < MIN_AUDIO_FILE_SIZE || file.size > MAX_AUDIO_FILE_SIZE) {
        return false;
    }

    const ext = getExtension(file.name) || ``;
    if (supportedAudioFileExtMap.hasOwnProperty(ext) || supportedAudioFileMimeMap.hasOwnProperty(file.type)) {
        return true;
    } else if (!ext && !file.type) {
        return true;
    }
    return false;
}
