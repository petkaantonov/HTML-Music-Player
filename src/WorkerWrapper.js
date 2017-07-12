import {Worker} from "platform/platform";

export default class WorkerWrapper {
    constructor(src, deps) {
        this._page = deps.page;
        this._worker = new Worker(src);
        this._postedMessagePorts = new Map();
        this._worker.addEventListener("error", (event) => {
            this._page.uiLog(event.message, event.filename, event.lineno, event.colno)
        });
        this._worker.addEventListener(`message`, (event) => {
            const {type} = event.data;
            if (type === "uiLog") {
                this._page.uiLog(...event.data.args);
                return;
            }
            const [postedPort] = event.ports;
            const currentPort = this._postedMessagePorts.get(type);
            this._postedMessagePorts.set(type, postedPort);
            if (currentPort) {
                currentPort.resolve(postedPort);
            }
        }, false);
    }

    getPort(eventName) {
        const port = this._postedMessagePorts.get(eventName);

        if (!port) {
            let resolve;
            const promise = new Promise((r) => {
                resolve = r;
            });
            this._postedMessagePorts.set(eventName, {promise, resolve});
            return promise;
        } else if (port.promise) {
            return port.promise;
        } else {
            return Promise.resolve(port);
        }
    }
}
