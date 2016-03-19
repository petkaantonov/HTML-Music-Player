"use strict";

import { Uint8Array, DataView, ArrayBuffer } from "platform/platform";
import Promise from "platform/PromiseExtensions";
import blobPatch from "platform/blobpatch";
import { readAsArrayBuffer } from "util";

blobPatch();
function isRetryable(e) {
    return e && e.name === "NotReadableError";
}

export default function FileView(file) {
    this.file = file;
    this.dataview = null;
    this.buffer = null;
    this.start = -1;
    this.end = -1;
    this._readInProgress = false;
}

FileView.prototype.toBufferOffset = function(fileOffset) {
    return fileOffset - this.start;
};

FileView.prototype.ensure = function(offset, length) {
    if (!(this.start <= offset && offset + length <= this.end)) {
        throw new Error("read out of bounds");
    }
};

FileView.prototype.getFloat64 = function(offset, le) {
    return this.dataview.getFloat64(offset - this.start, le);
};

FileView.prototype.getFloat32 = function(offset, le) {
    return this.dataview.getFloat32(offset - this.start, le);
};

FileView.prototype.getUint32 = function(offset, le) {
    return this.dataview.getUint32(offset - this.start, le);
};

FileView.prototype.getInt32 = function(offset, le) {
    return this.dataview.getInt32(offset - this.start, le);
};

FileView.prototype.getUint16 = function(offset, le) {
    return this.dataview.getUint16(offset - this.start, le);
};

FileView.prototype.getInt16 = function(offset, le) {
    return this.dataview.getInt16(offset - this.start, le);
};

FileView.prototype.getUint8 = function(offset) {
    return this.dataview.getUint8(offset - this.start);
};

FileView.prototype.getInt8 = function(offset) {
    return this.dataview.getInt8(offset - this.start);
};

FileView.prototype.block = function() {
    if (!this.buffer) throw new Error("no block available");
    return this.buffer;
};

FileView.prototype.modifyBlock = function(callback) {
    if (!this.buffer) throw new Error("no block available");
    var length = this.buffer.length;
    var result = callback(this.buffer);
    var change = result.length - length;
    var start = this.start;
    var end = this.end;

    start += change;
    end += change;

    start = Math.max(0, Math.min(this.file.size, start));
    end = Math.max(0, Math.min(this.file.size, end));
    end = Math.max(start, end);

    this.start = start;
    this.end = end;
    this.buffer = new Uint8Array(result);
    this.dataview = new DataView(result);
};

FileView.prototype._freeBuffer = function() {
    if (this.buffer) {
        ArrayBuffer.transfer(this.buffer.buffer, 0);
        this.buffer = this.dataview = null;
    }
};

FileView.prototype.readBlockOfSizeAt = function(size, startOffset, paddingFactor) {
    if (this._readInProgress) {
        return Promise.reject(new Error("invalid parallel read"));
    }
    this._readInProgress = true;
    var self = this;
    size = Math.ceil(size);
    startOffset = Math.ceil(startOffset);
    return new Promise(function(resolve) {
        if (!paddingFactor || paddingFactor <= 1 || paddingFactor === undefined) paddingFactor = 1;
        var maxSize = self.file.size;
        var start = Math.min(maxSize - 1, Math.max(0, startOffset));
        var end = Math.min(maxSize, start + size);

        if (self.buffer &&
            (self.start <= start && end <= self.end)) {
            return resolve();
        }

        end = Math.min(maxSize, start + size * paddingFactor);
        self.start = start;
        self.end = end;
        self._freeBuffer();

        resolve((function loop(retries) {
            var blob = self.file.slice(self.start, self.end);
            return readAsArrayBuffer(blob).finally(function() {
                blob.close();
            }).then(function(result) {
                self._freeBuffer();
                self.buffer = new Uint8Array(result);
                self.dataview = new DataView(result);
            }).catch(function(e) {
                if (isRetryable(e) && retries < 5) {
                    return Promise.delay(500).then(function() {
                        return loop(retries + 1);
                    });
                }
                self.start = self.end = -1;
                self._freeBuffer();
                throw e;
            });
        })(0));
    }).finally(function() {
        self._readInProgress = false;
    });
};
