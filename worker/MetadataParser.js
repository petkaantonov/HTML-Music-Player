"use strict";

const Promise = require("../lib/bluebird");
const sniffer = require("./sniffer");
const FileView = require("./FileView");
const parseMp3Metadata = require("./metadata/mp3");

const maxActive = 8;
const queue = [];
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
        var parser = new MetadataParser(item.file, item.resolve);
        active++;
        parser.parse();
    }
};

function MetadataParser(file, resolve) {
    this.file = file;
    this.resolve = resolve;
    this.fileView = new FileView(file);
}

MetadataParser.prototype.parse = function() {
    var self = this;
    var data = {
        basicInfo: {
            duration: NaN,
            sampleRate: 44100,
            channels: 2
        }
    };
    var done = sniffer.getCodecName(this.fileView).then(function(codecName) {
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
    }).catch(function(e) {
        debugger;
        throw codecNotSupportedError();
    });

    this.resolve(done);
};

MetadataParser.parse = function(args) {
    return new Promise(function(resolve) {
        if (active >= maxActive) {
            queue.push({
                file: args.file,
                resolve: resolve
            });
        } else {
            var parser = new MetadataParser(args.file, resolve);
            active++;
            parser.parse()
        }
    }).finally(next);
};

module.exports = MetadataParser;
