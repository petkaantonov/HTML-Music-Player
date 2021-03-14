import { AudioPlayerResult } from "audio/AudioPlayerFrontend";
///@ts-ignore
import EventEmitter from "eventsjs";
import * as io from "io-ts";
import { MetadataResult } from "metadata/MetadataManagerFrontend";
import { SearchWorkerResult } from "search/SearchController";
import { PromiseResolve } from "types/helpers";
import { AudioVisualizerResult } from "visualization/AudioVisualizerFrontend";
import WorkerWrapper from "WorkerWrapper";
import { ZipperResult } from "zip/ZipperFrontend";

export const FrontendName = io.keyof({
    audio: null,
    zipper: null,
    visualizer: null,
    metadata: null,
    search: null,
});
export type FrontendName = io.TypeOf<typeof FrontendName>;

type ResultType = MetadataResult | ZipperResult | AudioPlayerResult | AudioVisualizerResult | SearchWorkerResult;

export default class WorkerFrontend<T extends ResultType> extends EventEmitter {
    _channel: string | null;
    _readyPromise: Promise<void> | null;
    _frontendName: FrontendName;
    _workerWrapper: WorkerWrapper;
    constructor(frontendName: FrontendName, workerWrapper: WorkerWrapper) {
        super();
        this._channel = null;
        this._readyPromise = null;
        this._frontendName = frontendName;
        this._workerWrapper = workerWrapper;
        void this._bindToBackend();
    }

    async _bindToBackend() {
        const workerWrapper = this._workerWrapper;
        let resolveReady: PromiseResolve<void>;
        this._readyPromise = new Promise(resolve => {
            resolveReady = resolve;
        });

        const channel = await workerWrapper.getChannelForFrontend(this._frontendName);
        this._channel = channel;
        workerWrapper.registerFrontendListener(channel, this);
        resolveReady!(undefined);
    }

    ready() {
        return this._readyPromise;
    }

    postMessageToBackend(action: string, args: any[], transferList?: ArrayBuffer[]) {
        if (!this._channel) {
            throw new Error(`attempting to send message before ready()`);
        }
        this._workerWrapper.postBackendMessage(this._channel, action, args, transferList);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    receiveMessageFromBackend(_arg: T, transferList?: ArrayBuffer[]) {}
}
