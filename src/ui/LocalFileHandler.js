"use strict";

import LocalFiles from "LocalFiles";
import $ from "lib/jquery";
import Track from "Track";
import Promise from "lib/bluebird";

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

    $(document).on("dragenter", this._dragEntered.bind(this));
    $(document).on("dragleave", this._dragLeft.bind(this));
    $(document).on("dragover", this._dragOvered.bind(this));
    $(document).on("drop", this._dropped.bind(this));
}

LocalFileHandler.prototype._dragEntered = function(e) {
    e.preventDefault();
    return false;
};

LocalFileHandler.prototype._dragLeft = function(e) {
    e.preventDefault();
    return false;
};

LocalFileHandler.prototype._dragOvered = function(e) {
    e.preventDefault();
    return false;
};

LocalFileHandler.prototype._dropped = function(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var dt = ev.originalEvent.dataTransfer;
    if (!dt) return;
    if (!dt.items && !dt.files) return;

    var files;
    if (dt.getFilesAndDirectories) {
        Promise.resolve(dt.getFilesAndDirectories()).bind(this).then(function(filesAndDirs) {
            var fileEmitter = this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs, 10000);
            fileEmitter.on("files", this.addFilesToPlaylist);
            fileEmitter.on("end", function() {
                fileEmitter.removeAllListeners();
            });
        });
    } else if (dt.items && dt.items.length > 0) {
        var item = dt.items[0];
        var entry = item.getAsEntry || item.webkitGetAsEntry;
        if (!entry) {
            files = Promise.resolve(dt.files);
        } else {
            var entries = [].map.call(dt.items, function(v) {
                return entry.call(v);
            });
            var fileEmitter = this.localFiles.fileEmitterFromEntries(entries, 10000);
            fileEmitter.on("files", this.addFilesToPlaylist);
            fileEmitter.on("end", function() {
                fileEmitter.removeAllListeners();
            });
        }
    } else if (dt.files && dt.files.length > 0) {
        files = Promise.resolve(dt.files);
    }

    if (!files) {
        return;
    }

    files.bind(this).then(function(files) {
        this.addFilesToPlaylist(this.filterFiles(files));
    });
};

LocalFileHandler.prototype.generateFakeFiles = function(count) {
    const id3v1String = function(value) {
        var ret = new Uint8Array(30);
        for (var i = 0; i < value.length; ++i) {
            ret[i] = value.charCodeAt(i);
        }
        return ret;
    };

    var files = new Array(+count);
    var dummy = new Uint8Array(256 * 1024);
    var sync = new Uint8Array(4);
    sync[0] = 0xFF;
    sync[1] = 0xFB;
    sync[2] = 0xB4;
    sync[3] = 0x00;
    for (var i = 0; i < dummy.length; i += 4) {
        dummy[i] = sync[0];
        dummy[i + 1] = sync[1];
        dummy[i + 2] = sync[2];
        dummy[i + 3] = sync[3];
    }
    for (var i = 0; i < files.length; ++i) {
        var tag = new Uint8Array(3);
        tag[0] = 84;
        tag[1] = 65;
        tag[2] = 71;
        var title = id3v1String("Track " + i);
        var artist = id3v1String("Artist");
        var album = id3v1String("Album");
        var year = new Uint8Array(4);
        var comment = id3v1String("Comment");
        var genre = new Uint8Array(1);

        var parts = [sync, dummy, tag, title, artist, album, year, comment, genre];


        files[i] = new File(parts, "file " + i + ".mp3", {type: "audio/mp3"});
    }
    var self = this;
    setTimeout(function() {
        self.addFilesToPlaylist(files);
    }, 100);
};

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


