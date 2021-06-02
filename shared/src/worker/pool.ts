import { ChannelCount } from "shared/metadata";
import WebAssemblyWrapper from "shared/wasm/WebAssemblyWrapper";
import Resampler, { ResamplerOpts } from "shared/worker/Resampler";

import ChannelMixer from "./ChannelMixer";

interface ResamplerPoolEntry {
    allocationCount: number;
    instances: Resampler[];
}
interface ChannelMixerPoolEntry {
    allocationCount: number;
    instances: ChannelMixer[];
}
const resamplers: Record<string, ResamplerPoolEntry> = Object.create(null);
const channelMixers: Record<string, ChannelMixerPoolEntry> = Object.create(null);

export function allocChannelMixer(wasm: WebAssemblyWrapper, destinationChannelCount: number): ChannelMixer {
    const key = `${destinationChannelCount}`;
    let entry = channelMixers[key];
    if (!entry) {
        entry = channelMixers[key] = {
            allocationCount: 1,
            instances: [new ChannelMixer(wasm, { destinationChannelCount })],
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new ChannelMixer(wasm, { destinationChannelCount }));
        entry.allocationCount++;
    }
    return entry.instances.shift()!;
}

export function allocResampler(
    wasm: WebAssemblyWrapper,
    channels: ChannelCount,
    sourceSampleRate: number,
    destinationSampleRate: number
): Resampler {
    const opts: ResamplerOpts = {
        channels,
        sourceSampleRate,
        destinationSampleRate,
    };

    const key = Resampler.CacheKey(channels, sourceSampleRate, destinationSampleRate);
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
    }
    const ret = entry.instances.shift()!;
    ret.reset();
    return ret;
}

export function freeResampler(resampler: Resampler) {
    const { channelCount, sourceSampleRate, destinationSampleRate } = resampler;
    const key = Resampler.CacheKey(channelCount, sourceSampleRate, destinationSampleRate);
    resamplers[key]!.instances.push(resampler);
}

export function freeChannelMixer(cm: ChannelMixer) {
    const key = `${cm.destinationChannelCount}`;
    channelMixers[key]!.instances.push(cm);
}
