import { HttpError, HttpErrorJson } from "shared/errors";
import { fileExtensionToMime } from "shared/types/files";
import { PromiseReject, PromiseResolve } from "shared/types/helpers";
import { delay, slugTitle } from "shared/util";

export class SlicedStreamedFile {
    private _sf: HttpStreamedFile;
    private _start: number;
    private _end: number;

    constructor(sf: HttpStreamedFile, start: number, end: number) {
        this._sf = sf;
        this._start = start;
        this._end = end;
    }

    get size() {
        return this._end - this._start;
    }

    async readAsArrayBuffer(): Promise<ArrayBuffer> {
        return this._sf.toSlice(this._start, this._end);
    }
}

interface Json {
    title: string;
    extension: string;
    expectedSize: number;
    url: string;
}

export default class HttpStreamedFile {
    private _data: Uint8Array | null;
    private _url: string;
    private _resultPromise: Promise<File> | null;
    private _resultPromiseResolve: PromiseResolve<File> | null;
    private _resultPromiseReject: PromiseReject | null;
    private _expectedSize: number;
    private _pointer: number = 0;
    private _fileName: string;
    private _inited: boolean = false;
    private _json: Json;
    private _error: any = null;

    readonly type: string;

    constructor({ title, extension, expectedSize, url }: Json) {
        this.type = fileExtensionToMime.get(extension) || "application/octet-stream";
        this._fileName = `${slugTitle(title)}.${extension}`;
        this._expectedSize = expectedSize;
        this._url = url;
        this._data = null;
        this._resultPromiseResolve = null;
        this._resultPromiseReject = null;
        this._resultPromise = null;
        this._json = { title, extension, expectedSize, url };
    }

    get size() {
        return this._expectedSize;
    }

    get name() {
        return this._fileName;
    }

    toJSON(): Json {
        return { ...this._json, expectedSize: this._expectedSize };
    }

    toFile(): Promise<File> {
        return this._init();
    }

    async toSlice(start: number, end: number): Promise<ArrayBuffer> {
        void this._init();
        while (start >= this._pointer || end > this._pointer) {
            if (this._error) {
                throw this._error;
            }
            await delay(50);
        }
        const size = end - start;
        const ret = new Uint8Array(size);
        ret.set(this._data!.subarray(start, end));
        return ret.buffer;
    }

    private async _init(): Promise<File> {
        if (this._inited) {
            return this._resultPromise!;
        }
        this._inited = true;
        this._resultPromise = new Promise<File>((r, rj) => {
            this._resultPromiseResolve = r;
            this._resultPromiseReject = rj;
        });
        this._data = new Uint8Array(this._expectedSize);
        const response = await fetch(this._url);
        if (response.status !== 200) {
            const json = (await response.json()) as HttpErrorJson;
            const err = new HttpError(json);
            this._error = err;
            this._resultPromiseReject!(err);
            return this._resultPromise!;
        }
        const reader = response.body!.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                const { done, value } = await reader.read();

                if (done) {
                    const realSize = this._pointer;
                    this._expectedSize = realSize;
                    const data = new Uint8Array(this._data.buffer, 0, realSize);
                    const file = new File([data], this._fileName, { lastModified: Date.now() });
                    this._data = data;
                    this._resultPromiseResolve!(file);
                    break;
                } else {
                    const bytesRead = value!.length;
                    if (bytesRead + this._pointer > this._expectedSize) {
                        this._expectedSize = bytesRead * 10 + this._pointer;
                        const newData = new Uint8Array(this._expectedSize);
                        newData.set(this._data);
                        this._data = newData;
                    }
                    this._data.set(value!, this._pointer);
                    this._pointer += bytesRead;
                }
            } catch (e) {
                try {
                    await reader.cancel();
                    // eslint-disable-next-line no-empty
                } catch {}
                this._error = e;
                this._resultPromiseReject!(e);

                break;
            }
        }
        return this._resultPromise!;
    }

    slice(start: number, end?: number): SlicedStreamedFile {
        const max = this._expectedSize;
        if (end === undefined) {
            end = max;
        }
        while (start < 0) {
            start = max + start;
        }
        while (end < 0) {
            end = max + end;
        }

        if (start >= end) {
            throw new Error("invalid start index");
        }

        if (end - start > max) {
            throw new Error("too big slice");
        }

        return new SlicedStreamedFile(this, start, end);
    }
}
