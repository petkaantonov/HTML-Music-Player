import EventEmitter from "events";
import {console, self} from "platform/platform";

const VERBOSE_DEBUGGING = false;

function randomChannelId() {
    return `${Math.random()}${Math.random()}${Math.random()}`.replace(/[^0-9]/g, ``);
}

const channelsToBackends = new Map();

self.onmessage = function(event) {
    const backend = channelsToBackends.get(event.data.channel);
    if (!backend) {
        self.uiLog(`${event.data.channel} not found`);
        return;
    }

    const {args} = event.data;
    event.data.args = undefined;
    Object.assign(event.data, args);
    backend.receiveMessage(event);
};

export default class AbstractBackend extends EventEmitter {
    constructor(frontendName) {
        super();
        this._frontendName = frontendName;
        this._channel = randomChannelId();
        channelsToBackends.set(this._channel, this);
    }

    receiveMessage(event) {
        const action = this.actions[event.data.action];
        action.call(this, event.data.args);
    }

    postMessage(args, transferList) {
        if (VERBOSE_DEBUGGING) {
            console.info(`Receiving message from worker ${this._readyEventName}: ${JSON.stringify(args[0])}`);
        }
        if (!transferList) transferList = undefined;
        self.postMessage({channel: this._channel, args}, transferList);
    }

    start() {
        self.postMessage({type: `ready`, frontendName: this._frontendName, channel: this._channel});
        return this;
    }

    toString() {
        return this.constructor.name;
    }
}
