import {File, DataView, ArrayBuffer} from "platform/platform";
import LocalFiles from "platform/LocalFiles";
import {delay} from "util";

const MAX_FILE_COUNT = 75000;
const BATCH_SIZE = 25;

function _dragEntered(e) {
    e.preventDefault();
    return false;
}

function _dragLeft(e) {
    e.preventDefault();
    return false;
}

function _dragOvered(e) {
    e.preventDefault();
    return false;
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
    return new File([buffer], `thefile.wav`, {type: `audio/wav`});
}

export default class LocalFileHandler {
    constructor(deps) {
        this.page = deps.page;
        this.env = deps.env;
        this.mainMenu = deps.mainMenu;
        this.fileInputContext = deps.fileInputContext;
        this.metadataManager = deps.metadataManager;
        this.playlist = deps.playlist;
        this.localFiles = new LocalFiles(this.env);

        this.gotFiles = this.gotFiles.bind(this);
        this.gotEntries = this.gotEntries.bind(this);
        this.addFilesToPlaylist = this.addFilesToPlaylist.bind(this);
        this.gotFilesAndDirectories = this.gotFilesAndDirectories.bind(this);

        this.directoryFileInput = null;
        if (this.env.supportsDirectories()) {
            this.directoryFileInput = this.fileInputContext.createFileInput({
                onchange: this.directoryInputChanged.bind(this),
                webkitdirectory: true,
                directory: true
            });
            this.mainMenu.on(`addFolder`, () => this.directoryFileInput.trigger());
        }

        this.filesFileInput = this.fileInputContext.createFileInput({
            onchange: this.fileInputChanged.bind(this),
            multiple: true,
            accept: this.env.supportedMimes().join(`,`)
        });
        this.mainMenu.on(`addFiles`, () => this.filesFileInput.trigger());

        this.page.addDocumentListener(`dragenter`, _dragEntered);
        this.page.addDocumentListener(`dragleave`, _dragLeft);
        this.page.addDocumentListener(`dragover`, _dragOvered);
        this.page.addDocumentListener(`drop`, this._dropped.bind(this));
    }

    receiveFiles(fileEmitter) {
        fileEmitter.on(`files`, this.addFilesToPlaylist);
        fileEmitter.on(`end`, () => {
            fileEmitter.removeAllListeners();
        });
    }

    async gotFiles(files) {
        const {length} = files;
        let i = 0;

        while (i < length) {
            const filtered = this.filterFiles(files.slice(i, Math.min(i + BATCH_SIZE, length)));
            await this.addFilesToPlaylist(filtered);
            await delay(500);
            i += BATCH_SIZE;
        }
    }

    gotEntries(entries) {
        this.receiveFiles(this.localFiles.fileEmitterFromEntries(entries, MAX_FILE_COUNT));
    }

    gotFilesAndDirectories(filesAndDirs) {
        this.receiveFiles(this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs, MAX_FILE_COUNT));
    }

    async _dropped(e) {
        e.preventDefault();
        e.stopPropagation();
        const dt = e.dataTransfer;
        if (!dt) return;
        if (!dt.items && !dt.files) return;

        if (typeof dt.getFilesAndDirectories === `function`) {
            const filesAndDirs = await dt.getFilesAndDirectories();
            this.gotFilesAndDirectories(filesAndDirs);
        } else if (dt.items && dt.items.length > 0) {
            const item = dt.items[0];
            const entry = item.getAsEntry || item.webkitGetAsEntry;
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
    }

    fileInputChanged(e) {
        const files = Array.from(e.target.files);
        this.gotFiles(files);
        this.filesFileInput.resetFiles();
    }

    directoryInputChanged(e) {
        const input = e.target;
        if (typeof input.getFilesAndDirectories === `function`) {
            (async () => {
                const filesAndDirs = await input.getFilesAndDirectories();
                this.gotFilesAndDirectories(filesAndDirs);
            })();
        } else {
            this.gotFiles(input.files);
        }
        this.directoryFileInput.resetFiles();
    }

    async addFilesToPlaylist(files) {
        const tracks = await Promise.all(files.map(file => this.metadataManager.getTrackByFileReferenceAsync(file)));
        this.playlist.add(tracks);
    }

    filterFiles(files) {
        const ret = new Array(files.length);
        ret.length = 0;
        for (let i = 0; i < files.length; ++i) {
            if (this.localFiles.defaultFilter(files[i])) {
                ret.push(files[i]);
            }
        }
        return ret;
    }
}
