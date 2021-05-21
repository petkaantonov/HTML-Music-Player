/* eslint-disable @typescript-eslint/no-namespace */
import EventEmitter from "events";
import { decode } from "shared/types/helpers";
import sourceMapSupport from "source-map-support";
import { Worker } from "worker_threads";

import { WorkerMessage } from "./types";

sourceMapSupport.install({
    environment: "node",
});

declare module "worker_threads" {
    interface Worker {
        online: boolean;
    }
}

const worker = new Worker(process.env.WORKER_PATH!);
//ringbuffer
//send data
//life cycle
class FfmpegHandle extends EventEmitter {
    private worker: Worker;
    private killed = false;

    private constructor(worker: Worker) {
        super();
        this.worker = worker;
        worker.on("message", this.handleMessage);
        // setup ring buffers
        // send message with params to begin
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
            default:
                // eslint-disable-next-line no-console
                console.error("unknown message", m);
        }
    };

    signalEof() {}

    sendData() {}

    kill() {
        if (this.killed) {
            return;
        }
        this.signalEof();
        // Wait for the signal before returning to pool
        this.killed = true;
        this.worker.removeListener("message", this.handleMessage);
        FfmpegHandle.pool.push(this.worker);
    }

    static pool: Worker[] = [];

    static create(): FfmpegHandle {
        if (FfmpegHandle.pool.length > 4) {
            console.log("possible memory leak");
        }
        const pool = FfmpegHandle.pool;
        const worker = pool.length ? pool.shift()! : new Worker(process.env.WORKER_PATH!);
        if (!worker.online) {
            worker.on("online", () => {
                worker.online = true;
            });
        }
        return new FfmpegHandle(worker);
    }
}

worker.on("message", v => {
    console.log(v.message);
});

worker.on("online", () => {
    worker.postMessage({
        args: ["-y", "-i", "pipe:0", "-vn", "-acodec", "libmp3lame", "-b:a", "192k", "/ytdata/lol.mp3"],
    });
});

worker.on("error", data => {
    console.log("crash", data);
});
