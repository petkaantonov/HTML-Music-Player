import { CancellationToken } from "shared//utils/CancellationToken";
import { CodecName } from "shared/metadata";
import FileView from "shared/platform/FileView";
import {
    codecNameToTypeMap,
    getExtension,
    SNIFF_LENGTH,
    supportedAudioFileExtMap,
    supportedAudioFileMimeMap,
} from "shared/types/files";

const RIFF = 1380533830 | 0;
const WAVE = 1463899717 | 0;
const ID3 = 0x494433 | 0;
const OGGS = 0x4f676753 | 0;
const WEBM = 0x1a45dfa3 | 0;
const AAC_1 = 0xfff1 | 0;
const AAC_2 = 0xfff9 | 0;

const probablyMp3Header = function (header: number) {
    return !(
        (header & 0xffe00000) !== -2097152 ||
        (header & (3 << 17)) !== 1 << 17 ||
        (header & (0xf << 12)) === 0xf << 12 ||
        (header & (3 << 10)) === 3 << 10
    );
};

function refine(type: CodecName, dataView: DataView, index: number): CodecName {
    if (type === `wav`) {
        if (index >= dataView.byteLength - 22) {
            return `wav`;
        }
        const fmt = dataView.getUint16(index + 20, true);
        switch (fmt) {
            case 0x0055:
                return `mp3`;
            case 0x0001:
                return `wav`;
            case 0x0003:
                return `wav`;
            default:
                return `unknown`;
        }
    } else {
        return type;
    }
}

export default async function getCodecName<T extends object>(
    fileView: FileView,
    cancellationToken?: CancellationToken<T>
) {
    await fileView.readBlockOfSizeAt(SNIFF_LENGTH, 0, cancellationToken);
    const contentResult = getCodecNameFromContents(fileView.block());

    if (contentResult) {
        return contentResult;
    }

    const { file } = fileView;
    if (supportedAudioFileMimeMap[file.type]) {
        return supportedAudioFileMimeMap[file.type];
    }

    return getCodecNameFromFileName(file.name);
}

export function getCodecNameFromContents(buffer: Uint8Array): CodecName | null {
    const length = Math.min(buffer.length, SNIFF_LENGTH);
    const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    for (let i = 0; i < length - 4; ++i) {
        const value = dataView.getInt32(i, false);

        if (value === RIFF && i < length - 12 && dataView.getInt32(i + 8) === WAVE) {
            return refine(`wav`, dataView, i);
        } else if (value >>> 16 === AAC_1 || value >>> 16 === AAC_2) {
            return refine(`aac`, dataView, i);
        } else if (value === WEBM) {
            return refine(`webm`, dataView, i);
        } else if (value === OGGS) {
            return refine(`ogg`, dataView, i);
        } else if (value >>> 8 === ID3 || probablyMp3Header(value)) {
            return refine(`mp3`, dataView, i);
        }
    }
    return null;
}

export function getCodecNameFromFileName(fileName: string): CodecName | null {
    const ext = getExtension(fileName);

    if (ext) {
        return supportedAudioFileExtMap[ext] || null;
    }

    return null;
}

export function codecNameToFileType(codecName: CodecName) {
    return `${codecNameToTypeMap[codecName]}`;
}
