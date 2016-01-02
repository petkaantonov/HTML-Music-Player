"use strict";
var FileView = require("./FileView");

const MINIMUM_DURATION = 3;
const MP3_DECODER_DELAY = 529;
const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

function probablyMp3Header(header) {
    return !(((header & 0xffe00000) !== -2097152)     ||
             ((header & (3 << 17)) !== (1 << 17))     ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
}



function demuxMp3(view) {
    var offset = 0;
    var dataStart = 0;
    var dataEnd = view.file.size;
    var samplesPerFrame = 1152;

    var now = Date.now();

    if ((view.getUint32(0, false) >>> 8) === 0x494433) {
        var footer = ((view.getUint8(5) >> 4) & 1) * 10;
        var size = (view.getUint8(6) << 21) | 
                   (view.getUint8(7) << 14) |
                   (view.getUint8(8) << 7) | 
                   view.getUint8(9);
        offset = size + 10 + footer;
        dataStart = offset;
    }

    var n = Date.now();
    var id3v1AtEnd = (view.getUint32(view.file.size - 128) >>> 8) === 0x544147;

    if (id3v1AtEnd) {
        dataEnd -= 128;
    }

    var max = 2314 * 20;
    var header = 0;
    var metadata = null;
    var headersFound = 0;

    for (var i = 0; i < max; ++i) {
        var index = offset + i;
        header = view.getInt32(index);
            
        if (probablyMp3Header(header)) {
            if (headersFound > 4) {
                break;
            }
            
            var lsf, mpeg25;
            if ((header & (1<<20)) !== 0) {
                lsf = (header & (1<<19)) !== 0 ? 0 : 1;
                mpeg25 = 0;
            } else {
                lsf = 1;
                mpeg25 = 1;
            }

            samplesPerFrame = lsf === 1 ? 576 : 1152;

            var sampleRateIndex = ((header >> 10) & 3);
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) continue;
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) continue;
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            if (!bitRate || !sampleRate) {
                continue;
            }

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            var nextHeader = view.getInt32(index + 4 + frame_size - 4, false);

            if (!probablyMp3Header(nextHeader)) {
                if (view.getInt32(index + 4 + 32) === (0x56425249|0)) {
                    i += (4 + 32 - 1);
                } else {
                    continue;
                }
            }
        
            headersFound++;
            if (metadata) {
                if (metadata.bitRate !== bitRate) {
                    metadata.bitRate = bitRate;
                    metadata.vbr = true;
                }
                i += (frame_size - 4 - 1);
            } else {
                metadata = {
                    frames: 0,
                    encoderDelay: 576,
                    encoderPadding: 0,
                    paddingStartFrame: -1,
                    lsf: !!lsf,
                    sampleRate: sampleRate,
                    channels: ((header >> 6) & 3) === 3 ? 1 : 2,
                    bitRate: bitRate,
                    dataStart: dataStart,
                    dataEnd: dataEnd,
                    averageFrameSize: ((bitRate / 1000) * 144000) / (sampleRate << lsf),
                    vbr: false,
                    duration: 0,
                    samplesPerFrame: samplesPerFrame,
                    seekTable: null,
                    toc: null
                };
            }
            header = 0;
            // VBRI
        } else if (header === (0x56425249|0)) {
            metadata.vbr = true;
            var offset = index + 4 + 10;
            var frames = view.getUint32(offset, false);
            metadata.frames = frames;
            metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
            offset += 4;
            var entries = view.getUint16(offset, false);
            offset += 2;
            var entryScale = view.getUint16(offset, false);
            offset += 2;
            var sizePerEntry = view.getUint16(offset, false);
            offset += 2;
            var framesPerEntry = view.getUint16(offset, false);
            offset += 2;
            var entryOffset = offset + entries + sizePerEntry;
            var dataStart = entryOffset;

            var seekTable = new Mp3SeekTable();
            var table = seekTable.table;
            table.length = entries + 1;
            seekTable.isFromMetaData = true;
            seekTable.framesPerEntry = framesPerEntry;
            seekTable.tocFilledUntil = metadata.duration;
            seekTable.frames = frames;
            metadata.seekTable = seekTable;
            
            var shift = 0;
            var method;
            switch (sizePerEntry) {
                case 4: method = view.getUint32; break;
                case 3: method = view.getUint32; shift = 8; break;
                case 2: method = view.getUint16; break;
                case 1: method = view.getUint8; break;
                default: return null;
            }

            var j = 0;
            table[0] = dataStart;
            for (; j < entries; ++j) {
                var value = method.call(view, offset + (j * sizePerEntry)) >>> shift;
                entryOffset += (value * entryScale);
                table[j + 1] = entryOffset;
            }

            // 1159, 864, or 529
            // http://mp3decoders.mp3-tech.org/decoders_lame.html
            metadata.encoderDelay = 1159;
            metadata.dataStart = dataStart;
            break;
        // Xing | Info
        } else if (header === (0x58696e67|0) || header === (0x496e666f|0)) {
            if (header === (0x58696e67|0)) {
                metadata.vbr = true;
            }

            var offset = index + 4;
            var fields = view.getUint32(offset, false);
            offset += 4;

            var frames = -1;
            if ((fields & 0x7) !== 0) {
                if ((fields & 0x1) !== 0) {
                    var frames = view.getUint32(offset, false);
                    metadata.frames = frames;
                    metadata.duration = (frames * samplesPerFrame / metadata.sampleRate);
                    offset += 4;
                }
                if ((fields & 0x2) !== 0) {
                    offset += 4;
                }
                if ((fields & 0x4) !== 0) {
                    var toc = new Uint8Array(100);
                    for (var j = 0; j < 100; ++j) {
                        toc[j] = view.getUint8(offset + j);
                    }
                    metadata.toc = toc;
                    offset += 100;
                }
                if (fields & 0x8 !== 0) offset += 4;
            }

            // LAME
            if (view.getInt32(offset, false) === (0x4c414d45|0)) {
                offset += (9 + 1 + 1 + 8 + 1 + 1);
                var padding = (view.getInt32(offset, false) >>> 8);
                var encoderDelay = padding >> 12;
                metadata.encoderDelay = encoderDelay;
                var encoderPadding = padding & 0xFFF;
                if (frames !== -1) {
                    if (encoderPadding > 0) {
                        encoderPadding = Math.max(0, encoderPadding - MP3_DECODER_DELAY);
                        metadata.paddingStartFrame = frames - Math.ceil(encoderPadding / metadata.samplesPerFrame) - 1;
                        metadata.encoderPadding = encoderPadding;
                    }
                }
                offset += (3 + 1 + 1 + 2 + 4 + 2 + 2);
            }

            metadata.dataStart = offset;
            break;
        }
    }

    if (!metadata) {
        return null;
    }
    metadata.maxByteSizePerSample = (2881 * (metadata.samplesPerFrame / 1152)) / 1152;

    if (metadata.duration === 0) {
        var size = Math.max(0, metadata.dataEnd - metadata.dataStart);
        if (!metadata.vbr) {
            metadata.duration = (size * 8) / metadata.bitRate;
            metadata.frames = ((metadata.sampleRate * metadata.duration) / metadata.samplesPerFrame) | 0;
        } else {
            // VBR without Xing or VBRI header = need to scan the entire file.
            // What kind of sadist encoder does this?
            metadata.seekTable = new Mp3SeekTable();
            metadata.seekTable.fillUntil(2592000, metadata, view);
            metadata.frames = metadata.seekTable.frames;
            metadata.duration = (metadata.frames * metadata.samplesPerFrame) / metadata.sampleRate;
        }
    }

    if (metadata.duration < MINIMUM_DURATION) {
        return null;
    }

    return metadata;
}

module.exports = function(codecName, fileView) {
    try {
        if (codecName === "mp3") {
            return demuxMp3(fileView);
        }
    } catch (e) {
        throw e;
        return null;
    }
    return null;
};

// TODO: code is ruthlessly duplicated from above.
function Mp3SeekTable() {
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
    var index = frame / this.framesPerEntry;
    return this.table[index];
};

Mp3SeekTable.prototype.fillUntil = function(time, metadata, fileView) {
    if (this.tocFilledUntil >= time) return;
    var offset = metadata.dataStart;
    var end = metadata.dataEnd;

    var bufferSize = metadata.maxByteSizePerSample * metadata.samplesPerFrame | 0;
    var maxFrames = Math.ceil(time * (metadata.sampleRate / (1152 >> metadata.lsf)));
    var lsf = metadata.lsf ? 1 : 0;

    var table = this.table;
    var offset, frames;
    if (this.frames > 0) {
        frames = this.frames;
        offset = table[this.frames - 1] + this.lastFrameSize;
    } else {
        frames = 0;
        offset = metadata.dataStart;
    }

    mainLoop: while (offset < end && frames < maxFrames) {
        var buffer = fileView.bufferOfSizeAt(bufferSize, offset);
        var header = 0;

        do {
            var i = offset - fileView.start;
            header = ((header << 8) | buffer[i]) | 0;

            if ((header & 0xffe00000) !== -2097152) {
                
                continue;
            }

            if ((header & (3 << 17)) !== (1 << 17)) {
                continue;
            }

            if ((header & (0xF << 12)) === (0xF << 12)) {
                continue;
            }

            if ((header & (3 << 10)) === (3 << 10)) {
                continue;
            }

            var lsf, mpeg25;
            if ((header & (1<<20)) !== 0) {
                lsf = (header & (1<<19)) !== 0 ? 0 : 1;
                mpeg25 = 0;
            } else {
                lsf = 1;
                mpeg25 = 1;
            }

            var sampleRateIndex = ((header >> 10) & 3);
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) continue;
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) continue;
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            table[frames] = (offset - 3);
            frames++;

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            this.lastFrameSize = frame_size;
            offset += (frame_size - 4);

            if (frames >= maxFrames) {
                break mainLoop;
            }
            break;
        } while (++offset < end);
    }

    this.frames = frames;
    this.tocFilledUntil = (metadata.samplesPerFrame / metadata.sampleRate) * frames;
};

module.exports.Mp3SeekTable = Mp3SeekTable;
