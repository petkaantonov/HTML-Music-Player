import { ApplicationPreferences, EffectPreferences, StoredKVValues } from "Application";
import deepEqual from "deep-equal";
import { Type } from "io-ts";
import { typedKeys } from "types/helpers";

import { titleCase } from "../util";

export interface Preference {
    key: keyof StoredKVValues;
    value: string | number | boolean | object;
}
export type PreferenceArray = Preference[];

export abstract class AbstractPreferenceManager<T extends ApplicationPreferences | EffectPreferences> {
    private __codec: Type<T>;

    constructor(codec: Type<T>) {
        this.__codec = codec;
    }

    set<Key extends keyof T>(key: Key, value: T[Key]) {
        const fn = (this as any)["set" + titleCase(key)];
        if (typeof fn === "function") {
            fn.call(this, value);
        } else {
            ((this as unknown) as T)[key] = value;
        }
    }

    get<Key extends keyof T>(key: Key) {
        return ((this as unknown) as T)[key] as T[Key];
    }

    toJSON(): T {
        return this.__codec.encode((this as unknown) as T);
    }

    copyFrom(vals: T) {
        const keys = typedKeys(vals);
        for (const key of keys) {
            this.set(key, vals[key]);
        }
    }

    equals(vals: T | null): boolean {
        return deepEqual(this.toJSON(), vals, { strict: true });
    }
}
