import * as io from "io-ts";
import { ioTypeFromClass } from "shared/src/types/helpers";

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
export const WorkerMessageReady = io.type({
    type: io.literal("ready"),
});
export type WorkerMessageReady = io.TypeOf<typeof WorkerMessageReady>;

export const WorkerMessageAck = io.type({
    type: io.literal("ack"),
    id: io.number,
});
export type WorkerMessageAck = io.TypeOf<typeof WorkerMessageAck>;

export const WorkerMessageInitError = io.type({
    type: io.literal("initError"),
    message: io.string,
});
export type WorkerMessageInitError = io.TypeOf<typeof WorkerMessageInitError>;

export const ParentMessageNewJob = io.type({
    type: io.literal("newjob"),
    id: io.number,
    sab: ioTypeFromClass(SharedArrayBuffer),
    args: io.array(io.string),
});
export type ParentMessageNewJob = io.TypeOf<typeof ParentMessageNewJob>;
export const ParentMessageInit = io.type({
    type: io.literal("init"),
    audioCacheDir: io.string,
    audioCacheMemDir: io.string,
});
export type ParentMessageInit = io.TypeOf<typeof ParentMessageInit>;

export const ParentMessage = io.union([ParentMessageNewJob, ParentMessageInit]);
export type ParentMessage = io.TypeOf<typeof ParentMessage>;
export const WorkerMessage = io.union([
    WorkerMessageStdout,
    WorkerMessageStderr,
    WorkerMessageExit,
    WorkerMessageReady,
    WorkerMessageAck,
    WorkerMessageInitError,
]);
export type WorkerMessage = io.TypeOf<typeof WorkerMessage>;
