import * as io from "io-ts";
import { AudioPlayerResult } from "shared/audio";
import { MetadataResult } from "shared/metadata";
import { SearchWorkerResult } from "shared/search";
import { PromiseResolve } from "shared/types/helpers";
import { capitalize } from "shared/util";
import { AudioVisualizerResult } from "shared/visualizer";
import { ZipperResult } from "shared/zipper";

export const FrontendName = io.keyof({
    audio: null,
    zipper: null,
    visualizer: null,
    metadata: null,
    search: null,
});
export type FrontendName = io.TypeOf<typeof FrontendName>;

export type ResultType = MetadataResult | ZipperResult | AudioPlayerResult | AudioVisualizerResult | SearchWorkerResult;

export const SerializableError = io.partial({
    name: io.string,
    message: io.string,
    stack: io.string,
});
export type SerializableError = io.TypeOf<typeof SerializableError>;

export const mainWindowCalls = {
    getLocalStorageItem(name: string) {
        return localStorage.getItem(name);
    },

    setLocalStorageItem(name: string, value: any) {
        return localStorage.setItem(name, value);
    },
};

export type MainWindowCalls = typeof mainWindowCalls;

export const createMainWindowCallType = <Key extends keyof typeof mainWindowCalls>(
    name: Key,
    args: io.Type<Parameters<typeof mainWindowCalls[Key]>>,
    returnType: io.Type<ReturnType<typeof mainWindowCalls[Key]>>
): {
    [K in Key as `${Capitalize<string & K>}Call`]: typeof call;
} &
    {
        [K in Key as `${Capitalize<string & K>}Result`]: typeof result;
    } => {
    const call = io.type({
        name: io.literal(name),
        type: io.literal("callMainWindow"),
        callId: io.number,
        args: args,
    });
    const result = io.intersection([
        io.type({
            name: io.literal(name),
            type: io.literal("callMainWindowResult"),
            callId: io.number,
        }),
        io.union([io.type({ result: returnType }), io.type({ error: SerializableError })]),
    ]);

    return {
        [`${capitalize(name)}Call`]: call,
        [`${capitalize(name)}Result`]: result,
    } as any;
};
export const { GetLocalStorageItemCall, GetLocalStorageItemResult } = createMainWindowCallType(
    "getLocalStorageItem",
    io.tuple([io.string]),
    io.union([io.string, io.null])
);
export const { SetLocalStorageItemCall, SetLocalStorageItemResult } = createMainWindowCallType(
    "setLocalStorageItem",
    io.tuple([io.string, io.any]),
    io.void
);
export const MainWindowCall = io.union([GetLocalStorageItemCall, SetLocalStorageItemCall]);
export const MainWindowCallResult = io.union([GetLocalStorageItemResult, SetLocalStorageItemResult]);
export type MainWindowCall = io.TypeOf<typeof MainWindowCall>;
export type MainWindowCallResult = io.TypeOf<typeof MainWindowCallResult>;

export const UiLogCall = io.type({
    type: io.literal("uiLog"),
    args: io.array(io.string),
});

export type UiLogCall = io.TypeOf<typeof UiLogCall>;

export const ReadyCall = io.type({
    type: io.literal("ready"),
    channel: io.string,
    frontendName: FrontendName,
});

export type ReadyCall = io.TypeOf<typeof ReadyCall>;

export const FrontendCall = io.intersection([
    io.type({
        type: io.literal("frontendCall"),
        channel: io.string,
        args: io.array(io.any),
        action: io.string,
    }),
    io.partial({
        transferList: io.array(io.any),
    }),
]);

export type FrontendCall = io.TypeOf<typeof FrontendCall>;

export const BackendCall = io.intersection([
    io.type({
        type: io.literal("backendCall"),
        channel: io.string,
        args: io.array(io.any),
    }),
    io.partial({
        transferList: io.array(io.any),
    }),
]);

export type BackendCall = io.TypeOf<typeof BackendCall>;

export type FrontendWorkerMessageType = BackendCall | UiLogCall | ReadyCall | MainWindowCall;
export type BackendWorkerMessageType = MainWindowCallResult | FrontendCall;

export interface ResultPromise<T> {
    resolve: (d: T) => void;
    reject: (d: SerializableError) => void;
}

export interface ChannelPromise {
    resolve: PromiseResolve<string>;
    promise: Promise<string>;
}
