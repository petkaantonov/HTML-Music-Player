import {setTimers} from "util";
import AudioPlayerBackend from "audio/AudioPlayerBackend";
import TrackAnalyzerBackend from "tracks/TrackAnalyzerBackend";
import SearchBackend from "search/SearchBackend";
import UsageDataBackend from "usageData/UsageDataBackend";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import {fetch, Request, WebAssembly} from "platform/platform";
import Timers from "platform/Timers";

self.env = {
    isDevelopment() {
        return !(self.location.href.indexOf(`.min.js`) >= 0);
    }
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
    self.audioPlayerBackend = new AudioPlayerBackend(self.mainWasmModule, timers).start();
    self.trackAnalyzerBackend = new TrackAnalyzerBackend(self.mainWasmModule).start();
    self.searchBackend = new SearchBackend(self.trackAnalyzerBackend).start();
    self.usageDataBackend = new UsageDataBackend().start();
})();
