"use strict";

const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/g;

const indices = ["wav", "mp3", "aac", "webm", "ogg"];
const WAV = 0
const MP3 = 1;
const AAC = 2;
const WEBM = 3;
const OGG = 4;

function refine(type, str, matchIndex) {
    if (type === "wav") { 
        var fmt = (str.charCodeAt(matchIndex + 20 + 0) & 0xFF) |
                  (str.charCodeAt(matchIndex + 20 + 1) << 8);
        switch (fmt) {
            case 0x0055: return "mp3";
            case 0x0001: return "wav";
            case 0x0003: return "wav";
            default: return "unknown";
        }

    } else {
        return type;
    }
}

exports.getCodecName = function(blob) {
    var reader = new FileReaderSync();
    var str = reader.readAsBinaryString(blob.slice(0, 8192));
    rType.lastIndex = 0;

    var match = rType.exec(str);

    if (match) {
        for (var i = 0; i < indices.length; ++i) {
            if (match[i + 1] !== undefined) {
                return refine(indices[i], str, rType.lastIndex - match[0].length);
            }
        }
    }

    return null;
};
