import { SelectDeps } from "ui/Application";
import Slider, { SliderOpts } from "ui/ui/Slider";

type Deps = SelectDeps<"page" | "recognizerContext" | "globalEvents">;
type Opts = Pick<SliderOpts, "knobSelector" | "fillSelector">;

export default class SliderContext {
    deps: Deps;
    knobSelector: string;
    fillSelector: string;

    constructor(opts: Opts, deps: Deps) {
        this.knobSelector = opts.knobSelector;
        this.fillSelector = opts.fillSelector;
        this.deps = deps;
    }

    createSlider(opts: Omit<SliderOpts, "knobSelector" | "fillSelector">) {
        return new Slider({ ...opts, knobSelector: this.knobSelector, fillSelector: this.fillSelector }, this.deps);
    }
}
