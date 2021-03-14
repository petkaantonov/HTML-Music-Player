import { SelectDeps } from "Application";
import * as io from "io-ts";
import Page from "platform/dom/Page";
import { decode, PromiseResolve } from "types/helpers";
import WorkerFrontend, { FrontendName } from "WorkerFrontend";

import { capitalize } from "./util";

export const SerializableError = io.partial({
    name: io.string,
    message: io.string,
    stack: io.string,
});
export type SerializableError = io.TypeOf<typeof SerializableError>;

const mainWindowCalls = {
    getLocalStorageItem(name: string) {
        return localStorage.getItem(name);
    },

    setLocalStorageItem(name: string, value: any) {
        return localStorage.setItem(name, value);
    },
};

export type MainWindowCalls = typeof mainWindowCalls;

const createMainWindowCallType = <Key extends keyof typeof mainWindowCalls>(
    name: Key,
    args: io.Type<Parameters<typeof mainWindowCalls[Key]>>,
    returnType: io.Type<ReturnType<typeof mainWindowCalls[Key]>>
): {
    [K in Key as `${Capitalize<string & K>}Call`]: typeof call;
} &
    {
        [K in Key as `${Capitalize<string & K>}Result`]: typeof result;
    } => {
    const call = io.type({
        name: io.literal(name),
        type: io.literal("callMainWindow"),
        callId: io.number,
        args: args,
    });
    const result = io.intersection([
        io.type({
            name: io.literal(name),
            type: io.literal("callMainWindowResult"),
            callId: io.number,
        }),
        io.union([io.type({ result: returnType }), io.type({ error: SerializableError })]),
    ]);

    return {
        [`${capitalize(name)}Call`]: call,
        [`${capitalize(name)}Result`]: result,
    } as any;
};
const { GetLocalStorageItemCall, GetLocalStorageItemResult } = createMainWindowCallType(
    "getLocalStorageItem",
    io.tuple([io.string]),
    io.union([io.string, io.null])
);
const { SetLocalStorageItemCall, SetLocalStorageItemResult } = createMainWindowCallType(
    "setLocalStorageItem",
    io.tuple([io.string, io.any]),
    io.void
);
export const MainWindowCall = io.union([GetLocalStorageItemCall, SetLocalStorageItemCall]);
export const MainWindowCallResult = io.union([GetLocalStorageItemResult, SetLocalStorageItemResult]);
export type MainWindowCall = io.TypeOf<typeof MainWindowCall>;
export type MainWindowCallResult = io.TypeOf<typeof MainWindowCallResult>;

export const UiLogCall = io.type({
    type: io.literal("uiLog"),
    args: io.array(io.string),
});

export type UiLogCall = io.TypeOf<typeof UiLogCall>;

export const ReadyCall = io.type({
    type: io.literal("ready"),
    channel: io.string,
    frontendName: FrontendName,
});

export type ReadyCall = io.TypeOf<typeof ReadyCall>;

export const FrontendCall = io.intersection([
    io.type({
        type: io.literal("frontendCall"),
        channel: io.string,
        args: io.array(io.any),
        action: io.string,
    }),
    io.partial({
        transferList: io.array(io.any),
    }),
]);

export type FrontendCall = io.TypeOf<typeof FrontendCall>;

export const BackendCall = io.intersection([
    io.type({
        type: io.literal("backendCall"),
        channel: io.string,
        args: io.array(io.any),
    }),
    io.partial({
        transferList: io.array(io.any),
    }),
]);

export type BackendCall = io.TypeOf<typeof BackendCall>;

export type FrontendWorkerMessageType = BackendCall | UiLogCall | ReadyCall | MainWindowCall;
export type BackendWorkerMessageType = MainWindowCallResult | FrontendCall;

export interface ResultPromise<T> {
    resolve: (d: T) => void;
    reject: (d: SerializableError) => void;
}

type Deps = SelectDeps<"page">;

interface ChannelPromise {
    resolve: PromiseResolve<string>;
    promise: Promise<string>;
}

export default class WorkerWrapper {
    _page: Page;
    _worker: Worker;
    _frontendNamesToChannels: Map<string, ChannelPromise | string>;
    _channelsToFrontends: Map<string, WorkerFrontend<any>>;
    constructor(src: string, deps: Deps) {
        this._page = deps.page;
        this._worker = new Worker(src);
        this._frontendNamesToChannels = new Map<FrontendName, ChannelPromise | string>();
        this._channelsToFrontends = new Map<string, WorkerFrontend<any>>();
        this._worker.addEventListener(`error`, (event: ErrorEvent) => {
            uiLog(event.message, event.filename, event.lineno + "", event.colno + "");
        });
        this._worker.addEventListener(
            `message`,
            (event: MessageEvent<FrontendWorkerMessageType>) => {
                const data = event.data;
                switch (data.type) {
                    case "callMainWindow": {
                        const call = decode(MainWindowCall, data);
                        void this.callMainWindow(call);
                        break;
                    }
                    case "uiLog": {
                        const call = decode(UiLogCall, data);
                        uiLog(...call.args);
                        break;
                    }
                    case "ready": {
                        const call = decode(ReadyCall, event.data);
                        const name = call.frontendName;
                        const promise = this._frontendNamesToChannels.get(name)!;
                        if (typeof promise !== "string") {
                            promise.resolve(call.channel);
                        }
                        this._frontendNamesToChannels.set(name, call.channel);
                        break;
                    }
                    case "backendCall": {
                        const call = decode(BackendCall, event.data);
                        const frontend = this._channelsToFrontends.get(call.channel)!;
                        frontend.receiveMessageFromBackend(call.args[0], call.transferList as ArrayBuffer[]);
                        break;
                    }
                }
            },
            false
        );
    }

    async callMainWindow(call: MainWindowCall) {
        const type = `callMainWindowResult`;

        try {
            const callId = call.callId;
            switch (call.name) {
                case "getLocalStorageItem":
                    this.postMessage({
                        type,
                        name: call.name,
                        result: mainWindowCalls.getLocalStorageItem(call.args[0]),
                        callId,
                    });
                    break;
                case "setLocalStorageItem":
                    this.postMessage({
                        type,
                        name: call.name,
                        result: mainWindowCalls.setLocalStorageItem(call.args[0], call.args[1]),
                        callId,
                    });
                    break;
                default:
                    throw new Error("unkown main window method name " + name);
            }
        } catch (e) {
            this.postMessage({
                type,
                error: {
                    name: e.name,
                    message: e.message,
                },
                name: call.name as any,
                callId: call.callId,
            });
        }
    }

    registerFrontendListener(channel: string, frontend: WorkerFrontend<any>) {
        this._channelsToFrontends.set(channel, frontend);
    }

    getChannelForFrontend(frontendName: FrontendName) {
        const channel = this._frontendNamesToChannels.get(frontendName);

        if (channel) {
            return typeof channel === "string" ? Promise.resolve(channel) : channel.promise;
        } else {
            let resolve: PromiseResolve<string>;
            const promise = new Promise<string>(r => {
                resolve = r;
            });
            this._frontendNamesToChannels.set(frontendName, { promise, resolve: resolve! });
            return promise;
        }
    }

    postMessage(message: BackendWorkerMessageType, transferList?: ArrayBuffer[]) {
        this._worker.postMessage({ ...message, transferList }, { transfer: transferList });
    }

    postBackendMessage(channel: string, action: string, args: any[], transferList?: ArrayBuffer[]) {
        this.postMessage({ type: "frontendCall", channel, args, action }, transferList);
    }
}
