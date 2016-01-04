"use strict";
const Track = require("./Track");

function LocalFiles(playlist, allowMime, allowExt) {
    var i, l;
    this._mimes = Object.create(null);
    this._extensions = Object.create(null);
    for (i = 0, l = allowMime && allowMime.length || 0; i < l; ++i) {
        this._mimes[allowMime[i]] = true;
    }
    for (i = 0, l = allowExt && allowExt.length || 0; i < l; ++i) {
        this._extensions[allowExt[i]] = true;
    }
    this._playlist = playlist;
}


const rext = /\.([A-Z_a-z0-9-]+)$/;
function getExtension(name) {
    return name.match(rext);
}

LocalFiles.prototype.isMimeTypeSupported = function(mime) {
    return this._mimes[mime] === true;
};


LocalFiles.prototype.isExtensionSupported = function(extName) {
    return this._extensions[extName] === true;
};

LocalFiles.prototype.handle = function(files) {
    var tracks = [];
    for (var i = 0; i < files.length; ++i) {
        var file = files[i];

        if (file.size <= 131072 || file.size >= 1073741824) {
            continue;
        }

        var ext = getExtension(file.name);

        if (ext) {
            ext = ext[1].toLowerCase();
        } else {
            ext = "";
        }

        if (this.isExtensionSupported(ext) ||
            this.isMimeTypeSupported(file.type)) {
            tracks.push(new Track(file));
        } else if (!ext && !file.type) {
            tracks.push(new Track(file));
        }
    }

    this._playlist.add(tracks);
};

module.exports = LocalFiles;
