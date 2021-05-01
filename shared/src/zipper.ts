import { DatabaseClosedResult } from "./platform/DatabaseClosedEmitterTrait";
import { QuotaExceededResult } from "./platform/QuotaExceededEmitterTrait";

export interface AudioFileExtractedResult {
    type: "audioFileExtracted";
    tmpFileId: string;
}

export interface ArchiveProgressResult {
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
