"use strict";

import ApplicationDependencies from "ApplicationDependencies";
import Tooltip from "ui/Tooltip";

export default function TooltipContext(deps) {
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;
    deps.ensure();
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
        content: content
    }, new ApplicationDependencies({
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents,
        page: this.page
    }));
};
