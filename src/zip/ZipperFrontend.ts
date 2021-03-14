import { SelectDeps } from "Application";
import {
    DatabaseClosedEmitterTrait,
    DatabaseClosedResult,
    DatabaseEventsMap,
} from "platform/DatabaseClosedEmitterTrait";
import {
    QuotaExceededEmitterTrait,
    QuotaExceededEventsMap,
    QuotaExceededResult,
} from "platform/QuotaExceededEmitterTrait";
import { EventEmitterInterface } from "types/helpers";
import WorkerFrontend from "WorkerFrontend";

interface AudioFileExtractedResult {
    type: "audioFileExtracted";
    tmpFileId: string;
}

interface ArchiveProgressResult {
    type: "archiveProgress";
    filesArchived: number;
    totalFilesToArchive: number;
    bytesWritten: number;
    totalBytesToWrite: number;
}

export type ZipperResult =
    | AudioFileExtractedResult
    | ArchiveProgressResult
    | QuotaExceededResult
    | DatabaseClosedResult;

export interface ZipperBackendActions<T> {
    extractSupportedAudioFilesFromZipFile: (this: T, { zipFile }: { zipFile: File }) => Promise<void>;
    archiveFiles: (this: T, { files, archiveRequestId }: { files: File[]; archiveRequestId: number }) => Promise<void>;
    cancelArchiveAudioFiles: (this: T, { archiveRequestId }: { archiveRequestId: number }) => void;
}

type Deps = SelectDeps<"zipperWorkerWrapper">;
export default class ZipperFrontend extends WorkerFrontend<ZipperResult> {
    constructor(deps: Deps) {
        super("zipper", deps.zipperWorkerWrapper);
    }

    receiveMessageFromBackend(t: ZipperResult) {
        if (t.type === "audioFileExtracted") {
            this._audioFileExtracted(t.tmpFileId);
        } else if (t.type === "quotaExceeded") {
            this.quotaExceeded();
        } else if (t.type === "databaseClosed") {
            this.databaseClosed();
        }
    }

    _audioFileExtracted(tmpFileId: string) {
        this.emit("audioFileExtracted", tmpFileId);
    }

    async archiveFiles(files: File[]) {
        await this.ready();
        this.postMessageToMetadataBackend("archiveFiles", { files, archiveRequestId: 1 });
    }

    async extractSupportedAudioFilesFromZip(zipFile: File) {
        await this.ready();
        this.postMessageToMetadataBackend("extractSupportedAudioFilesFromZipFile", { zipFile });
    }

    postMessageToMetadataBackend = <T extends string & keyof ZipperBackendActions<unknown>>(
        action: T,
        ...args: Parameters<ZipperBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args);
    };
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export default interface ZipperFrontend
    extends EventEmitterInterface<
            DatabaseEventsMap &
                QuotaExceededEventsMap & {
                    audioFileExtracted: (tmpFileId: string) => void;
                }
        >,
        QuotaExceededEmitterTrait,
        DatabaseClosedEmitterTrait {}

Object.assign(ZipperFrontend.prototype, QuotaExceededEmitterTrait, DatabaseClosedEmitterTrait);
