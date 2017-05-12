
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
    this.ffmpegStarted = false;
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
            var args = ["--ignore-config",
                         "--no-color",
                         "--no-mark-watched",
                         "--no-playlist",
                         "--no-mtime",
                         "-o",
                         this.ytid + ".%(ext)s",
                         "--restrict-filenames",
                         "-w",
                         "--write-info-json",
                         "--cache-dir",
                         cacheRoot,
                         "--cookies",
                         path.join(this.getDataDir(), "cookies"),
                         "--no-progress",
                         "--no-call-home",
                         "--no-check-certificate",
                         "-x",
                         "--format",
                         "258/256/141/140/139/172/171/251/250/249/22/34/35/43/44/59/78",
                         "--audio-format",
                         "mp3",
                         "--audio-quality",
                         (OUTPUT_BITRATE / 1000) + "",
                         "--no-post-overwrites",
                         "--prefer-ffmpeg",
                         "--ffmpeg-location",
                         "/usr/bin/ffmpeg",
                         "https://www.youtube.com/watch?v=" + this.ytid];
            this.handle = spawn("youtube-dl", args, {cwd: cwd});
            this.handle.stdout.on("data", (data) => {
                // TODO: Use streaming parser to detect when ffmpeg is ready.
                stdout += data;
                if (!this.ffmpegStarted && stdout.indexOf("[ffmpeg] Des") >= 0) {
                    this.ffmpegStarted = true;
                    resolve(fs.readFileAsync(path.join(this.getDataDir(), this.ytid + ".info.json"), "utf8").then(result => {
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
                            var bitRate;
                            if (/mp3/.test(result.acodec + "")) {
                                bitRate = result.abr * 1000;
                            } else {
                                bitRate = OUTPUT_BITRATE;
                            }

                            var predictedSize = (bitRate * result.duration) / 8;

                            this.audioFileData = {
                                duration: result.duration,
                                title: result.title,
                                currentSize: currentSize,
                                predictedSize: predictedSize,
                                bitRate: bitRate,
                                handle: this.getHandle()
                            };

                            return this.audioFileData;
                        });
                    }));
                }
            });

            this.handle.stderr.on("data", (data) => {
                stderr += data;
                // LOG ERROR
            });

            this.handle.on("exit", (code) => {
                this.handle = null;
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
