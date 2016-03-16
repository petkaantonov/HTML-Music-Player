"use strict";

import { setTransform } from "platform/DomUtil";
import Scroller from "scroller";
import Scrollbar from "ui/scrolling/Scrollbar";
import $ from "jquery";

export default function ContentScroller(node, opts) {
    opts = Object(opts);
    this._domNode = $($(node)[0]);
    this._contentContainer = $($((opts.contentContainer || node))[0]);

    this._scrollTop = 0;
    this._frameId = -1;

    this._containerHeight = 0;
    this._containerPadding = 0;
    this._top = this._left = 0;
    this._clearWillChangeTimerId = -1;
    this._willChangeSet = false;

    this._renderScroller = this._renderScroller.bind(this);
    this._renderScrollTop = this._renderScrollTop.bind(this);
    this._clearWillChange = this._clearWillChange.bind(this);

    this._scroller = new Scroller(this._renderScroller, opts);
    this._scrollbar = new Scrollbar(opts.scrollbar, this, opts);
    this._scrollerEventBinding = opts.scrollEvents.createBinding(this.$contentContainer(),
                                                                 this._scroller,
                                                                 opts.shouldScroll,
                                                                 this._scrollbar);
    this.refresh();
}

ContentScroller.prototype.$ = function() {
    return this._domNode;
};

ContentScroller.prototype.$contentContainer = function() {
    return this._contentContainer;
};

ContentScroller.prototype.getTopLeft = function() {
    return this.$()[0].getBoundingClientRect();
};

ContentScroller.prototype.refresh = function() {
    this._containerHeight = this.$().innerHeight();
    this._containerPadding = this._containerHeight - this.$().height();
};

ContentScroller.prototype.physicalHeight = function() {
    return this.$contentContainer().innerHeight() + this._containerPadding;
};

ContentScroller.prototype.contentHeight = function() {
    return this.$().innerHeight();
};

ContentScroller.prototype._scheduleRender = function() {
    if (this._frameId === -1) {
        this._clearWillChangeTimer();
        this._setWillChange();
        this._frameId = requestAnimationFrame(this._renderScrollTop);
    }
};

ContentScroller.prototype._renderScrollTop = function() {
    this._clearWillChangeTimerId = setTimeout(this._clearWillChange, 500);
    this._frameId = -1;
    var y = -this._scrollTop;
    setTransform(this.$contentContainer()[0], "translate3d(0px, "+y+"px, 0px)");
    this._scrollbar.render(this._scrollTop);
};


ContentScroller.prototype._clearWillChangeTimer = function() {
    if (this._clearWillChangeTimerId !== -1) {
        clearTimeout(this._clearWillChangeTimerId);
        this._clearWillChangeTimerId = -1;
    }
};

ContentScroller.prototype._clearWillChange = function() {
    if (!this._willChangeSet) return;
    this._willChangeSet = false;
    this.$contentContainer().css("willChange", "");
};

ContentScroller.prototype._setWillChange = function() {
    if (this._willChangeSet) return;
    this._willChangeSet = true;
    this.$contentContainer().css("willChange", "transform");
};

ContentScroller.prototype._renderScroller = function(left, top) {
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    this._scheduleRender();
};

ContentScroller.prototype.needScrollbar = function() {
    return this.physicalHeight() > this.contentHeight();
};

ContentScroller.prototype.scrollToUnsnapped = function(top, animate) {
    top = Math.max(0, Math.min(this.maxTop(), +top));
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    this._scroller.scrollTo(null, top, !!animate);
};

ContentScroller.prototype.maxTop = function() {
    return this.physicalHeight() - this.contentHeight();
};

ContentScroller.prototype.scrollBy = function(amount) {
    if (amount === 0) return;
    var maxTop = this.maxTop();
    var top = this.settledScrollTop() + amount;
    top = Math.max(0, Math.min(Math.round(top), maxTop));
    this._scrollTop = top;
    this._scroller.scrollTo(null, top, false);
};

ContentScroller.prototype.resize = function() {
    var topLeft = this.getTopLeft();
    this._left = topLeft.left;
    this._top = topLeft.top;
    var width = this.$().innerWidth();
    var maxTop = this.maxTop();
    var top = this.needScrollbar() ? Math.min(maxTop, Math.max(0, this._scrollTop)) : 0;
    this._scrollTop = top;
    this._scrollbar.resize();
    this._scroller.setPosition(this._left, this._top);
    this._scroller.setDimensions(width, this.contentHeight(), width, this.physicalHeight());
    this._scroller.scrollTo(null, top, false);
};

ContentScroller.prototype.loadScrollTop = function(top) {
    this._scrollTop = top;
    this.resize();
};

ContentScroller.prototype.settledScrollTop = function() {
    if (!this.needScrollbar()) return 0;
    return this._scrollTop|0;
};

ContentScroller.prototype.scrollIntoView = function(elem, animate) {
    var scrollTop = this.settledScrollTop();
    var height = this.contentHeight();
    var rect = elem.getBoundingClientRect();
    var elemStart = rect.top - this._top + scrollTop;
    var elemEnd = rect.bottom - this._top + scrollTop;

    var visibleStart = scrollTop;
    var visibleEnd = scrollTop + height;

    if (elemStart >= visibleStart && elemEnd <= visibleEnd) {
        return;
    }

    var pos = elemEnd < visibleStart ? elemStart : elemEnd;

    this.scrollToUnsnapped(pos / this.physicalHeight() * this.maxTop(), !!animate);
};
