import {Symbol} from "platform/platform";
import {moduleEvents} from "wasm/WebAssemblyWrapper";

let effects_noise_sharpening;

export default class Effects {
    constructor() {
        this._effects = [{
            name: `noise-sharpening`,
            effectSize: 0,
            apply(channelCount, samplePtr, byteLength) {
                if (this.effectSize > 0) {
                    effects_noise_sharpening(this.effectSize, channelCount, samplePtr, byteLength);
                }
                return {samplePtr, byteLength};
            },

            _applySpec(spec = null) {
                this.effectSize = spec ? spec.effectSize : 0;
            }
        }];
    }

    [Symbol.iterator]() {
        return this._effects[Symbol.iterator]();
    }

    setEffects(spec = []) {
        const effectMap = new Map();
        for (const specEffect of spec) {
            effectMap.set(specEffect.name, specEffect);
        }

        for (const effect of this) {
            effect._applySpec(effectMap.get(effect.name));
        }
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    ({effects_noise_sharpening} = exports);
});
