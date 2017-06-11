

import Slider from "ui/Slider";
import withDeps from "ApplicationDependencies";

export default function SliderContext(opts, deps) {
    this.knobSelector = opts.knobSelector;
    this.fillSelector = opts.fillSelector;

    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;


}

SliderContext.prototype.createSlider = function(opts) {
    opts.knobSelector = this.knobSelector;
    opts.fillSelector = this.fillSelector;
    return withDeps({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }, deps => new Slider(opts, deps));
};
