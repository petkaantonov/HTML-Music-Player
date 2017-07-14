import {importScripts} from "platform/platform";
import Mp3Context from "audio/backend/mp3";

const codecs = new Map([
    [`mp3`, Mp3Context]
]);

let expectedCodec = null;
const loadCodec = function(name) {
    expectedCodec = null;
    const url = self.DEBUGGING === false ? `codecs/${name}.min.js` : `codecs/${name}.js`;
    importScripts(url);
    if (!expectedCodec || expectedCodec.name !== name) {
        throw new Error(`unable to load codec ${name} ${JSON.stringify(expectedCodec)}`);
    }
    return expectedCodec;
};

self.codecLoaded = function(name, Context) {
    expectedCodec = {
        name,
        Context
    };
};

export default function getCodec(name) {
    if (codecs.get(name)) return codecs.get(name);
    codecs.set(name, loadCodec(name));
    return codecs.get(name);
}
