import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import {fetch, Request, WebAssembly} from "platform/platform";
import ZipperBackend from "zip/ZipperBackend";
const isDevelopment = !(self.location.href.indexOf(`.min.js`) >= 0);

self.env = {
    isDevelopment() {
        return isDevelopment;
    }
};

self.uiLog = function(...args) {
    self.postMessage({
        type: `uiLog`,
        args
    });
};

self.onerror = function(...args) {
    self.uiLog(...args);
};

if (self.addEventListener) {
    self.addEventListener(`unhandledrejection`, (event) => {
        self.uiLog(event.reason.stack);
    });
}

(async () => {

    const wasmBuild = self.env.isDevelopment() ? `debug` : `release`;
    const request = new Request(`wasm/zip.${wasmBuild}.wasm`, {
        cache: self.env.isDevelopment() ? `no-store` : `default`
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    self.zipWasmModule = new WebAssemblyWrapper(module, `zip`);
    await self.zipWasmModule.start();

    self.zipperBackend = new ZipperBackend(self.zipWasmModule).start();
})();
