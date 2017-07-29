import {Symbol} from "platform/platform";
import {moduleEvents} from "wasm/WebAssemblyWrapper";

let effects_noise_sharpening;
export default class Effects {
    constructor() {
        this._effects = {
            "noise-sharpening": {
                effectSize: 0,
                apply(samplePtr, byteLength, {channelCount}) {
                    if (this.effectSize > 0) {
                        effects_noise_sharpening(this.effectSize, channelCount, samplePtr, byteLength);
                    }
                    return {samplePtr, byteLength};
                },

                _applySpec(spec = null) {
                    this.effectSize = spec ? spec.effectSize : 0;
                }
            }
        };
        this._effectNames = Object.keys(this._effects);
    }

    * [Symbol.iterator]() {
        for (let i = 0; i < this._effectNames.length; ++i) {
            yield this._effects[this._effectNames[i]];
        }
    }

    setEffects(spec = []) {
        for (const specEffect of spec) {
            this._effects[specEffect.name]._applySpec(specEffect);
        }
    }
}

moduleEvents.on(`main_afterInitialized`, (wasm, exports) => {
    ({effects_noise_sharpening} = exports);
});
