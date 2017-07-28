import {ZIPPER_READY_EVENT_NAME,
        QUOTA_EXCEEDED_MESSAGE,
         AUDIO_FILE_EXTRACTED_MESSAGE} from "zip/ZipperBackend";
import WorkerFrontend from "WorkerFrontend";
import QuotaExceededEmitterTrait from "platform/QuotaExceededEmitterTrait";
import DatabaseClosedEmitterTrait from "platform/DatabaseClosedEmitterTrait";
import {DATABASE_HAS_BEEN_CLOSED_MESSAGE} from "DatabaseUsingBackend";

export const AUDIO_FILE_EXTRACTED_EVENT = `audioFileExtracted`;

export default class ZipperFrontend extends WorkerFrontend {
    constructor(deps) {
        super(ZIPPER_READY_EVENT_NAME, deps.zipperWorkerWrapper);
    }

    receiveMessage(event) {
        const {type, result} = event.data;

        if (type === AUDIO_FILE_EXTRACTED_MESSAGE) {
            this._audioFileExtracted(result);
        } else if (type === QUOTA_EXCEEDED_MESSAGE) {
            this.quotaExceeded();
        } else if (type === DATABASE_HAS_BEEN_CLOSED_MESSAGE) {
            this.databaseClosed();
        }
    }

    _audioFileExtracted({tmpFileId}) {
        this.emit(AUDIO_FILE_EXTRACTED_EVENT, tmpFileId);
    }

    async archiveFiles(files) {
        await this.ready();
        this.postMessage({
            action: `archiveFiles`,
            args: {files, archiveRequestId: 1}
        });
    }

    async extractSupportedAudioFilesFromZip(zipFile) {
        await this.ready();
        this.postMessage({
            action: `extractSupportedAudioFilesFromZipFile`,
            args: {zipFile}
        });
    }
}

Object.assign(ZipperFrontend.prototype, QuotaExceededEmitterTrait, DatabaseClosedEmitterTrait);
