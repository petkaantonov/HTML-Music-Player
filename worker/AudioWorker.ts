import AudioPlayerBackend from "audio/AudioPlayerBackend";
import Timers from "src/platform/Timers";
import { setIsDevelopment, setTimers } from "src/util";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";

const isDevelopment = !(self.location.href.indexOf(`.min.js`) >= 0);

export const env = {
    isDevelopment() {
        return isDevelopment;
    },
};

export const uiLog = function (...args: any[]) {
    self.postMessage({
        type: `uiLog`,
        args: args.map(v => (typeof v === "string" ? v : JSON.stringify(v))),
    });
};

self.addEventListener("error", uiLog);
self.addEventListener(`unhandledrejection`, event => {
    uiLog(event.reason.name, event.reason.message);
});

// eslint-disable-next-line @typescript-eslint/no-empty-function
let resolveFunction: (value: void) => void = () => {};
// eslint-disable-next-line @typescript-eslint/no-empty-function
let rejectFunction: (value: Error) => void = () => {};
export const workerReady: Promise<void> = new Promise((res, rej) => {
    resolveFunction = res;
    rejectFunction = rej;
});

(async () => {
    const timers = new Timers(self);
    setTimers(timers);
    setIsDevelopment(isDevelopment);

    const wasmBuild = env.isDevelopment() ? `debug` : `release`;
    const request = new Request(`wasm/main.${wasmBuild}.wasm`, {
        cache: env.isDevelopment() ? `no-store` : `default`,
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    const mainWasmModule = new WebAssemblyWrapper(module, `main`);
    await mainWasmModule.start();

    new AudioPlayerBackend(mainWasmModule, timers).start();
    resolveFunction();
})().then(undefined, rejectFunction);
