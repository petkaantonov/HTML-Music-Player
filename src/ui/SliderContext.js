"use strict";

import Slider from "ui/Slider";

export default function SliderContext(recognizerContext, globalEvents) {
    this.recognizerContext = recognizerContext;
    this.globalEvents = globalEvents;
}

SliderContext.prototype.createSlider = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.globalEvents = this.globalEvents;
    return new Slider(dom, opts);
};
