"use strict";

import Slider from "ui/Slider";

export default function SliderMaker(recognizerMaker, globalEvents) {
    this.recognizerMaker = recognizerMaker;
    this.globalEvents = globalEvents;
}

SliderMaker.prototype.createSlider = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.globalEvents = this.globalEvents;
    return new Slider(dom, opts);
};
