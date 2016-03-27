"use strict";

import ContentScroller from "ui/scrolling/ContentScroller";
import FixedItemListScroller from "ui/scrolling/FixedItemListScroller";
import ApplicationDependencies from "ApplicationDependencies";

export default function ScrollerContext(opts, deps) {
    opts = Object(opts);
    this.itemHeight = opts.itemHeight;
    this.page = deps.page;
    this.scrollEvents = deps.scrollEvents;
    deps.ensure();
}

ScrollerContext.prototype.createContentScroller = function(opts) {
    return new ContentScroller(opts, new ApplicationDependencies({
        page: this.page,
        scrollEvents: this.scrollEvents
    }));
};

ScrollerContext.prototype.createFixedItemListScroller = function(opts) {
    opts.itemHeight = this.itemHeight;
    return new FixedItemListScroller(opts, new ApplicationDependencies({
        page: this.page,
        scrollEvents: this.scrollEvents
    }));
};
