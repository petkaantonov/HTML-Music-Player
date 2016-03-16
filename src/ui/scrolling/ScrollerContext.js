"use strict";

import ContentScroller from "ui/scrolling/ContentScroller";
import FixedItemListScroller from "ui/scrolling/FixedItemListScroller";

export default function ScrollerContext(recognizerContext, scrollEvents, itemHeight) {
    this.recognizerContext = recognizerContext;
    this.scrollEvents = scrollEvents;
    this.itemHeight = itemHeight;
}

ScrollerContext.prototype.createContentScroller = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.scrollEvents = this.scrollEvents;
    return new ContentScroller(dom, opts);
};

ScrollerContext.prototype.createFixedItemListScroller = function(dom, itemViews, opts) {
    opts = Object(opts);
    opts.recognizerContext = this.recognizerContext;
    opts.scrollEvents = this.scrollEvents;
    return new FixedItemListScroller(dom, itemViews, this.itemHeight, opts);
};
