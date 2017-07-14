import Resampler from "audio/Resampler";
import LoudnessAnalyzer from "audio/LoudnessAnalyzer";

const decoderPool = Object.create(null);
const resamplers = Object.create(null);
const loudnessAnalyzers = {
    allocationCount: 0,
    instances: []
};

export function allocLoudnessAnalyzer(wasm, channelCount, sampleRate, windowMs) {
    if (!loudnessAnalyzers.instances.length) {
        loudnessAnalyzers.allocationCount++;
        loudnessAnalyzers.instances.push(new LoudnessAnalyzer(wasm, channelCount, sampleRate, windowMs));

        if (loudnessAnalyzers.allocationCount > 4) {
            self.uiLog(`memory leak: ${loudnessAnalyzers.allocationCount} loudnessAnalyzers allocated.`);
        }
    }

    return loudnessAnalyzers.instances.shift().reinitialized(channelCount, sampleRate, windowMs);
}

export function freeLoudnessAnalyzer(loudnessAnalyzer) {
    loudnessAnalyzers.instances.push(loudnessAnalyzer);
}

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
            self.uiLog(`memory leak: ${entry.allocationCount} decoders allocated with key: ${name}`);
        }
    }

    return entry.instances.shift().reinitialized(contextOpts);
}

export function freeDecoderContext(name, context) {
    decoderPool[name].instances.push(context);
    context.end();
}
