import { pictureKinds, TagData, TagDataWithCriticalDemuxData } from "shared/metadata";
import FileView from "shared/platform/FileView";
import { typedKeys } from "shared/types/helpers";
import { readBit } from "shared/util";
import { CancellationToken } from "shared/utils/CancellationToken";
import demux from "shared/worker/demuxer";

const ID3 = 0x494433 | 0;
const TAG = 0x544147 | 0;

interface Flags {
    tagAlterPreservation: boolean;
    fileAlterPreservation: boolean;
    readOnly: boolean;
    containsGroupInfo: boolean;
    isCompressed: boolean;
    isEncrypted: boolean;
    hasBeenUnsynchronized: boolean;
    hasDataLengthIndicator: boolean;
}

type FieldNameFunction = (t: TagData, r: string) => void;
type FieldNameString = "artist" | "title" | "album" | "mood" | "albumArtist";
type FieldName = FieldNameFunction | FieldNameString;

const id3v1Genres = [
    `Blues`,
    `Classic Rock`,
    `Country`,
    `Dance`,
    `Disco`,
    `Funk`,
    `Grunge`,
    `Hip-Hop`,
    `Jazz`,
    `Metal`,
    `New Age`,
    `Oldies`,
    `Other`,
    `Pop`,
    `Rhythm and Blues`,
    `Rap`,
    `Reggae`,
    `Rock`,
    `Techno`,
    `Industrial`,
    `Alternative`,
    `Ska`,
    `Death Metal`,
    `Pranks`,
    `Soundtrack`,
    `Euro-Techno`,
    `Ambient`,
    `Trip-Hop`,
    `Vocal`,
    `Jazz & Funk`,
    `Fusion`,
    `Trance`,
    `Classical`,
    `Instrumental`,
    `Acid`,
    `House`,
    `Game`,
    `Sound Clip`,
    `Gospel`,
    `Noise`,
    `Alternative Rock`,
    `Bass`,
    `Soul`,
    `Punk`,
    `Space`,
    `Meditative`,
    `Instrumental Pop`,
    `Instrumental Rock`,
    `Ethnic`,
    `Gothic`,
    `Darkwave`,
    `Techno-Industrial`,
    `Electronic`,
    `Pop-Folk`,
    `Eurodance`,
    `Dream`,
    `Southern Rock`,
    `Comedy`,
    `Cult`,
    `Gangsta`,
    `Top 40`,
    `Christian Rap`,
    [`Pop`, `Funk`],
    `Jungle`,
    `Native US`,
    `Cabaret`,
    `New Wave`,
    `Psychedelic`,
    `Rave`,
    `Showtunes`,
    `Trailer`,
    `Lo-Fi`,
    `Tribal`,
    `Acid Punk`,
    `Acid Jazz`,
    `Polka`,
    `Retro`,
    `Musical`,
    `Rock ’n’ Roll`,
    `Hard Rock`,
    `Folk`,
    `Folk-Rock`,
    `National Folk`,
    `Swing`,
    `Fast Fusion`,
    `Bebop`,
    `Latin`,
    `Revival`,
    `Celtic`,
    `Bluegrass`,
    `Avantgarde`,
    `Gothic Rock`,
    `Progressive Rock`,
    `Psychedelic Rock`,
    `Symphonic Rock`,
    `Slow Rock`,
    `Big Band`,
    `Chorus`,
    `Easy Listening`,
    `Acoustic`,
    `Humour`,
    `Speech`,
    `Chanson`,
    `Opera`,
    `Chamber Music`,
    `Sonata`,
    `Symphony`,
    `Booty Bass`,
    `Primus`,
    `Porn Groove`,
    `Satire`,
    `Slow Jam`,
    `Club`,
    `Tango`,
    `Samba`,
    `Folklore`,
    `Ballad`,
    `Power Ballad`,
    `Rhythmic Soul`,
    `Freestyle`,
    `Duet`,
    `Punk Rock`,
    `Drum Solo`,
    `A cappella`,
    `Euro-House`,
    `Dance Hall`,
    `Goa`,
    `Drum & Bass`,
    `Club-House`,
    `Hardcore Techno`,
    `Terror`,
    `Indie`,
    `BritPop`,
    `Negerpunk`,
    `Polsk Punk`,
    `Beat`,
    `Christian Gangsta Rap`,
    `Heavy Metal`,
    `Black Metal`,
    `Crossover`,
    `Contemporary Christian`,
    `Christian Rock`,
    `Merengue`,
    `Salsa`,
    `Thrash Metal`,
    `Anime`,
    `Jpop`,
    `Synthpop`,
    `Abstract`,
    `Art Rock`,
    `Baroque`,
    `Bhangra`,
    `Big Beat`,
    `Breakbeat`,
    `Chillout`,
    `Downtempo`,
    `Dub`,
    `EBM`,
    `Eclectic`,
    `Electro`,
    `Electroclash`,
    `Emo`,
    `Experimental`,
    `Garage`,
    `Global`,
    `IDM`,
    `Illbient`,
    `Industro-Goth`,
    `Jam Band`,
    `Krautrock`,
    `Leftfield`,
    `Lounge`,
    `Math Rock`,
    `New Romantic`,
    `Nu-Breakz`,
    `Post-Punk`,
    `Post-Rock`,
    `Psytrance`,
    `Shoegaze`,
    `Space Rock`,
    `Trop Rock`,
    `World Music`,
    `Neoclassical`,
    `Audiobook`,
    `Audio Theatre`,
    `Neue Deutsche Welle`,
    `Podcast`,
    `Indie Rock`,
    `G-Funk`,
    `Dubstep`,
    `Garage Rock`,
    `Psybient`,
];

const decoders = [
    new TextDecoder(`iso-8859-1`),
    new TextDecoder(`utf-16`),
    new TextDecoder(`utf-16be`),
    new TextDecoder(`utf-8`),
];

const id3v2String = function (fieldName: FieldName) {
    return function (
        offset: number,
        fileView: FileView,
        _flags: Flags,
        _version: number,
        size: number,
        tagData: TagData
    ) {
        const encoding = fileView.getUint8(offset);
        offset++;
        const buffer = fileView.block();
        const { start } = fileView;
        const nullLength = encoding === 1 || encoding === 2 ? 2 : 1;
        const length = distanceUntilNull(offset - start, buffer, size - 1, nullLength);

        if (length > 0) {
            const strBytes = new Uint8Array(buffer.buffer, offset - start, length);
            const decoder = decoders[encoding];

            if (decoder) {
                let result = decoder.decode(strBytes).trim();

                if (result.length > 512) {
                    result = result.slice(0, 512);
                }

                if (typeof fieldName === `function`) {
                    fieldName(tagData, result);
                } else {
                    tagData[fieldName] = result;
                }
            }
        }
    };
};

const distanceUntilNull = function (offset: number, buffer: Uint8Array, maxLength: number, nullLength: number) {
    for (let j = 0; j < maxLength; j += nullLength) {
        const i = offset + j;
        if (buffer[i] === 0 && (nullLength === 2 ? buffer[i + 1] === 0 : true)) {
            return j;
        }
    }
    return maxLength;
};

const rnumdenom = /\s*(\d+)\s*\/\s*(\d+)/;
const tagMap: {
    [index: number]: (
        offset: number,
        fileView: FileView,
        flags: Flags,
        version: number,
        size: number,
        tagData: TagData
    ) => void;
} = {};

tagMap[0x545031 | 0] = tagMap[0x54504531 | 0] = id3v2String(`artist`);
tagMap[0x545432 | 0] = tagMap[0x54495432 | 0] = id3v2String(`title`);
tagMap[0x54414c | 0] = tagMap[0x54414c42 | 0] = id3v2String(`album`);
tagMap[0x544d4f4f | 0] = id3v2String(`mood`);
tagMap[0x545332 | 0] = tagMap[0x54534f32 | 0] = tagMap[0x545032 | 0] = tagMap[0x54504532 | 0] = id3v2String(
    `albumArtist`
);
tagMap[0x54524b | 0] = tagMap[0x5452434b | 0] = id3v2String((tagData, result) => {
    const m = rnumdenom.exec(result);
    if (m) {
        tagData.albumIndex = +m[1]!;
        tagData.trackCount = +m[2]!;
    } else {
        tagData.albumIndex = +result;
        tagData.trackCount = -1;
    }
});
tagMap[0x545041 | 0] = tagMap[0x54504f53 | 0] = id3v2String((tagData, result) => {
    const m = rnumdenom.exec(result);
    if (m) {
        tagData.discNumber = +m[1]!;
        tagData.discCount = +m[2]!;
    } else {
        tagData.discNumber = +result;
        tagData.discCount = -1;
    }
});
tagMap[0x544350 | 0] = tagMap[0x54434d50 | 0] = id3v2String((tagData, result) => {
    tagData.compilationFlag = result === `1`;
    if (tagData.compilationFlag && !tagData.albumArtist) {
        tagData.albumArtist = `Various Artists`;
    }
});

tagMap[0x544250 | 0] = tagMap[0x5442504d | 0] = id3v2String((tagData, result) => {
    tagData.beatsPerMinute = +result;
});

tagMap[0x545945 | 0] = tagMap[0x54594552 | 0] = id3v2String((tagData, result) => {
    tagData.year = +result.slice(0, 4);
});

const rgenre = /\((\d+)\)/g;
tagMap[0x54434f | 0] = tagMap[0x54434f4e | 0] = id3v2String((tagData, result) => {
    const genres: Record<string, string> = {};
    let lastRIndex = -1;
    let m = rgenre.exec(result);

    if (!m) {
        tagData.genres = [result];
        return;
    }

    while (m) {
        lastRIndex = rgenre.lastIndex;
        let genre = id3v1Genres[+m[1]!]!;

        if (!Array.isArray(genre)) {
            genre = [genre];
        }

        for (let i = 0; i < genre.length; ++i) {
            genres[genre[i]!.toLowerCase()] = genre[i]!;
        }

        m = rgenre.exec(result);
    }

    const rest = result.slice(lastRIndex).trim();

    if (rest) {
        const multi = rest.split(/\s*\/\s*/g);
        for (let i = 0; i < multi.length; ++i) {
            const genre = multi[i]!.trim();
            genres[genre.toLowerCase()] = genre;
        }
    }

    tagData.genres = typedKeys(genres).map(key => genres[key]!);
});

tagMap[0x504943 | 0] = tagMap[0x41504943 | 0] = function (offset, fileView, flags, version, size, tagData) {
    const originalOffset = offset;
    const encoding = fileView.getUint8(offset);
    offset++;
    let type;
    const buffer = fileView.block();
    let { start } = fileView;
    let pictureKind = -1;
    const decoder = decoders[encoding];

    if (!decoder) return;

    const nullLength = encoding === 1 || encoding === 2 ? 2 : 1;

    if (version <= 2) {
        type = `image/${decoder.decode(new Uint8Array(buffer.buffer, offset - start, 3))}`;
        offset += 3;
    } else {
        const length = distanceUntilNull(offset - start, buffer, size - (offset - originalOffset), 1);
        const typeString = decoder.decode(new Uint8Array(buffer.buffer, offset - start, length)).toLowerCase();
        offset += length + 1;

        if (typeString.indexOf(`/`) === -1) {
            if (/jpg|jpeg|png/.test(typeString)) {
                type = `image/${typeString}`;
            } else {
                return;
            }
        } else {
            type = typeString.toLowerCase();
        }
    }

    pictureKind = fileView.getUint8(offset);
    offset++;

    const length = distanceUntilNull(offset - start, buffer, size - (offset - originalOffset), nullLength);
    const description = decoder.decode(new Uint8Array(buffer.buffer, offset - start, length));
    offset += length + nullLength;

    const dataLength = size - (offset - originalOffset);
    start = fileView.start + offset;

    let { pictures } = tagData;
    if (!pictures) {
        pictures = [];
        tagData.pictures = pictures;
    }

    let data;
    if (flags.hasBeenUnsynchronized) {
        data = new Uint8Array(dataLength);
        let actualLength = 0;
        for (let j = 0; j < dataLength; ++j) {
            const i = offset - fileView.start + j;
            const value = buffer[i]!;
            if (value === 0xff && i + 1 < buffer.length && buffer[i + 1] === 0x00) {
                ++j;
            }
            data[actualLength] = value;
            actualLength++;
        }
        if (actualLength !== dataLength) {
            data = new Uint8Array(data.buffer, offset - fileView.start, actualLength);
        }
    } else {
        data = new Uint8Array(buffer.buffer, offset - fileView.start, dataLength);
    }

    pictures.push({
        image: new Blob([data], { type }),
        pictureKind: pictureKinds[pictureKind]!,
        description,
    });
};

const hex8 = `[0-9A-F]{8}`;
const hex8Capture = `([0-9A-F]{8})`;
const hex16 = `[0-9A-F]{16}`;
const riTunesGapless = new RegExp(
    [hex8, hex8Capture, hex8Capture, hex16, hex8, hex8, hex8, hex8, hex8, hex8, hex8].join(` `)
);
tagMap[0x434f4d4d | 0] = tagMap[0x434f4d | 0] = function (offset, fileView, _flags, _version, size, data) {
    const originalOffset = offset;
    const encoding = fileView.getUint8(offset);
    const buffer = fileView.block();
    offset++;
    decoders[0]!.decode(new Uint8Array(buffer.buffer, offset - fileView.start, 3));
    offset += 3;

    const decoder = decoders[encoding];
    if (!decoder) return;

    const nullLength = encoding === 1 || encoding === 2 ? 2 : 1;
    let length = distanceUntilNull(offset - fileView.start, buffer, size - 4, nullLength);
    const key = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));

    offset += length + nullLength;
    length = distanceUntilNull(offset - fileView.start, buffer, size - (offset - originalOffset), nullLength);
    const value = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));

    if (key === `iTunSMPB` || key === ``) {
        const matches = riTunesGapless.exec(value.trim());
        if (matches) {
            data.encoderDelay = parseInt(matches[1]!, 16);
            data.encoderDelay = Math.min(65536, Math.max(0, data.encoderDelay));
            data.encoderPadding = parseInt(matches[2]!, 16);
            data.encoderPadding = Math.min(65536, Math.max(0, data.encoderPadding));
        }
    }
};

const synchIntAt = function (fileView: FileView, offset: number) {
    return (
        (fileView.getUint8(offset) << 21) |
        (fileView.getUint8(offset + 1) << 14) |
        (fileView.getUint8(offset + 2) << 7) |
        fileView.getUint8(offset + 3)
    );
};

const getFlags = function (fileView: FileView, offset: number, version: number) {
    let tagAlterPreservation = false;
    let fileAlterPreservation = false;
    let readOnly = false;
    let containsGroupInfo = false;
    let isCompressed = false;
    let isEncrypted = false;
    let hasBeenUnsynchronized = false;
    let hasDataLengthIndicator = false;

    if (version >= 3) {
        const bits = fileView.getUint16(offset);
        tagAlterPreservation = readBit(bits, 14);
        fileAlterPreservation = readBit(bits, 13);
        readOnly = readBit(bits, 12);
        containsGroupInfo = readBit(bits, 6);
        isCompressed = readBit(bits, 3);
        isEncrypted = readBit(bits, 2);
        hasBeenUnsynchronized = readBit(bits, 1);
        hasDataLengthIndicator = readBit(bits, 0);
    }

    return {
        tagAlterPreservation,
        fileAlterPreservation,
        readOnly,
        containsGroupInfo,
        isCompressed,
        isEncrypted,
        hasBeenUnsynchronized,
        hasDataLengthIndicator,
    };
};

const getMainFlags = function (fileView: FileView, offset: number) {
    const bits = fileView.getUint8(offset + 5);

    const hasBeenUnsynchronized = readBit(bits, 7);
    const isExtended = readBit(bits, 6);
    const isExperimental = readBit(bits, 5);
    const hasFooter = readBit(bits, 4);

    return {
        hasBeenUnsynchronized,
        isExtended,
        isExperimental,
        hasFooter,
        invalidBits: (bits & 0xf) !== 0,
    };
};

const getDemuxData = async function <T extends object>(fileView: FileView, cancellationToken?: CancellationToken<T>) {
    const demuxData = await demux(`mp3`, fileView, true, 262144, cancellationToken);
    if (!demuxData) return null;
    return demuxData;
};

const parseId3v2Data = async function <T extends object>(
    data: TagData,
    fileView: FileView,
    offset: number,
    cancellationToken?: CancellationToken<T>
) {
    const id3MetadataSize = synchIntAt(fileView, offset + 6);
    const version = fileView.getUint8(offset + 3);
    const mainFlags = getMainFlags(fileView, offset);

    if (!(2 <= version && version <= 4) || mainFlags.invalidBits) {
        return false;
    }

    if (offset + id3MetadataSize + 10 + 3 > fileView.end) {
        await fileView.readBlockOfSizeAt(id3MetadataSize + 8192 + 3, offset, cancellationToken);
    }

    offset += 10;

    const end = offset + id3MetadataSize;
    const tagShift = version > 2 ? 0 : 8;
    const tagSize = version > 2 ? 4 : 3;
    const headerSize = version > 2 ? 10 : 6;

    if (mainFlags.isExtended) {
        offset += synchIntAt(fileView, offset);
    }

    while (offset + headerSize < end) {
        const tag = (fileView.getUint32(offset) >>> tagShift) | 0;
        offset += tagSize;

        if (tag === 0) {
            continue;
        }

        let size = version > 3 ? synchIntAt(fileView, offset) : fileView.getUint32(offset) >>> tagShift;
        offset += tagSize;
        const flags = getFlags(fileView, offset, version);
        if (version > 2) offset += 2;

        if (flags.hasDataLengthIndicator) {
            size = synchIntAt(fileView, offset);
            offset += 4;
        }

        flags.hasBeenUnsynchronized = flags.hasBeenUnsynchronized || mainFlags.hasBeenUnsynchronized;

        if (flags.hasBeenUnsynchronized && !flags.hasDataLengthIndicator) {
            const buffer = fileView.block();
            const { start } = fileView;
            for (let j = 0; j < size; ++j) {
                const i = offset + j - start;
                if (buffer[i] === 0xff && buffer[i + 1] === 0) {
                    size++;
                }
            }
        }

        const handler = tagMap[tag];

        if (handler) {
            handler(offset, fileView, flags, version, size, data);
        }

        offset += size;
    }

    if (mainFlags.hasFooter) {
        offset += 10;
    }

    while (offset + headerSize < fileView.end) {
        const tag = fileView.getUint32(offset);
        if (tag >>> 8 === ID3) {
            await parseId3v2Data(data, fileView, offset);
            return true;
        } else if (tag !== 0) {
            break;
        }
        offset += 4;
    }
    return true;
};

const getId3v1String = function (fileView: FileView, offset: number) {
    const buffer = fileView.block();
    let length = 0;
    for (let i = 30 - 1; i >= 0; --i) {
        const byteVal = buffer[offset + i - fileView.start]!;
        if (byteVal > 32 && byteVal < 255) {
            length = i + 1;
            break;
        }
    }
    const decoder = decoders[0]!;
    return decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, length));
};

const parseId3v1Data = async function <T extends object>(
    data: TagData,
    fileView: FileView,
    cancellationToken?: CancellationToken<T>
) {
    const start = fileView.file.size - 128;
    await fileView.readBlockOfSizeAt(128, start, cancellationToken);
    let offset = start;
    const decoder = decoders[0]!;
    const buffer = fileView.block();
    if (((fileView.getUint32(offset) >>> 8) | 0) === TAG) {
        offset += 3;
        const title = getId3v1String(fileView, offset);
        offset += 30;
        const artist = getId3v1String(fileView, offset);
        offset += 30;
        const album = getId3v1String(fileView, offset);
        offset += 30;
        const year = decoder.decode(new Uint8Array(buffer.buffer, offset - fileView.start, 4));
        offset += 4;
        const comment = fileView.getUint16(offset + 28);
        let albumIndex = -1;
        if ((comment & 0xff00) === 0) {
            albumIndex = comment & 0xff;
        }
        offset += 30;
        const genre = id3v1Genres[fileView.getUint8(offset)];
        if (title) {
            data.title = title;
        }

        if (artist) {
            data.artist = artist;
        }

        if (album) {
            data.album = album;
        }
        if (!isNaN(+year)) {
            data.year = +year;
        }

        if (albumIndex !== -1) {
            data.albumIndex = albumIndex;
        }

        if (genre) {
            data.genres = Array.isArray(genre) ? genre.slice() : [genre];
        }
    }
};

export default async function parseMp3Metadata<T extends object>(
    tagData: TagDataWithCriticalDemuxData,
    fileView: FileView,
    cancellationToken?: CancellationToken<T>
) {
    const demuxData = await getDemuxData(fileView, cancellationToken);
    if (demuxData) {
        tagData.demuxData = demuxData;
    } else {
        tagData.demuxData = {
            duration: 0,
            sampleRate: 44100,
            channels: 2,
        };
    }
    const length = 16384;
    await fileView.readBlockOfSizeAt(length, 0, cancellationToken);
    if (fileView.end < length) return null;
    let header = 0;
    const buffer = fileView.block();

    for (let i = 0; i < length; ++i) {
        header = (header << 8) | buffer[i]! | 0;
        if (header >>> 8 === ID3) {
            const maybeId3v2 = await parseId3v2Data(tagData, fileView, i - 3, cancellationToken);
            if (maybeId3v2) {
                return maybeId3v2;
            }
        }
    }

    await parseId3v1Data(tagData, fileView, cancellationToken);
    return tagData;
}
