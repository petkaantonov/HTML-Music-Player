/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-namespace */
import { assertNever, decode } from "shared/types/helpers";
import createFfmpeg, { Module } from "vendor/ffmpeg-core";
import { parentPort } from "worker_threads";

import CircularBuffer from "./CircularBuffer";
import {
    ParentMessage,
    ParentMessageInit,
    ParentMessageNewJob,
    WorkerMessage,
    WorkerMessageExit,
    WorkerMessageStderr,
    WorkerMessageStdout,
} from "./types";

console.log = function (...args: any[]) {
    postMessage({
        type: "stdout",
        message: JSON.stringify(args),
    });
};
console.error = console.warn = function (...args: any[]) {
    postMessage({
        type: "stderr",
        message: JSON.stringify(args),
    });
};
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

let currentBuffer: CircularBuffer | null = null;
global.wasmStdin = function (HEAP8, offset, length) {
    const buffer = HEAP8.subarray(offset, offset + length);
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const bytesRead = currentBuffer!.read(buffer);
        if (bytesRead > 0) {
            return bytesRead;
        } else if (currentBuffer!.isEof()) {
            return 0;
        }
    }
};
global.wasmStderr = function (HEAP8, offset, length) {
    const message = Buffer.from(HEAP8.buffer, offset, length).toString("utf-8");
    postMessage(
        decode(WorkerMessageStderr, {
            type: "stderr",
            message,
        })
    );
};
global.wasmStdout = function (HEAP8, offset, length) {
    const message = Buffer.from(HEAP8.buffer, offset, length).toString("utf-8");
    postMessage(
        decode(WorkerMessageStdout, {
            type: "stdout",
            message,
        })
    );
};

let em: Module | null = null;
let runMain: ((sab: SharedArrayBuffer, userArgs: string[]) => void) | null = null;
parentPort?.on("message", (m: any) => {
    const pm = decode(ParentMessage, m);
    switch (pm.type) {
        case "init":
            void init(pm);
            break;
        case "newjob":
            newJob(pm);
            break;
        default:
            assertNever(pm);
    }
});

async function init(m: ParentMessageInit) {
    global.fsMounts = [{ inmem: m.audioCacheMemDir, root: m.audioCacheDir }];
    try {
        em = await createFfmpeg({
            noInitialRun: true,
        });
    } catch (e) {
        postMessage({ type: "initError", message: e.message });
        return;
    }
    const rawRunMain = em.cwrap("main", "number", ["number", "number"]) as (argc: number, argv: number) => number;
    runMain = (sab: SharedArrayBuffer, userArgs: string[]) => {
        currentBuffer = new CircularBuffer(sab);
        const freeList = [];
        try {
            const args = ["./ffmpeg", ...userArgs];
            const argc = args.length;
            const argv = em!._malloc(args.length * Uint32Array.BYTES_PER_ELEMENT);
            if (argv === 0) {
                throw new Error("malloc returned 0");
            }
            freeList.push(argv);
            let i = 0;
            for (const arg of args) {
                const ptr = em!._malloc(arg.length + 1);
                if (ptr === 0) {
                    throw new Error("malloc returned 0");
                }
                freeList.push(ptr);
                em!.writeAsciiToMemory(arg, ptr);
                em!.setValue(argv + 4 * i, ptr, "i32");
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
                    code: e.message === "unreachable" ? 0 : 1,
                })
            );
        } finally {
            currentBuffer = null;
            for (const ptr of freeList) {
                em!._free(ptr);
            }
        }
    };
    postMessage({ type: "ready" });
}

function newJob(m: ParentMessageNewJob) {
    postMessage({ type: "ack", id: m.id });
    runMain!(m.sab, m.args);
}

process.on("uncaughtException", e => {
    console.error(e.message);
});
process.on("unhandledRejection", e => {
    console.error((e && (e as any).message) || "error");
});
