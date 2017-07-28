import AbstractBackend from "AbstractBackend";
import Zipper, {
    FILE_EXTRACTED_EVENT,
    FILE_EXTRACTION_PROGRESSED_EVENT,
    WILL_EXTRACT_FILE_EVENT,
    ARCHIVING_WILL_START_EVENT,
    ARCHIVING_BUFFER_FULL_EVENT,
    ARCHIVING_PROGRESS_EVENT
} from "zip/Zipper";
import {File, Blob} from "platform/platform";
import {getCodecNameFromContents, getCodecNameFromFileName,
        codecNameToFileType} from "audio/backend/sniffer";
import KeyValueDatabase from "platform/KeyValueDatabase";

export const ZIPPER_READY_EVENT_NAME = `ZipperReady`;
export const AUDIO_FILE_EXTRACTED_MESSAGE = `audioFileExtractedMessage`;
export const ARCHIVE_PROGRESS_MESSAGE = `archiveProgress`;

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
export default class ZipperBackend extends AbstractBackend {
    constructor(wasm) {
        super(ZIPPER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._kvdb = null;
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
                this._extractingZipper.readZip(zipFile);
            },

            async archiveFiles({files, archiveRequestId}) {
                await this._checkDb();
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
        if (!this._kvdb) {
            this._kvdb = new KeyValueDatabase();
            await this._kvdb.getDb();
        }
    }

    _archivingStarts(fileCount, totalSizeBytes) {
        this._archiveTotalFiles = fileCount;
        this._archiveTotalSize = totalSizeBytes;
    }

    async _archivingBufferFull(ptr, length) {
        const blob = new Blob([this._wasm.u8view(ptr, length)]);
        await this._kvdb.addTmpFile(blob, this._archiveRequestId);
        // TODO Communicate to frontend, which communicates to serviceworker
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

    async _fileExtracted({lastModified, name, userData, fileCount, filesExtracted, index: zipArchiveIndex}, ptr, length) {
        const fileName = basename(name);
        const file = new File([this._wasm.u8view(ptr, length)], fileName, {
            type: userData.type,
            lastModified: lastModified * 1000
        });
        self.uiLog(`extracted file ${fileName} (#${zipArchiveIndex}) ${filesExtracted}/${fileCount}`);
        const tmpFileId = await this._kvdb.addTmpFile(file, EXTRACTED_FILE_TMP_SOURCE_NAME);
        this.postMessage({
            type: AUDIO_FILE_EXTRACTED_MESSAGE,
            result: {tmpFileId}
        });
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
}
