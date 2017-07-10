import ContentScroller from "ui/scrolling/ContentScroller";
import FixedItemListScroller from "ui/scrolling/FixedItemListScroller";
import withDeps from "ApplicationDependencies";

export default function ScrollerContext({itemHeight}, deps) {
    const {page} = deps;
    this.itemHeight = itemHeight;
    this.page = page;
}

ScrollerContext.prototype.createContentScroller = function(opts) {
    const {page} = this;
    return withDeps({page}, deps => new ContentScroller(opts, deps));
};

ScrollerContext.prototype.createFixedItemListScroller = function(opts) {
    const {itemHeight, page} = this;
    opts.itemHeight = itemHeight;
    return withDeps({page}, deps => new FixedItemListScroller(opts, deps));
};
