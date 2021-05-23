import { AnyFunction } from "shared/types/helpers";

export default interface Timers {
    setTimeout: (fn: AnyFunction, ms: number) => number;
    clearTimeout: (id: number) => void;
    setInterval: (fn: AnyFunction, ms: number) => number;
    clearInterval: (id: number) => void;
}
