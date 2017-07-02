import AudioPlayerBackend from "audio/AudioPlayerBackend";
import TrackAnalyzerBackend from "tracks/TrackAnalyzerBackend";
import SearchBackend from "search/SearchBackend";
import UsageDataBackend from "usageData/UsageDataBackend";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import {fetch, Request, WebAssembly} from "platform/platform";

self.env = {
    isDevelopment() {
        return !(self.location.href.indexOf(`.min.js`) >= 0);
    }
};

(async () => {
    // TODO: Compile from database in Production
    // TODO: minified
    const wasmBuild = `debug`;
    console.log(`using ${wasmBuild}`);
    const request = new Request(`wasm/main.${wasmBuild}.wasm`, {
        cache: `no-store`
    });
    const response = await fetch(request);
    if (!response.ok) {
        throw new Error(`response not ok: ${response.status}`);
    }
    const bufferSource = await response.arrayBuffer();
    const module = await WebAssembly.compile(bufferSource);
    self.mainWasmModule = new WebAssemblyWrapper(module, `main`);
    await self.mainWasmModule.start();
    self.audioPlayerBackend = new AudioPlayerBackend(self.mainWasmModule).start();
    self.trackAnalyzerBackend = new TrackAnalyzerBackend(self.mainWasmModule).start();
    self.searchBackend = new SearchBackend(self.trackAnalyzerBackend).start();
    self.usageDataBackend = new UsageDataBackend().start();
})();
