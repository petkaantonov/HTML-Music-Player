import withDeps from "ApplicationDependencies";
import Tooltip from "ui/Tooltip";
import {noUndefinedGet} from "util";

export default class TooltipContext {
    constructor(opts, deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.globalEvents = deps.globalEvents;
        opts = noUndefinedGet(opts);

        this.gap = opts.gap;
        this.activation = opts.activation;
        this.transitionClass = opts.transitionClass;
        this.preferredDirection = opts.preferredDirection;
        this.preferredAlign = opts.preferredAlign;
        this.arrow = opts.arrow;
        this.delay = opts.delay;
        this.classPrefix = opts.classPrefix;
        this.container = opts.container;
    }

    createTooltip(target, content) {
        return withDeps({
            recognizerContext: this.recognizerContext,
            globalEvents: this.globalEvents,
            page: this.page
        }, deps => new Tooltip({
            gap: this.gap,
            activation: this.activation,
            transitionClass: this.transitionClass,
            preferredDirection: this.preferredDirection,
            preferredAlign: this.preferredAlign,
            arrow: this.arrow,
            delay: this.delay,
            classPrefix: this.classPrefix,
            target,
            content,
            container: this.container
        }, deps));
    }
}
