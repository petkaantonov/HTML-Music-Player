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

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            
            var channels = ((header >> 6) & 3) === 3 ? 1 : 2;
            headersFound++;

            if (metadata) {
                if (metadata.bitRate !== bitRate) {
                    metadata.bitRate = bitRate;
                    metadata.vbr = true;
                }
            } else {
                metadata = {
                    lsf: !!lsf,
                    sampleRate: sampleRate,
                    channels: channels,
                    bitRate: bitRate,
                    dataStart: dataStart,
                    dataEnd: dataEnd,
                    vbr: false,
                    duration: 0,
                    samplesPerFrame: samplesPerFrame,
                    seekTable: null
                };
            }
            header = 0;
            i += (frame_size - 4);
            // VBRI
        } else if (header === (0x56425249 >>> 0)) {
            metadata.vbr = true;
            var offset = i - 4;
            var frames = view.getUint32(offset + 14, false);
            metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
            metadata.dataStart = offset + 26;
            break;
        // Xing | Info
        } else if (header === (0x58696e67 >>> 0) || header === (0x496e666f >>> 0)) {
            if (header === (0x58696e67 >>> 0)) {
                metadata.vbr = true;
            }
            var offset = i - 4;
            var fields = view.getUint32(offset + 4, false);

            if ((fields & 0x7) !== 0) {
                offset += 8;
                if ((fields & 0x1) !== 0) {
                    metadata.duration =
                        (view.getUint32(offset, false) * samplesPerFrame / metadata.sampleRate);
                    offset += 4;
                }
            }
            metadata.dataStart = offset + 26;
            break;
        }
    }

    if (metadata.duration === 0) {
        var size = blob.size - metadata.dataStart - (id3v1AtEnd ? 128 : 0);
        metadata.duration = (size * 8) / metadata.bitRate;
    }

    metadata.maxByteSizePerSample = (2881 * (metadata.samplesPerFrame / 1152)) / 1152;
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
