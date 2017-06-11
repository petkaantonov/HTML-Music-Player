import EventEmitter from "events";
import {MessageChannel, console, self} from "platform/platform";

const VERBOSE_DEBUGGING = false;

export default class AbstractBackend extends EventEmitter {
    constructor(readyEventName) {
        super();
        this._readyEventName = readyEventName;
        this._channel = new MessageChannel();
    }

    receiveMessage(event) {
        const action = this.actions[event.data.action];
        action.call(this, event.data.args);
    }

    postMessage(...args) {
        if (VERBOSE_DEBUGGING) {
            console.info(`Receiving message from worker ${this._readyEventName}: ${JSON.stringify(args[0])}`);
        }
        this._channel.port1.postMessage(...args);
    }

    start() {
        this._channel.port1.addEventListener(`message`,
                                             event => this.receiveMessage(event),
                                             false);
        self.postMessage({type: this._readyEventName}, [this._channel.port2]);
        this._channel.port1.start();
        return this;
    }

    toString() {
        return this.constructor.name;
    }
}
