import {Proxy} from "platform/platform";
import {getterProxyHandlers} from "util";

let doCheckDeps = true;

export function setDepChecking(value) {
    doCheckDeps = value;
}

export default function withDeps(deps, callback) {
    if (typeof callback !== `function`) {
        throw new Error(`${typeof callback} is not a function`);
    }
    if (typeof deps !== `object` || deps === null) {
        throw new Error(`${typeof deps} is not an object`);
    }
    if (!doCheckDeps) return callback(deps);
    const usedDeps = {};
    const unmetDeps = [];
    const proxy = new Proxy(deps, getterProxyHandlers((target, key) => {
        const ret = target[key];
        if (ret === undefined) {
            unmetDeps.push(key);
        }
        usedDeps[key] = true;
        return ret;
    }));
    const ret = callback(proxy);
    const unusedDeps = Object.keys(deps).filter(depKey => usedDeps[depKey] !== true);
    const err = [];

    if (unmetDeps.length > 0) {
        err.push(`Dependencies ${unmetDeps.join(`, `)} were not passed in`);
    }

    if (unusedDeps.length > 0) {
        err.push(`Dependencies ${unusedDeps.join(`, `)} were passed in but are not needed`);
    }

    if (err.length > 0) {
        throw new Error(err.join(`,`));
    }
    return ret;
}
