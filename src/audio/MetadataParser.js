"use strict";

import Promise from "platform/PromiseExtensions";
import getCodecName from "audio/sniffer";
import FileView from "platform/FileView";
import parseMp3Metadata from "metadata/mp3_metadata";
import TrackSearchIndex from "search/TrackSearchIndex";

const maxActive = 8;
const queue = [];
var active = 0;

const codecNotSupportedError = function() {
    var e = new Error("codec not supported");
    e.name = "CodecNotSupportedError";
    return e;
};

const next = function() {
    active--;
    if (queue.length > 0) {
        var item = queue.shift();
        var parser = new MetadataParser(item.file, item.resolve, item.transientId);
        active++;
        parser.parse();
    }
};

export default function MetadataParser(file, resolve, transientId) {
    this.file = file;
    this.resolve = resolve;
    this.transientId = transientId;
    this.fileView = new FileView(file);
}

MetadataParser.prototype.parse = function() {
    var self = this;
    var file = self.file;
    var data = {
        basicInfo: {
            duration: NaN,
            sampleRate: 44100,
            channels: 2
        }
    };
    var done = getCodecName(this.fileView).then(function(codecName) {
        if (!codecName) {
            throw codecNotSupportedError();
        }

        switch(codecName) {
            case "wav":
            case "webm":
            case "aac":
            case "ogg":
                throw codecNotSupportedError();
            case "mp3":
                return parseMp3Metadata(data, self.fileView);
        }
    }).catch(function() {
        throw codecNotSupportedError();
    }).then(function() {
        MetadataParser.searchIndex.add(file, data, self.transientId);
        return data;
    });

    this.resolve(done);
};

MetadataParser.searchIndex = new TrackSearchIndex();

MetadataParser.parse = function(args) {
    return new Promise(function(resolve) {
        if (active >= maxActive) {
            queue.push({
                file: args.file,
                transientId: args.transientId,
                resolve: resolve
            });
        } else {
            var parser = new MetadataParser(args.file, resolve, args.transientId);
            active++;
            parser.parse();
        }
    }).finally(next);
};

MetadataParser.fetchAnalysisData = function(db, args) {
    var data = db.query(args.uid);
    var albumImage = db.getAlbumImage(args.albumKey);

    return Promise.join(data, albumImage, function(data, albumImage) {
        if (data && albumImage) {
            data.albumImage = albumImage;
        }
        return data;
    });
};
