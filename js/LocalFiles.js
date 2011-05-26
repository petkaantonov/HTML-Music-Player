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

(function() {
    function getExtension(name) {
        try {
            return name.substr(name.lastIndexOf(".") + 1).toLowerCase();
        } catch (e) {
            return null;
        }
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
            var ext = getExtension(file.name);

            if (this.isExtensionSupported(ext) ||
                this.isMimeTypeSupported(file.type)) {
                tracks.push(new Track(file));
            } else if ((!ext || ext.length < 3 || ext.length > 4) && !file.type) {
                tracks.push(new Track(file));
            }
        }

        this._playlist.add(tracks);
    };
})();
