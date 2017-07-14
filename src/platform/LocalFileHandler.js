import {noUndefinedGet} from "util";
import {File, Uint8Array, DataView, ArrayBuffer} from "platform/platform";
import LocalFiles from "platform/LocalFiles";
import Track from "tracks/Track";

const MAX_FILE_COUNT = 75000;

export default class LocalFileHandler {
    constructor(deps) {
        this.page = deps.page;
        this.env = deps.env;
        this.mainMenu = deps.mainMenu;
        this.fileInputContext = deps.fileInputContext;
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

        this.page.addDocumentListener(`dragenter`, this._dragEntered.bind(this));
        this.page.addDocumentListener(`dragleave`, this._dragLeft.bind(this));
        this.page.addDocumentListener(`dragover`, this._dragOvered.bind(this));
        this.page.addDocumentListener(`drop`, this._dropped.bind(this));
    }

    receiveFiles(fileEmitter) {
        fileEmitter.on(`files`, this.addFilesToPlaylist);
        fileEmitter.on(`end`, () => {
            fileEmitter.removeAllListeners();
        });
    }

    gotFiles(files) {
        this.addFilesToPlaylist(this.filterFiles(files));
    }

    gotEntries(entries) {
        this.receiveFiles(this.localFiles.fileEmitterFromEntries(entries, MAX_FILE_COUNT));
    }

    gotFilesAndDirectories(filesAndDirs) {
        this.receiveFiles(this.localFiles.fileEmitterFromFilesAndDirs(filesAndDirs, MAX_FILE_COUNT));
    }

    _dragEntered(e) {
        e.preventDefault();
        return false;
    }

    _dragLeft(e) {
        e.preventDefault();
        return false;
    }

    _dragOvered(e) {
        e.preventDefault();
        return false;
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
                this.gotFiles(files);
            } else {
                const entries = [].map.call(dt.items, v => entry.call(v));
                this.gotEntries(entries);
            }
        } else if (dt.files && dt.files.length > 0) {
            this.gotFiles(dt.files);
        }
    }

    generateSilentWavFile() {
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

    generateFakeFiles(count) {
        const id3v1String = function(value) {
            const ret = new Uint8Array(30);
            for (let i = 0; i < value.length; ++i) {
                ret[i] = value.charCodeAt(i);
            }
            return ret;
        };

        const files = new Array(+count);
        const dummy = new Uint8Array(256 * 1024);
        const sync = new Uint8Array(4);
        sync[0] = 0xFF;
        sync[1] = 0xFB;
        sync[2] = 0xB4;
        sync[3] = 0x00;
        for (let i = 0; i < dummy.length; i += 4) {
            dummy[i] = sync[0];
            dummy[i + 1] = sync[1];
            dummy[i + 2] = sync[2];
            dummy[i + 3] = sync[3];
        }
        for (let i = 0; i < files.length; ++i) {
            const tag = new Uint8Array(3);
            tag[0] = 84;
            tag[1] = 65;
            tag[2] = 71;
            const title = id3v1String(`Track ${i}`);
            const artist = id3v1String(`Artist`);
            const album = id3v1String(`Album`);
            const year = new Uint8Array(4);
            const comment = id3v1String(`Comment`);
            const genre = new Uint8Array(1);

            const parts = [sync, dummy, tag, title, artist, album, year, comment, genre];


            files[i] = new File(parts, `file ${i}.mp3`, {type: `audio/mp3`});
        }

        files.unshift(this.generateSilentWavFile());
        this.page.setTimeout(() => {
            this.addFilesToPlaylist(files);
        }, 100);
    }

    fileInputChanged(e) {
        this.gotFiles(e.target.files);
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

    addFilesToPlaylist(files) {
        this.playlist.add(files.map(file => new Track(file)));
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
