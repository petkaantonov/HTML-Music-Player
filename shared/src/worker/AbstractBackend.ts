/* eslint-disable no-case-declarations */
import { setDebugConfig } from "shared/debug";
import EventEmitter from "vendor/events";

import {
    BackendWorkerMessageType,
    FrontendName,
    FrontendWorkerMessageType,
    MainWindowCalls,
    ResultPromise,
} from "./types";

function randomChannelId() {
    return `${Math.random()}${Date.now()}`.replace(/[^0-9]/g, ``);
}

let nextCallId = 0;
const mainWindowResultPromises = new Map<number, ResultPromise<any>>();
const channelsToBackends = new Map<string, AbstractBackend<any, FrontendName>>();

self.onmessage = function (event: MessageEvent<BackendWorkerMessageType>) {
    const data = event.data;
    switch (data.type) {
        case "callMainWindowResult":
            const { resolve, reject } = mainWindowResultPromises.get(data.callId)!;
            mainWindowResultPromises.delete(data.callId);
            if ("error" in data) {
                reject(data.error);
            } else {
                resolve(data.result);
            }
            break;
        case "frontendCall":
            const backend = channelsToBackends.get(data.channel)!;
            backend.receiveFrontendMessage(data.action, data.args, data.transferList);
            break;
        case "debugConfig":
            setDebugConfig(data.value);
            break;
    }
};

export const callMainWindow = function <T extends keyof MainWindowCalls>(
    name: T,
    ...args: Parameters<MainWindowCalls[T]>
): Promise<ReturnType<MainWindowCalls[T]>> {
    const callId = ++nextCallId;
    return new Promise((resolve, reject) => {
        mainWindowResultPromises.set(callId, { resolve, reject });
        postMessage({
            type: `callMainWindow`,
            name: name as any,
            args: args as any,
            callId,
        });
    });
};

function postMessage(message: FrontendWorkerMessageType, transferList?: Transferable[]) {
    //@ts-ignore
    self.postMessage(message, { transfer: transferList });
}

export default abstract class AbstractBackend<ActionType, F extends FrontendName> extends EventEmitter {
    protected actions: ActionType;
    _frontendName: F;
    _channel: string;
    _readyEventName: any;

    constructor(frontendName: F, actions: ActionType) {
        super();
        this.actions = actions;
        this._frontendName = frontendName;
        this._channel = randomChannelId();
        channelsToBackends.set(this._channel, this);
    }

    receiveFrontendMessage(action: string, args: any[] | any, transferList?: ArrayBuffer[]) {
        if (Array.isArray(args)) {
            (this.actions as any)[action]!.apply(this, [...args, transferList]);
        } else {
            (this.actions as any)[action]!.call(this, args, transferList);
        }
    }

    postMessageToFrontend(args: any[], transferList?: Transferable[]) {
        postMessage({ type: "backendCall", channel: this._channel, args, transferList }, transferList);
    }

    start() {
        postMessage({ type: `ready`, frontendName: this._frontendName, channel: this._channel });
        return this;
    }

    toString() {
        return this.constructor.name;
    }
}
