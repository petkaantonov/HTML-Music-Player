import Resampler from "audio/Resampler";

const decoderPool = Object.create(null);
const resamplers = Object.create(null);

export function allocResampler(wasm, channels, from, to, quality) {
    const opts = {
        nb_channels: channels,
        in_rate: from,
        out_rate: to,
        quality
    };
    quality = quality || 0;
    const key = `${channels} ${from} ${to} ${quality}`;
    let entry = resamplers[key];
    if (!entry) {
        entry = resamplers[key] = {
            allocationCount: 1,
            instances: [new Resampler(wasm, opts)]
        };
    }
    if (entry.instances.length === 0) {
        entry.instances.push(new Resampler(wasm, opts));
        entry.allocationCount++;
        if (entry.allocationCount > 4) {
            throw new Error(`memory leak`);
        }
    }
    const ret = entry.instances.shift();
    ret.reset();
    return ret;
}

export function freeResampler(resampler) {
    const {nb_channels, in_rate, out_rate, quality} = resampler._passedArgs;
    const key = `${nb_channels} ${in_rate} ${out_rate} ${quality}`;
    resamplers[key].instances.push(resampler);
}

export function allocDecoderContext(wasm, name, ContextConstructor, contextOpts) {
    let entry = decoderPool[name];

    if (!entry) {
        entry = decoderPool[name] = {
            allocationCount: 1,
            instances: [new ContextConstructor(wasm, contextOpts)]
        };
    }

    if (entry.instances.length === 0) {
        entry.instances.push(new ContextConstructor(wasm, contextOpts));
        entry.allocationCount++;
        if (entry.allocationCount > 4) {
            throw new Error(`memory leak`);
        }
    }

    return entry.instances.shift().reinitialized(contextOpts);
}

export function freeDecoderContext(name, context) {
    decoderPool[name].instances.push(context);
    context.end();
}
