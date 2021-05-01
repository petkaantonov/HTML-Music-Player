import { DatabaseClosedEmitterTrait, DatabaseEventsMap } from "shared/src/platform/DatabaseClosedEmitterTrait";
import { QuotaExceededEmitterTrait, QuotaExceededEventsMap } from "shared/src/platform/QuotaExceededEmitterTrait";
import { ZipperBackendActions, ZipperResult } from "shared/src/zipper";
import { EventEmitterInterface } from "shared/types/helpers";
import { SelectDeps } from "ui/Application";
import WorkerFrontend from "ui/WorkerFrontend";

type Deps = SelectDeps<"zipperWorker">;
export default class ZipperFrontend extends WorkerFrontend<ZipperResult> {
    constructor(deps: Deps) {
        super("zipper", deps.zipperWorker);
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
