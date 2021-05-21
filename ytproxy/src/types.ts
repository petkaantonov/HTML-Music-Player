import * as io from "io-ts";

export const WorkerMessageStdout = io.type({
    type: io.literal("stdout"),
    message: io.string,
});
export type WorkerMessageStdout = io.TypeOf<typeof WorkerMessageStdout>;

export const WorkerMessageStderr = io.type({
    type: io.literal("stderr"),
    message: io.string,
});
export type WorkerMessageStderr = io.TypeOf<typeof WorkerMessageStderr>;

export const WorkerMessageExit = io.type({
    type: io.literal("exit"),
    code: io.number,
});
export type WorkerMessageExit = io.TypeOf<typeof WorkerMessageExit>;

export const WorkerMessage = io.union([WorkerMessageStdout, WorkerMessageStderr, WorkerMessageExit]);
export type WorkerMessage = io.TypeOf<typeof WorkerMessage>;
