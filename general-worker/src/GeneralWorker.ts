import TagDatabase from "shared/idb/TagDatabase";
import Timers from "shared/platform/Timers";
import { setIsDevelopment, setTimers } from "shared/util";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";

import MetadataManagerBackend from "./MetadataManagerBackend";
import SearchBackend from "./SearchBackend";

const isDevelopment = process.env.NODE_ENV === "development";

const env = {
    isDevelopment() {
        return isDevelopment;
    },
};

const uiLog = function (...args: string[]) {
    self.postMessage({
        type: `uiLog`,
        args: args.map(v => (typeof v === "string" ? v : JSON.stringify(v))),
    });
};

self.addEventListener("error", event => {
    uiLog(event.error.stack ? event.error.stack : event.error.message);
});
self.addEventListener(`unhandledrejection`, event => {
    uiLog(event.reason.name, event.reason.message);
});

void (async () => {
    const timers = new Timers();
    setTimers(timers);
    setIsDevelopment(isDevelopment);

    const request = new Request(process.env.GENERAL_WASM_PATH!, {
        cache: env.isDevelopment() ? `no-store` : `default`,
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    const mainWasmModule = new WebAssemblyWrapper(module, `general`);
    await mainWasmModule.start();

    const db = new TagDatabase();

    const searchBackend = new SearchBackend(db).start();
    new MetadataManagerBackend(mainWasmModule, db, searchBackend, uiLog).start();
})();
