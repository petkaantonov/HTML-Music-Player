import { Type } from "io-ts";
import { ApplicationPreferences, EffectPreferences } from "shared/preferences";
import { decode, typedKeys } from "shared/types/helpers";
import { deepEqual, titleCase } from "shared/util";

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
        const keys = typedKeys(this);
        const ret: Record<string, any> = {};
        for (const key of keys) {
            if (!key.startsWith("_")) {
                ret[key] = this[key]!;
            }
        }
        return decode(this.__codec, ret);
    }

    copyFrom(vals: T) {
        const keys = typedKeys(vals);
        for (const key of keys) {
            this.set(key, vals[key]);
        }
    }

    equals(vals: T | null): boolean {
        return deepEqual(this.toJSON(), vals);
    }
}
