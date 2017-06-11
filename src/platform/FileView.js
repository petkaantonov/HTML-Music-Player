

import {Uint8Array, DataView} from "platform/platform";
import {delay} from "platform/PromiseExtensions";
import {readAsArrayBuffer} from "util";

function isRetryable(e) {
    return e && e.name === `NotReadableError`;
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
        throw new Error(`read out of bounds`);
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
    if (!this.buffer) throw new Error(`no block available`);
    return this.buffer;
};

FileView.prototype.blockAtOffset = function(offset) {
    if (!this.buffer) throw new Error(`no block available`);
    return new Uint8Array(this.buffer.buffer, offset);
};

FileView.prototype.modifyBlock = function(callback) {
    if (!this.buffer) throw new Error(`no block available`);
    const {length} = this.buffer;
    const result = callback(this.buffer);
    const change = result.length - length;
    let {start, end} = this;

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
        this.buffer = this.dataview = null;
    }
};

FileView.prototype.readBlockOfSizeAt = async function(size, startOffset, paddingFactor) {
    if (this._readInProgress) {
        throw new Error(`invalid parallel read`);
    }
    try {
        this._readInProgress = true;
        size = Math.ceil(size);
        startOffset = Math.ceil(startOffset);
        if (!paddingFactor || paddingFactor <= 1 || paddingFactor === undefined) {
            paddingFactor = 1;
        }
        const maxSize = this.file.size;
        const start = Math.min(maxSize - 1, Math.max(0, startOffset));
        let end = Math.min(maxSize, start + size);

        if (this.buffer && this.start <= start && end <= this.end) {
            return;
        }

        end = Math.min(maxSize, start + size * paddingFactor);
        this.start = start;
        this.end = end;
        this._freeBuffer();

        let retries = 0;
        while (retries < 5) {
            try {
                const blob = this.file.slice(this.start, this.end);
                let result;
                try {
                    result = await readAsArrayBuffer(blob);
                } finally {
                    blob.close();
                }
                this._freeBuffer();
                this.buffer = new Uint8Array(result);
                this.dataview = new DataView(result);
                break;
            } catch (e) {
                if (!isRetryable(e)) {
                    this.start = this.end = -1;
                    this._freeBuffer();
                    throw e;
                }
                await delay(500);
                retries++;
            }
        }
    } finally {
        this._readInProgress = false;
    }
};
