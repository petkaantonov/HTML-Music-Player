import Resampler from "Resampler";
import WebAssemblyWrapper from "wasm/WebAssemblyWrapper";
import { uiLog } from "WorkerBackend";

import { ChannelCount } from "./ChannelMixer";

interface PoolEntry {
    allocationCount: number;
    instances: Resampler[];
}
const resamplers: Record<string, PoolEntry> = Object.create(null);

export function allocResampler(
    wasm: WebAssemblyWrapper,
    channels: ChannelCount,
    from: number,
    to: number,
    quality: number
) {
    const opts = {
        nb_channels: channels,
        in_rate: from,
        out_rate: to,
        quality,
    };
    quality = quality || 0;
    const key = `${channels} ${from} ${to} ${quality}`;
    let entry = resamplers[key];
    if (!entry) {
        entry = resamplers[key] = {
            allocationCount: 1,
            instances: [new Resampler(wasm, opts)],
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new Resampler(wasm, opts));
        entry.allocationCount++;
        if (entry.allocationCount > 4) {
            uiLog(`memory leak: ${entry.allocationCount} resamplers allocated with key: ${key}`);
        }
    }
    const ret = entry.instances.shift()!;
    ret.reset();
    return ret;
}

export function freeResampler(resampler: Resampler) {
    const { nb_channels, in_rate, out_rate, quality } = resampler._passedArgs;
    const key = `${nb_channels} ${in_rate} ${out_rate} ${quality}`;
    resamplers[key]!.instances.push(resampler);
}
