

import ContentScroller from "ui/scrolling/ContentScroller";
import FixedItemListScroller from "ui/scrolling/FixedItemListScroller";
import withDeps from "ApplicationDependencies";

export default function ScrollerContext({itemHeight}, deps) {
    const {page, scrollEvents} = deps;
    this.itemHeight = itemHeight;
    this.page = page;
    this.scrollEvents = scrollEvents;
}

ScrollerContext.prototype.createContentScroller = function(opts) {
    const {page, scrollEvents} = this;
    return withDeps({page, scrollEvents}, deps => new ContentScroller(opts, deps));
};

ScrollerContext.prototype.createFixedItemListScroller = function(opts) {
    const {itemHeight, page, scrollEvents} = this;
    opts.itemHeight = itemHeight;
    return withDeps({page, scrollEvents}, deps => new FixedItemListScroller(opts, deps));
};
