"use strict";
var FileView = require("./FileView");

const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

function demuxMp3(blob) {
    var view = new FileView(blob);
    var offset = 0;
    var dataStart = 0;
    var dataEnd = blob.size;
    var samplesPerFrame = 1152;

    if ((view.getUint32(0, false) >>> 8) === 0x494433) {
        var footer = ((view.getUint8(5) >> 4) & 1) * 10;
        var size = (view.getUint8(6) << 21) | 
                   (view.getUint8(7) << 14) |
                   (view.getUint8(8) << 7) | 
                   view.getUint8(9);
        offset = size + 10 + footer;
        dataStart = offset;
    }

    var id3v1AtEnd = (view.getUint32(blob.size - 128) >>> 8) === 0x544147;

    if (id3v1AtEnd) {
        dataEnd -= 128;
    }

    var max = 2314 * 20;
    var header = 0;
    var metadata = null;
    var headersFound = 0;
    var prevSampleRate = 0;
    var prevChannels = 0;
    var prevLsf = -1;
    var prevMpeg25 = -1;

    for (var i = 0; i < max; ++i) {
        var index = offset + i;
        header = ((header << 8) | view.getUint8(index)) >>> 0;
            // MP3
        if (((header & (0xffe60000 >>> 0)) >>> 0) === (0xffe20000) >>> 0) {
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

            var channels = ((header >> 6) & 0x3) === 3 ? 1 : 2;

            if (prevLsf === -1) {
                prevLsf = lsf;
                prevMpeg25 = mpeg25;
                prevSampleRate = sampleRate;
                prevChannels = channels;
            } else if (prevLsf !== lsf ||
                       prevMpeg25 !== mpeg25 ||
                       prevSampleRate !== sampleRate ||
                       prevChannels !== channels) {
                return null;
            }

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            
            var channels = ((header >> 6) & 3) === 3 ? 1 : 2;
            headersFound++;

            if (metadata) {
                if (metadata.bitRate !== bitRate) {
                    metadata.bitRate = bitRate;
                    metadata.vbr = true;
                }
                i += (frame_size - 4 - 1);
            } else {
                metadata = {
                    lsf: !!lsf,
                    sampleRate: sampleRate,
                    channels: channels,
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
        } else if (header === (0x56425249 >>> 0)) {
            metadata.vbr = true;
            var offset = index + 1 + 10;
            var frames = view.getUint32(offset, false);
            offset += 4;
            var entries = view.getUint16(offset, false);
            // Skip "entries scale factor" as nobody seems to have any idea what that actually means.
            offset += 4;
            var sizePerEntry = view.getUint16(offset, false);
            offset += 2;
            var framesPerEntry = view.getUint16(offset, false);
            offset += 2;
            var entryOffset = offset + entries + sizePerEntry;
            var dataStart = entryOffset;
            var toc = new Uint8Array(100);
            var tocFrame = 0;
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
            for (; j < entries; ++j) {
                var value = method.call(view, offset + (j * sizePerEntry)) >>> shift;
                entryOffset += value;
                var bytePercentage = (((entryOffset - dataStart) / (dataEnd - dataStart)) * 256) | 0;
                var framesPercentage = Math.min(((tocFrame / frames) * 100)|0, 99);
                toc[framesPercentage] = Math.min(255, bytePercentage);
                tocFrame += framesPerEntry;
            }

            for ( ; j < 100; ++j) {
                toc[j] = 255;
            }

            metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
            metadata.dataStart = dataStart;
            metadata.toc = toc;
            break;
        // Xing | Info
        } else if (header === (0x58696e67 >>> 0) || header === (0x496e666f >>> 0)) {
            if (header === (0x58696e67 >>> 0)) {
                metadata.vbr = true;
            }

            var offset = index + 1;
            var fields = view.getUint32(offset, false);

            offset += 4;
            if ((fields & 0x7) !== 0) {
                if ((fields & 0x1) !== 0) {
                    metadata.duration =
                        (view.getUint32(offset, false) * samplesPerFrame / metadata.sampleRate);
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
            metadata.dataStart = offset;
            break;
        }
    }
    metadata.maxByteSizePerSample = (2881 * (metadata.samplesPerFrame / 1152)) / 1152;

    if (metadata.duration === 0) {
        var size = Math.max(0, metadata.dataEnd - metadata.dataStart);
        if (!metadata.vbr) {
            metadata.duration = (size * 8) / metadata.bitRate;
        } else {
            metadata.seekTable = new Mp3SeekTable();
            metadata.seekTable.fillUntil(2592000, metadata, view);
            metadata.duration = (metadata.seekTable.frames * metadata.samplesPerFrame) / metadata.sampleRate;
        }
    }

    return metadata;
}

module.exports = function(codecName, blob) {
    try {
        if (codecName === "mp3") {
            return demuxMp3(blob);
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
}

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
