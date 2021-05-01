import { CodecName, codecPaths } from "shared/metadata";
import { Class } from "shared/types/helpers";

import Mp3Context from "./mp3";

type ContextType = Class<Mp3Context>;
interface ExpectedCodec {
    name: CodecName;
    Context: ContextType;
}

declare global {
    interface WorkerGlobalScope {
        codecLoaded: (name: CodecName, Context: ContextType) => void;
    }
}
declare let self: WorkerGlobalScope;

export type Decoder = Mp3Context;

const codecs = new Map<CodecName, ContextType>([[`mp3`, Mp3Context]]);

let expectedCodec: ExpectedCodec | null = null;
const loadCodec = function (name: CodecName): ExpectedCodec {
    expectedCodec = null;
    importScripts(codecPaths[name]!);
    expectedCodec = (expectedCodec as unknown) as ExpectedCodec | null;
    if (!expectedCodec || expectedCodec.name !== name) {
        throw new Error(`unable to load codec ${name} ${JSON.stringify(expectedCodec)}`);
    }
    return expectedCodec;
};

self.codecLoaded = function (name: CodecName, Context) {
    expectedCodec = {
        name,
        Context,
    };
};

export default function getCodec(name: CodecName) {
    if (codecs.get(name)) return codecs.get(name);
    const expectedCodec = loadCodec(name);
    codecs.set(name, expectedCodec.Context);
    return codecs.get(name);
}
