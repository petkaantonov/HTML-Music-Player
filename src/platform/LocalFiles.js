

import EventEmitter from "events";
import {Directory} from "platform/platform";

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

    let ext = getExtension(file.name);

    if (ext) {
        ext = ext[1];
    } else {
        ext = ``;
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
    return new Promise(resolve => reader.readEntries(resolve, () => resolve(null)));
};

LocalFiles.prototype.entryToFile = function(entry) {
    return new Promise(resolve => entry.file(resolve, () => resolve(null)));
};

LocalFiles.prototype.traverseEntries = async function(entries, ee, context) {
    for (let i = 0; i < entries.length && context.currentFileCount < context.maxFileCount; ++i) {
        const entry = entries[i];
        if (entry.isFile) {
            const file = await this.entryToFile(entry);
            if (file && context.filter(file)) {
                context.currentFileCount++;
                if (context.stack.push(file) >= MIN_FILES_BEFORE_TRIGGER) {
                    ee.emit(`files`, context.stack.slice());
                    context.stack.length = 0;
                }
            }
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let results;
            do {
                results = await this.readEntries(reader);
                await this.traverseEntries(results, ee, context);
            } while (results.length > 0 && context.currentFileCount < context.maxFileCount);
        }
    }
};

LocalFiles.prototype.traverseFilesAndDirs = async function(entries, ee, context) {
    for (let i = 0; i < entries.length && context.currentFileCount < context.maxFileCount; ++i) {
        const entry = entries[i];
        if (!(entry instanceof Directory) && entry.name && entry.size) {
            const file = entry;
            if (file && context.filter(file)) {
                context.currentFileCount++;
                if (context.stack.push(file) >= MIN_FILES_BEFORE_TRIGGER) {
                    ee.emit(`files`, context.stack.slice());
                    context.stack.length = 0;
                }
            }
        } else if (entry instanceof Directory) {
            try {
                const dir = entry;
                const results = await Promise.resolve(dir.getFilesAndDirectories());
                await this.traverseFilesAndDirs(results, ee, context);
            } catch (e) {
                // NOOP
            }
        }
    }
};

LocalFiles.prototype.fileEmitterFromFilesAndDirs = function(filesAndDirs, maxFileCount, filter) {
    const ret = new EventEmitter();
    const context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || this.defaultFilter
    };

    (async () => {
        try {
            await this.traverseFilesAndDirs(filesAndDirs, ret, context);
        } finally {
            if (context.stack.length) {
                ret.emit(`files`, context.stack.slice());
                context.stack.length = 0;
            }
            ret.emit(`end`);
        }
    })();
    return ret;
};

LocalFiles.prototype.fileEmitterFromEntries = function(entries, maxFileCount, filter) {
    const ret = new EventEmitter();
    const context = {
        stack: [],
        maxFileCount: MAX_FILE_COUNT,
        currentFileCount: 0,
        filter: filter || this.defaultFilter
    };

    (async () => {
        try {
            await this.traverseEntries(entries, ret, context);
        } finally {
            if (context.stack.length) {
                ret.emit(`files`, context.stack.slice());
                context.stack.length = 0;
            }
            ret.emit(`end`);
        }
    })();
    return ret;
};
