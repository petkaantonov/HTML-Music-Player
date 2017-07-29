import EventEmitter from "events";

export default class WorkerFrontend extends EventEmitter {
    constructor(frontendName, workerWrapper) {
        super();
        this._channel = null;
        this._readyPromise = null;
        this._frontendName = frontendName;
        this._workerWrapper = workerWrapper;
        this._bindToBackend();
    }

    async _bindToBackend() {
        const workerWrapper = this._workerWrapper;
        let resolveReady;
        this._readyPromise = new Promise((resolve) => {
            resolveReady = resolve;
        });

        const channel = await workerWrapper.getChannelForFrontend(this._frontendName);
        this._channel = channel;
        workerWrapper.registerFrontendListener(channel, this);
        resolveReady();
    }

    ready() {
        return this._readyPromise;
    }

    postMessage(args, transferList) {
        if (!this._channel) {
            throw new Error("attempting to send message before ready()")
        }
        this._workerWrapper.postMessage(this._channel, args, transferList);
    }

    receiveMessage(event) {
        throw new Error(`unimplemented receiveMessage in: ${this._frontendName} data: ${JSON.stringify(event.data)}`);
    }
}
