import { isAudioFile, isZipFile, supportedMimes } from "shared/src/types/files";
import { SelectDeps } from "ui/Application";
import MetadataManagerFrontend from "ui/metadata/MetadataManagerFrontend";
import LocalFiles, { FileEmitter } from "ui/platform/LocalFiles";
import PlaylistController from "ui/player/PlaylistController";
import MainMenu from "ui/ui/MainMenu";
import ZipperFrontend from "ui/zip/ZipperFrontend";

import Page from "./dom/Page";
import Env from "./Env";
import FileInputContext, { FileInput } from "./FileInputContext";

function _dragEntered(e: Event) {
    e.preventDefault();
    return false;
}

function _dragLeft(e: Event) {
    e.preventDefault();
    return false;
}

function _dragOvered(e: Event) {
    e.preventDefault();
    return false;
}

function filterFiles(files: File[]) {
    const audioFiles: File[] = new Array(files.length);
    audioFiles.length = 0;
    const zipFiles: File[] = [];

    for (let i = 0; i < files.length; ++i) {
        if (isZipFile(files[i]!)) {
            zipFiles.push(files[i]!);
        } else if (isAudioFile(files[i]!)) {
            audioFiles.push(files[i]!);
        }
    }
    return { audioFiles, zipFiles };
}

export function generateSilentWavFile() {
    const seconds = 10;
    const sampleRate = 8000;
    const samples = sampleRate * seconds;
    const format = 1;
    const bytesPerSample = 2;
    const channels = 1;
    const buffer = new ArrayBuffer(44 + samples * bytesPerSample);
    const view = new DataView(buffer);
    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + samples * bytesPerSample, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * bytesPerSample, true);
    view.setUint16(32, channels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, samples * channels * bytesPerSample, true);
    return new File([buffer], `thefile.wav`, { type: `audio/wav` });
}

type Deps = SelectDeps<"page" | "env" | "mainMenu" | "fileInputContext" | "metadataManager" | "playlist" | "zipper">;

export default class LocalFileHandler {
    readonly page: Page;
    readonly env: Env;
    readonly mainMenu: MainMenu;
    readonly fileInputContext: FileInputContext;
    readonly metadataManager: MetadataManagerFrontend;
    readonly playlist: PlaylistController;
    readonly zipper: ZipperFrontend;
    readonly localFiles: LocalFiles;
    directoryFileInput: null | FileInput;
    filesFileInput: FileInput;
    constructor(deps: Deps) {
        this.page = deps.page;
        this.env = deps.env;
        this.mainMenu = deps.mainMenu;
        this.fileInputContext = deps.fileInputContext;
        this.metadataManager = deps.metadataManager;
        this.playlist = deps.playlist;
        this.zipper = deps.zipper;
        this.localFiles = new LocalFiles();

        this.directoryFileInput = null;
        if (this.env.supportsDirectories()) {
            this.directoryFileInput = this.fileInputContext.createFileInput({
                onchange: this.directoryInputChanged.bind(this),
                webkitdirectory: true,
                directory: true,
            });
            this.mainMenu.on(`addFolder`, () => this.directoryFileInput!.trigger());
        }

        this.filesFileInput = this.fileInputContext.createFileInput({
            onchange: this.fileInputChanged.bind(this),
            multiple: true,
            accept: supportedMimes.join(`,`),
        });
        this.mainMenu.on(`addFiles`, () => this.openFilePicker());

        this.page.addDocumentListener(`dragenter`, _dragEntered);
        this.page.addDocumentListener(`dragleave`, _dragLeft);
        this.page.addDocumentListener(`dragover`, _dragOvered);
        this.page.addDocumentListener(`drop`, this._dropped.bind(this));
    }

    openFilePicker = () => {
        this.filesFileInput.trigger();
    };

    receiveFiles = (fileEmitter: FileEmitter) => {
        fileEmitter.on(`files`, this.gotFiles);
        fileEmitter.on(`end`, () => {
            fileEmitter.removeAllListeners();
        });
    };

    gotFiles = (files: File[]) => {
        const { audioFiles, zipFiles } = filterFiles(files);
        void this.addFilesToPlaylist(audioFiles);
        zipFiles.forEach(zipFile => this.zipper.extractSupportedAudioFilesFromZip(zipFile));
    };

    gotEntries = (entries: any[]) => {
        this.receiveFiles(this.localFiles.fileEmitterFromEntries(entries));
    };

    gotFilesAndDirectories = (filesAndDirs: any[]) => {
        this.receiveFiles(this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs));
    };

    _dropped = async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const dt = e.dataTransfer;
        if (!dt) return;
        if (!dt.items && !dt.files) return;

        if (typeof (dt as any).getFilesAndDirectories === `function`) {
            const filesAndDirs = await ((dt as unknown) as Directory).getFilesAndDirectories();
            this.gotFilesAndDirectories(filesAndDirs);
        } else if (dt.items && dt.items.length > 0) {
            const item = dt.items[0]!;
            const entry = (item as any).getAsEntry || item.webkitGetAsEntry;
            if (!entry) {
                const files = await Promise.resolve(dt.files);
                this.gotFiles(Array.from(files));
            } else {
                const entries = Array.from(dt.items).map(v => entry.call(v));
                this.gotEntries(entries);
            }
        } else if (dt.files && dt.files.length > 0) {
            this.gotFiles(Array.from(dt.files));
        }
    };

    fileInputChanged = (e: Event) => {
        const files = Array.from((e.target as HTMLInputElement).files!);
        this.gotFiles(files);
        this.filesFileInput.resetFiles();
    };

    directoryInputChanged = (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (typeof ((input as unknown) as Directory).getFilesAndDirectories === `function`) {
            void (async () => {
                const filesAndDirs = await ((input as unknown) as Directory).getFilesAndDirectories();
                this.gotFilesAndDirectories(filesAndDirs);
            })();
        } else {
            this.gotFiles((input.files! as unknown) as File[]);
        }
        this.directoryFileInput!.resetFiles();
    };

    addFilesToPlaylist = async (files: File[]) => {
        const tracks = await Promise.all(files.map(file => this.metadataManager.getTrackByFileReferenceAsync(file)));
        this.playlist.add(tracks);
    };
}
