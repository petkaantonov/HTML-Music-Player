import EventEmitter from "events";

export default class WorkerFrontend extends EventEmitter {
    constructor(readyEventName, workerWrapper) {
        super();
        this._messagePort = null;
        this._readyPromise = null;
        this._readyEventName = readyEventName;
        this._bindBackend(readyEventName, workerWrapper);
    }

    async _bindBackend(readyEventName, workerWrapper) {
        let resolveReady;
        this._readyPromise = new Promise((resolve) => {
         resolveReady = resolve;
        });
        const port = workerWrapper.getPort(readyEventName);
        this._messagePort = await port;
        this._messagePort.addEventListener(`message`, event => this.receiveMessage(event), false);
        this._messagePort.start();
        resolveReady();
    }

    ready() {
        return this._readyPromise;
    }

    postMessage(...args) {
        this._messagePort.postMessage(...args);
    }

    receiveMessage(event) {
        throw new Error(`unimplemented receiveMessage in: ${this._readyEventName} data: ${JSON.stringify(event.data)}`);
    }
}
