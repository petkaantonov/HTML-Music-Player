"use strict";

import Slider from "ui/Slider";
import ApplicationDependencies from "ApplicationDependencies";

export default function SliderContext(deps) {
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;
    deps.ensure();
}

SliderContext.prototype.createSlider = function(opts) {
    return new Slider(opts, new ApplicationDependencies({
        page: this.page,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents
    }));
};
