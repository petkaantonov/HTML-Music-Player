"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const Track = require("./Track");
const metadataRetriever = require("./MetadataRetriever");
const tagDatabase = require("./TagDatabase");
const TagData = require("./TagData");
const util = require("./util");
const blobPatch = require("../lib/blobpatch");
blobPatch();

const AudioError = require("./AudioError");
const TrackWasRemovedError = require("./TrackWasRemovedError");

const XING_FRAMES = 0x0001;

const ID3Encoding = {
    ISO88591: 0,
    UNICODE: 1,
    UTF16BE: 2,
    UTF8: 3
};

const ID3Artist = ["TP1", "TP1", "TP1", "TPE1", "TPE1"];
const ID3Title = ["TT2", "TT2", "TT2", "TIT2", "TIT2"];
const ID3Album = ["TAL", "TAL", "TAL", "TALB", "TALB"];
const ID3AlbumArtist = ["TP2", "TP2", "TP2", "TPE2", "TPE2"];
const ID3AlbumArtistAlt = ["TS2", "TS2", "TS2", "TSO2", "TSO2"];
const ID3TrackIndex = ["TRK", "TRK", "TRK", "TRCK", "TRCK"];
const ID3DiscNumber = ["TPA", "TPA", "TPA", "TPOS", "TPOS"];
const ID3Picture = ["PIC", "PIC", "PIC", "APIC", "APIC"];
const ID3CompilationFlag = ["TCP", "TCP", "TCP", "TCMP", "TCMP"];

const MPEGSyncWord = /\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF]/;

const MPEGBitRate = [
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
];

const MPEGSampleRate = [
    [11025, 12000, 8000, 0],
    [0, 0, 0, 0],
    [22050, 24000, 16000, 0],
    [44100, 48000, 32000, 0]
];

const MPEGChannels = [2, 2, 2, 1];

function ID3Process(playlist, player, trackAnalyzer) {
    this.trackAnalyzer = trackAnalyzer;
    this.playlist = playlist;
    this.player = player;
    this.concurrentParsers = 8;
    this.queue = [];
    this.queueProcessors = new Array(this.concurrentParsers);
    for (var i = 0; i < this.concurrentParsers; ++i) {
        this.queueProcessors[i] = null;
    }
    this.queueSet = new Set();
    this.jobPollerId = -1;
    playlist.on("lengthChange", this.playlistLengthChanged.bind(this));
    playlist.on("nextTrackChange", this.nextTrackChanged.bind(this));
    playlist.on("trackChange", this.currentTrackChanged.bind(this));
}

function isNull(value) {
    return value === null;
}

var retrieveAcoustIdImage = util.throttle(function(track) {
    if (track && track.shouldRetrieveAcoustIdImage()) {
        track.fetchAcoustIdImage();
    }
}, 100);

ID3Process.prototype.currentTrackChanged = function(track) {
    retrieveAcoustIdImage(track);
};

ID3Process.prototype.nextTrackChanged = function(track) {
    retrieveAcoustIdImage(track);
};

ID3Process.prototype.checkEmpty = function() {
    if (this.queueProcessors.every(isNull)) {
        var tracks = this.playlist.getUnparsedTracks(this.concurrentParsers * 8);
        if (tracks.length) {
            this.placeQueue(tracks);
            return true;
        }
    }
    return false;
};

ID3Process.prototype.playlistLengthChanged = function(newLength, oldLength) {
    var self = this;
    if (newLength > oldLength && this.jobPollerId === -1) {
        this.jobPollerId = setTimeout(function jobPoller() {
            self.jobPollerId = setTimeout(jobPoller, 1);
            if (!self.checkEmpty()) {
                clearTimeout(self.jobPollerId);
                self.jobPollerId = -1;
            }
        }, 1);
    }
};

ID3Process.prototype.placeQueue = function(queue) {
    if (!queue.length) {
        return;
    }

    for (var i = 0; i < queue.length; ++i) {
        var track = queue[i];
        if (this.queueSet.has(track)) {
            continue;
        }

        this.queueSet.add(track);
        this.queue.push(track);
    }

    this.queueProcessors.forEach(function(queueProcess, index) {
        var self = this;
        if (!queueProcess) {
            this.queueProcessors[index] = this.loadNext().reflect().then(function(result) {
                self.queueProcessors[index] = null;
                self.checkEmpty();
                if (result.isRejected()) {
                    throw result.reason();
                }
                return null;
            });
        }
    }, this);
};

ID3Process.prototype.getTimeFromXing = function(bytes, sampleRate) {
    var index = bytes.indexOf("Xing");
    index = index === -1 ? bytes.indexOf("Info") : index;
    if (index === -1) return null;

    if (util.int32BE(bytes, index + 4) & XING_FRAMES) {
        var frames = util.int32BE(bytes, index + 8);
        return ~~(1152 * frames / sampleRate);
    }
    return null;
};

ID3Process.prototype.getTimeFromVBRi = function(bytes, sampleRate) {
    var offset = bytes.indexOf("VBRI");
    if (offset < 0) {
        return null;
    }
    var frames = util.int32BE(bytes, offset + 14) >>> 0;
    return Math.floor(1152 * frames / sampleRate);
};


ID3Process.prototype.getTagSize = function(bytes, version, magicOffset) {
    if (magicOffset === undefined) magicOffset = 0;

    if (version < 3) {
        return util.int24BE(bytes, 3 + magicOffset) >>> 0;
    } else if (version === 3) {
        return util.int32BE(bytes, 4 + magicOffset) >>> 0;
    } else if (version > 3) {
        return util.synchInt32(bytes, 4 + magicOffset) >>> 0;
    }
    throw new Error("InvalidVersion");
};

ID3Process.prototype.fillInAcoustId = function(track, duration, fingerprint) {
    var self = this;
    metadataRetriever.getAcoustIdDataForTrack(track, duration, fingerprint).then(function(acoustId) {
        if (!track.isDetachedFromPlaylist()) {
            track.tagData.setAcoustId(acoustId);
            tagDatabase.updateAcoustId(track.getUid(), acoustId);

            if (self.playlist.isTrackHighlyRelevant(track) &&
                track.shouldRetrieveAcoustIdImage()) {
                track.fetchAcoustIdImage();
            }
        }
        return null;
    }).catch(function(e) {
        if (e && e.statusText && e.statusText === "timeout") {
            return;
        }
    });

    if (this.playlist.isTrackHighlyRelevant(track)) {
        metadataRetriever.prioritize(track);
    }
};

ID3Process.prototype.loadNext = function() {
    var self = this;
    if (!this.queue.length) {
        return Promise.resolve(false);
    }
    var track = this.queue.shift();
    if (track.isDetachedFromPlaylist() || track.hasError()) {
        this.queueSet.delete(track);
        return Promise.resolve(false);
    }

    var tagData;
    if (track.tagData) {
        tagData = Promise.resolve(track.tagData);
    } else {
        var blob = track.file.slice(0, 256);
        tagData = util.readAsBinaryString(blob)
            .finally(function() {
                blob.close();
            })
            .then(function(bytes) {
                var format = track.getFormat(bytes);
                if (format === Track.MP3) {
                    return self.parseMpegTagData(bytes, track);
                } else if (format === Track.WAV) {
                    return self.parseWavTagData(bytes, track);
                } else if (format === Track.OGG) {
                    return self.parseOggTagData(bytes, track);
                } else if (format === Track.AAC) {
                    return new TagData(track);
                } else if (format === Track.WEBM) {
                    return new TagData(track);
                } else {
                    throw new AudioError();
                }
            })
            .then(function(result) {
                if (!result|| !result.basicInfo) {
                    return new TagData(track, null, null, {
                        channels: 2,
                        sampleRate: 44100,
                        duration: NaN
                    });
                }
                return result;
            })
            .then(function(tagData) {
                track.setTagData(tagData);
                return tagData;
            });
    }

    return tagData.then(function(tagData) {
        var id = track.getUid();

        var coverArt = Promise.resolve(null);
        if (tagData.album) {
            coverArt = tagDatabase.getAlbumImage(tagData.album.toLowerCase());
        }

        Promise.join(tagDatabase.query(id), coverArt, function(value, coverArt) {
            if (coverArt && value) value.coverArt = coverArt;

            var shouldAnalyzeLoudness = !value || value.trackGain === undefined;
            var shouldCalculateFingerprint = !value || value.fingerprint === undefined;
            var shouldRetrieveAcoustIdMetaData = (shouldCalculateFingerprint ||
                                                 (value && value.acoustId === undefined));

            if (shouldRetrieveAcoustIdMetaData && value && value.fingerprint && value.duration) {
                self.fillInAcoustId(track, value.duration, value.fingerprint);
            }

            if (shouldAnalyzeLoudness || shouldCalculateFingerprint) {
                var analyzerOptions = {
                    loudness: shouldAnalyzeLoudness,
                    fingerprint: shouldCalculateFingerprint
                };
                track.setAnalysisStatus(analyzerOptions);
                return self.trackAnalyzer.analyzeTrack(track, analyzerOptions).finally(function() {
                    track.unsetAnalysisStatus();
                }).then(function(result) {
                    var duration = value && value.duration ? value.duration : result.duration;

                    if (result.fingerprint && result.fingerprint.fingerprint && shouldRetrieveAcoustIdMetaData) {
                        self.fillInAcoustId(track, duration, result.fingerprint.fingerprint);
                    }

                    return $.extend({},
                                    value || {},
                                    {duration: duration},
                                    result.loudness || {},
                                    result.fingerprint || {});
                });
            } else if (value) {
                tagData.setDataFromTagDatabase(value);
                return null;
            }
        }).then(function(value) {
            if (value) {
                tagData.setDataFromTagDatabase(value);
                return tagDatabase.insert(id, value);
            }
        }).then(function() {
            if (track.needsParsing()) {
                debugger;
            }
        })
        .catch(AudioError, function() {})
        .catch(TrackWasRemovedError, function() {});
        return tagData;
    })
    .catch(AudioError, function(e) {
        track.setTagData(new TagData(track, null, null, {
            channels: 2,
            sampleRate: 44100,
            duration: NaN
        }));
    })
    .catch(function(e) {
        if (e instanceof Error) {
            if (e.name === "NotFoundError" || e.name === "NotReadableError") {
                track.setError(Track.FILESYSTEM_ACCESS_ERROR);
                return;
            }
        }
        throw e;
    })
    .finally(function() {
        self.queueSet.delete(track);
        return self.loadNext();
    });
};

ID3Process.prototype.getPictures = function(bytes, version, offsetMap) {
    const magic = ID3Picture[version];
    var index = bytes.indexOf(magic);
    var ret = null;

    if (index !== -1) ret = [];

    while (index !== -1) {
        var size = this.getTagSize(bytes, version, index);
        var offset = index;

        if (version <= 2) {
            offset += 6;
            var encoding = bytes.charCodeAt(offset);
            var nullMagic = this.getNullTerminatorByEncoding(encoding);
            offset += 1;
            var type = "image/" + bytes.substr(offset, 3).toLowerCase();
            offset += 3;
            //var pictureKind = bytes.charCodeAt(offset);
            offset += 1;
            var dataStart = bytes.indexOf(nullMagic, offset) + nullMagic.length;
            var descriptionLength = dataStart - nullMagic.length - offset;
            offset += (descriptionLength + nullMagic.length);
            var dataLength = size - (5 + nullMagic.length + descriptionLength);
            offset += dataLength;
            ret.push({
                start: this.translatePositiveOffset(index, offsetMap, dataStart - index),
                length: dataLength,
                type: type,
                id3version: "2.2"
            });
            index = offset;
        } else if (version === 3) {
            offset += 10;
            var encoding = bytes.charCodeAt(offset);
            var nullMagic = this.getNullTerminatorByEncoding(encoding);
            offset += 1;
            var type = bytes.slice(offset, bytes.indexOf("\x00", offset));
            if (!type) {
                return null;
            }
            var typeLength = type.length;
            type = type.toLowerCase();
            if (type.indexOf("/") === -1) {
                if (/jpg|jpeg|png/.test(type)) {
                    type = "image/" + type;
                } else {
                    return null;
                }
            }
            offset += (typeLength + 1);
            //var pictureKind = bytes.charCodeAt(offset);
            offset += 1;
            var dataStart = bytes.indexOf(nullMagic, offset) + nullMagic.length;
            var descriptionLength = dataStart - nullMagic.length - offset;
            offset += (descriptionLength + nullMagic.length);
            var dataLength = size - (nullMagic.length - 3 - descriptionLength - typeLength);
            offset += dataLength;
            ret.push({
                start: this.translatePositiveOffset(index, offsetMap, dataStart - index),
                length: dataLength,
                type: type,
                id3version: "2.3"
            });
            index = offset;
        } else {
            offset += 8;
            var flags = this.parseId3v2Bits(bytes, offset);
            offset += 2;

            if (flags.hasDataLengthIndicator) {
                size = util.synchInt32(bytes, offset);
                offset += 4;
            }

            var encoding = bytes.charCodeAt(offset);
            var nullMagic = this.getNullTerminatorByEncoding(encoding);
            offset += 1;
            var type = bytes.slice(offset, bytes.indexOf("\x00", offset));
            if (!type) {
                return null;
            }
            var typeLength = type.length;
            type = type.toLowerCase();
            if (type.indexOf("/") === -1) {
                if (/jpg|jpeg|png/.test(type)) {
                    type = "image/" + type;
                } else {
                    return null;
                }
            }
            offset += (typeLength + 1);
            //var pictureKind = bytes.charCodeAt(offset);
            offset += 1;
            var dataStart = bytes.indexOf(nullMagic, offset) + nullMagic.length;
            var descriptionLength = dataStart - nullMagic.length - offset;
            offset += (descriptionLength + nullMagic.length);
            var dataLength = size - (nullMagic.length - 3 - descriptionLength - typeLength);

            if (flags.hasBeenUnsynchronized) {
                var unsynchIndex;
                while ((unsynchIndex = bytes.indexOf("\xff\x00", offset)) !== -1) {
                    if (unsynchIndex < dataStart + dataLength) {
                        bytes = bytes.slice(0, unsynchIndex) + bytes.slice(unsynchIndex + 1);
                        dataLength--;
                    } else {
                        break;
                    }
                }
            }

            offset += dataLength;
            ret.push({
                start: this.translatePositiveOffset(index, offsetMap, dataStart - index),
                length: dataLength,
                type: type,
                id3version: "2.4"
            });
            index = offset;
        }
        index = bytes.indexOf(magic, index);
    }

    return ret;
};

ID3Process.prototype.parseOggTagData = function(bytes, track) {
    var oggsIndex = bytes.indexOf("OggS");
    if (oggsIndex === -1) return null;
    var segmentDescriptors = bytes.charCodeAt(oggsIndex + 26);
    var totalSize = 0;
    var index = oggsIndex + 27;
    for (var i = 0; i < segmentDescriptors; ++i) {
        totalSize += bytes.charCodeAt(index);
        index++;
    }

    var self = this;
    var blob = track.file.slice(index, index + totalSize);
    return util.readAsBinaryString(blob).finally(function() {
        blob.close();
    }).then(function(bytes) {
        if (bytes.indexOf("vorbis") === 1) {
            var basicInfo = self.getVorbisBasicInfo(bytes, track.file.size);
            return new TagData(track, null, null, basicInfo);
        } else {
            return new TagData(track);
        }
    });
};

ID3Process.prototype.parseWavTagData = function(bytes, track) {
    var riffIndex = bytes.indexOf("RIFF");
    var fmtIndex = bytes.indexOf("fmt ");
    if (riffIndex !== 0 || fmtIndex !== 12) {
        return new TagData(track);
    }
    var basicInfo = this.getWavBasicInfo(bytes);
    return new TagData(track, null, null, basicInfo);
};

ID3Process.prototype.parseMpegTagData = function(bytes, track) {
    var ID3v2Pos = bytes.indexOf("ID3");
    var fileSize = track.getFileSize();

    if (ID3v2Pos > -1) {
        var size = util.synchInt32(bytes, 6);
        var startStart = ID3v2Pos;
        var startEnd = ID3v2Pos + size + 1527;
        var endStart = fileSize - 200;
        var endEnd = fileSize;

        var self = this;
        var blob1 = track.file.slice(startStart,  startEnd);
        var blob2 = track.file.slice(endStart, endEnd);
        var blob3 = new Blob([blob1, blob2]);
        return util.readAsBinaryString(blob3).finally(function() {
            blob1.close();
            blob2.close();
            blob3.close();
        }).then(function(bytes) {
            return self.getID3v2(bytes, track, [
                [0, startEnd - startStart, startStart],
                [startEnd - startStart, (startEnd - startStart) + (endEnd - endStart), endStart]
            ]);
        });
    } else {
        var startStart = 0;
        var startEnd = 1527;
        var endStart = fileSize - 200;
        var endEnd = fileSize;

        var self = this;
        var blob1 = track.file.slice(startStart,  startEnd);
        var blob2 = track.file.slice(endStart, endEnd);
        var blob3 = new Blob([blob1, blob2]);
        return util.readAsBinaryString(blob3).finally(function() {
            blob1.close();
            blob2.close();
            blob3.close();
        }).then(function(bytes) {
            return self.getID3v1(bytes, track, [
                [0, startEnd - startStart, startStart],
                [startEnd - startStart, (startEnd - startStart) + (endEnd - endStart), endStart]
            ]);
        });
    }
};

ID3Process.prototype.getVorbisBasicInfo = function(bytes, fileSize) {
    var bitrateUpper = util.int32LE(bytes, 16) >>> 0;
    var bitrateNominal = util.int32LE(bytes, 20) >>> 0;
    var bitrateLower = util.int32LE(bytes, 24) >>> 0;

    var duration = NaN;
    if (bitrateNominal) {
        duration = Math.floor(fileSize * 8 / bitrateNominal);
    } else if (bitrateLower && bitrateUpper) {
        duration = Math.floor(fileSize * 8 / ((bitrateLower + bitrateUpper) / 2));
    }

    var sampleRate = util.int32LE(bytes, 12) >>> 0;

    return {
        channels: bytes.charCodeAt(11),
        sampleRate: sampleRate,
        duration: duration
    };
};

ID3Process.prototype.getWavBasicInfo = function(bytes) {
    var channels = util.int16LE(bytes, 22);
    var sampleRate = util.int32LE(bytes, 24);
    var byteRate = util.int32LE(bytes, 28);
    var chunkType = bytes.substr(36, 4);
    var duration = NaN;

    if (chunkType === "data") {
        var chunkSize = util.int32LE(bytes, 40) >>> 0;
        duration = chunkSize / byteRate;
    }

    return {
        duration: Math.floor(duration),
        sampleRate: sampleRate,
        channels: channels
    };
};

ID3Process.prototype.parseMpegBasicInfo = function(bytes, track) {
    var syncWord = bytes.match(MPEGSyncWord);
    if (syncWord) {
        var firstFrame = syncWord[0];
        var version2Bit = (firstFrame.charCodeAt(1) & 0x18) >> 3;
        var bitRate = MPEGBitRate[version2Bit][(
            firstFrame.charCodeAt(2) & 0xF0) >> 4];
        var sampleRate = MPEGSampleRate[version2Bit][(
            firstFrame.charCodeAt(2) & 0x0C) >> 2];

        var channels = MPEGChannels[util.bits(firstFrame.charCodeAt(3), 6, 2)];

        var fileSize = track.file.size;

        if (!bitRate || !channels || !sampleRate) return null;

        var duration = this.getTimeFromXing(bytes, sampleRate) ||
                       this.getTimeFromVBRi(bytes, sampleRate) ||
                       Math.round(fileSize / ((bitRate * 1000) / 8)) ||
                       0;

        return {
            duration: duration,
            sampleRate: sampleRate,
            channels: channels
        };
    }
    return null;
};

ID3Process.prototype.getMpegBasicInfo = Promise.method(function(bytes, offsetMap, track) {
    var start = offsetMap[0][1] - 1527;
    var end = offsetMap[0][1];
    var trialsLeft = 5;
    var self = this;

    return (function trial(bytes) {
        var basicInfo = self.parseMpegBasicInfo(bytes, track);
        if (basicInfo) {
            return basicInfo;
        }

        if (trialsLeft-- < 0) {
            throw new AudioError(MediaError.MEDIA_ERR_DECODE);
        }

        start = Math.min(offsetMap[0][2] + end, track.file.size - 1);
        end = Math.min(start + 1527 * 20, track.file.size);

        var blob = track.file.slice(start, end);
        return util.readAsBinaryString(blob).finally(function() {
            blob.close();
        }).then(trial);
    })(bytes.slice(start, end));
});

ID3Process.prototype.getID3v1String = function(bytes, startPosition) {
    var string = bytes.substr(startPosition, 30);
    var nullPosition = string.indexOf("\u0000");
    if (nullPosition >= 0) {
        return string.slice(0, nullPosition);
    } else {
        return string;
    }
};

ID3Process.prototype.getNullTerminatorByEncoding = function(encoding) {
    switch (encoding) {
        case ID3Encoding.UNICODE:
        case ID3Encoding.UTF16BE:
            return "\x00\x00";
        default:
            return "\x00";
    }
};

ID3Process.prototype.decodeID3v2Text = function(text, encoding) {
    if (encoding === ID3Encoding.UNICODE) {
        return util.unicode.decodeUnicodeEncodedBinaryString(text);
    } else if (encoding === ID3Encoding.ISO88591) {
        return util.stripBinaryBom(text);
    } else if (encoding === ID3Encoding.UTF16BE) {
        return util.unicode.decodeUnicodeEncodedBinaryString(text, true);
    } else if (encoding === ID3Encoding.UTF8) {
        return util.unicode.decodeUtf8EncodedBinaryString(text);
    } else {
        return util.stripBinaryBom(text);
    }
};

ID3Process.prototype.getID3v2String = function(bytes, tagIdentifier, version, offset) {
    if (offset === undefined) offset = 0;
    var position = bytes.indexOf(tagIdentifier, offset);
    if (position < 0) return null;
    var tagSize = this.getTagSize(bytes.substr(position, 10), version);

    var encoding, contents;
    if (version > 2) {
        var flags = this.parseId3v2Bits(bytes, position + 8);

        if (flags.hasDataLengthIndicator) {
            tagSize = util.synchInt32(bytes, position + 10);
            encoding = bytes.charCodeAt(position + 14);
            contents = bytes.substr(position + 15, tagSize - 1);
        } else {
            encoding = bytes.charCodeAt(position + 10);
            contents = bytes.substr(position + 11, tagSize - 1);
        }

        if (flags.hasBeenUnsynchronized) {
            while (contents.indexOf("\xff\x00") !== -1) {
                contents = contents.replace("\xff\x00", "\xff");
            }
        }
    } else {
        encoding = bytes.charCodeAt(position + 6);
        contents = bytes.substr(position + 7, tagSize - 1);
    }

    return this.decodeID3v2Text(contents, encoding);
};

ID3Process.prototype.getID3v1 = Promise.method(function(bytes, track, offsetMap) {
    var id3Bytes = bytes.slice(offsetMap[1][1] - 128);
    var tagPos = id3Bytes.indexOf("TAG");
    var title = null;
    var artist = null;
    var album = null;
    var trackIndex = -1;

    if (tagPos === 0) {
        title = this.getID3v1String(id3Bytes, tagPos + 3);
        artist = this.getID3v1String(id3Bytes, tagPos + 33);
        album = this.getID3v1String(id3Bytes, tagPos + 63);
        var trackIndexData = id3Bytes.substr(tagPos + 125, 2);
        trackIndex = -1;
        if (trackIndexData.charCodeAt(0) === 0) {
            trackIndex = trackIndexData.charCodeAt(1);
        }
    }

    return this.getMpegBasicInfo(bytes, offsetMap, track).then(function(basicInfo) {
        return new TagData(track, title, artist, basicInfo, album, trackIndex);
    });
});

ID3Process.prototype.getID3v2 = Promise.method(function(bytes, track, offsetMap) {
    var version = bytes.charCodeAt(3);
    var artist = this.getID3v2String(bytes, ID3Artist[version], version);
    var title = this.getID3v2String(bytes, ID3Title[version], version);
    var album = this.getID3v2String(bytes, ID3Album[version], version);
    var trackIndex = this.getID3v2String(bytes, ID3TrackIndex[version], version);
    var discNumber = this.getID3v2String(bytes, ID3DiscNumber[version], version);
    var albumArtist = this.getID3v2String(bytes, ID3AlbumArtist[version], version) ||
                      this.getID3v2String(bytes, ID3AlbumArtistAlt[version], version);

    if (!albumArtist) {
        var isCompilation = this.getID3v2String(bytes, ID3CompilationFlag[version], version) === "1\x00";
        if (isCompilation) {
            albumArtist = "Various Artists";
        }
    }

    var pictures = this.getPictures(bytes, version, offsetMap);
    var picture = null;

    if (pictures && pictures.length) {
        if (pictures.length === 1) {
            picture = pictures.first();
        } else {
            var maxSize = -Infinity;
            var maxSizePic = null;
            for (var i = 0; i < pictures.length; ++i) {
                var pic = pictures[i];

                if (pic.length > maxSize) {
                    maxSize = pic.length;
                    maxSizePic = pic;
                }
            }
            picture = maxSizePic;
        }
    }


    if (trackIndex) {
        var match = trackIndex.match(/\d+/);
        if (match) {
            trackIndex = parseInt(match, 10);
        } else {
            trackIndex = -1;
        }
    } else {
        trackIndex = -1;
    }

    if (discNumber) {
        var match = discNumber.match(/\d+/);
        if (match) {
            discNumber = parseInt(match, 10);
        } else {
            discNumber = -1;
        }
    } else {
        discNumber = -1;
    }

    return this.getMpegBasicInfo(bytes, offsetMap, track).then(function(basicInfo) {
        return new TagData(track, title, artist, basicInfo, album, trackIndex, albumArtist, discNumber, picture);
    });
});

ID3Process.prototype.parseId3v2Bits = function(bytes, offset) {
    var bits = util.int16BE(bytes, offset);

    return {
        tagAlterPreservation: util.bit(bits, 14),
        fileAlterPreservation: util.bit(bits, 13),
        readOnly: util.bit(bits, 12),
        containsGroupInfo: util.bit(bits, 6),
        isCompressed: util.bit(bits, 3),
        isEncrypted: util.bit(bits, 2),
        hasBeenUnsynchronized: util.bit(bits, 1),
        hasDataLengthIndicator: util.bit(bits, 0)
    };
};

ID3Process.prototype.parseApeBits = function(bytes, offset) {
    var bits = util.int32LE(bytes, offset);
    var containsHeader = util.bit(bits, 31);
    var containsFooter = util.bit(bits, 30);
    var isHeader = util.bit(bits, 29);
    var isFooter = !isHeader;
    var dataType = util.bits(bits, 1, 2);
    var readOnly = util.bit(bits, 0);

    return {
        isHeader: isHeader,
        isFooter: isFooter,
        dataType: dataType,
        containsFooter: containsFooter,
        containsHeader: containsHeader,
        readOnly: readOnly
    };
};

ID3Process.prototype.parseApe = function(bytes, offset, track, offsetMap) {
    var apeHeader;
    var version = util.int32LE(bytes, offset + 8);

    if (version !== 2000) {
        return Promise.resolve({});
    }

    var tagSize = util.int32LE(bytes, offset + 12);
    var itemCount = util.int32LE(bytes, offset + 16);
    var flags = this.parseApeBits(bytes, offset + 20);
    var start, end;

    if (flags.isHeader) {
        var start = this.translatePositiveOffset(offset, offsetMap, 32);
        var end = this.translatePositiveOffset(offset, offsetMap, 32 + tagSize);
    } else {
        var start = this.translateNegativeOffset(offset, offsetMap, tagSize - 32);
        var end = this.translateNegativeOffset(offset, offsetMap, 0);
    }
    apeHeader = track.file.slice(start, end);

    return util.readAsBinaryString(apeHeader).finally(function() {
        apeHeader.close();
    }).then(function(bytes) {
        var offset = 0;
        var ret = Object.create(null);
        for (var i = 0; i < itemCount; ++i) {
            var valueLen = util.int32LE(bytes, offset);
            offset += 8;
            var nullIndex = bytes.indexOf("\x00", offset);
            var key = bytes.slice(offset, nullIndex);
            offset = nullIndex + 1;
            var value = bytes.substr(offset, valueLen);
            offset += valueLen;
            ret[key.toLowerCase()] = value;
        }
        return ret;
    });
};

ID3Process.prototype.translatePositiveOffset = function(offset, offsetMap, plus) {
    var startFileMap = offsetMap[0];
    var endFileMap = offsetMap[1];

    if (offset >= startFileMap[0] && offset < startFileMap[1]) {
        return startFileMap[2] + offset + plus;
    } else if (offset >= endFileMap[0] && offset < endFileMap[1]) {
        return endFileMap[2] + (offset - (startFileMap[1] - startFileMap[0])) + plus;
    } else {
        throw new Error("offset " + offset + " is not described by the given offsetMap");
    }
};

ID3Process.prototype.translateNegativeOffset = function(offset, offsetMap, minus) {
    if (minus === undefined) minus = 0;
    var startFileMap = offsetMap[0];
    var endFileMap = offsetMap[1];

    if (offset >= startFileMap[0] && offset < startFileMap[1]) {
        return startFileMap[2] + offset - minus;
    } else if (offset >= endFileMap[0] && offset < endFileMap[1]) {
        return endFileMap[2] + (offset - (startFileMap[1] - startFileMap[0])) - minus;
    } else {
        throw new Error("offset " + offset + " is not described by the given offsetMap");
    }
};

module.exports = ID3Process;
