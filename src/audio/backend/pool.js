import Resampler from "audio/backend/Resampler";
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
            self.uiLog(`memory leak: ${entry.allocationCount} resamplers allocated with key: ${key}`);
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
