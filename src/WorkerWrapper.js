import {Worker} from "platform/platform";

export default class WorkerWrapper {
    constructor(src, deps) {
        this._page = deps.page;
        this._worker = new Worker(src);
        this._frontendNamesToChannels = new Map();
        this._channelsToFrontends = new Map();
        this._worker.addEventListener(`error`, (event) => {
            this._page.uiLog(event.message, event.filename, event.lineno, event.colno);
        });
        this._worker.addEventListener(`message`, (event) => {
            const {type} = event.data;
            if (type === `uiLog`) {
                this._page.uiLog(...event.data.args);
                return;
            } else if (type === `ready`) {
                const name = event.data.frontendName;
                const promise = this._frontendNamesToChannels.get(name);
                if (promise) {
                    promise.resolve(event.data.channel);
                }
                this._frontendNamesToChannels.set(name, event.data.channel);
            } else {
                const frontend = this._channelsToFrontends.get(event.data.channel);
                const args = event.data.args;
                event.data.args = undefined;
                Object.assign(event.data, args);
                frontend.receiveMessage(event);
            }
        }, false);
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
