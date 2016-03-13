"use strict"

import Slider from "ui/Slider";

export default function SliderMaker(recognizerMaker) {
    this.recognizerMaker = recognizerMaker;
}

SliderMaker.prototype.createSlider = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    return new Slider(dom, opts);
};
