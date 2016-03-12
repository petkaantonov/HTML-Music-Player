"use strict";

import LocalFiles from "LocalFiles";
import $ from "lib/jquery";
import Track from "Track";

function LocalFileHandler(opts) {
    opts = Object(opts);
    this.env = opts.env;
    this.opts = opts;
    this.localFiles = new LocalFiles(this.env);
    this.playlist = opts.playlist;
    this.addFilesToPlaylist = this.addFilesToPlaylist.bind(this);

    var self = this;
    if (this.env.supportsDirectories()) {
        $(opts.directoryButton).fileInput("create", {
            onchange: this.directoryInputChanged.bind(this),
            webkitdirectory: true,
            directory: true
        });
    } else {
        $(opts.directoryButton).remove();
    }

    $(opts.fileButton).fileInput("create", {
        onchange: this.fileInputChanged.bind(this),
        multiple: true,
        accept: this.env.supportedMimes().join(",")
    });
}

LocalFileHandler.prototype.fileInputChanged = function(e) {
    var input = e.target;
    this.addFilesToPlaylist(this.filterFiles(input.files));
    $(this.opts.fileButton).fileInput("clearFiles");
};

LocalFileHandler.prototype.directoryInputChanged = function(e) {
    var input = e.target;
    if ('getFilesAndDirectories' in input) {
        Promise.resolve(input.getFilesAndDirectories()).bind(this).then(function(filesAndDirs) {
            var fileEmitter = this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs, 10000);
            fileEmitter.on("files", this.addFilesToPlaylist);
            fileEmitter.on("end", function() {
                fileEmitter.removeAllListeners();
            });
        })
    } else {
        this.addFilesToPlaylist(this.filterFiles(input.files));
    }
    $(this.opts.directoryButton).fileInput("clearFiles");
};

const toTrack = function(v) { return new Track(v); }
LocalFileHandler.prototype.addFilesToPlaylist = function(files) {
    this.playlist.add(files.map(toTrack));
};

LocalFileHandler.prototype.filterFiles = function(files) {
    var ret = new Array(files.length);
    ret.length = 0;
    for (var i = 0; i < files.length; ++i) {
        if (this.localFiles.defaultFilter(files[i])) {
            ret.push(files[i]);
        }
    }
    return ret;
};


