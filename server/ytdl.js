
const Promise = require("bluebird");
const os = require("os");
const spawn = require("child_process").spawn;
const fs = Promise.promisifyAll(require("fs"));
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const path = require("path");
const mkdirpAsync = Promise.promisify(mkdirp);
const rimrafAsync = Promise.promisify(rimraf);

const dataRoot = path.join(os.tmpdir(), "soita");
const cacheRoot = path.join(dataRoot, "cache");
const OUTPUT_BITRATE = 192000;

mkdirp.sync(dataRoot);
mkdirp.sync(cacheRoot);

// Clean up started handles that are never aborted or confirmed

function YoutubeDl(ytid) {
    this.ytid = ytid;
    this.handle = null;
    this.aborted = false;
    this.uid = (Math.random() + "").replace(/[^0-9]+/g, "");
    this.started = null;
    this.audioFileData = null;
}

YoutubeDl.prototype.getDummyData = function() {
    return {
        duration: 0,
        title: "",
        currentSize: 0,
        predictedSize: 0,
        bitRate: 0,
        handle: this.getHandle()
    };
};

YoutubeDl.prototype.getHandle = function() {
    return this.uid + "-" + this.ytid;
};

YoutubeDl.prototype.getDataDir = function() {
    return path.join(dataRoot, "data-" + this.getHandle());
};

YoutubeDl.prototype.getAudioFilePath = function() {
    return path.join(this.getDataDir(), this.ytid + ".mp3");
};

YoutubeDl.prototype.getInfoFilePath = function() {
    return path.join(this.getDataDir(), "-.info.json");
};

YoutubeDl.prototype.getCookieFilePath = function() {
    return path.join(this.getDataDir(), "cookie.txt");
};

YoutubeDl.prototype.abort = function() {
    if (this.aborted) return;
    this.handle.kill();
    return this.confirmDl();
};

YoutubeDl.prototype.start = function() {
    if (this.handle || this.aborted) return;
    this.started = Date.now();
    return mkdirpAsync(this.getDataDir()).then(() => {
        return new Promise((resolve, reject) => {
            var stderr = "";
            var stdout = "";
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
                cacheRoot,
                "--cookies",
                this.getCookieFilePath(),
                "--no-progress",
                "--no-call-home",
                "--no-check-certificate",
                "--format",
                "258/256/141/140/139/172/171/251/250/249/22/34/35/43/44/59/78",
                "--no-post-overwrites",
                "https://www.youtube.com/watch?v=" + this.ytid,
                "|",
                "/usr/bin/ffmpeg",
                "-y",
                "-i",
                "pipe:0",
                "-vn",
                "-acodec",
                "libmp3lame",
                "-b:a",
                (OUTPUT_BITRATE / 1000) + "k",
                "file:" + this.ytid + ".mp3"].join(" ");

            this.handle = spawn("sh", ["-c", shellCommand], {
                cwd: cwd
            });

            this.handle.stdout.on("data", (data) => {
                console.log("stdout", data + "");
            });

            this.handle.stderr.on("data", (data) => {
                stderr += data;
                console.log("stderr", data + "");
                // TODO: Use streaming parser to detect when info is ready.
                if (!this.infoRetrieved && stderr.indexOf("[download] Destination:") >= 0) {
                    this.infoRetrieved = true;
                    resolve(fs.readFileAsync(this.getInfoFilePath(), "utf8").then(result => {
                        if (this.aborted) {
                            return this.getDummyData();
                        }
                        result = JSON.parse(result);
                        var self = this;
                        function statLoop() {
                            return fs.statAsync(self.getAudioFilePath()).catch(e => {
                                if (self.aborted) {
                                    return {size: 0};
                                }
                                if (e && e.code === "ENOENT") {
                                    return Promise.delay(25).then(statLoop);
                                }
                                throw e;
                            });
                        }

                        return Promise.delay(50).then(statLoop).get("size").then(currentSize => {
                            if (this.aborted) {
                                return this.getDummyData();
                            }

                            var statlol = false;
                            var lol = setInterval(() => {
                                if (statlol) return;
                                statlol = true;
                                if (this.handle) {
                                    fs.statAsync(this.getAudioFilePath()).get("size").then(size => {
                                        console.log("currentSize", size);
                                        statlol = false;
                                    });
                                } else {
                                    clearInterval(lol);
                                }
                            }, 30);

                            var bitRate = OUTPUT_BITRATE;
                            var predictedSize = (bitRate * result.duration) / 8;

                            this.audioFileData = {
                                duration: result.duration,
                                title: result.title,
                                currentSize: currentSize,
                                predictedSize: predictedSize,
                                bitRate: bitRate,
                                handle: this.getHandle()
                            };

                            console.log(this.audioFileData);

                            return this.audioFileData;
                        });
                    }));
                }
            });

            this.handle.on("exit", (code) => {
                this.handle = null;
                console.log("code", code);
                if ((+code) !== 0) {
                    reject(new Error(stderr));
                }
            });

            this.handle.on("error", (error) => {
                console.error(error && error.stack || error + "");
            });
        });
    });
};

YoutubeDl.prototype.confirmDl = function() {
    if (this.aborted) return;
    this.aborted = true;
    if (this.handle) {
        return new Promise(resolve => {
            this.handle.on("exit", resolve);
        }).then(() => rimrafAsync(this.getDataDir()));
    } else {
        return rimrafAsync(this.getDataDir());
    }
};

YoutubeDl.prototype.streamAudio = function(start, end) {
    if (this.aborted || !this.audioFileData) {
        throw new Error("invalid call");
    }
    /* Need a tailing stream

    var stream = fs.createReadStream(this.getAudioFilePath(), {
        start: 0,
        end: currentSize
    });*/
};

module.exports = YoutubeDl;
