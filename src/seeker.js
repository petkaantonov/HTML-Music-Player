"use strict";
import Promise from "lib/bluebird";
const FileView = require("lib/FileView");
const Mp3SeekTable = require("audio/demuxer").Mp3SeekTable;

const seekMp3 = Promise.method(function(time, metadata, context, fileView) {
    var promise = Promise.resolve();
    time = Math.min(metadata.duration, Math.max(0, time));
    var frames = ((metadata.duration * metadata.sampleRate) / metadata.samplesPerFrame)|0;
    var frame = (time / metadata.duration * frames) | 0;
    var currentTime = frame * (metadata.samplesPerFrame / metadata.sampleRate);
    // Target an earlier frame to build up the bit reservoir for the actual frame.
    var targetFrame = Math.max(0, frame - 9);
    // The frames are only decoded to build up the bit reservoir and should not be actually played back.
    var samplesToSkip = (frame - targetFrame) * metadata.samplesPerFrame;

    var offset;

    if (!metadata.vbr) {
        offset = (metadata.dataStart + targetFrame * metadata.averageFrameSize)|0;
    } else if (metadata.toc) {
        // Xing seek tables.
        frame = ((Math.round(frame / frames * 100) / 100) * frames)|0;
        currentTime = (frame + 1) * (metadata.samplesPerFrame / metadata.sampleRate);
        samplesToSkip = metadata.samplesPerFrame;
        targetFrame = frame;
        var tocIndex = Math.min(99, Math.round(frame / frames * 100)|0);
        var offsetPercentage = metadata.toc[tocIndex] / 256;
        offset = (metadata.dataStart + (offsetPercentage * (metadata.dataEnd - metadata.dataStart)))|0;
    } else {
        var table = metadata.seekTable;
        if (!table) {
            table = metadata.seekTable = new Mp3SeekTable();
        }
        promise = table.fillUntil(time + (metadata.samplesPerFrame / metadata.sampleRate), metadata, fileView).then(function() {
            // Trust that the seek offset given by VBRI metadata will not be to a frame that has bit
            // reservoir. VBR should have little need for bit reservoir anyway.
            if (table.isFromMetaData) {
                frame = table.closestFrameOf(frame);
                currentTime = (frame + 1) * (metadata.samplesPerFrame / metadata.sampleRate);
                samplesToSkip = metadata.samplesPerFrame;
                offset = table.offsetOfFrame(frame);
                targetFrame = frame;
            } else {
                offset = table.offsetOfFrame(targetFrame);
            }
        });
    }

    return promise.then(function() {
        if (targetFrame === 0) {
            samplesToSkip = metadata.encoderDelay;
        }

        return {
            time: currentTime,
            offset: Math.max(metadata.dataStart, Math.min(offset, metadata.dataEnd)),
            samplesToSkip: samplesToSkip,
            frame: targetFrame
        };
    });
});

function seek(type, time, metadata, context, fileView) {
    if (type === "mp3") {
        return seekMp3(time, metadata, context, fileView);
    }
    throw new Error("unsupported type");
}

module.exports = Promise.method(seek);
