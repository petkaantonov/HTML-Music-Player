import Timers from "shared/platform/Timers";
import { setIsDevelopment, setTimers } from "shared/util";

import AudioVisualizerBackend from "./AudioVisualizerBackend";

const isDevelopment = process.env.NODE_ENV === "development";

export const env = {
    isDevelopment() {
        return isDevelopment;
    },
};

export const uiLog = function (...args: string[]) {
    self.postMessage({
        type: `uiLog`,
        args: args.map(v => (typeof v === "string" ? v : JSON.stringify(v))),
    });
};

self.addEventListener("error", uiLog as any);
self.addEventListener(`unhandledrejection`, event => {
    uiLog(event.reason.name, event.reason.message);
});

void (async () => {
    const timers = new Timers();
    setTimers(timers);
    setIsDevelopment(isDevelopment);
    new AudioVisualizerBackend().start();
})();
