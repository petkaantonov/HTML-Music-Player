"use strict";
/*
 * Ported from acousticid/chromaprint
 *
 * Chromaprint -- Audio fingerprinting toolkit
 * Copyright (C) 2010  Lukas Lalinsky <lalinsky@gmail.com>,
 * Copyright (C) 2015  Petka Antonov
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301
 * USA
 */

var realFft = require("lib/realfft");
import Promise from "lib/bluebird";
const AcoustIdApiError = require("audio/AcoustIdApiError");
import { queryString } from "lib/util";
const tagDatabase = require("TagDatabase");

const DURATION = 120;
const SAMPLE_RATE = 11025;
const MAX_FRAMES = DURATION * SAMPLE_RATE;
const OVERLAP = 1365;
const FRAMES = 4096;
const IM_OFFSET = FRAMES / 2;
const BUFFER = new Float64Array(FRAMES);
const NOTES = 12;
const ROWS = Math.ceil(((DURATION * SAMPLE_RATE) - FRAMES) / OVERLAP);
const COEFFS = new Float64Array([0.25, 0.75, 1.0, 0.75, 0.25]);
const TMP = new Float64Array(NOTES);
const IMAGE = new Float64Array(ROWS * NOTES);
const NOTE_BUFFER = new Float64Array(8 * NOTES);
const pi2 = Math.PI * 2;
const a = 2 * Math.pow(Math.sin(-Math.PI / FRAMES), 2);
const b = Math.sin(-Math.PI * 2 / FRAMES);
const NOTE_FREQUENCY_START = 10;
const NOTE_FREQUENCY_END = 1308;
const REFERENCE_FREQUENCY = 440;
const WIDTH = 16;
const BASE = REFERENCE_FREQUENCY / WIDTH;
const ALGORITHM = 1;
const BITS = new Uint8Array(960 * 33);
const BASE64 = new Uint8Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("").map(function(v) {
    return v.charCodeAt(0);
}));

const cmp = function(a, b) {
    return Math.log(1.0 + a) - Math.log(1.0 + b);
};

const area = function(x1, y1, x2, y2) {
    if (x2 < x1 || y2 < y1) {
        return 0;
    }

    var area = IMAGE[x2 * 12 + y2];
    if (x1 > 0) {
        area -= IMAGE[(x1 - 1) * 12 + y2];
        if (y1 > 0) {
            area += IMAGE[(x1 - 1) * 12 + (y1 - 1)];
        }
    }

    if (y1 > 0) {
        area -= IMAGE[x2 * 12 + (y1 - 1)];
    }

    return area;
};

const quantize = function(value, t0, t1, t2) {
    if (value < t1) {
        if (value < t0) {
            return 0;
        }
        return 1;
    } else if (value < t2) {
        // Grey coded.
        return 3;
    } else {
        // Grey coded.
        return 2;
    }
};

const classify0 = function(x, y, h, w, t0, t1, t2) {
        return quantize(cmp(area(x, y, x + w - 1, y + h - 1), 0), t0, t1, t2);
};

const classify1 = function(x, y, h, w, t0, t1, t2) {
        const h_2 = h/2|0;

        return quantize(cmp(area(x, y + h_2, x + w - 1, y + h - 1),
                   area(x, y, x + w - 1, y + h_2 - 1)), t0, t1, t2);
};

const classify2 = function(x, y, h, w, t0, t1, t2) {
        const w_2 = w/2|0;

        return quantize(cmp(area(x + w_2, y, x + w - 1, y + h - 1),
                   area(x, y, x + w_2 - 1, y + h - 1)), t0, t1, t2);
};

const classify3 = function(x, y, h, w, t0, t1, t2) {
        const h_2 = h/2|0;
        const w_2 = w/2|0;

        const a = area(x, y + h_2, x + w_2 - 1, y + h - 1) +
                area(x + w_2, y, x + w - 1, y + h_2 - 1);

        const b = area(x, y, x + w_2 - 1, y + h_2 - 1) +
                area(x + w_2, y + h_2, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};

const classify4 = function(x, y, h, w, t0, t1, t2) {
        const h_3 = h/3|0
        const w_3 = w/3|0;

        const a = area(x, y + h_3, x + w - 1, y + 2 * h_3 - 1);

        const b = area(x, y, x + w - 1, y + h_3 - 1) +
                area(x, y + 2 * h_3, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};

const classify5 = function(x, y, h, w, t0, t1, t2) {
        const h_3 = h/3|0
        const w_3 = w/3|0;

        const a = area(x + w_3, y, x + 2 * w_3 - 1, y + h - 1);

        const b = area(x, y, x + w_3 - 1, y + h - 1) +
                area(x + 2 * w_3, y, x + w - 1, y + h - 1);

        return quantize(cmp(a, b), t0, t1, t2);
};


function AcoustId(src, srcLength) {
    this.src = src;
    this.srcLength = srcLength;
    this.offset = OVERLAP;
    this.noteBufferIndex = 0;
    this.coeff = 1;
    this.row = 0;
    this.bitsIndex = 0;

    for (var i = 0; i < FRAMES; ++i) {
        BUFFER[i] = this.src[i];
    }
}

AcoustId.prototype.fill = function() {
    var offset = this.offset;

    if (offset + FRAMES - 1 >= this.srcLength) {
        return false;
    }

    var src = this.src;

    for (var j = 0; j < FRAMES; ++j) {
        BUFFER[j] = src[offset + j];
    }

    this.offset += OVERLAP;
    return true;
};

AcoustId.prototype.hammingWindow = function() {
    var tmp;
    var cos = 1;
    var sin = 0;
    for (var n = 0; n < FRAMES; ++n) {
        BUFFER[n] *= (0.54 - 0.46 * cos);
        tmp = cos - (a * cos + b * sin);
        sin = sin + (b * cos - a * sin);
        cos = tmp;
    }
};

AcoustId.prototype.chroma = function() {
    var noteBufferOffset = this.noteBufferIndex * NOTES;
    for (var i = 0; i < NOTES; ++i) {
        NOTE_BUFFER[noteBufferOffset + i] = 0;
    }

    for (var i = NOTE_FREQUENCY_START; i < NOTE_FREQUENCY_END; ++i) {
        var octave = Math.log((i * SAMPLE_RATE / FRAMES) / BASE) / Math.LN2;
        var note = (NOTES * (octave - Math.floor(octave)))|0;
        var re = BUFFER[i];
        var im = BUFFER[i + IM_OFFSET];
        var energy = re * re + im * im;
        NOTE_BUFFER[noteBufferOffset + note] += energy;
    }

    this.noteBufferIndex = (this.noteBufferIndex + 1) & 7;

    if (this.coeff >= 5) {
        var offset = (this.noteBufferIndex + 3) & 7;

        var sum = 0;
        for (var i = 0; i < NOTES; ++i) {
            TMP[i] = 0;

            for (var j = 0; j < 5; ++j) {
                var noteIndex = (((offset + j) & 7) * NOTES) + i;
                var value = NOTE_BUFFER[noteIndex] * COEFFS[j];
                TMP[i] += value;
            }

            sum += (TMP[i] * TMP[i]);
        }
        sum = Math.sqrt(sum);



        var row = this.row;
        var j = row * NOTES;
        if (sum < 0.01) {
            for (var i = 0; i < NOTES; ++i) {
                IMAGE[j++] = 0;
            }
        } else {
            for (var i = 0; i < NOTES; ++i) {
                IMAGE[j] = TMP[i] / sum;
                j++;
            }
        }

        this.row++;
    } else {
        this.coeff++;
    }
};

AcoustId.prototype.transformImage = function() {
    var rows = this.row;
    var current = 1;
    for (var i = 1; i < 12; ++i) {
        IMAGE[i] = IMAGE[i] + IMAGE[i - 1];
        current++;
    }

    var previous = 0;
    for (var i = 1; i < rows; ++i) {
        IMAGE[current] = IMAGE[current] + IMAGE[previous];
        current++;
        previous++;

        for (var j = 1; j < 12; ++j) {
            IMAGE[current] = IMAGE[current] +
                             IMAGE[current - 1] +
                             IMAGE[previous] -
                             IMAGE[previous - 1];
            current++;
            previous++;
        }
    }
};

AcoustId.prototype.getFingerprint = function() {
    var rows = this.row;
    var length = rows - 16 + 1;
    var fingerprint = new Int32Array(length);
    for (var i = 0; i < length; ++i) {
        var value = 0;
        value = (value << 2) | classify0(i, 4, 3, 15, 1.98215, 2.35817, 2.63523);
        value = (value << 2) | classify4(i, 4, 6, 15, -1.03809, -0.651211, -0.282167);
        value = (value << 2) | classify1(i, 0, 4, 16, -0.298702, 0.119262, 0.558497);
        value = (value << 2) | classify3(i, 8, 2, 12, -0.105439, 0.0153946, 0.135898);
        value = (value << 2) | classify3(i, 4, 4, 8, -0.142891, 0.0258736, 0.200632);
        value = (value << 2) | classify4(i, 0, 3, 5, -0.826319, -0.590612, -0.368214);
        value = (value << 2) | classify1(i, 2, 2, 9, -0.557409, -0.233035, 0.0534525);
        value = (value << 2) | classify2(i, 7, 3, 4, -0.0646826, 0.00620476, 0.0784847);
        value = (value << 2) | classify2(i, 6, 2, 16, -0.192387, -0.029699, 0.215855);
        value = (value << 2) | classify2(i, 1, 3, 2, -0.0397818, -0.00568076, 0.0292026);
        value = (value << 2) | classify5(i, 10, 1, 15, -0.53823, -0.369934, -0.190235);
        value = (value << 2) | classify3(i, 6, 2, 10, -0.124877, 0.0296483, 0.139239);
        value = (value << 2) | classify2(i, 1, 1, 14, -0.101475, 0.0225617, 0.231971);
        value = (value << 2) | classify3(i, 5, 6, 4, -0.0799915, -0.00729616, 0.063262);
        value = (value << 2) | classify1(i, 9, 2, 12, -0.272556, 0.019424, 0.302559);
        value = (value << 2) | classify3(i, 4, 2, 14, -0.164292, -0.0321188, 0.08463);
        fingerprint[i] = value;
    }
    return fingerprint;
};

AcoustId.prototype.compressSubFingerprint = function(x) {
    var bit = 1;
    var last_bit = 0;

    while (x !== 0) {
        if ((x & 1) !== 0) {
            BITS[this.bitsIndex++] = bit - last_bit;
            last_bit = bit;
        }
        x >>>= 1;
        bit++;
    }
    BITS[this.bitsIndex++] = 0;
};

AcoustId.prototype.writeExceptionBits = function(dst, dstIndex) {
    var bitsLength = this.bitsIndex;
    var holder = 0;
    var holderSize = 0;

    for (var i = 0; i < bitsLength; ++i) {
        var value = BITS[i];

        if (value < 7) continue;
        value = value - 7;

        holder |= (value << holderSize);
        holderSize += 5;

        while (holderSize >= 8) {
            dst[dstIndex++] = holder & 0xFF;
            holder >>>= 8;
            holderSize -= 8;
        }
    }

    while (holderSize > 0) {
        dst[dstIndex++] = holder & 0xFF;
        holder >>>= 8;
        holderSize -= 8;
    }
    holderSize = 0;

    return dstIndex;
};

AcoustId.prototype.writeNormalBits = function(dst, dstIndex) {
    var bitsLength = this.bitsIndex;
    var holder = 0;
    var holderSize = 0;

    for (var i = 0; i < bitsLength; ++i) {
        var value = Math.min(BITS[i], 7);

        holder |= (value << holderSize);
        holderSize += 3;

        while (holderSize >= 8) {
            dst[dstIndex++] = holder & 0xFF;
            holder >>>= 8;
            holderSize -= 8;
        }
    }

    while (holderSize > 0) {
        dst[dstIndex++] = holder & 0xFF;
        holder >>>= 8;
        holderSize -= 8;
    }
    holderSize = 0;

    return dstIndex;
};

AcoustId.prototype.base64Encode = function(src, length) {
    var newLength = ((length * 4 + 2) / 3)|0;
    var ret = "";
    var srcIndex = 0;

    while (length > 0) {
        ret += String.fromCharCode(BASE64[(src[srcIndex] >> 2)]);
        ret += String.fromCharCode(BASE64[((src[srcIndex] << 4) |
                                   (((--length) > 0) ? (src[srcIndex + 1] >> 4) : 0)) & 63]);

        if (length > 0) {
            ret += String.fromCharCode(BASE64[((src[srcIndex + 1] << 2) |
                                       (((--length) > 0) ? (src[srcIndex + 2] >> 6) : 0)) & 63]);
            if (length > 0) {
                ret += String.fromCharCode(BASE64[src[srcIndex + 2] & 63]);
                length--;
            }
        }

        srcIndex += 3;
    }

    if (ret.length !== newLength) throw new Error("wrong length");
    return ret;
};

AcoustId.prototype.compressed = function() {
    var fingerprint = this.getFingerprint();
    this.bitsIndex = 0;

    var prev = fingerprint[0];
    this.compressSubFingerprint(prev);
    for (var i = 1; i < fingerprint.length; ++i) {
        var cur = fingerprint[i];
        this.compressSubFingerprint(cur ^ prev);
        prev = cur;
    }

    var length = fingerprint.length;
    var ret = new Uint8Array(fingerprint.buffer);
    ret[0] = ALGORITHM & 0xFF;
    ret[1] = (length >>> 16) & 0xFF;
    ret[2] = (length >>> 8) & 0xFF;
    ret[3] = (length >>> 0) & 0xFF;

    var offset = this.writeNormalBits(ret, 4);
    offset = this.writeExceptionBits(ret, offset);

    return this.base64Encode(ret, offset);
};

AcoustId.prototype.calculate = function(raw) {
    do {
        this.hammingWindow();
        realFft(BUFFER);
        this.chroma();
    } while (this.fill());

    this.transformImage();

    if (!raw) {
        return this.compressed();
    } else {
        return this.getFingerprint();
    }
};

const getBestRecordingGroup = function(recordings) {
    recordings.reverse();
    var groups = [];

    for (var i = 0; i < recordings.length; ++i) {
        var recording = recordings[i];
        if (!recording || !recording.releasegroups) {
            continue;
        }
        var releasegroups = recording.releasegroups;
        if (!releasegroups) {
            continue;
        }
        for (var j = 0; j < releasegroups.length; ++j) {
            var releasegroup = releasegroups[j];
            if (!releasegroup) {
                continue;
            }

            if (!releasegroup.type) {
                releasegroup.type = "crap";
            }

            var secondarytypes = releasegroup.secondarytypes;
            groups.push({
                indexI: i,
                indexJ: j,
                recording: recording,
                type: releasegroup.type.toLowerCase(),
                album: releasegroups[j],
                secondarytypes: secondarytypes ? secondarytypes.map(function(v) {
                    return v.toLowerCase();
                }) : null
            });
        }
    }

    groups.sort(function(a, b) {
        if (a.type === "album" && b.type === "album") {
            var aSec = a.secondarytypes;
            var bSec = b.secondarytypes;

            if (aSec && bSec) {
                var aCompilation = aSec.indexOf("compilation") >= 0;
                var bCompilation = bSec.indexOf("compilation") >= 0;

                if (aCompilation && bCompilation) {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                } else if (aCompilation && !bCompilation) {
                    return 1;
                } else if (!aCompilation && bCompilation) {
                    return -1;
                } else {
                    var diff = a.indexI - b.indexI;
                    if (diff !== 0) return diff;
                    return a.indexJ - b.indexJ;
                }
            } else if (aSec && !bSec) {
                return 1;
            } else if (!aSec && bSec) {
                return -1;
            } else {
                var diff = a.indexI - b.indexI;
                if (diff !== 0) return diff;
                return a.indexJ - b.indexJ;
            }
        } else if (a.type === "album") {
            return -1;
        } else {
            return 1;
        }
    });

    if (!groups.length) {
        return {
            recording: recordings[0],
            album: null
        };
    }

    return groups[0];
};

const formatArtist = function (artists) {
    if (artists.length === 1) {
        return artists[0].name;
    } else {
        var ret = "";
        for (var i = 0; i < artists.length - 1; ++i) {
            ret += artists[i].name + artists[i].joinphrase;
        }
        ret += artists[i].name;
        return ret;
    }
};

const parseAcoustId = function (data) {
    if (!data) {
        throw new AcoustIdApiError("Invalid JSON response", -1);
    }

    if (data.status === "error") {
        throw new AcoustIdApiError(data.error.message, data.error.code);
    }

    var result = data.results && data.results[0] || null;

    if (!result) return null;
    if (!result.recordings || result.recordings.length === 0) return null;
    var bestRecordingGroup = getBestRecordingGroup(result.recordings);
    if (!bestRecordingGroup) return null;
    var recording = bestRecordingGroup.recording;

    var title = {
        name: recording.title,
        mbid: recording.id,
        type: "release"
    };
    var album = null;

    if (bestRecordingGroup.album) {
        album = {
            name: bestRecordingGroup.album.title,
            mbid: bestRecordingGroup.album.id,
            type: "release-group"
        };
    }

    var artist = null;
    if (recording.artists && recording.artists.length) {
        artist = {
            name: formatArtist(recording.artists),
            mbid: recording.artists[0].id,
            type: "artist"
        };
    }

    return {
        title: title,
        album: album,
        artist: artist
    };
};

AcoustId.fetch = function(args, _retries) {
    if (!_retries) _retries = 0;

    return new Promise(function(resolve, reject) {
        var duration = (+args.duration)|0;
        var fingerprint = args.fingerprint;
        var data = queryString({
            client: "djbbrJFK",
            format: "json",
            duration: duration,
            meta: "recordings+releasegroups+compress",
            fingerprint: fingerprint
        });
        var xhr = new XMLHttpRequest();
        xhr.timeout = 5000;
        var url = "https://api.acoustId.org/v2/lookup?" + data;

        function error() {
            reject(new Promise.TimeoutError("request timed out"));
        }

        xhr.addEventListener("load", function() {
            try {
              var result = JSON.parse(this.responseText);
              resolve(result);
            } catch (e) {
              reject(e);
            }
        }, false);

        xhr.addEventListener("abort", error);
        xhr.addEventListener("timeout", error);
        xhr.addEventListener("error", error);

        xhr.open("GET", url);
        xhr.send(null);
    }).then(parseAcoustId)
    .catch(AcoustIdApiError, function(e) {
        if (e.isRetryable() && _retries <= 5) {
            return AcoustId.fetch(args, _retries + 1);
        } else {
            throw e;
        }
    }).tap(function(result) {
        if (result || result === null) {
            tagDatabase.updateAcoustId(args.uid, result);
        }
    })
};

var imageFetchQueue = [];
var currentImageFetch = false;

const next = function() {
    if (imageFetchQueue.length > 0) {
        var item = imageFetchQueue.shift();
        item.resolve(actualFetchImage(item.args));
    } else {
        currentImageFetch = false;
    }
};
AcoustId.fetchImage = function(args) {
    return new Promise(function(resolve) {
        if (!currentImageFetch) {
            currentImageFetch = true;
            resolve(actualFetchImage(args));
        } else {
            imageFetchQueue.push({
                args: args,
                resolve: resolve
            });
        }
    }).finally(next);

};

const actualFetchImage = function(args) {
    var albumKey = args.albumKey;
    var uid = args.uid;
    var acoustId = args.acoustId;
    return tagDatabase.getAlbumImage(albumKey).then(function(image) {
        if (image) return image;

        if (acoustId && acoustId.album) {
            var type = acoustId.album.type;
            var mbid = acoustId.album.mbid;
            var url = "https://coverartarchive.org/" + type + "/" + mbid + "/front-250";
            var ret = {url: url};
            tagDatabase.setAlbumImage(albumKey, url);
            return ret;
        } else {
            return null;
        }
    });
};


module.exports = AcoustId;
