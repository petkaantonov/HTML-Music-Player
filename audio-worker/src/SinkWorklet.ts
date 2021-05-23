import CircularAudioBuffer from "shared/worker/CircularAudioBuffer";

declare global {
    function registerProcessor<T>(name: string, c: new (...args: any[]) => AudioWorkletProcessor<T>): void;

    interface Options<T> {
        numberOfInputs?: number;
        numberOfOutputs?: number;
        outputChannelCount?: number[];
        parameterData?: T;
        processorOptions?: any;
    }

    abstract class AudioWorkletProcessor<T> {
        get port(): MessagePort;
        constructor(opts?: Options<T>);
        abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: T): boolean;
    }
}

class SinkWorklet extends AudioWorkletProcessor<{}> {
    private cab: CircularAudioBuffer | null = null;

    constructor(channels: number) {
        super({
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [channels || 2],
        });
        this.port.onmessage = e => {
            this.cab = new CircularAudioBuffer(e.data.sab, channels);
        };
    }

    process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
        const channels = outputs[0];
        const framesWritten = this.cab ? this.cab.read(channels, 128) : 0;
        for (const channel of channels) {
            for (let i = framesWritten; i < channel.length; ++i) {
                channel[i] = 0.0;
            }
        }
        return true;
    }
}

registerProcessor("sink-worklet", SinkWorklet);

export {};
