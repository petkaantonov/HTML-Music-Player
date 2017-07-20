import {setTimers, setIsDevelopment} from "util";
import AudioPlayerBackend from "audio/backend/AudioPlayerBackend";
import MetadataManagerBackend from "metadata/MetadataManagerBackend";
import SearchBackend from "search/SearchBackend";
import UsageDataBackend from "usageData/UsageDataBackend";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import {fetch, Request, WebAssembly} from "platform/platform";
import Timers from "platform/Timers";
import TagDatabase from "tracks/TagDatabase";

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
    const timers = new Timers(self);
    setTimers(timers);
    setIsDevelopment(isDevelopment);

    const wasmBuild = self.env.isDevelopment() ? `debug` : `release`;
    const request = new Request(`wasm/main.${wasmBuild}.wasm`, {
        cache: self.env.isDevelopment() ? `no-store` : `default`
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    self.mainWasmModule = new WebAssemblyWrapper(module, `main`);
    await self.mainWasmModule.start();

    const db = new TagDatabase();

    self.metadataManagerBackend = new MetadataManagerBackend(self.mainWasmModule, db, timers).start();
    self.audioPlayerBackend = new AudioPlayerBackend(self.mainWasmModule, timers, self.metadataManagerBackend).start();
    self.searchBackend = new SearchBackend().start();
    self.usageDataBackend = new UsageDataBackend(db).start();
})();
