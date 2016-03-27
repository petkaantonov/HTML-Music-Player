"use strict";

import Slider from "ui/Slider";
import ApplicationDependencies from "ApplicationDependencies";

export default function SliderContext(opts, deps) {
    this.knobSelector = opts.knobSelector;
    this.fillSelector = opts.fillSelector;

    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;

    deps.ensure();
}

SliderContext.prototype.createSlider = function(opts) {
    opts.knobSelector = this.knobSelector;
    opts.fillSelector = this.fillSelector;
    return new Slider(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }));
};
