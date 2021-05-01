import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";

import ZipperBackend from "./ZipperBackend";

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
    const request = new Request(process.env.ZIPPER_WASM_PATH!, {
        cache: env.isDevelopment() ? `no-store` : `default`,
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    const zipWasmModule = new WebAssemblyWrapper(module, `zip`);
    await zipWasmModule.start();

    new ZipperBackend(zipWasmModule, uiLog).start();
})();
