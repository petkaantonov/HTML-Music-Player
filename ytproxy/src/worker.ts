/* eslint-disable @typescript-eslint/no-namespace */
console.log = function (...args: any[]) {
    parentPort?.postMessage({
        type: "stdout",
        message: JSON.stringify(args),
    });
};
import * as fs from "fs";
import * as os from "os";
import { join } from "path";
import { decode } from "shared/types/helpers";
import sourceMapSupport from "source-map-support";
import createFfmpeg from "vendor/ffmpeg-core";
import { parentPort } from "worker_threads";

const lolBuffer = new Uint8Array(fs.readFileSync("abc.mp3").buffer);
let pointer = 0;
const max = lolBuffer.length;

sourceMapSupport.install({
    environment: "node",
});
Error.stackTraceLimit = 1000;

import { WorkerMessage, WorkerMessageExit, WorkerMessageStderr, WorkerMessageStdout } from "./types";

const queuedMessages: any[] = [];
parentPort!.on("message", v => {
    queuedMessages.push(v);
});

const audioCacheDir = join(os.homedir(), "YtProxyAudioCache");
try {
    fs.mkdirSync(audioCacheDir);
} catch (e) {
    if (e.code !== "EEXIST") {
        throw e;
    }
}

function postMessage(message: WorkerMessage) {
    parentPort!.postMessage(message);
}

declare global {
    namespace NodeJS {
        interface Global {
            fsMounts: { root: string; inmem: string }[];
            wasmStdin: (arr: Uint8Array, offset: number, length: number) => number;
            wasmStderr: (arr: Uint8Array, offset: number, length: number) => void;
            wasmStdout: (arr: Uint8Array, offset: number, length: number) => void;
        }
    }
}

global.fsMounts = [{ inmem: "/ytdata", root: audioCacheDir }];
global.wasmStdin = function (arr, offset, length) {
    const remaining = max - pointer;
    if (remaining <= 0) {
        return 0;
    }
    const readable = Math.min(remaining, length);
    const slice = lolBuffer.subarray(pointer, pointer + readable);
    pointer += readable;
    arr.set(slice, offset);
    return readable;
};
global.wasmStderr = function (arr, offset, length) {
    const message = Buffer.from(arr.buffer, offset, length).toString("utf-8");
    postMessage(
        decode(WorkerMessageStderr, {
            type: "stderr",
            message,
        })
    );
};
global.wasmStdout = function (arr, offset, length) {
    const message = Buffer.from(arr.buffer, offset, length).toString("utf-8");
    postMessage(
        decode(WorkerMessageStdout, {
            type: "stdout",
            message,
        })
    );
};

void (async () => {
    const em = await createFfmpeg({
        noInitialRun: true,
    });
    const rawRunMain = em.cwrap("main", "number", ["number", "number"]);
    const runMain = (userArgs: string[]) => {
        console.log("run main called", userArgs);
        try {
            const args = ["./ffmpeg", ...userArgs];
            const argc = args.length;
            const argv = em._malloc(args.length * Uint32Array.BYTES_PER_ELEMENT);
            if (argv === 0) {
                throw new Error("malloc returned 0");
            }
            let i = 0;
            for (const arg of args) {
                const ptr = em._malloc(arg.length + 1);
                if (ptr === 0) {
                    throw new Error("malloc returned 0");
                }
                em.writeAsciiToMemory(arg, ptr);
                em.setValue(argv + 4 * i, ptr, "i32");
                i++;
            }
            const code = rawRunMain(argc, argv);
            postMessage(
                decode(WorkerMessageExit, {
                    type: "exit",
                    code,
                })
            );
        } catch (e) {
            postMessage(
                decode(WorkerMessageExit, {
                    type: "exit",
                    code: 1,
                })
            );
        }
    };
    parentPort!.removeAllListeners();
    parentPort!.on("message", v => {
        runMain(v.args);
    });
    while (queuedMessages.length > 0) {
        const msg = queuedMessages.shift();
        runMain(msg.args);
    }
})().catch(e => {
    console.error(e.stack || e.message);
});
