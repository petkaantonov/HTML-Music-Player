import {Worker, localStorage, webkitTemporaryStorage, webkitPersistentStorage} from "platform/platform";
import {fsPromisify} from "utils/indexedDbUtil";

const mainWindowCalls = {
    queryUsageAndQuota() {
        try {
            return fsPromisify(webkitTemporaryStorage, `queryUsageAndQuota`);
        } catch (e) {
            return [0, 0];
        }
    },

    requestPersistentQuota(size) {
        try {
            return fsPromisify(webkitPersistentStorage, `requestQuota`, size);
        } catch (e) {
            return 0;
        }
    },

    getLocalStorageItem(name) {
        return localStorage.getItem(name);
    },

    setLocalStorageItem(name, value) {
        return localStorage.setItem(name, value);
    }
};

export default class WorkerWrapper {
    constructor(src, deps) {
        this._page = deps.page;
        this._worker = new Worker(src);
        this._frontendNamesToChannels = new Map();
        this._channelsToFrontends = new Map();
        this._worker.addEventListener(`error`, (event) => {
            self.uiLog(event.message, event.filename, event.lineno, event.colno);
        });
        this._worker.addEventListener(`message`, (event) => {
            const {type} = event.data;
            if (type === `callMainWindow`) {
                const {name, args, callId} = event.data;
                this.callMainWindow(name, args, callId);
            } else if (type === `uiLog`) {
                self.uiLog(...event.data.args);
            } else if (type === `ready`) {
                const name = event.data.frontendName;
                const promise = this._frontendNamesToChannels.get(name);
                if (promise) {
                    promise.resolve(event.data.channel);
                }
                this._frontendNamesToChannels.set(name, event.data.channel);
            } else {
                const frontend = this._channelsToFrontends.get(event.data.channel);
                const {args} = event.data;
                event.data.args = undefined;
                Object.assign(event.data, args);
                frontend.receiveMessage(event);
            }
        }, false);
    }

    async callMainWindow(name, args, callId) {
        try {
            const result = await mainWindowCalls[name](...args);
            this._worker.postMessage({
                type: `callMainWindowResult`,
                result,
                callId
            });
        } catch (e) {
            this._worker.postMessage({
                type: `callMainWindowResult`,
                error: {
                    name: e.name,
                    message: e.message
                },
                callId
            });
        }
    }

    registerFrontendListener(channel, frontend) {
        this._channelsToFrontends.set(channel, frontend);
    }

    getChannelForFrontend(frontendName) {
        const channel = this._frontendNamesToChannels.get(frontendName);

        if (channel) {
            return channel.promise ? channel.promise : Promise.resolve(channel);
        } else {
            let resolve;
            const promise = new Promise((r) => {
                resolve = r;
            });
            this._frontendNamesToChannels.set(frontendName, {promise, resolve});
            return promise;
        }
    }

    postMessage(channel, args, transferList) {
        this._worker.postMessage({channel, args}, transferList);
    }
}
