import { readAsArrayBuffer } from "shared/util";
import { CancellationToken } from "shared/utils/CancellationToken";

function isRetryable(e: Error) {
    return e && e.name === `NotReadableError`;
}

export default class FileView {
    file: File;
    dataview: DataView | null;
    buffer: Uint8Array | null;
    start: number;
    end: number;
    _readInProgress: boolean;
    constructor(file: File) {
        this.file = file;
        this.dataview = null;
        this.buffer = null;
        this.start = -1;
        this.end = -1;
        this._readInProgress = false;
    }

    toBufferOffset(fileOffset: number) {
        return fileOffset - this.start;
    }

    ensure(offset: number, length: number) {
        if (!(this.start <= offset && offset + length <= this.end)) {
            throw new Error(`read out of bounds`);
        }
    }

    getFloat64(offset: number, le?: boolean) {
        return this.dataview!.getFloat64(offset - this.start, le);
    }

    getFloat32(offset: number, le?: boolean) {
        return this.dataview!.getFloat32(offset - this.start, le);
    }

    getUint32(offset: number, le?: boolean) {
        return this.dataview!.getUint32(offset - this.start, le);
    }

    getInt32(offset: number, le?: boolean) {
        return this.dataview!.getInt32(offset - this.start, le);
    }

    getUint16(offset: number, le?: boolean) {
        return this.dataview!.getUint16(offset - this.start, le);
    }

    getInt16(offset: number, le?: boolean) {
        return this.dataview!.getInt16(offset - this.start, le);
    }

    getUint8(offset: number) {
        return this.dataview!.getUint8(offset - this.start);
    }

    getInt8(offset: number) {
        return this.dataview!.getInt8(offset - this.start);
    }

    block() {
        if (!this.buffer) throw new Error(`no block available`);
        return this.buffer;
    }

    blockAtOffset(offset: number) {
        if (!this.buffer) throw new Error(`no block available`);
        return new Uint8Array(this.buffer.buffer, offset);
    }

    modifyBlock(callback: (b: Uint8Array) => Uint8Array) {
        if (!this.buffer) throw new Error(`no block available`);
        const { length } = this.buffer;
        const result = callback(this.buffer);
        const change = result.length - length;
        let { start, end } = this;

        start += change;
        end += change;

        start = Math.max(0, Math.min(this.file.size, start));
        end = Math.max(0, Math.min(this.file.size, end));
        end = Math.max(start, end);

        this.start = start;
        this.end = end;
        this.buffer = new Uint8Array(result);
        this.dataview = new DataView(result);
    }

    _freeBuffer() {
        if (this.buffer) {
            this.buffer = this.dataview = null;
        }
    }

    async readBlockOfSizeAt<T extends object | (() => number)>(
        size: number,
        startOffset: number,
        _cancellationToken?: CancellationToken<T>,
        paddingFactor = 1
    ) {
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
                    const result = await readAsArrayBuffer(blob);
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
                    retries++;
                }
            }
        } finally {
            this._readInProgress = false;
        }
    }
}
