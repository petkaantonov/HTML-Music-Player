const EventEmitter = require("events");
const Promise = require("bluebird");
const os = require("os");
const spawn = require("child_process").spawn;
const fs = Promise.promisifyAll(require("fs"));
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const path = require("path");
const Readable = require("stream").Readable;
const mkdirpAsync = Promise.promisify(mkdirp);
const rimrafAsync = Promise.promisify(rimraf);
Promise.promisifyAll(require("stream").Writable);

const DATA_ROOT = "/var/lib/soita";
const CACHE_ROOT = path.join(DATA_ROOT, "cache");
const OUTPUT_BITRATE = 192000;
const EXPECTED_BYTES_WRITTEN_PER_MILLISECOND = 2160;
const MAX_CONCURRENT_READ_STREAMS = 10;

mkdirp.sync(DATA_ROOT);
mkdirp.sync(CACHE_ROOT);

class GrowingAudioFileReadable extends Readable {
    constructor(youtubeDl, offset, length) {
        super();
        this.youtubeDl = youtubeDl;
        this.offset = offset;
        this.bytesRead = 0;
        this.handle = null;
        this.desiredLength = length;
        this.length = Math.min(offset + length, this._getMaximumFileSize()) - offset;
        this.closedFromOutside = false;
        this.on("end", () => {
            this._clearHandle();
        });
    }

    _clearHandle() {
        if (this.handle) {
            var handle = this.handle;
            this.handle = null;
            handle.then(handle => fs.closeAsync(handle));
        }
    }

    _getMaximumFileSize() {
        return this.youtubeDl.getAudioFileSize(true);
    }

    _getCurrentFileSizeAsync() {
        if (!this.handle) {
            if (this.closedFromOutside) {
                return Promise.resolve(-1);
            }
            this.handle = fs.openAsync(this.youtubeDl.getAudioFilePath(), "r");
        }
        return this.handle.then(handle => fs.fstatAsync(handle).get("size"));
    }

    _bytesRemaining() {
        return this.length - this.bytesRead;
    }

    _read(size) {
        if (this.closedFromOutside || this._bytesRemaining() <= 0) {
            this.push(null);
            return;
        }
        var howMuchToRead = +size > 0 ? +size : this._bytesRemaining();
        howMuchToRead = Math.min(this._bytesRemaining(), howMuchToRead);
        var self = this;
        this._getCurrentFileSizeAsync()
            .then(function fileSizeRetrieved(currentFileSize) {
                if (currentFileSize < 0) {
                    self.push(null);
                    return;
                }
                var position = self.offset + self.bytesRead;
                var canRead = self.youtubeDl.isAudioFileFinished() || position + howMuchToRead <= currentFileSize;

                if (self.youtubeDl.isAudioFileFinished()) {
                    self.length = Math.min(self.offset + self.desiredLength, self._getMaximumFileSize()) - self.offset;
                    howMuchToRead = +size > 0 ? +size : self._bytesRemaining();
                    howMuchToRead = Math.min(self._bytesRemaining(), howMuchToRead);
                }

                if (!canRead) {
                    var fileSizeGrowthNeeded = position + howMuchToRead - currentFileSize;
                    return Promise.delay((fileSizeGrowthNeeded / EXPECTED_BYTES_WRITTEN_PER_MILLISECOND) | 0).then(
                        () => {
                            return self._getCurrentFileSizeAsync().then(fileSizeRetrieved);
                        }
                    );
                } else {
                    if (!self.handle) {
                        if (self.closedFromOutside) {
                            self.push(null);
                            return;
                        }
                        self.handle = fs.openAsync(self.youtubeDl.getAudioFilePath(), "r");
                    }
                    return self.handle.then(handle => {
                        if (self.closedFromOutside || !self.handle) {
                            self.push(null);
                            return;
                        }
                        var buf = Buffer.allocUnsafe(howMuchToRead);
                        var offset = 0;
                        return (function readLoop(bytesRead) {
                            position += bytesRead;
                            self.bytesRead += bytesRead;
                            offset += bytesRead;
                            howMuchToRead -= bytesRead;
                            if (self.closedFromOutside || !self.handle) {
                                self.push(null);
                                return;
                            }

                            if (howMuchToRead > 0) {
                                return fs.readAsync(handle, buf, offset, howMuchToRead, position).then(readLoop);
                            } else {
                                self.push(buf);
                                if (self._bytesRemaining() <= 0) {
                                    self.push(null);
                                }
                            }
                        })(0);
                    });
                }
            })
            .catch(e => {
                this.abort();
                this.emit("error", e);
            });
    }

    abort() {
        if (this.closedFromOutside) {
            return;
        }
        this.closedFromOutside = true;
        this._clearHandle();
    }
}

class YoutubeDl extends EventEmitter {
    constructor(ytid) {
        super();
        this.ytid = ytid;
        this.handle = null;
        this.aborted = false;
        this.uid = (Math.random() + "").replace(/[^0-9]+/g, "");
        this.started = -1;
        this.audioFileData = null;
        this.logHandle = Promise.resolve();
        this.readStreams = [];
    }

    getDummyData() {
        return {
            duration: 0,
            title: "",
            realSize: -1,
            predictedSize: 0,
            bitRate: 0,
            handle: this.getHandle(),
        };
    }

    getHandle() {
        return this.uid + "-" + this.ytid;
    }

    getDataDir() {
        return path.join(DATA_ROOT, "data-" + this.getHandle());
    }

    getAudioFileName() {
        return this.ytid + ".mp3";
    }

    getAudioFilePath() {
        return path.join(this.getDataDir(), this.getAudioFileName());
    }

    getInfoFilePath() {
        return path.join(this.getDataDir(), "-.info.json");
    }

    getCookieFilePath() {
        return path.join(this.getDataDir(), "cookie.txt");
    }

    getLogFilePath() {
        return path.join(this.getDataDir(), "output.log");
    }

    log(message) {
        this.logHandle = this.logHandle.then(handle => {
            if (handle) {
                message = message instanceof Buffer ? message : Buffer.from(message + "", "utf8");
                var stream = fs.createWriteStream(null, {
                    flags: "a",
                    fd: handle,
                    autoClose: false,
                });
                return stream.endAsync(message).thenReturn(handle);
            }
        });
    }

    closeLogFile() {
        return this.logHandle.then(handle => {
            this.logHandle = Promise.resolve();
            if (handle) {
                return fs.closeAsync(handle);
            }
        });
    }

    closeStreams() {
        this.readStreams.forEach(readStream => readStream.abort());
        this.readStreams = [];
    }

    cleanup() {
        if (this.aborted) return;
        this.aborted = true;
        this.closeLogFile();
        this.closeStreams();
        if (this.handle) {
            return new Promise(resolve => {
                this.handle.on("exit", resolve);
            }).then(() => rimrafAsync(this.getDataDir()));
        } else {
            return rimrafAsync(this.getDataDir());
        }
    }

    // Client aborting the download process
    abort() {
        if (this.aborted) return;
        if (this.handle) this.handle.kill();
        return this.cleanup();
    }

    // Client starting the download process, returns a handle for the client from which .streamAudio() can immediately
    // be used to start streaming the audio.
    start() {
        if (this.handle || this.aborted) return;
        this.started = Date.now();
        return mkdirpAsync(this.getDataDir()).then(() => {
            if (this.aborted) {
                return rimrafAsync(this.getDataDir());
            }
            this.logHandle = fs.openAsync(this.getLogFilePath(), "a");
            return new Promise((resolve, reject) => {
                var stderr = "";
                var cwd = this.getDataDir();
                var shellCommand = [
                    "youtube-dl",
                    "--ignore-config",
                    "--no-color",
                    "--fixup",
                    "never",
                    "--no-mark-watched",
                    "--no-playlist",
                    "--no-mtime",
                    "-o",
                    "-",
                    "--restrict-filenames",
                    "-w",
                    "--write-info-json",
                    "--cache-dir",
                    CACHE_ROOT,
                    "--cookies",
                    this.getCookieFilePath(),
                    "--no-progress",
                    "--no-call-home",
                    "--no-check-certificate",
                    "--format",
                    "258/256/141/140/139/172/171/251/250/249/22/34/35/43/44/59/78/best",
                    "--no-post-overwrites",
                    "https://www.youtube.com/watch?v=" + this.ytid,
                    "|",
                    "/usr/bin/ffmpeg",
                    "-y",
                    "-i",
                    "pipe:0",
                    "-vn",
                    "-acodec",
                    "libshine",
                    "-b:a",
                    OUTPUT_BITRATE / 1000 + "k",
                    "file:" + this.getAudioFileName(),
                ].join(" ");

                this.emit("downloadStart");
                this.handle = spawn("sh", ["-c", shellCommand], {
                    cwd: cwd,
                });

                this.handle.stderr.on("data", data => {
                    stderr += data;
                    this.log(data);
                    // TODO: Use streaming parser to detect when info is ready.
                    if (!this.infoRetrieved && stderr.indexOf("[download] Destination:") >= 0) {
                        this.infoRetrieved = true;
                        resolve(
                            fs.readFileAsync(this.getInfoFilePath(), "utf8").then(result => {
                                if (this.aborted) {
                                    return this.getDummyData();
                                }
                                result = JSON.parse(result);
                                var self = this;
                                function statLoop() {
                                    return fs.statAsync(self.getAudioFilePath()).catch(e => {
                                        if (self.aborted) {
                                            return { size: 0 };
                                        }
                                        if (e && e.code === "ENOENT") {
                                            return Promise.delay(10).then(statLoop);
                                        }
                                        throw e;
                                    });
                                }

                                return Promise.delay(10)
                                    .then(statLoop)
                                    .then(() => {
                                        if (this.aborted) {
                                            return this.getDummyData();
                                        }

                                        var bitRate = OUTPUT_BITRATE;
                                        var predictedSize = (bitRate * result.duration) / 8;

                                        this.audioFileData = {
                                            duration: result.duration,
                                            title: result.title,
                                            predictedSize: predictedSize,
                                            realSize: -1,
                                            bitRate: bitRate,
                                            handle: this.getHandle(),
                                        };

                                        return this.audioFileData;
                                    });
                            })
                        );
                    }
                });

                this.handle.on("exit", code => {
                    this.emit("downloadEnd");
                    var success = +code === 0;
                    this.handle = null;
                    this.log("exited with code " + code);
                    if (!success) {
                        reject(new Error(stderr));
                    } else if (!this.aborted) {
                        fs.statAsync(this.getAudioFilePath())
                            .then(stat => {
                                if (this.audioFileData) {
                                    this.audioFileData.realSize = stat.size;
                                }
                            })
                            .catch(() => {});
                    }
                    this.closeLogFile();
                });

                this.handle.on("error", error => {
                    this.log((error && error.stack) || error + "");
                });
            });
        });
    }

    // Client has fully downloaded the file to IndexedDB
    confirmDownload() {
        return this.cleanup();
    }

    getAudioFileSize(overEstimate) {
        if (!this.audioFileData) {
            throw new Error("invalid call");
        }
        if (this.audioFileData.realSize >= 0) {
            return this.audioFileData.realSize;
        } else {
            return this.audioFileData.predictedSize + (overEstimate ? (OUTPUT_BITRATE / 8) * 5 : 0);
        }
    }

    isAudioFileFinished() {
        return this.audioFileData && this.audioFileData.realSize >= 0;
    }

    isDownloading() {
        if (this.handle || !this.isAudioFileFinished()) {
            return !this.aborted;
        }
        return false;
    }

    // Client requesting a chunk of the file
    streamAudio(offset, length) {
        if (this.aborted || !this.audioFileData) {
            throw new Error("invalid call");
        }
        var ret = new GrowingAudioFileReadable(this, offset, length);
        ret.on("end", () => {
            var index = this.readStreams.indexOf(ret);
            if (index >= 0) {
                this.readStreams.splice(index, 1);
            }
        });
        this.readStreams.push(ret);
        while (this.readStreams.length > MAX_CONCURRENT_READ_STREAMS) {
            this.readStreams.shift().abort();
        }
        return ret;
    }
}

module.exports = YoutubeDl;
