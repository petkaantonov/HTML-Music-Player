"use strict";

import ApplicationDependencies from "ApplicationDependencies";
import Tooltip from "ui/Tooltip";

export default function TooltipContext(opts, deps) {
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.globalEvents = deps.globalEvents;

    this.gap = opts.gap;
    this.activation = opts.activation;
    this.transitionClass = opts.transitionClass;
    this.preferredDirection = opts.preferredDirection;
    this.preferredAlign = opts.preferredAlign;
    this.arrow = opts.arrow;
    this.delay = opts.delay;
    this.classPrefix = opts.classPrefix;
    this.container = opts.container;
    deps.ensure();
}

TooltipContext.prototype.createTooltip = function(target, content) {
    return new Tooltip({
        gap: this.gap,
        activation: this.activation,
        transitionClass: this.transitionClass,
        preferredDirection: this.preferredDirection,
        preferredAlign: this.preferredAlign,
        arrow: this.arrow,
        delay: this.delay,
        classPrefix: this.classPrefix,
        target: target,
        content: content,
        container: this.container
    }, new ApplicationDependencies({
        recognizerContext: this.recognizerContext,
        globalEvents: this.globalEvents,
        page: this.page
    }));
};
