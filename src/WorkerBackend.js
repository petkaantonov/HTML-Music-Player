import {setTimers} from "util";
import AudioPlayerBackend from "audio/AudioPlayerBackend";
import TrackAnalyzerBackend from "tracks/TrackAnalyzerBackend";
import SearchBackend from "search/SearchBackend";
import UsageDataBackend from "usageData/UsageDataBackend";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import {fetch, Request, WebAssembly} from "platform/platform";
import Timers from "platform/Timers";
import MetadataParser from "audio/MetadataParser";
import TagDatabase from "tracks/TagDatabase";

self.env = {
    isDevelopment() {
        return !(self.location.href.indexOf(`.min.js`) >= 0);
    }
};

self.uiLog = function(...args) {
    self.postMessage({
        type: "uiLog",
        args: args
    });
};

self.onerror = function(...args) {
    self.uiLog(...args);
};

(async () => {
    const timers = new Timers(self);
    setTimers(timers);

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
    const metadataParser = new MetadataParser(db);

    self.audioPlayerBackend = new AudioPlayerBackend(self.mainWasmModule, timers, db, metadataParser).start();
    self.trackAnalyzerBackend = new TrackAnalyzerBackend(self.mainWasmModule, db, metadataParser).start();
    self.searchBackend = new SearchBackend(self.trackAnalyzerBackend).start();
    self.usageDataBackend = new UsageDataBackend().start();
})();
