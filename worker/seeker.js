"use strict";
const FileView = require("./FileView");
const Mp3SeekTable = require("./demuxer").Mp3SeekTable;

function seekMp3(time, metadata, context, fileView) {
    time = Math.min(metadata.duration, Math.max(0, time));
    var frames = ((metadata.duration * metadata.sampleRate) / metadata.samplesPerFrame)|0;
    var frame = (time / metadata.duration * frames) | 0;
    var currentTime = frame * (metadata.samplesPerFrame / metadata.sampleRate);
    // Target an earlier frame to build up the bit reservoir for the actual frame.
    var targetFrame = Math.max(0, frame - 9);
    // The frames are only decoded to build up the bit reservoir and should not be actually played back.
    var framesToSkip = frame - targetFrame;

    var offset;

    if (!metadata.vbr) {
        offset = (metadata.dataStart + targetFrame * metadata.averageFrameSize)|0;
    } else if (metadata.toc) {
        // Xing seek tables.
        frame = ((Math.round(frame / frames * 100) / 100) * frames)|0;
        currentTime = frame * (metadata.samplesPerFrame / metadata.sampleRate);
        framesToSkip = 0;
        var tocIndex = Math.min(99, Math.round(frame / frames * 100)|0);
        var offsetPercentage = metadata.toc[tocIndex] / 256;
        offset = (metadata.dataStart + (offsetPercentage * (metadata.dataEnd - metadata.dataStart)))|0;
    } else {
        var table = metadata.seekTable;
        if (!table) {
            table = metadata.seekTable = new Mp3SeekTable();
        }
        table.fillUntil(time + (metadata.samplesPerFrame / metadata.sampleRate),
                metadata, fileView);

        // Trust that the seek offset given by VBRI metadata will not be to a frame that has bit
        // reservoir. VBR should have little need for bit reservoir anyway.
        if (table.isFromMetaData) {
            frame = table.closestFrameOf(frame);
            currentTime = frame * (metadata.samplesPerFrame / metadata.sampleRate);
            framesToSkip = 0;
            offset = table.offsetOfFrame(frame);
        } else {
            offset = table.offsetOfFrame(targetFrame);
        }
    }

    return {
        time: currentTime,
        offset: Math.max(metadata.dataStart, Math.min(offset, metadata.dataEnd)),
        framesToSkip: framesToSkip
    };
}

function seek(type, time, metadata, context, fileView) {
    if (type === "mp3") {
        return seekMp3(time, metadata, context, fileView);
    }
    throw new Error("unsupported type");
}

module.exports = seek;
