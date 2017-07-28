import DatabaseUsingBackend from "DatabaseUsingBackend";
import Zipper, {
    FILE_EXTRACTED_EVENT,
    FILE_EXTRACTION_PROGRESSED_EVENT,
    WILL_EXTRACT_FILE_EVENT,
    ARCHIVING_WILL_START_EVENT,
    ARCHIVING_BUFFER_FULL_EVENT,
    ARCHIVING_PROGRESS_EVENT
} from "zip/Zipper";
import {File, Blob, isOutOfMemoryError} from "platform/platform";
import {getCodecNameFromContents, getCodecNameFromFileName,
        codecNameToFileType} from "audio/backend/sniffer";
import KeyValueDatabase from "platform/KeyValueDatabase";

export const ZIPPER_READY_EVENT_NAME = `ZipperReady`;
export const AUDIO_FILE_EXTRACTED_MESSAGE = `audioFileExtractedMessage`;
export const ARCHIVE_PROGRESS_MESSAGE = `archiveProgress`;
export const QUOTA_EXCEEDED_MESSAGE = `quotaExceeded`;

export const EXTRACTED_FILE_TMP_SOURCE_NAME = `ExtractedFromArchive`;
export const ARCHIVE_FILE_TMP_SOURCE_NAME = `ArchiveTmpChunk`;

function basename(name) {
    const slash = name.lastIndexOf(`/`);
    if (slash >= 0) {
        return name.slice(slash + 1);
    }
    return name;
}

function audioExtractorMetadataFilter({size}, out) {
    out.preventExtraction = size < 131072 || size > 1073741824;
}

// TODO Cancellation
// TODO Import min max sizes
// TODO import block size from sniffer
// TODO Import supported codec
// TODO Handle fileread errors
// TODO Service worker the bundle
// TODO CLear tmp files
export default class ZipperBackend extends DatabaseUsingBackend {
    constructor(wasm) {
        super(ZIPPER_READY_EVENT_NAME, null);
        this._wasm = wasm;
        this._archivingZipper = new Zipper(wasm);
        this._extractingZipper = new Zipper(wasm);

        this._archiveRequestId = -1;
        this._archiveCancellationToken = null;
        this._archiveTotalFiles = 0;
        this._archiveTotalSize = 0;

        this._extractingZipper.on(FILE_EXTRACTED_EVENT, this._fileExtracted.bind(this));
        this._extractingZipper.on(FILE_EXTRACTION_PROGRESSED_EVENT, this._fileExtractionProgress.bind(this));
        this._extractingZipper.on(WILL_EXTRACT_FILE_EVENT, audioExtractorMetadataFilter);
        this._archivingZipper.on(ARCHIVING_BUFFER_FULL_EVENT, this._archivingBufferFull.bind(this));
        this._archivingZipper.on(ARCHIVING_PROGRESS_EVENT, this._archivingProgress.bind(this));
        this._archivingZipper.on(ARCHIVING_WILL_START_EVENT, this._archivingStarts.bind(this));
        this.actions = {
            async extractSupportedAudioFilesFromZipFile({zipFile}) {
                await this._checkDb();
                if (!this.canUseDatabase()) return;
                this._extractingZipper.readZip(zipFile);
            },

            async archiveFiles({files, archiveRequestId}) {
                await this._checkDb();
                if (!this.canUseDatabase()) return;
                if (this._archiveRequestId >= 0) {
                    // Already in progress
                }
                this._archiveRequestId = archiveRequestId;
                try {
                    this._archivingZipper.writeZip(files);
                } finally {
                    this._archiveRequestId = -1;
                    this._archiveCancellationToken = null;
                    this._archiveTotalFiles = 0;
                    this._archiveTotalSize = 0;
                }
            },

            cancelArchiveAudioFiles({archiveRequestId}) {
                if (this._archiveRequestId === archiveRequestId) {
                    this._archiveCancellationToken;
                }
            }
        };
    }

    async _checkDb() {
        if (!this.database) {
            this.database = new KeyValueDatabase();
            await this.database.getDb();
        }
    }

    _archivingStarts(fileCount, totalSizeBytes) {
        this._archiveTotalFiles = fileCount;
        this._archiveTotalSize = totalSizeBytes;
    }

    async _saveArchivedChunk(buffer) {
        if (!this.canUseDatabase()) return false;
        try {
            const blob = new Blob([buffer]);
            await this.database.addTmpFile(blob, this._archiveRequestId);
            // TODO Communicate to frontend, which communicates to serviceworker
            return true;
        } catch (e) {
            if (this._checkStorageError(e)) {
                return false;
            }
            throw e;
        }
    }

    _archivingBufferFull(ptr, length, out) {
        out.respondWith = this._saveArchivedChunk(this._wasm.u8view(ptr, length));
    }

    _archivingProgress(filesArchived, bytesWritten) {
        this.postMessage({
            type: ARCHIVE_PROGRESS_MESSAGE,
            result: {
                filesArchived,
                totalFilesToArchive: this._archiveTotalFiles,
                bytesWritten,
                totalBytesToWrite: this._archiveTotalSize
            }
        });
    }

    async _saveExtractedFile(buffer, fileName, type, lastModified) {
        if (!this.canUseDatabase()) return false;
        try {
            const file = new File([buffer], fileName, {type, lastModified});
            const tmpFileId = await this.database.addTmpFile(file, EXTRACTED_FILE_TMP_SOURCE_NAME);
            this.postMessage({
                type: AUDIO_FILE_EXTRACTED_MESSAGE,
                result: {tmpFileId}
            });
            return true;
        } catch (e) {
            if (this._checkStorageError(e)) {
                return false;
            }
            throw e;
        }
    }

    _fileExtracted({lastModified, name, userData}, buffer, out) {
        const fileName = basename(name);
        out.respondWith = this._saveExtractedFile(buffer, fileName, userData.type, lastModified * 1000);
    }

    _fileExtractionProgress({name, userData}, ptr, length, out) {
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
    }

    _checkStorageError(e) {
        if (isOutOfMemoryError(e)) {
            this.postMessage({type: QUOTA_EXCEEDED_MESSAGE});
            return true;
        }
        return false;
    }
}
