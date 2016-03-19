"use strict";

import Slider from "ui/Slider";

export default function SliderContext(page, recognizerContext, globalEvents) {
    this.page = page;
    this.recognizerContext = recognizerContext;
    this.globalEvents = globalEvents;
}

SliderContext.prototype.createSlider = function(dom, opts) {
    opts = Object(opts);
    opts.page = this.page;
    opts.recognizerContext = this.recognizerContext;
    opts.globalEvents = this.globalEvents;
    return new Slider(dom, opts);
};
