"use strict";

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
        const max = this.file.size;
        if (offset + length > max) {
            throw new Error("EOF");
        }
        this.start = Math.max(Math.min(max - 1, offset), 0);
        var end = (offset + length + 65536)
        this.end = Math.max(Math.min(max, end), 0);
        var reader = new FileReaderSync();
        var result = reader.readAsArrayBuffer(
                this.file.slice(this.start, this.end));
        this.dataview = new DataView(result);
    }
};

FileView.prototype.getFloat64 = function(offset, le) {
    this.ensure(offset, 8);
    return this.dataview.getFloat64(offset - this.start, le);
};

FileView.prototype.getFloat32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getFloat32(offset - this.start, le);
};

FileView.prototype.getUint32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getUint32(offset - this.start, le);
};

FileView.prototype.getInt32 = function(offset, le) {
    this.ensure(offset, 4);
    return this.dataview.getInt32(offset - this.start, le);
};

FileView.prototype.getUint16 = function(offset, le) {
    this.ensure(offset, 2);
    return this.dataview.getUint16(offset - this.start, le);
};

FileView.prototype.getInt16 = function(offset, le) {
    this.ensure(offset, 2);
    return this.dataview.getInt16(offset - this.start, le);
};

FileView.prototype.getUint8 = function(offset) {
    this.ensure(offset, 1);
    return this.dataview.getUint8(offset - this.start);
};

FileView.prototype.getInt8 = function(offset) {
    this.ensure(offset, 1);
    return this.dataview.getInt8(offset - this.start);
};

FileView.prototype.bufferOfSizeAt = function(size, start) {
    var start = Math.min(this.file.size - 1, Math.max(0, start));
    var end = Math.min(this.file.size, start + size);

    if (this.buffer && 
        (this.start <= start && end <= this.end)) {
        return this.buffer;
    }

    end = Math.min(this.file.size, start + size * 10);
    this.start = start;
    this.end = end;
    var reader = new FileReaderSync();
    var result = reader.readAsArrayBuffer(
            this.file.slice(this.start, this.end));
    this.buffer = new Uint8Array(result);
    return this.buffer;
};


module.exports = FileView;
