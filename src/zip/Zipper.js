import {moduleEvents} from "wasm/WebAssemblyWrapper";
import {createFs, fs, handles} from "wasm/fs";
import {File} from "platform/platform";
import EventEmitter from "events";

export const FILE_EXTRACTED_EVENT = `fileExtracted`;
export const FILE_EXTRACTION_PROGRESSED_EVENT = `fileExtractionProgressed`;
export const WILL_EXTRACT_FILE_EVENT = `willExtractFile`;
export const ARCHIVING_WILL_START_EVENT = `archivingWillStart`;
export const ARCHIVING_BUFFER_FULL_EVENT = `archivingBufferFull`;
export const ARCHIVING_PROGRESS_EVENT = `archivingProgressEvent`;

function delay(ms) {
    return new Promise(resolve => self.setTimeout(resolve, ms));
}

const CALLBACK_MODE_NONE = 0;
const CALLBACK_MODE_EXTRACT = 1;
const CALLBACK_MODE_ARCHIVE = 2;

const zippersToJsInstances = new Map();
const out = {preventExtraction: false, waitUntil: null};

export default class Zipper extends EventEmitter {
    constructor(wasm) {
        super();
        this._wasm = wasm;
        this._ptr = this.init_zipper();
        if (!this._ptr) {
            throw new Error(`out of memory`);
        }
        this._currentFileInfo = null;
        this._callbackMode = CALLBACK_MODE_NONE;
        this._wasmDataWritten = 0;
        this._filesArchived = 0;
        zippersToJsInstances.set(this._ptr, this);
    }

    _getWasmData() {
        const [err, wasmDataPtr, wasmDataLength] = this.zipper_get_data(this._ptr);
        this._checkError(err);
        return {wasmDataPtr, wasmDataLength};
    }

    _checkError(err) {
        if (err) {
            const errorStringPtr = this.zipper_error_string(this._ptr, err);
            const errorString = this._wasm.convertCharPToAsciiString(errorStringPtr);
            throw new Error(`Zipper error: ${errorString}`);
        }
    }

    _writeCallback(fileOffset, bufferPtr, bufferLength, wasmDataPtr, wasmDataLength) {
        if (this._callbackMode === CALLBACK_MODE_EXTRACT) {
            if (this._currentFileInfo.finished) {
                return bufferLength;
            }
            this._wasm.memcpy(wasmDataPtr + fileOffset, bufferPtr, bufferLength);
            if (fileOffset + bufferLength === this._currentFileInfo.size) {
                this._currentFileInfo.finished = true;
                const buffer = this._wasm.u8view(wasmDataPtr, this._currentFileInfo.size);
                this.emit(FILE_EXTRACTED_EVENT, this._currentFileInfo, buffer, out);
                this._currentFileInfo.waitUntil = out.waitUntil;
                return bufferLength;
            }
            this._currentFileInfo.written += bufferLength;
            out.preventExtraction = false;
            this.emit(FILE_EXTRACTION_PROGRESSED_EVENT, this._currentFileInfo, wasmDataPtr, this._currentFileInfo.written, out);
            if (out.preventExtraction) {
                return 0;
            }
            return bufferLength;
        } else {
            if (this._wasmDataWritten + bufferLength > wasmDataLength) {
                this.emit(ARCHIVING_BUFFER_FULL_EVENT, wasmDataPtr, this._wasmDataWritten);
                this._wasmDataWritten = 0;
                this.emit(ARCHIVING_PROGRESS_EVENT, this._filesArchived, fileOffset);
            }
            this._wasm.memcpy(wasmDataPtr + this._wasmDataWritten, bufferPtr, bufferLength);
            this._wasmDataWritten += bufferLength;
            return bufferLength;
        }
    }

    async writeZip(files) {
        if (this._callbackMode !== CALLBACK_MODE_NONE) {
            throw new Error(`no parallel processing`);
        }
        this._callbackMode = CALLBACK_MODE_ARCHIVE;
        this._wasmDataWritten = 0;
        this._filesArchived = 0;
        let totalSize = 0;
        for (let i = 0; i < files.length; ++i) {
            const file = files[i];
            totalSize += file.size;
            fs.set(file.name, file);
        }

        try {
            this.emit(ARCHIVING_WILL_START_EVENT, files.length, totalSize);
            this._checkError(this.zipper_prepare_file_for_writing(this._ptr));

            for (let i = 0; i < files.length; ++i) {
                const {name, size, lastModified, type} = files[i];
                this._currentFileInfo = {name, size, lastModified, type};
                this._checkError(this.zipper_add_file_to_archive(this._ptr, name, name, 0));
                this._filesArchived++;
                await delay(100);
            }

            this._checkError(this.zipper_finish_archive(this._ptr));
            if (this._wasmDataWritten > 0) {
                const {wasmDataPtr} = this._getWasmData();
                this.emit(ARCHIVING_BUFFER_FULL_EVENT, wasmDataPtr, this._wasmDataWritten);
                this._wasmDataWritten = 0;
            }
        } finally {
            this._checkError(this.zipper_finish_writing(this._ptr));
            for (let i = 0; i < files.length; ++i) {
                fs.delete(files[i].name);
            }
            handles.clear();
            this._callbackMode = CALLBACK_MODE_NONE;
        }
    }

    async readZip(zipFile) {
        if (!(zipFile instanceof File)) {
            throw new Error(`must be a file`);
        }
        if (this._callbackMode !== CALLBACK_MODE_NONE) {
            throw new Error(`no parallel processing`);
        }
        this._callbackMode = CALLBACK_MODE_EXTRACT;
        fs.set(zipFile.name, zipFile);
        try {
            let err = this.zipper_prepare_file_for_reading(this._ptr, zipFile.name);
            this._checkError(err);
            const populateFileInfosResult = this.zipper_populate_file_infos(this._ptr);
            const [, fileCount] = populateFileInfosResult;
            ([err] = populateFileInfosResult);
            this._checkError(err);
            let filesExtracted = 0;

            if (fileCount > 0) {
                for (let i = 0; i < fileCount; ++i) {
                    const [error, is_directory,
                           is_supported, name, lastModified,
                           size, index, entryPtr] = this.zipper_get_nth_file_info_fields(this._ptr, i);

                    this._checkError(error);

                    if (is_directory || !is_supported) {
                        continue;
                    }

                    out.preventExtraction = false;
                    this._currentFileInfo = {finished: false, waitUntil: null, index, lastModified, name, size, entryPtr, userData: {}};
                    this.emit(WILL_EXTRACT_FILE_EVENT, this._currentFileInfo, out);

                    if (out.preventExtraction) {
                        continue;
                    }
                    out.preventExtraction = false;

                    err = this.zipper_extract_file(this._ptr, entryPtr);

                    if (!out.preventExtraction) {
                        this._checkError(err);
                    } else {
                        continue;
                    }

                    filesExtracted++;

                    await this._currentFileInfo.waitUntil;
                }
            }
            return {fileCount, filesExtracted};
        } finally {
            fs.delete(zipFile.name);
            handles.clear();
            this._currentFileInfo = null;
            this._checkError(this.zipper_finish_reading(this._ptr));
            this._callbackMode = CALLBACK_MODE_NONE;
        }
    }
}

moduleEvents.on(`zip_beforeModuleImport`, (wasm, imports) => {
    Object.assign(imports.env, createFs(wasm), {
        js_write_callback(zipperPtr, fileOffset, bufferPtr, bufferLength, wasmDataPtr, wasmDataLength) {
            return zippersToJsInstances.get(zipperPtr)._writeCallback(fileOffset, bufferPtr, bufferLength, wasmDataPtr, wasmDataLength);
        }
    });
});

moduleEvents.on(`zip_afterInitialized`, (wasm, exports) => {
    Zipper.prototype.init_zipper = exports.init_zipper;
    Zipper.prototype.zipper_prepare_file_for_reading = wasm.createFunctionWrapper({
        name: `zipper_prepare_file_for_reading`
    }, `integer`, `string`);
    Zipper.prototype.zipper_populate_file_infos = wasm.createFunctionWrapper({
        name: `zipper_populate_file_infos`
    }, `integer`, `integer-retval`);
    Zipper.prototype.zipper_get_nth_file_info_fields = wasm.createFunctionWrapper({
        name: `zipper_get_nth_file_info_fields`
    }, `integer`, `integer`,
    `boolean-retval`, `boolean-retval`, `string-retval`, `double-retval`,
    `double-retval`, `integer-retval`, `integer-retval`);
    Zipper.prototype.zipper_extract_file = wasm.createFunctionWrapper({
        name: `zipper_extract_file`
    }, `integer`, `integer`);
    Zipper.prototype.zipper_error_string = exports.zipper_error_string;
    Zipper.prototype.zipper_finish_reading = exports.zipper_finish_reading;
    Zipper.prototype.zipper_add_file_to_archive = wasm.createFunctionWrapper({
        name: `zipper_add_file_to_archive`
    }, `integer`, `string`, `string`, `integer`);
    Zipper.prototype.zipper_prepare_file_for_writing = exports.zipper_prepare_file_for_writing;
    Zipper.prototype.zipper_finish_archive = exports.zipper_finish_archive;
    Zipper.prototype.zipper_finish_writing = exports.zipper_finish_writing;
    Zipper.prototype.zipper_get_data = wasm.createFunctionWrapper({
        name: `zipper_get_data`
    }, `integer`, `integer-retval`, `integer-retval`);
});
