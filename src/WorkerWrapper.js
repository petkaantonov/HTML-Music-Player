import {Worker} from "platform/platform";

export default class WorkerWrapper {
    constructor(src) {
        this._worker = new Worker(src);
        this._postedMessagePorts = new Map();
        this._worker.addEventListener(`message`, (event) => {
            const {type} = event.data;
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
            console.log(`resolving with port`, port);
            return Promise.resolve(port);
        }
    }
}
