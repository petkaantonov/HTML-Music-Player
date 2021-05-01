import TagDatabase from "shared/idb/TagDatabase";
import Timers from "shared/platform/Timers";
import { setIsDevelopment, setTimers } from "shared/util";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";

import AudioPlayerBackend from "./AudioPlayerBackend";

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

    const request = new Request(process.env.AUDIO_WASM_PATH!, {
        cache: env.isDevelopment() ? `no-store` : `default`,
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    const db = new TagDatabase();
    const mainWasmModule = new WebAssemblyWrapper(module, `audio`);
    await mainWasmModule.start();

    new AudioPlayerBackend(mainWasmModule, timers, db).start();
})();
