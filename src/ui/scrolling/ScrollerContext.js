"use strict";

import ContentScroller from "ui/scrolling/ContentScroller";
import FixedItemListScroller from "ui/scrolling/FixedItemListScroller";

export default function ScrollerContext(page, recognizerContext, scrollEvents, itemHeight) {
    this.page = page;
    this.recognizerContext = recognizerContext;
    this.scrollEvents = scrollEvents;
    this.itemHeight = itemHeight;
}

ScrollerContext.prototype.createContentScroller = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.scrollEvents = this.scrollEvents;
    opts.page = this.page;
    return new ContentScroller(dom, opts);
};

ScrollerContext.prototype.createFixedItemListScroller = function(dom, itemViews, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.scrollEvents = this.scrollEvents;
    opts.page = this.page;
    return new FixedItemListScroller(dom, itemViews, this.itemHeight, opts);
};
