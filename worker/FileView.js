"use strict";

const Promise = require("../lib/bluebird");
const util = require("../js/util");

function FileView(file) {
    this.file = file;
    this.dataview = null;
    this.buffer = null;
    this.start = -1;
    this.end = -1;
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

FileView.prototype.readBlockOfSizeAt = function(size, startOffset, paddingFactor) {
    var self = this;
    size = Math.ceil(size);
    startOffset = Math.ceil(startOffset);
    return new Promise(function(resolve, reject) {
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
        self.buffer = null;
        self.dataview = null;

        resolve(util.readAsArrayBuffer(self.file.slice(self.start, self.end)).then(function(result) {
            self.buffer = new Uint8Array(result);
            self.dataview = new DataView(result);
        }).catch(function(e) {
            self.start = self.end = -1;
            self.buffer = null;
            self.dataview = null;
            throw e;
        }));
    });
};


module.exports = FileView;
