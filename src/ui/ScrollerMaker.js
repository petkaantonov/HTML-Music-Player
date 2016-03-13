"use strict";

import ContentScroller from "ui/ContentScroller";
import FixedItemListScroller from "ui/FixedItemListScroller";

export default function ScrollerMaker(recognizerMaker, scrollEvents, itemHeight) {
    this.recognizerMaker = recognizerMaker;
    this.scrollEvents = scrollEvents;
    this.itemHeight = itemHeight;
}

ScrollerMaker.prototype.createContentScroller = function(dom, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.scrollEvents = this.scrollEvents;
    return new ContentScroller(dom, opts);
};

ScrollerMaker.prototype.createFixedItemListScroller = function(dom, itemViews, opts) {
    opts = Object(opts);
    opts.recognizerMaker = this.recognizerMaker;
    opts.scrollEvents = this.scrollEvents;
    return new FixedItemListScroller(dom, itemViews, this.itemHeight, opts);
};
