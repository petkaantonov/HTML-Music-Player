"use strict"

const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const Scroller = require("../lib/scroller");
const Scrollbar = require("./Scrollbar");

function ContentScroller(node, opts) {
    opts = Object(opts);
    this._domNode = $($(node)[0]);
    this._contentContainer = $($((opts.contentContainer || node))[0]);

    this._scrollTop = 0;
    this._frameId = -1;

    this._containerHeight = 0;
    this._containerPadding = 0;
    this._top = this._left = 0;

    this._renderScroller = this._renderScroller.bind(this);
    this._renderScrollTop = this._renderScrollTop.bind(this);

    this._scroller = new Scroller(this._renderScroller, opts);
    this._scrollbar = new Scrollbar(opts.scrollbar, this, opts);
    domUtil.bindScrollerEvents(this.$contentContainer(),
                               this._scroller,
                               opts.shouldScroll || null,
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
        this._frameId = requestAnimationFrame(this._renderScrollTop);
    }
};

ContentScroller.prototype._renderScrollTop = function() {
    this._frameId = -1;
    var y = -this._scrollTop;
    domUtil.setTransform(this.$contentContainer()[0], "translate3d(0px, "+y+"px, 0px)");
    this._scrollbar.render(this._scrollTop);
};

ContentScroller.prototype._renderScroller = function(left, top, zoom) {
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    this._scheduleRender();
};

ContentScroller.prototype.needScrollbar = function() {
    return this.physicalHeight() > this.contentHeight();
};

ContentScroller.prototype.scrollToUnsnapped = function(top, animate) {
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

module.exports = ContentScroller;
