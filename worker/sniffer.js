"use strict";

const rType =
    /(?:(RIFF....WAVE)|(ID3|\xFF[\xF0-\xFF][\x02-\xEF][\x00-\xFF])|(\xFF\xF1|\xFF\xF9)|(\x1A\x45\xDF\xA3)|(OggS))/;

var indices = ["wav", "mp3", "aac", "webm", "ogg"];
const WAV = 0
const MP3 = 1;
const AAC = 2;
const WEBM = 3;
const OGG = 4;

exports.getCodecName = function(blob) {
    var reader = new FileReaderSync();
    var str = reader.readAsBinaryString(blob.slice(0, 10));

    var match = rType.exec(str);

    if (match) {
        for (var i = 0; i < indices.length; ++i) {
            if (match[i + 1] !== undefined) {
                return indices[i];
            }
        }
    }
    return null;
};
