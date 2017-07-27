import {moduleEvents} from "wasm/WebAssemblyWrapper";
import {createFs, fs, handles} from "wasm/fs";
import {File} from "platform/platform";

const zippersToJsInstances = new Map();

export default class Zipper {
    constructor(wasm) {
        this._wasm = wasm;
        this._ptr = this.init_zipper();
        if (!this._ptr) {
            throw new Error(`out of memory`);
        }
        this._fileExtractionProgressCallback = null;
        this._fileExtractedCallback = null;
        this._currentFileInfo = null;
        this._fileCancelled = false;
        zippersToJsInstances.set(this._ptr, this);
    }

    _writeCallback(fileOffset, bufferPtr, bufferLength, wasmDataPtr) {
        this._wasm.memcpy(wasmDataPtr + fileOffset, bufferPtr, bufferLength);
        this._currentFileInfo.written += bufferLength;

        if (fileOffset + bufferLength >= this._currentFileInfo.size ||
            this._currentFileInfo.written >= this._currentFileInfo.size) {
            this._fileExtractedCallback(this._currentFileInfo, wasmDataPtr, this._currentFileInfo.written);
            return bufferLength;
        } else {
            if (!this._fileExtractionProgressCallback(this._currentFileInfo, wasmDataPtr, this._currentFileInfo.written)) {
                this._fileCancelled = true;
                return 0;
            }
            return bufferLength;
        }
    }

    readZip(zipFile, fileExtractedCallback, fileExtractionProgressCallback, fileMetadataCallback) {
        if (!(zipFile instanceof File)) {
            throw new Error(`must be a file`);
        }
        fs.set(zipFile.name, zipFile);
        try {
            let err = this.zipper_prepare_file_for_reading(this._ptr, zipFile.name);
            if (err) {
                throw new Error(`Zipper error: ${err}`);
            }
            const populateFileInfosResult = this.zipper_populate_file_infos(this._ptr);
            const [, fileCount] = populateFileInfosResult;
            ([err] = populateFileInfosResult);
            if (err) {
                throw new Error(`Zipper error: ${err}`);
            }
            let filesExtracted = 0;
            if (fileCount > 0) {
                for (let i = 0; i < fileCount; ++i) {
                    const [error, is_directory,
                           is_encrypted, name, lastModified,
                           size, index, entryPtr] = this.zipper_get_nth_file_info_fields(this._ptr, i);
                    if (error) {
                        throw new Error(`Zipper error: ${error}`);
                    }

                    if (is_directory || is_encrypted) {
                        continue;
                    }

                    this._currentFileInfo = {lastModified, name, size, index, entryPtr, userData: {}, written: 0};
                    this._fileCancelled = false;

                    if (!fileMetadataCallback(this._currentFileInfo)) {
                        continue;
                    }

                    err = this.zipper_extract_file(this._ptr, entryPtr);

                    if (err && !this._fileCancelled) {
                        throw new Error(`unexpected extraction fail`);
                    }

                    if (!err) {
                        filesExtracted++;
                    }
                }
            }
            return {fileCount, filesExtracted};
        } finally {
            fs.delete(zipFile.name);
            handles.clear();
            this._fileExtractionProgressCallback = null;
            this._fileExtractedCallback = null;
            this._currentFileInfo = null;
            this._fileCancelled = false;
        }
    }
}

moduleEvents.on(`zip_beforeModuleImport`, (wasm, imports) => {
    Object.assign(imports.env, createFs(wasm), {
        js_write_callback(zipperPtr, fileOffset, bufferPtr, bufferLength, wasmDataPtr) {
            return zippersToJsInstances.get(zipperPtr)._writeCallback(fileOffset, bufferPtr, bufferLength, wasmDataPtr);
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
    }, `integer`, `boolean-retval`, `boolean-retval`, `string-retval`,
     `double-retval`, `double-retval`, `integer-retval`, `integer-retval`);
    Zipper.prototype.zipper_extract_file = wasm.createFunctionWrapper({
        name: `zipper_extract_file`
    }, `integer`, `integer`);
});
