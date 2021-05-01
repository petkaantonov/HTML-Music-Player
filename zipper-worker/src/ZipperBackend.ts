import { isOutOfMemoryError } from "shared/errors";
import KeyValueDatabase from "shared/idb/KeyValueDatabase";
import { DatabaseClosedResult } from "shared/src/platform/DatabaseClosedEmitterTrait";
import { LogFunction } from "shared/src/types/helpers";
import AbstractBackend from "shared/src/worker/AbstractBackend";
import { CancellationToken } from "shared/utils/CancellationToken";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";
import { codecNameToFileType, getCodecNameFromContents, getCodecNameFromFileName } from "shared/worker/sniffer";
import { ZipperBackendActions, ZipperResult } from "shared/zipper";

import Zipper, { ZipperByRef, ZipperEventTypesMap } from "./Zipper";

export const ZIPPER_READY_EVENT_NAME = `ZipperReady`;
export const AUDIO_FILE_EXTRACTED_MESSAGE = `audioFileExtractedMessage`;
export const ARCHIVE_PROGRESS_MESSAGE = `archiveProgress`;
export const QUOTA_EXCEEDED_MESSAGE = `quotaExceeded`;

export const EXTRACTED_FILE_TMP_SOURCE_NAME = `ExtractedFromArchive`;
export const ARCHIVE_FILE_TMP_SOURCE_NAME = `ArchiveTmpChunk`;

function basename(name: string) {
    const slash = name.lastIndexOf(`/`);
    if (slash >= 0) {
        return name.slice(slash + 1);
    }
    return name;
}

function audioExtractorMetadataFilter({ size }: { size: number }, out: ZipperByRef) {
    out.preventExtraction = size < 131072 || size > 1073741824;
}

const actions: ZipperBackendActions<ZipperBackend> = {
    async extractSupportedAudioFilesFromZipFile(this: ZipperBackend, { zipFile }) {
        await this._checkDb();
        if (!this.canUseDatabase()) return;
        await this._extractingZipper.readZip(zipFile);
    },

    async archiveFiles(this: ZipperBackend, { files, archiveRequestId }) {
        await this._checkDb();
        if (!this.canUseDatabase()) return;
        if (this._archiveRequestId >= 0) {
            // Already in progress
        }
        this._archiveRequestId = archiveRequestId;
        try {
            await this._archivingZipper.writeZip(files);
        } finally {
            this._archiveRequestId = -1;
            this._archiveCancellationToken = null;
            this._archiveTotalFiles = 0;
            this._archiveTotalSize = 0;
        }
    },

    cancelArchiveAudioFiles(this: ZipperBackend, { archiveRequestId }) {
        if (this._archiveRequestId === archiveRequestId) {
            this._archiveCancellationToken;
        }
    },
};

// TODO Cancellation
// TODO Import min max sizes
// TODO import block size from sniffer
// TODO Import supported codec
// TODO Handle fileread errors
// TODO Service worker the bundle
// TODO CLear tmp files
export default class ZipperBackend extends AbstractBackend<typeof actions, "zipper"> {
    _extractingZipper: Zipper;
    _archiveRequestId: number;
    _archivingZipper: Zipper;
    _archiveCancellationToken: CancellationToken<any> | null;
    _archiveTotalFiles: number;
    _archiveTotalSize: number;
    _wasm: WebAssemblyWrapper;
    _database: KeyValueDatabase | null;
    _uiLog: LogFunction;
    constructor(wasm: WebAssemblyWrapper, uiLog: LogFunction) {
        super("zipper", actions);
        this._wasm = wasm;
        this._archivingZipper = new Zipper(wasm);
        this._extractingZipper = new Zipper(wasm);

        this._archiveRequestId = -1;
        this._archiveCancellationToken = null;
        this._archiveTotalFiles = 0;
        this._archiveTotalSize = 0;
        this._database = null;
        this._uiLog = uiLog;

        this._extractingZipper.on("fileExtracted", this._fileExtracted);
        this._extractingZipper.on("fileExtractionProgressed", this._fileExtractionProgress);
        this._extractingZipper.on("willExtractFile", audioExtractorMetadataFilter);
        this._archivingZipper.on("archivingBufferFull", this._archivingBufferFull);
        this._archivingZipper.on("archivingProgressEvent", this._archivingProgress);
        this._archivingZipper.on("archivingWillStart", this._archivingStarts);
    }

    async _checkDb() {
        if (!this._database) {
            this._database = new KeyValueDatabase(this._uiLog);
            await this._database.getDb();
        }
    }

    canUseDatabase() {
        if (!this._database) {
            return false;
        }
        if (this._database.isClosed()) {
            const msg: DatabaseClosedResult = { type: "databaseClosed" };
            this.postMessageToFrontend([msg]);
            return false;
        }
        return true;
    }

    _archivingStarts: ZipperEventTypesMap["archivingWillStart"] = (fileCount, totalSizeBytes) => {
        this._archiveTotalFiles = fileCount;
        this._archiveTotalSize = totalSizeBytes;
    };

    _saveArchivedChunk = async (buffer: Uint8Array) => {
        if (!this.canUseDatabase()) return false;
        try {
            const blob = new Blob([buffer]);
            await this._database!.addTmpFile(blob, this._archiveRequestId.toString());
            // TODO Communicate to frontend, which communicates to serviceworker
            return true;
        } catch (e) {
            if (this._checkStorageError(e)) {
                return false;
            }
            throw e;
        }
    };

    _archivingBufferFull: ZipperEventTypesMap["archivingBufferFull"] = (ptr, length, out) => {
        out!.respondWith = this._saveArchivedChunk(this._wasm.u8view(ptr, length));
    };

    _archivingProgress: ZipperEventTypesMap["archivingProgressEvent"] = (filesArchived, bytesWritten) => {
        this.postMessageToZipperFrontend({
            type: "archiveProgress",
            filesArchived,
            totalFilesToArchive: this._archiveTotalFiles,
            bytesWritten,
            totalBytesToWrite: this._archiveTotalSize,
        });
    };

    _saveExtractedFile = async (buffer: Uint8Array, fileName: string, type: string, lastModified: number) => {
        if (!this.canUseDatabase()) return false;
        try {
            const file = new File([buffer], fileName, { type, lastModified });
            const tmpFileId = await this._database!.addTmpFile(file, EXTRACTED_FILE_TMP_SOURCE_NAME);

            this.postMessageToZipperFrontend({
                type: "audioFileExtracted",
                tmpFileId: tmpFileId.toString(),
            });
            return true;
        } catch (e) {
            if (this._checkStorageError(e)) {
                return false;
            }
            throw e;
        }
    };

    _fileExtracted: ZipperEventTypesMap["fileExtracted"] = ({ lastModified, name, userData }, buffer, out) => {
        const fileName = basename(name);
        out.respondWith = this._saveExtractedFile(buffer, fileName, userData.type, lastModified * 1000);
    };

    _fileExtractionProgress: ZipperEventTypesMap["fileExtractionProgressed"] = (
        { name, userData },
        ptr,
        length,
        out
    ) => {
        if (!userData.type) {
            if (length >= 8192) {
                let codecName = getCodecNameFromContents(this._wasm.u8view(ptr, length));
                if (codecName !== `mp3`) {
                    codecName = getCodecNameFromFileName(name);
                    if (codecName !== `mp3`) {
                        out.preventExtraction = true;
                        return;
                    }
                }
                userData.type = codecNameToFileType(codecName);
            }
        }
    };

    _checkStorageError = (e: Error) => {
        if (isOutOfMemoryError(e)) {
            this.postMessageToZipperFrontend({ type: "quotaExceeded" });
            return true;
        }
        return false;
    };

    postMessageToZipperFrontend<T extends ZipperResult>(result: T) {
        this.postMessageToFrontend([result]);
    }
}
