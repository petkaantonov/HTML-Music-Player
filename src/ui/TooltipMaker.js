"use strict";

import $ from "jquery";
import Tooltip from "ui/Tooltip";

export default function TooltipMaker(recognizerMaker) {
    this.recognizerMaker = recognizerMaker;
}

TooltipMaker.prototype.makeTooltip = function(target, content) {
    return new Tooltip({
        activation: "hover",
        transitionClass: "fade-in",
        preferredDirection: "top",
        preferredAlign: "middle",
        container: $("body"),
        arrow: false,
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content,
        recognizerMaker: this.recognizerMaker
    });
};
