import { FrontendName, ResultType } from "shared/src/worker/types";
import { PromiseResolve } from "shared/types/helpers";
import WorkerWrapper from "ui/WorkerWrapper";
import EventEmitter from "vendor/events";

export default abstract class WorkerFrontend<T extends ResultType> extends EventEmitter {
    _channel: string | null;
    _readyPromise: Promise<void> | null;
    _frontendName: FrontendName;
    _workerWrapper: WorkerWrapper;

    private _additionalReadyPromises: Promise<void>[] = [];

    constructor(frontendName: FrontendName, workerWrapper: WorkerWrapper) {
        super();
        this._channel = null;
        this._readyPromise = null;
        this._frontendName = frontendName;
        this._workerWrapper = workerWrapper;
        void this._bindToBackend();
    }
    abstract receiveMessageFromBackend(arg: T, transferList?: ArrayBuffer[]): void;

    addReadyPromise(promise: Promise<void>) {
        this._additionalReadyPromises.push(promise);
    }

    async _bindToBackend() {
        const workerWrapper = this._workerWrapper;
        let resolveReady: PromiseResolve<void>;
        this._readyPromise = new Promise(resolve => {
            resolveReady = resolve;
        });

        const channel = await workerWrapper.getChannelForFrontend(this._frontendName);
        this._channel = channel;
        workerWrapper.registerFrontendListener(channel, this);
        resolveReady!(undefined);
    }

    async ready() {
        await Promise.all([this._readyPromise, ...this._additionalReadyPromises]);
    }

    postMessageToBackend(action: string, opts: any, transferList?: Transferable[]) {
        if (!this._channel) {
            throw new Error(`attempting to send message before ready()`);
        }
        this._workerWrapper.postBackendMessage(this._channel, action, opts, transferList);
    }
}
