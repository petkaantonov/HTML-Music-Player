"use strict";
const Track = require("./Track");
const Promise = require("../lib/bluebird");
const EventEmitter = require("events");

var mimes, extensions;

var LocalFiles = {};

const MIN_FILES_BEFORE_TRIGGER = 10;
const MAX_FILE_COUNT = Math.pow(2, 31);

const rext = /\.([A-Z_a-z0-9-]+)$/;
const getExtension = function(name) {
    return name.match(rext);
};

const isMimeTypeSupported = function(mime) {
    return mimes[mime] === true;
};


const isExtensionSupported = function(extName) {
    return extensions[extName] === true;
};

const defaultFilter = function(file) {
    if (file.size <= 131072 || file.size >= 1073741824) {
        return false;
    }

    var ext = getExtension(file.name);

    if (ext) {
        ext = ext[1].toLowerCase();
    } else {
        ext = "";
    }

    if (isExtensionSupported(ext) ||
        isMimeTypeSupported(file.type)) {
        return true;
    } else if (!ext && !file.type) {
        return true;
    }
    return false;
};
LocalFiles.defaultFilter = defaultFilter;

const readEntries = function(reader) {
    return new Promise(function(resolve, reject) {
        reader.readEntries(resolve, reject);
    }).catch(function(e) {
        return [];
    });
};

const entryToFile = function(entry) {
    return new Promise(function(resolve, reject) {
        entry.file(resolve, reject);
    }).catch(function(e) {
        return null;
    });
};

const traverseEntries = function(entries, ee, context) {
    return Promise.resolve(0).then(function loop(i) {
        if (i < entries.length && context.currentFileCount < context.maxFileCount) {
            var entry = entries[i];
            if (entry.isFile) {
                return entryToFile(entry).then(function(file) {
                    if (file && context.filter(file)) {
                        context.currentFileCount++;
                        if (context.stack.push(file) >= MIN_FILES_BEFORE_TRIGGER) {
                            ee.emit("files", context.stack.slice());
                            context.stack.length = 0;
                        }
                    }
                    return loop(i + 1);
                });
            } else if (entry.isDirectory) {
                var reader = entry.createReader();
                return readEntries(reader).then(function directoryLoop(results) {
                    if (results.length) {
                        return traverseEntries(results, ee, context).then(function() {
                            return readEntries(reader).then(directoryLoop);
                        });
                    } else {
                        return loop(i + 1);
                    }
                });
            } else {
                return loop(i + 1);
            }
        }
    });
};

const Directory = window.Directory || function() {};
Promise.longStackTraces();
const traverseFilesAndDirs = function(filesAndDirs, ee, context) {
    return Promise.resolve(0).then(function loop(i) {
        if (i < filesAndDirs.length && context.currentFileCount < context.maxFileCount) {
            var file = filesAndDirs[i];
            if (!(file instanceof Directory) && file.name && file.size) {
                if (file && context.filter(file)) {
                    context.currentFileCount++;
                    if (context.stack.push(file) >= MIN_FILES_BEFORE_TRIGGER) {
                        ee.emit("files", context.stack.slice());
                        context.stack.length = 0;
                    }
                }
                return loop(i + 1);
            } else if (file instanceof Directory) {
                return Promise.resolve(file.getFilesAndDirectories()).then(function(filesAndDirs) {
                    return traverseFilesAndDirs(filesAndDirs, ee, context);
                })
                .catch(function(e) {})
                .finally(function() {
                    return loop(i + 1);
                });
            }
        }
    });
};

LocalFiles.fileEmitterFromFilesAndDirs = function(filesAndDirs, maxFileCount, filter) {
    var ret = new EventEmitter();
    var context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || defaultFilter
    };
    traverseFilesAndDirs(filesAndDirs, ret, context).finally(function() {
        if (context.stack.length) {
            ret.emit("files", context.stack.slice());
            context.stack.length = 0;
        }
        ret.emit("end");
    });
    return ret;
};

LocalFiles.fileEmitterFromEntries = function(entries, maxFileCount, filter) {
    var ret = new EventEmitter();
    var context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || defaultFilter
    };
    traverseEntries(entries, ret, context).finally(function() {
        if (context.stack.length) {
            ret.emit("files", context.stack.slice());
            context.stack.length = 0;
        }
        ret.emit("end");
    });
    return ret;
};

LocalFiles.setup = function(allowMime, allowExt) {
    var i, l;
    mimes = Object.create(null);
    extensions = Object.create(null);
    for (i = 0, l = allowMime && allowMime.length || 0; i < l; ++i) {
        mimes[allowMime[i]] = true;
    }
    for (i = 0, l = allowExt && allowExt.length || 0; i < l; ++i) {
        extensions[allowExt[i]] = true;
    }
};


module.exports = LocalFiles;
