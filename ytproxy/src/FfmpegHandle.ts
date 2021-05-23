import { EventEmitter } from "events";
import { join } from "path";
import { assertNever, decode } from "shared/src/types/helpers";
import { Worker } from "worker_threads";

import CircularBuffer, { withHeaderDataZeroed } from "./CircularBuffer";
import { ParentMessage, ParentMessageInit, WorkerMessage } from "./types";

declare module "worker_threads" {
    interface Worker {
        readyReceived: boolean;
    }
}
//file cleanup
// server logs
interface Opts {
    filename: string;
    bitrate: number;
}
export default class FfmpegHandle extends EventEmitter {
    private worker: Worker | null;
    private killed = false;
    private inited = false;
    private dataSourceEnded = false;
    private circularBuffer: CircularBuffer | null;
    private backLog: Uint8Array[] = [];
    private backOffTimer: null | NodeJS.Timeout = null;
    private id: number;
    private opts: Opts;

    private constructor(worker: Worker, circularBuffer: CircularBuffer, id: number, opts: Opts) {
        super();
        this.worker = worker;
        this.circularBuffer = circularBuffer;
        this.id = id;
        this.opts = opts;
        worker.on("message", this.handleMessage);
        if (worker.readyReceived) {
            this.workerReady();
        }
    }

    handleMessage = (m: any) => {
        const d = decode(WorkerMessage, m);
        switch (d.type) {
            case "stderr":
                this.emit("stderr", d.message);
                break;
            case "stdout":
                this.emit("stdout", d.message);
                break;
            case "exit":
                this.kill();
                this.emit("exit", d.code);
                break;
            case "ack":
                if (d.id === this.id) {
                    this.init();
                } else {
                    this.kill();
                }
                break;
            case "ready":
                this.workerReady();
                break;
            case "initError":
                break;
            default:
                assertNever(d);
        }
    };

    init() {
        if (this.inited) {
            return;
        }
        this.inited = true;
        this.emit("setupDataSource");
    }

    postMessage(m: ParentMessage) {
        this.worker!.postMessage(m);
    }

    onDataSourceData(data: Uint8Array) {
        if (this.killed) {
            // Kill data
            return;
        }
        this.backLog.push(data);
        if (!this.backOffTimer) {
            this.processBacklog();
        }
    }

    processBacklog() {
        if (this.killed) {
            return;
        }
        if (this.backLog.length > 0) {
            do {
                const item = this.backLog.shift()!;
                const wrote = this.circularBuffer!.write(item);
                if (wrote < item.length) {
                    this.backLog.unshift(item.subarray(wrote));
                    this.backOffTimer = setTimeout(this.backedOffProcessBacklog, 50);
                    break;
                }
            } while (this.backLog.length > 0);
        }

        if (this.backLog.length === 0 && this.dataSourceEnded) {
            this.signalEof();
        }
    }

    backedOffProcessBacklog = () => {
        this.backOffTimer = null;
        this.processBacklog();
    };

    onDataSourceEnd() {
        if (this.killed || this.dataSourceEnded) {
            return;
        }
        this.dataSourceEnded = true;
        if (this.backLog.length === 0) {
            this.signalEof();
        }
    }

    workerReady() {
        if (this.inited || this.killed) {
            return;
        }
        this.postMessage({
            type: "newjob",
            args: [
                "-y",
                "-i",
                "pipe:0",
                "-vn",
                "-acodec",
                "libmp3lame",
                "-b:a",
                (this.opts.bitrate / 1000).toFixed(0) + "k",
                join(FfmpegHandle.audioCacheMemDir, this.opts.filename),
            ],
            id: this.id,
            sab: this.circularBuffer!.getSabRef(),
        });
    }

    signalEof() {
        if (this.killed) {
            return;
        }
        this.circularBuffer!.markEof();
    }

    kill() {
        if (this.killed) {
            return;
        }
        if (this.backOffTimer) {
            clearTimeout(this.backOffTimer);
            this.backOffTimer = null;
        }
        this.backLog = [];
        this.signalEof();
        this.worker!.removeListener("message", this.handleMessage);
        FfmpegHandle.sabPool.push(this.circularBuffer!.getSabRef());
        FfmpegHandle.workerPool.push(this.worker!);
        this.worker = null;
        this.circularBuffer = null;
        this.killed = true;
        this.emit("stopDataSource");
    }

    private static workerPool: Worker[] = [];
    private static sabPool: SharedArrayBuffer[] = [];
    private static nextId: number = 1;
    private static audioCacheDir: string;
    private static audioCacheMemDir: string;

    static setDirectories(dirs: { audioCacheDir: string; audioCacheMemDir: string }) {
        FfmpegHandle.audioCacheDir = dirs.audioCacheDir;
        FfmpegHandle.audioCacheMemDir = dirs.audioCacheMemDir;
    }

    static create(opts: Opts): FfmpegHandle {
        const sabPool = FfmpegHandle.sabPool;
        const sab = withHeaderDataZeroed(sabPool.length ? sabPool.shift()! : new SharedArrayBuffer(1024 * 1024));
        const cb = new CircularBuffer(sab);
        const workerPool = FfmpegHandle.workerPool;
        const worker = workerPool.length ? workerPool.shift()! : new Worker(process.env.WORKER_PATH!);
        if (!worker.readyReceived) {
            // eslint-disable-next-line no-inner-declarations
            function onMessage(m: any) {
                if (m.type === "ready") {
                    worker.readyReceived = true;
                    worker.removeListener("message", onMessage);
                } else if (m.type === "initError") {
                    // eslint-disable-next-line no-console
                    console.error("fatal " + m.message);
                    process.exit(1);
                }
            }
            worker.on("message", onMessage);
            const { audioCacheDir, audioCacheMemDir } = FfmpegHandle;
            worker.postMessage(decode(ParentMessageInit, { type: "init", audioCacheDir, audioCacheMemDir }));
        }
        return new FfmpegHandle(worker, cb, this.nextId++, opts);
    }
}
