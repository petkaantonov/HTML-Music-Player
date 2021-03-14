import * as fp from "fp-ts";
import * as io from "io-ts";

import { either } from "../../node_modules/fp-ts/lib/Either";

type IfEquals<X, Y, A = X, B = never> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

export type WritableKeys<T> = {
    [P in keyof T]-?: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, P>;
}[keyof T];

export type ReadonlyKeys<T> = {
    [P in keyof T]-?: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, never, P>;
}[keyof T];

export type StringKeysOf<T> = { [P in keyof T]: T[P] extends string ? P : never }[keyof T];
export type BooleanKeysOf<T> = { [P in keyof T]: T[P] extends boolean ? P : never }[keyof T];
export type NumberKeysOf<T> = { [P in keyof T]: T[P] extends number ? P : never }[keyof T];

export function typedKeys<T, K extends keyof T>(o: T): K[] {
    return Object.keys(o) as K[];
}

export interface Rect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export type Class<T> = new (...args: any[]) => T;
export type AnyFunction = (...args: any[]) => any;
export type PromiseResolve<T> = (value: T | PromiseLike<T>) => void;
export type PromiseReject = (value: any) => void;
export type UnwrapPromise<K> = K extends Promise<infer T> ? T : K;
export type RemoveFirst<K extends any[]> = K extends [any, ...infer R] ? R : [];

export function decode<T>(codec: io.Type<T>, value: any): T {
    const result = codec.decode(value);
    if (fp.either.isLeft(result)) {
        throw new TypeError("type error");
    }
    return result.right;
}

export const ioTypeFromClass = <T>(k: Class<T>) => {
    return new io.Type<T, T>(
        k.name,
        (i: unknown): i is T => typeof i === "object" && i instanceof k,
        (i: unknown, c: io.Context) => (typeof i === "object" && i instanceof k ? io.success(i) : io.failure(i, c)),
        i => i
    );
};

export type EventEmitterInterface<T> = {
    on: <EventName extends keyof T>(eventName: EventName, fn: T[EventName]) => void;
    once: <EventName extends keyof T>(eventName: EventName, fn: T[EventName]) => void;
    removeListener: <EventName extends keyof T>(eventName: EventName, fn: T[EventName]) => void;
    emit: <EventName extends keyof T>(
        eventName: EventName,
        ...args: Parameters<T[EventName] extends AnyFunction ? T[EventName] : never>
    ) => void;
    setMaxListeners: (m: number) => void;
    removeAllListeners: (name?: keyof T) => void;
};

export const NumberValueBetween = (min: number, max: number) => {
    return new io.Type<number, number>(
        "NumberValueBetween",
        io.number.is,
        (u, c) =>
            either.chain(io.number.validate(u, c), (n: number) => {
                return n >= min && n <= max ? io.success(n) : io.failure(u, c, `not between ${min} and ${max}`);
            }),
        Number
    );
};
