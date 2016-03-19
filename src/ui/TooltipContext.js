"use strict";

import Tooltip from "ui/Tooltip";

export default function TooltipContext(page, recognizerContext, globalEvents) {
    this.page = page;
    this.recognizerContext = recognizerContext;
    this.globalEvents = globalEvents;
}

TooltipContext.prototype.makeTooltip = function(target, content) {
    return new Tooltip({
        activation: "hover",
        transitionClass: "fade-in",
        preferredDirection: "top",
        preferredAlign: "middle",
        container: this.page.$("body"),
        arrow: false,
        target: target,
        delay: 600,
        classPrefix: "app-tooltip autosized-tooltip minimal-size-tooltip",
        content: content,
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents,
        page: this.page
    });
};
