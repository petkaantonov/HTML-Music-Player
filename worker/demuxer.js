"use strict";

const Promise = require("../lib/bluebird");
const FileView = require("./FileView");

const MINIMUM_DURATION = 3;
const MP3_DECODER_DELAY = 529;
const mp3_freq_tab = new Uint16Array([44100, 48000, 32000]);
const mp3_bitrate_tab = new Uint16Array([
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160
]);

const RIFF = 1380533830|0;
const WAVE = 1463899717|0;
const ID3 = 0x494433|0;
const VBRI = 0x56425249|0;
const Xing = 0x58696e67|0;
const Info = 0x496e666f|0;
const LAME = 0x4c414d45|0;
const TAG = 0x544147|0;
const DATA = 0x64617461|0;
const FACT = 0x66616374|0;

const LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP = 5 * 1024 * 1024;
const NETWORK_FILE_MAX_BYTES_UNTIL_GIVEUP = 50 * 1024;

const BLOCK_SIZE = 16384;

function probablyMp3Header(header) {
    return !(((header & 0xffe00000) !== -2097152)     ||
             ((header & (3 << 17)) !== (1 << 17))     ||
             ((header & (0xF << 12)) === (0xF << 12)) ||
             ((header & (3 << 10)) === (3 << 10)));
}


function demuxMp3FromWav(offset, fileView) {
    var max = Math.min(offset + 4096, fileView.end);

    var chunkSize = fileView.getInt32(offset + 4, true);
    var dataEnd = offset + chunkSize + 8;
    var subChunkSize = fileView.getInt32(offset + 16, true);
    var fmt = fileView.getInt16(offset + 20, true);
    var channels = fileView.getInt16(offset + 22, true);
    var sampleRate = fileView.getInt32(offset + 24, true);
    var lsf = sampleRate < 32000;
    var samplesPerFrame = lsf ? 576 : 1152;
    var byteRate = fileView.getInt32(offset + 28, true);
    var align = fileView.getInt16(offset + 32, true);
    var bitsPerSample = fileView.getInt16(offset + 34, true);
    var extraParamSize = fileView.getInt16(offset + 36, true);
    var wId = fileView.getInt16(offset + 38, true);
    var flags = fileView.getInt32(offset + 40, true);
    var blockSize = fileView.getInt16(offset + 44, true);
    var framesPerBlock = fileView.getInt16(offset + 46, true);
    var encoderDelay = fileView.getInt16(offset + 48, true);
    var frames = 0;

    offset += subChunkSize + 16 + 4;
    var duration = 0;
    while (offset < max) {
        var nextChunk = fileView.getInt32(offset, false);
        offset += 4;
        if (nextChunk === FACT) {
            var size = fileView.getInt32(offset, true);
            offset += 4;
            var samples = fileView.getInt32(offset, true);
            duration = samples / sampleRate;
            frames = (samples / samplesPerFrame)|0;
            offset += size;
        } else if (nextChunk === DATA) {
            var dataStart = offset + 4;
            if (duration === 0) {
                duration = Math.max(0, (dataEnd - dataStart)) / byteRate;
                frames = ((duration * sampleRate) / samplesPerFrame)|0;
            }
            if (duration < MINIMUM_DURATION) return null;

            var ret = {
                frames: frames,
                encoderDelay: encoderDelay,
                encoderPadding: 0,
                paddingStartFrame: -1,
                lsf: lsf,
                sampleRate: sampleRate,
                channels: channels,
                bitRate: byteRate * 8,
                dataStart: dataStart,
                dataEnd: dataEnd,
                averageFrameSize: blockSize,
                vbr: false,
                duration: duration,
                samplesPerFrame: samplesPerFrame,
                maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
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

function demuxMp3(fileView) {
    var offset = 0;
    var dataStart = 0;
    var dataEnd = fileView.file.size;
    var samplesPerFrame = 1152;

    return fileView.readBlockOfSizeAt(131072, 0).then(function() {
        if (fileView.end < 131072) return null;
        if ((fileView.getUint32(0, false) >>> 8) === ID3) {
            var footer = ((fileView.getUint8(5) >> 4) & 1) * 10;
            var size = (fileView.getUint8(6) << 21) | 
                       (fileView.getUint8(7) << 14) |
                       (fileView.getUint8(8) << 7) | 
                       fileView.getUint8(9);
            offset = size + 10 + footer;
            dataStart = offset;
        }

        return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 4).then(function() {
            if (fileView.getInt32(dataStart, false) === RIFF &&
                fileView.getInt32(dataStart + 8, false) === WAVE) {
                return demuxMp3FromWav(dataStart, fileView);
            }

            var max = Math.min(dataEnd, LOCAL_FILE_MAX_BYTES_UNTIL_GIVEUP);
            var metadata = null;
            var headersFound = 0;

            return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 4).then(function loop() {
                var localOffset = offset;
                var localMax = Math.max(0, Math.min(max - offset, BLOCK_SIZE / 2));

                if (localMax === 0) return;

                for (var i = 0; i < localMax; ++i) {
                    var index = localOffset + i;
                    var header = fileView.getInt32(index);
                        
                    if (probablyMp3Header(header)) {
                        if (headersFound > 4) {
                            return;
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
                        var nextHeader = fileView.getInt32(index + 4 + frame_size - 4, false);

                        if (!probablyMp3Header(nextHeader)) {
                            if (fileView.getInt32(index + 4 + 32) === VBRI) {
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
                                dataStart: index,
                                dataEnd: dataEnd,
                                averageFrameSize: ((bitRate / 1000) * 144000) / (sampleRate << lsf),
                                vbr: false,
                                duration: 0,
                                samplesPerFrame: samplesPerFrame,
                                maxByteSizePerSample: Math.ceil(((320 * 144000) / ((sampleRate << lsf)) |0) + 1) / samplesPerFrame,
                                seekTable: null,
                                toc: null
                            };
                        }
                        header = 0;
                        // VBRI
                    } else if (header === VBRI) {
                        metadata.vbr = true;
                        localOffset = index + 4 + 10;
                        var frames = fileView.getUint32(localOffset, false);
                        metadata.frames = frames;
                        metadata.duration = (frames * samplesPerFrame) / metadata.sampleRate;
                        localOffset += 4;
                        var entries = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var entryScale = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var sizePerEntry = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var framesPerEntry = fileView.getUint16(localOffset, false);
                        localOffset += 2;
                        var entryOffset = localOffset + entries + sizePerEntry;
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
                            case 4: method = fileView.getUint32; break;
                            case 3: method = fileView.getUint32; shift = 8; break;
                            case 2: method = fileView.getUint16; break;
                            case 1: method = fileView.getUint8; break;
                            default: return null;
                        }

                        var j = 0;
                        table[0] = dataStart;
                        for (; j < entries; ++j) {
                            var value = method.call(fileView, localOffset + (j * sizePerEntry)) >>> shift;
                            entryOffset += (value * entryScale);
                            table[j + 1] = entryOffset;
                        }

                        // 1159, 864, or 529
                        // http://mp3decoders.mp3-tech.org/decoders_lame.html
                        metadata.encoderDelay = 1159;
                        metadata.dataStart = dataStart;
                        return;
                    // Xing | Info
                    } else if (header === Xing || header === Info) {
                        if (header === Xing) {
                            metadata.vbr = true;
                        }

                        localOffset = index + 4;
                        var fields = fileView.getUint32(localOffset, false);
                        localOffset += 4;

                        var frames = -1;
                        if ((fields & 0x7) !== 0) {
                            if ((fields & 0x1) !== 0) {
                                var frames = fileView.getUint32(localOffset, false);
                                metadata.frames = frames;
                                metadata.duration = (frames * samplesPerFrame / metadata.sampleRate);
                                localOffset += 4;
                            }
                            if ((fields & 0x2) !== 0) {
                                localOffset += 4;
                            }
                            if ((fields & 0x4) !== 0) {
                                var toc = new Uint8Array(100);
                                for (var j = 0; j < 100; ++j) {
                                    toc[j] = fileView.getUint8(localOffset + j);
                                }
                                metadata.toc = toc;
                                localOffset += 100;
                            }
                            if (fields & 0x8 !== 0) localOffset += 4;
                        }

                        // LAME
                        if (fileView.getInt32(localOffset, false) === LAME) {
                            localOffset += (9 + 1 + 1 + 8 + 1 + 1);
                            var padding = (fileView.getInt32(localOffset, false) >>> 8);
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
                            localOffset += (3 + 1 + 1 + 2 + 4 + 2 + 2);
                        }

                        metadata.dataStart = localOffset;
                        return;
                    }                    
                }

                localOffset += Math.max(0, (i - localMax));
                offset = localOffset;
                return fileView.readBlockOfSizeAt(BLOCK_SIZE, localOffset, 4).then(loop);
            }).then(function() {
                if (!metadata) {
                    return null;
                }
                
                if (metadata.duration === 0) {
                    var size = Math.max(0, metadata.dataEnd - metadata.dataStart);
                    if (!metadata.vbr) {
                        metadata.duration = (size * 8) / metadata.bitRate;
                        metadata.frames = ((metadata.sampleRate * metadata.duration) / metadata.samplesPerFrame) | 0;
                    } else {
                        // VBR without Xing or VBRI header = need to scan the entire file.
                        // What kind of sadist encoder does this?
                        metadata.seekTable = new Mp3SeekTable();
                        metadata.seekTable.fillUntil(2592000, metadata, fileView);
                        metadata.frames = metadata.seekTable.frames;
                        metadata.duration = (metadata.frames * metadata.samplesPerFrame) / metadata.sampleRate;
                    }
                }

                if (metadata.duration < MINIMUM_DURATION) {
                    return null;
                }

                return metadata;
            });
        });
    });
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

Mp3SeekTable.prototype.fillUntil = Promise.method(function(time, metadata, fileView) {
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

    var self = this;
    var header = 0;
    return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 10).then(function loop() {
        var localEnd = Math.min(end, offset + BLOCK_SIZE / 2);
        var buffer = fileView.block();
        
        while (offset < localEnd && frames < maxFrames) {
            var i = offset - fileView.start;
            header = ((header << 8) | buffer[i]) | 0;

            if (!probablyMp3Header(header)) {
                offset++;
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
            if (sampleRateIndex < 0 || sampleRateIndex >= mp3_freq_tab.length) {
                offset++;
                continue;
            }
            var sampleRate = mp3_freq_tab[((header >> 10) & 3)] >> (lsf + mpeg25);

            var bitRateIndex = (lsf * 15) + ((header >> 12) & 0xf);
            if (bitRateIndex < 0 || bitRateIndex >= mp3_bitrate_tab.length) {
                offset++;
                continue;
            }
            var bitRate = mp3_bitrate_tab[bitRateIndex] * 1000;

            table[frames] = (offset - 3);
            frames++;

            var padding = (header >> 9) & 1;
            var frame_size = (((bitRate / 1000) * 144000) / ((sampleRate << lsf)) |0) + padding;
            self.lastFrameSize = frame_size;
            offset += (frame_size - 4);

            if (frames >= maxFrames) {
                return;
            }
        }
        return fileView.readBlockOfSizeAt(BLOCK_SIZE, offset, 10).then(loop);
    }).then(function() {
        self.frames = frames;
        self.tocFilledUntil = (metadata.samplesPerFrame / metadata.sampleRate) * frames;
    });
});

module.exports.Mp3SeekTable = Mp3SeekTable;
