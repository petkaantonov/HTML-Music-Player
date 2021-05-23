import {
    BackendCall,
    BackendWorkerMessageType,
    ChannelPromise,
    FrontendName,
    FrontendWorkerMessageType,
    MainWindowCall,
    mainWindowCalls,
    ReadyCall,
    UiLogCall,
} from "shared/src/worker/types";
import { decode, PromiseResolve } from "shared/types/helpers";
import { SelectDeps } from "ui/Application";
import Page from "ui/platform/dom/Page";
import WorkerFrontend from "ui/WorkerFrontend";

type Deps = SelectDeps<"page">;

export default class WorkerWrapper {
    _page: Page;
    _worker: Worker;
    _frontendNamesToChannels: Map<string, ChannelPromise | string | undefined>;
    _channelsToFrontends: Map<string, WorkerFrontend<any>>;
    constructor(src: string, deps: Deps) {
        this._page = deps.page;
        this._worker = new Worker(src);
        this._frontendNamesToChannels = new Map<FrontendName, ChannelPromise | string | undefined>();
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
                        if (promise && typeof promise !== "string") {
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

    postMessage(message: BackendWorkerMessageType, transferList?: Transferable[]) {
        this._worker.postMessage({ ...message, transferList }, { transfer: transferList });
    }

    postBackendMessage(channel: string, action: string, args: any[], transferList?: Transferable[]) {
        this.postMessage({ type: "frontendCall", channel, args, action }, transferList);
    }
}
