

import {Uint16Array, Uint8Array} from "platform/platform";

const SAMPLES_PER_FRAME_DEFAULT = 1152;
const MINIMUM_DURATION = 3;
const MP3_DECODER_DELAY = 529;
const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

const RIFF = 1380533830 | 0;
const WAVE = 1463899717 | 0;
const ID3 = 0x494433 | 0;
const VBRI = 0x56425249 | 0;
const Xing = 0x58696e67 | 0;
const Info = 0x496e666f | 0;
const LAME = 0x4c414d45 | 0;
const DATA = 0x64617461 | 0;
const FACT = 0x66616374 | 0;

const LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP = 5 * 1024 * 1024;
// Const NETWORK_FILE_MAX_BYTES_UNTIL_GIVEUP = 50 * 1024;

const BLOCK_SIZE = 16384;

function probablyMp3Header(header) {
    return !(((header & 0xffe00000) !== -2097152) ||
             ((header & (3 << 17)) !== (1 << 17)) ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
}


function demuxMp3FromWav(offset, fileView) {
    const max = Math.min(offset + 4096, fileView.end);

    const chunkSize = fileView.getInt32(offset + 4, true);
    const dataEnd = offset + chunkSize + 8;
    const subChunkSize = fileView.getInt32(offset + 16, true);
    // Var fmt = fileView.getInt16(offset + 20, true);
    const channels = fileView.getInt16(offset + 22, true);
    const sampleRate = fileView.getInt32(offset + 24, true);
    const lsf = sampleRate < 32000;
    const samplesPerFrame = lsf ? 576 : 1152;
    const byteRate = fileView.getInt32(offset + 28, true);
    // Var align = fileView.getInt16(offset + 32, true);
    // Var bitsPerSample = fileView.getInt16(offset + 34, true);
    // Var extraParamSize = fileView.getInt16(offset + 36, true);
    // Var wId = fileView.getInt16(offset + 38, true);
    // Var flags = fileView.getInt32(offset + 40, true);
    const blockSize = fileView.getInt16(offset + 44, true);
    // Var framesPerBlock = fileView.getInt16(offset + 46, true);
    const encoderDelay = fileView.getInt16(offset + 48, true);
    let frames = 0;

    offset += subChunkSize + 16 + 4;
    let duration = 0;
    while (offset < max) {
        const nextChunk = fileView.getInt32(offset, false);
        offset += 4;
        if (nextChunk === FACT) {
            const size = fileView.getInt32(offset, true);
            offset += 4;
            const samples = fileView.getInt32(offset, true);
            duration = samples / sampleRate;
            frames = (samples / samplesPerFrame) | 0;
            offset += size;
        } else if (nextChunk === DATA) {
            const dataStart = offset + 4;
            if (duration === 0) {
                duration = Math.max(0, (dataEnd - dataStart)) / byteRate;
                frames = ((duration * sampleRate) / samplesPerFrame) | 0;
            }
            if (duration < MINIMUM_DURATION) return null;

            const ret = {
                frames,
                encoderDelay,
                encoderPadding: 0,
                paddingStartFrame: -1,
                lsf,
                sampleRate,
                channels,
                bitRate: byteRate * 8,
                dataStart,
                dataEnd,
                averageFrameSize: blockSize,
                vbr: false,
                duration,
                samplesPerFrame,
                maxByteSizePerAudioFrame: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) | 0) + 1) / samplesPerFrame,
                seekTable: null,
                toc: null
            };
            return ret;
        } else {
            offset += 2;
        }

    }
    return null;
}

function parseProbableMp3Header(metadata, header, fileOffset, fileView) {
    const ret = {
        bytesRead: 0,
        metadata,
        headerFound: false
    };
    let lsf, mpeg25;
    if ((header & (1 << 20)) !== 0) {
        lsf = (header & (1 << 19)) !== 0 ? 0 : 1;
        mpeg25 = 0;
    } else {
        lsf = 1;
        mpeg25 = 1;
    }

    const samplesPerFrame = lsf === 1 ? 576 : 1152;

    const sampleRateIndex = ((header >> 10) & 3);
    if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) {
        return ret;
    }
    const sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

    const bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
    if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) {
        return ret;
    }
    const bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

    if (!bitRate || !sampleRate) {
        return ret;
    }

    const padding = (header >> 9) & 1;
    const frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) | 0) + padding;
    const nextHeader = fileView.getInt32(fileOffset + 4 + frame_size - 4, false);

    if (!probablyMp3Header(nextHeader)) {
        if (fileView.getInt32(fileOffset + 4 + 32) === VBRI) {
            ret.bytesRead += (4 + 32 - 1);
        } else {
            return ret;
        }
    }

    ret.headerFound = true;
    if (metadata) {
        if (metadata.bitRate !== bitRate) {
            metadata.bitRate = bitRate;
        }
        ret.bytesRead += (frame_size - 4 - 1);
    } else {
        ret.metadata = {
            frames: 0,
            encoderDelay: 576,
            encoderPadding: 0,
            paddingStartFrame: -1,
            lsf: !!lsf,
            sampleRate,
            channels: ((header >> 6) & 3) === 3 ? 1 : 2,
            bitRate,
            dataStart: fileOffset,
            dataEnd: fileView.file.size,
            averageFrameSize: ((bitRate / 1000) * 144000) / (sampleRate << lsf),
            vbr: false,
            duration: 0,
            samplesPerFrame,
            maxByteSizePerAudioFrame: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) | 0) + 1) / samplesPerFrame,
            seekTable: null,
            toc: null
        };
    }
    return ret;
}

function parseVbriHeader(metadata, fileOffset, fileView) {
    const samplesPerFrame = (metadata.samplesPerFrame || SAMPLES_PER_FRAME_DEFAULT);
    metadata.vbr = true;
    let position = fileOffset + 4 + 10;
    const frames = fileView.getUint32(position, false);
    metadata.frames = frames;
    metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
    position += 4;
    const entries = fileView.getUint16(position, false);
    position += 2;
    const entryScale = fileView.getUint16(position, false);
    position += 2;
    const sizePerEntry = fileView.getUint16(position, false);
    position += 2;
    const framesPerEntry = fileView.getUint16(position, false);
    position += 2;
    let entryOffset = position + entries + sizePerEntry;
    const dataStart = entryOffset;

    const seekTable = new Mp3SeekTable();
    const {table} = seekTable;
    table.length = entries + 1;
    seekTable.isFromMetaData = true;
    seekTable.framesPerEntry = framesPerEntry;
    seekTable.tocFilledUntil = metadata.duration;
    seekTable.frames = frames;
    metadata.seekTable = seekTable;

    let shift = 0;
    let method;
    switch (sizePerEntry) {
        case 4: method = fileView.getUint32; break;
        case 3: method = fileView.getUint32; shift = 8; break;
        case 2: method = fileView.getUint16; break;
        case 1: method = fileView.getUint8; break;
        default: return;
    }

    table[0] = dataStart;
    for (let j = 0; j < entries; ++j) {
        const value = method.call(fileView, position + (j * sizePerEntry)) >>> shift;
        entryOffset += (value * entryScale);
        table[j + 1] = entryOffset;
    }

    // 1159, 864, or 529
    // http://mp3decoders.mp3-tech.org/decoders_lame.html
    metadata.encoderDelay = 1159;
    metadata.dataStart = dataStart;
}

function parseXingHeader(metadata, header, fileOffset, fileView) {
    const samplesPerFrame = (metadata.samplesPerFrame || SAMPLES_PER_FRAME_DEFAULT);
    if (header === Xing) {
        metadata.vbr = true;
    }

    let position = fileOffset + 4;
    const fields = fileView.getUint32(position, false);
    position += 4;

    let frames = -1;
    if ((fields & 0x7) !== 0) {
        if ((fields & 0x1) !== 0) {
            frames = fileView.getUint32(position, false);
            metadata.frames = frames;
            metadata.duration = (frames * samplesPerFrame / metadata.sampleRate);
            position += 4;
        }
        if ((fields & 0x2) !== 0) {
            position += 4;
        }
        if ((fields & 0x4) !== 0) {
            const toc = new Uint8Array(100);
            for (let j = 0; j < 100; ++j) {
                toc[j] = fileView.getUint8(position + j);
            }
            metadata.toc = toc;
            position += 100;
        }
        if (fields & 0x8 !== 0) position += 4;
    }

    // LAME
    if (fileView.getInt32(position, false) === LAME) {
        position += (9 + 1 + 1 + 8 + 1 + 1);
        const padding = (fileView.getInt32(position, false) >>> 8);
        const encoderDelay = padding >> 12;
        metadata.encoderDelay = encoderDelay;
        let encoderPadding = padding & 0xFFF;
        if (frames !== -1) {
            if (encoderPadding > 0) {
                encoderPadding = Math.max(0, encoderPadding - MP3_DECODER_DELAY);
                metadata.paddingStartFrame = frames - Math.ceil(encoderPadding / samplesPerFrame) - 1;
                metadata.encoderPadding = encoderPadding;
            }
        }
        position += (3 + 1 + 1 + 2 + 4 + 2 + 2);
    }

    metadata.dataStart = position;
}

async function demuxMp3(fileView, noSeekTable, maxSize) {
    const dataEnd = fileView.file.size;

    if (maxSize === undefined) {
        maxSize = LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP;
    }

    await fileView.readBlockOfSizeAt(65536, 0);
    if (fileView.end < 65536) {
        return null;
    }

    let fileOffset = 0;
    let dataStart = 0;
    if ((fileView.getUint32(0, false) >>> 8) === ID3) {
        const footer = ((fileView.getUint8(5) >> 4) & 1) * 10;
        const size = (fileView.getUint8(6) << 21) |
                   (fileView.getUint8(7) << 14) |
                   (fileView.getUint8(8) << 7) |
                   fileView.getUint8(9);
        fileOffset = size + 10 + footer;
        dataStart = fileOffset;
    }

    await fileView.readBlockOfSizeAt(BLOCK_SIZE, fileOffset, 4);

    if (fileView.getInt32(dataStart, false) === RIFF &&
        fileView.getInt32(dataStart + 8, false) === WAVE) {
        return demuxMp3FromWav(dataStart, fileView);
    }

    const max = Math.min(dataEnd, maxSize);
    let parsedMetadata = null;
    let headersFound = 0;
    let dataParsed = false;

    while (!dataParsed) {
        const maxBytesToRead = Math.max(0, Math.min(max - fileOffset, BLOCK_SIZE / 2));

        if (maxBytesToRead === 0) {
            break;
        }

        let i;
        for (i = 0; i < maxBytesToRead; ++i) {
            const position = fileOffset + i;
            let header = fileView.getInt32(position);

            if (probablyMp3Header(header)) {
                if (headersFound > 4) {
                    dataParsed = true;
                    break;
                }

                const {bytesRead, metadata, headerFound} = parseProbableMp3Header(parsedMetadata, header, position, fileView);

                i += bytesRead;
                if (headerFound) {
                    headersFound++;
                    header = 0;
                }
                parsedMetadata = metadata;
                // VBRI
            } else if (header === VBRI) {
                parseVbriHeader(parsedMetadata, position, fileView);
                dataParsed = true;
                break;
            // Xing | Info
            } else if (header === Xing || header === Info) {
                parseXingHeader(parsedMetadata, header, position, fileView);
                dataParsed = true;
                break;
            }
        }

        if (dataParsed) {
            break;
        }

        fileOffset += i;
        await fileView.readBlockOfSizeAt(BLOCK_SIZE, fileOffset, 4);
    }

    if (!parsedMetadata) {
        return null;
    }

    if (parsedMetadata.duration === 0) {
        const size = Math.max(0, parsedMetadata.dataEnd - parsedMetadata.dataStart);
        if (!parsedMetadata.vbr) {
            parsedMetadata.duration = (size * 8) / parsedMetadata.bitRate;
            parsedMetadata.frames = ((parsedMetadata.sampleRate * parsedMetadata.duration) / parsedMetadata.samplesPerFrame) | 0;
        } else if (!noSeekTable) {
            // VBR without Xing or VBRI header = need to scan the entire file.
            parsedMetadata.seekTable = new Mp3SeekTable();
            await parsedMetadata.seekTable.fillUntil(30 * 60, parsedMetadata, fileView);
            parsedMetadata.frames = parsedMetadata.seekTable.frames;
            parsedMetadata.duration = (parsedMetadata.frames * parsedMetadata.samplesPerFrame) / parsedMetadata.sampleRate;
        }
    }

    if (parsedMetadata.duration < MINIMUM_DURATION) {
        return null;
    }

    return parsedMetadata;
}

export default function(codecName, fileView, noSeekTable, maxSize) {
    try {
        if (codecName === `mp3`) {
            return demuxMp3(fileView, noSeekTable, maxSize);
        }
    } catch (e) {
        return null;
    }
    return null;
}

// TODO: code is ruthlessly duplicated from above.
export function Mp3SeekTable() {
    this.frames = 0;
    this.tocFilledUntil = 0;
    this.table = new Array(128);
    this.lastFrameSize = 0;
    this.framesPerEntry = 1;
    this.isFromMetaData = false;
}

Mp3SeekTable.prototype.closestFrameOf = function(frame) {
    frame = Math.min(this.frames, frame);
    return Math.round(frame / this.framesPerEntry) * this.framesPerEntry;
};

Mp3SeekTable.prototype.offsetOfFrame = function(frame) {
    frame = this.closestFrameOf(frame);
    const index = frame / this.framesPerEntry;
    return this.table[index];
};

Mp3SeekTable.prototype.fillUntil = async function(time, metadata, fileView) {
    if (this.tocFilledUntil >= time) return;
    let position = metadata.dataStart;
    const dataEndPosition = metadata.dataEnd;

    // Var bufferSize = metadata.maxByteSizePerAudioFrame * metadata.samplesPerFrame | 0;
    const maxFrames = Math.ceil(time * (metadata.sampleRate / (1152 >> metadata.lsf)));
    // Var lsf = metadata.lsf ? 1 : 0;

    const {table} = this;
    let frames;
    if (this.frames > 0) {
        ({frames} = this);
        position = table[this.frames - 1] + this.lastFrameSize;
    } else {
        frames = 0;
        position = metadata.dataStart;
    }

    let header = 0;
    let maxFilePosition = 0;
    do {
        await fileView.readBlockOfSizeAt(BLOCK_SIZE, position, 10);

        maxFilePosition = Math.min(dataEndPosition, position + BLOCK_SIZE / 2);
        const buffer = fileView.block();

        while (position < maxFilePosition && frames < maxFrames) {
            const i = position - fileView.start;
            header = ((header << 8) | buffer[i]) | 0;

            if (!probablyMp3Header(header)) {
                position++;
                continue;
            }

            let lsf, mpeg25;
            if ((header & (1 << 20)) !== 0) {
                lsf = (header & (1 << 19)) !== 0 ? 0 : 1;
                mpeg25 = 0;
            } else {
                lsf = 1;
                mpeg25 = 1;
            }


            const sampleRateIndex = ((header >> 10) & 3);
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) {
                position++;
                continue;
            }
            const sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            const bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) {
                position++;
                continue;
            }
            const bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            table[frames] = (position - 3);
            frames++;

            const padding = (header >> 9) & 1;
            const frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) | 0) + padding;
            this.lastFrameSize = frame_size;
            position += (frame_size - 4);
        }
    } while (frames < maxFrames && maxFilePosition < fileView.file.size);
    this.frames = frames;
    this.tocFilledUntil = ((metadata.samplesPerFrame || SAMPLES_PER_FRAME_DEFAULT) / metadata.sampleRate) * frames;
};


