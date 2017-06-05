"use strict";

import { File, Uint8Array, DataView, ArrayBuffer } from "platform/platform";
import LocalFiles from "platform/LocalFiles";
import Track from "tracks/Track";

const MAX_FILE_COUNT = 75000;

export default function LocalFileHandler(opts, deps) {
    opts = Object(opts);
    this.page = deps.page;
    this.env = deps.env;
    this.fileInputContext = deps.fileInputContext;
    this.playlist = deps.playlist;
    this.localFiles = new LocalFiles(this.env);

    this.gotFiles = this.gotFiles.bind(this);
    this.gotEntries = this.gotEntries.bind(this);
    this.addFilesToPlaylist = this.addFilesToPlaylist.bind(this);
    this.gotFilesAndDirectories = this.gotFilesAndDirectories.bind(this);

    this.directoryFileInput = null;
    if (this.env.supportsDirectories()) {
        this.directoryFileInput = this.fileInputContext.createFileInput(this.page.$(opts.directoryButton), {
            onchange: this.directoryInputChanged.bind(this),
            webkitdirectory: true,
            directory: true
        });
    } else {
        this.page.$(opts.directoryButton).remove();
    }

    this.filesFileInput = this.fileInputContext.createFileInput(this.page.$(opts.fileButton), {
        onchange: this.fileInputChanged.bind(this),
        multiple: true,
        accept: this.env.supportedMimes().join(",")
    });

    this.page.addDocumentListener("dragenter", this._dragEntered.bind(this));
    this.page.addDocumentListener("dragleave", this._dragLeft.bind(this));
    this.page.addDocumentListener("dragover", this._dragOvered.bind(this));
    this.page.addDocumentListener("drop", this._dropped.bind(this));
    deps.ensure();
}

LocalFileHandler.prototype.receiveFiles = function(fileEmitter) {
    fileEmitter.on("files", this.addFilesToPlaylist);
    fileEmitter.on("end", function() {
        fileEmitter.removeAllListeners();
    });
};

LocalFileHandler.prototype.gotFiles = function(files) {
    this.addFilesToPlaylist(this.filterFiles(files));
};

LocalFileHandler.prototype.gotEntries = function(entries) {
    this.receiveFiles(this.localFiles.fileEmitterFromEntries(entries, MAX_FILE_COUNT));
};

LocalFileHandler.prototype.gotFilesAndDirectories = function(filesAndDirs) {
    this.receiveFiles(this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs, MAX_FILE_COUNT));
};

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

LocalFileHandler.prototype._dropped = function(e) {
    e.preventDefault();
    e.stopPropagation();
    var dt = e.dataTransfer;
    if (!dt) return;
    if (!dt.items && !dt.files) return;

    var files;
    if (typeof dt.getFilesAndDirectories === "function") {
        dt.getFilesAndDirectories().then(this.gotFilesAndDirectories);
    } else if (dt.items && dt.items.length > 0) {
        var item = dt.items[0];
        var entry = item.getAsEntry || item.webkitGetAsEntry;
        if (!entry) {
            files = Promise.resolve(dt.files);
        } else {
            var entries = [].map.call(dt.items, function(v) {
                return entry.call(v);
            });
            this.gotEntries(entries);
        }
    } else if (dt.files && dt.files.length > 0) {
        files = Promise.resolve(dt.files);
    }

    if (!files) {
        return;
    }
    files.then(this.gotFiles);
};

LocalFileHandler.prototype.generateSilentWavFile = function() {
    const seconds = 10;
    const sampleRate = 8000;
    const samples = sampleRate * seconds;
    const format = 1;
    const bytesPerSample = 2;
    const channels = 1;
    const buffer = new ArrayBuffer(44 + samples * bytesPerSample);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + samples * bytesPerSample, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, samples * channels * bytesPerSample, true);
    return new File([buffer], "thefile.wav", {type: "audio/wav"});
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
    files.unshift(this.generateSilentWavFile());
    this.page.setTimeout(function() {
        self.addFilesToPlaylist(files);
    }, 100);
};

LocalFileHandler.prototype.fileInputChanged = function(e) {
    this.gotFiles(e.target.files);
    this.filesFileInput.resetFiles();
};

LocalFileHandler.prototype.directoryInputChanged = function(e) {
    var input = e.target;
    if (typeof input.getFilesAndDirectories === "function") {
        input.getFilesAndDirectories().then(this.gotFilesAndDirectories);
    } else {
        this.gotFiles(input.files);
    }
    this.directoryFileInput.resetFiles();
};

const toTrack = function(v) { return new Track(v); };
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


