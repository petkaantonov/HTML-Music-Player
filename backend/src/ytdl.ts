import { spawn } from "child_process";
import fg from "fast-glob";
import { FastifyLoggerInstance } from "fastify";
import { constants } from "fs";
import * as fs from "fs/promises";
import { ChildProcess } from "node:child_process";
import { ReadableOptions } from "node:stream";
import { join } from "path";
import { YtId } from "shared/src/types";
import { Readable } from "stream";

const FS_CACHE_MAX_SIZE = 1024 * 1024 * 1024;
export const MAX_TIMEOUT_SECONDS = 20;
export const EXTENSION = "mp3";
export const BITRATE = 192000;
// 1 background downloader, 1 active stream, 1 passive stream (crossfading)
const MAX_CONCURRENT_DOWNLOADS = 3;
const currentDownloads: YtDownload[] = [];
const CACHE_DIR = "/opt/ytdl/cache";
const pathsAwaitingHandle: string[] = [];

class FdReadable extends Readable {
    private ytdl: YtDownload;
    private pointer: number = 0;
    private lastReceivedData: number = Date.now();
    private handle: fs.FileHandle | null = null;
    error: Error | null;

    constructor(opts: ReadableOptions, ytdl: YtDownload) {
        super(opts);
        this.ytdl = ytdl;
        this.error = null;
    }

    async _construct(callback: (err?: Error) => void) {
        try {
            const now = Date.now();
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const handle = await this.ytdl.getAudioFileHandle();
                if (handle) {
                    this.handle = handle;
                    callback();
                    this.emit("ready", this);
                    break;
                }
                await new Promise(r => setTimeout(r, 200));
                if (this.ytdl.isAborted()) {
                    const err = this.ytdl.getError();
                    this.error = err;
                    callback(err || undefined);
                    break;
                }
                if (Date.now() - now > MAX_TIMEOUT_SECONDS * 1000) {
                    const e = new ConnectionTimeoutError("timeout");
                    this.error = e;
                    callback(e);
                    break;
                }
            }
        } catch (e) {
            this.error = e;
            callback(e);
        }
    }

    async _read(bytes: number) {
        if (this.ytdl.isAborted()) {
            this.push(null);
            return;
        }
        const buffer = Buffer.alloc(bytes);
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (Date.now() - this.lastReceivedData > MAX_TIMEOUT_SECONDS * 1000) {
                this.error = new ConnectionTimeoutError("timeout");
                this.destroy(this.error);
                break;
            }
            try {
                const { bytesRead } = await this.handle!.read(buffer, 0, bytes, this.pointer);
                if (bytesRead! > 0) {
                    this.lastReceivedData = Date.now();
                    this.pointer = this.pointer + bytesRead!;
                    if (!this.push(buffer.slice(0, bytesRead!))) {
                        this.error = new Error("client abort");
                        this.destroy(this.error);
                    }
                    break;
                } else if (this.ytdl.isFinished()) {
                    this.push(null);
                    break;
                } else {
                    await new Promise(r => setTimeout(r, 200));
                }
            } catch (e) {
                this.error = e;
                this.destroy(e);
                return;
            }
        }
    }

    async _destroy(error: Error, callback: (err?: Error) => void) {
        if (error) {
            this.error = error;
        }
        try {
            await this.ytdl.abort(error);
            callback();
        } catch (e) {
            callback(e);
        }
        void this.ytdl.deleteFile();
    }
}

class YtDownload {
    private ytid: YtId;
    private aborted: boolean = false;
    private finished: boolean = false;
    private ytdlHandle: ChildProcess | null;
    private audioFilePath: string;
    private audioFileHandle: any | null = null;
    private logger: FastifyLoggerInstance;
    private stderr: string[] = [];
    private fileStream: FdReadable | null = null;
    private error: Error | null = null;

    constructor(ytid: YtId, logger: FastifyLoggerInstance) {
        this.ytid = ytid;
        this.ytdlHandle = null;
        this.logger = logger;
        this.audioFilePath = join(CACHE_DIR, `${this.fileName()}`);
    }

    private removeFromCurrentDownloads() {
        const i = currentDownloads.indexOf(this);
        if (i >= 0) {
            currentDownloads.splice(i, 1);
        }
    }

    private getYtDlCommand(): string {
        return `
        youtube-dl
        --ignore-config
        --no-color
        --abort-on-error
        --socket-timeout
        20
        --limit-rate
        512K
        --abort-on-unavailable-fragment
        --buffer-size
        64K
        --no-mtime
        -o
        -
        --cache-dir
        ${CACHE_DIR}
        --no-call-home
        --no-check-certificate
        --user-agent
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:88.0) Gecko/20100101 Firefox/88.0"
        --format
        bestaudio/best
        "https://www.youtube.com/watch?v=${this.ytid}"
        |
        /usr/bin/ffmpeg
        -y
        -i
        pipe:0
        -vn
        -acodec
        libmp3lame
        -b:a
        ${(BITRATE / 1000).toFixed(0)}k
        "${this.audioFilePath}"
        `
            .trim()
            .split("\n")
            .map(v => v.trim())
            .filter(Boolean)
            .join(" ");
    }

    getError() {
        return this.error;
    }

    isAborted() {
        return this.aborted;
    }

    isFinished() {
        return this.finished;
    }

    log(message: string, method: "info" | "error" = "info", data?: Object) {
        this.logger[method](`[YoutubeDL:${this.ytid}] ${message}${data ? " " + JSON.stringify(data) : ""}`);
    }

    fileName() {
        return ytIdToFileName(this.ytid);
    }

    fileType() {
        return "audio/mp3";
    }

    async getAudioFileHandle(): Promise<fs.FileHandle | null> {
        if (this.audioFileHandle) {
            return this.audioFileHandle;
        }
        try {
            const handle = await fs.open(this.audioFilePath, "r");
            this.audioFileHandle = handle;
            const index = pathsAwaitingHandle.indexOf(this.audioFilePath);
            if (index >= 0) {
                pathsAwaitingHandle.splice(index, 1);
            }
            // eslint-disable-next-line no-empty
        } catch {}
        return this.audioFileHandle || null;
    }

    async stream(): Promise<Readable> {
        if (this.fileStream) {
            return this.fileStream;
        }
        this.fileStream = new FdReadable(
            {
                highWaterMark: 64 * 1024,
            },
            this
        );
        const fs = this.fileStream;
        return new Promise((resolve, reject) => {
            fs.on("ready", resolve);
            fs.on("error", reject);
            fs.on("close", () => {
                if (fs.error) {
                    reject(classifyError(new YoutubeConnectionError("youtube connection error", this.stderr)));
                } else {
                    resolve(fs);
                }
            });
        });
    }

    private startYtDl() {
        pathsAwaitingHandle.push(this.audioFilePath);
        this.ytdlHandle = spawn("sh", ["-c", this.getYtDlCommand()], {
            stdio: ["pipe", "pipe", "pipe"],
        });
        this.ytdlHandle.stdout!.on("data", data => {
            if (process.env.SERVER_ENV === "development") {
                this.log(`${data}`);
            }
        });
        this.ytdlHandle.stderr!.on("data", data => {
            const strData = `${data}`;
            this.log(strData, "error");
            this.stderr.push(strData);
        });
        this.ytdlHandle.on("exit", code => {
            this.finished = true;
            this.ytdlHandle = null;
            void this.abort(code ? new Error("non 0 code") : undefined);
        });
        this.ytdlHandle.on("error", e => {
            void this.abort(e);
        });
    }

    async start(): Promise<Readable> {
        if (this.ytdlHandle) {
            throw new Error("start called twice");
        }
        const ret = this.stream();
        let fileWillExist = false;
        try {
            if (pathsAwaitingHandle.includes(this.audioFilePath)) {
                fileWillExist = true;
            } else {
                await fs.access(this.audioFilePath, constants.R_OK);
                await fs.utimes(this.audioFilePath, new Date(), new Date());
                fileWillExist = true;
            }
            // eslint-disable-next-line no-empty
        } catch {}

        if (!fileWillExist) {
            this.startYtDl();
        } else {
            this.finished = true;
        }

        return ret;
    }

    async abort(error?: Error) {
        const index = pathsAwaitingHandle.indexOf(this.audioFilePath);
        if (index >= 0) {
            pathsAwaitingHandle.splice(index, 1);
        }
        this.removeFromCurrentDownloads();
        if (this.aborted) {
            return;
        }
        if (error) {
            this.error = error;
            this.log(error.message, "error", this.stderr);
        } else {
            this.log("download successful");
        }
        this.aborted = true;

        if (this.ytdlHandle) {
            this.ytdlHandle.kill("SIGKILL");
            this.ytdlHandle = null;
        }
        if (this.audioFileHandle) {
            try {
                await this.audioFileHandle.close();
            } catch (e) {
                this.log(e.message, "error");
            }
            this.audioFileHandle = null;
        }
        if (this.fileStream) {
            try {
                this.fileStream.push(null);
                // eslint-disable-next-line no-empty
            } catch (e) {}
            this.fileStream = null;
        }
    }
    async deleteFile() {
        const files = await fg(CACHE_DIR + "/*.mp3", {
            absolute: true,
            onlyFiles: true,
            stats: true,
            suppressErrors: true,
        });

        let totalSize = 0;
        for (const file of files) {
            totalSize += file.stats!.size;
        }

        if (totalSize > FS_CACHE_MAX_SIZE) {
            this.log(`total size ${totalSize} exceeds maximum ${FS_CACHE_MAX_SIZE}, pruning`);
            files.sort((a, b) => {
                const atime = a.stats!.atimeMs;
                const btime = b.stats!.atimeMs;
                return atime - btime;
            });
            const filesToRemove = [];
            for (const file of files) {
                if (totalSize < FS_CACHE_MAX_SIZE / 2) {
                    break;
                }
                filesToRemove.push(file);
                totalSize -= file.stats!.size;
            }
            this.log(
                `removing ${filesToRemove}, most recently used ${filesToRemove[
                    filesToRemove.length - 1
                ].stats?.atime.toISOString()}`
            );
            for (const file of filesToRemove) {
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                fs.unlink(file.path).catch(() => {});
            }
        }
    }
}

function ytIdToFileName(ytId: YtId) {
    return `${ytId}.mp3`;
}

function classifyError(error: YoutubeConnectionError): SpecificYoutubeError | YoutubeConnectionError {
    const stderr = error.stderr.join("");
    if (stderr.includes("pipe:0: Invalid data found when processing input")) {
        return new YoutubeNotAvailableError("video unavailable or malformed");
    }
    if (stderr.toLowerCase().includes("cookie")) {
        return new YoutubeWrongCredentialsError("wrong credentials");
    }
    // TODO CAPTCHA ERROR
    return error;
}

export class ConnectionTimeoutError extends Error {}

export class YoutubeConnectionError extends Error {
    readonly stderr: string[];
    constructor(msg: string, stderr: string[]) {
        super(msg);
        this.stderr = stderr;
    }
}

export class SpecificYoutubeError extends Error {}
export class YoutubeNotAvailableError extends SpecificYoutubeError {}
export class YoutubeWrongCredentialsError extends SpecificYoutubeError {}

export class TooManyConcurrentDownloadsError extends Error {}

export function downloadYtId(ytId: YtId, logger: FastifyLoggerInstance): YtDownload {
    if (currentDownloads.length >= MAX_CONCURRENT_DOWNLOADS) {
        throw new TooManyConcurrentDownloadsError();
    }
    const ret = new YtDownload(ytId, logger);
    currentDownloads.push(ret);
    return ret;
}
