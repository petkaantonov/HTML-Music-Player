"use strict";
import Track from "Track";
import Promise from "bluebird";
import EventEmitter from "lib/events";

const MIN_FILES_BEFORE_TRIGGER = 10;
const MAX_FILE_COUNT = Math.pow(2, 31);

const rext = /\.([A-Z_a-z0-9-]+)$/;
const getExtension = function(name) {
    return name.match(rext);
};

export default function LocalFiles(env) {
    this.env = env;
    this.defaultFilter = this.defaultFilter.bind(this);
}

LocalFiles.prototype.defaultFilter = function(file) {
    if (file.size <= 131072 || file.size >= 1073741824) {
        return false;
    }

    var ext = getExtension(file.name);

    if (ext) {
        ext = ext[1];
    } else {
        ext = "";
    }

    if (this.env.supportsExtension(ext) ||
        this.env.supportsMime(file.type)) {
        return true;
    } else if (!ext && !file.type) {
        return true;
    }
    return false;
};

LocalFiles.prototype.readEntries = function(reader) {
    return new Promise(function(resolve, reject) {
        reader.readEntries(resolve, reject);
    }).catch(function(e) {
        return [];
    });
};


LocalFiles.prototype.entryToFile = function(entry) {
    return new Promise(function(resolve, reject) {
        entry.file(resolve, reject);
    }).catch(function(e) {
        return null;
    });
};

LocalFiles.prototype.traverseEntries = function(entries, ee, context) {
    var self = this;
    return Promise.resolve(0).then(function loop(i) {
        if (i < entries.length && context.currentFileCount < context.maxFileCount) {
            var entry = entries[i];
            if (entry.isFile) {
                return self.entryToFile(entry).then(function(file) {
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
                return self.readEntries(reader).then(function directoryLoop(results) {
                    if (results.length) {
                        return self.traverseEntries(results, ee, context).then(function() {
                            return self.readEntries(reader).then(directoryLoop);
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
LocalFiles.prototype.traverseFilesAndDirs = function(filesAndDirs, ee, context) {
    var self = this;
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
                    return self.traverseFilesAndDirs(filesAndDirs, ee, context);
                })
                .catch(function(e) {})
                .finally(function() {
                    return loop(i + 1);
                });
            }
        }
    });
};

LocalFiles.prototype.fileEmitterFromFilesAndDirs = function(filesAndDirs, maxFileCount, filter) {
    var ret = new EventEmitter();
    var context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || this.defaultFilter
    };

    this.traverseFilesAndDirs(filesAndDirs, ret, context).finally(function() {
        if (context.stack.length) {
            ret.emit("files", context.stack.slice());
            context.stack.length = 0;
        }
        ret.emit("end");
    });
    return ret;
};

LocalFiles.prototype.fileEmitterFromEntries = function(entries, maxFileCount, filter) {
    var ret = new EventEmitter();
    var context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || this.defaultFilter
    };

    this.traverseEntries(entries, ret, context).finally(function() {
        if (context.stack.length) {
            ret.emit("files", context.stack.slice());
            context.stack.length = 0;
        }
        ret.emit("end");
    });
    return ret;
};
