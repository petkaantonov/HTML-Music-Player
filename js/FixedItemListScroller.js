"use strict"

const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const Scroller = require("../lib/scroller");
const Scrollbar = require("./Scrollbar");

function FixedItemListScroller(node, itemList, itemHeight, opts) {
    opts = Object(opts);
    this._domNode = $($(node)[0]);
    this._contentContainer = $($((opts.contentContainer || node))[0]);
    this._itemHeight = itemHeight;
    this._itemList = itemList;
    this._displayedItems = new Array(300);
    this._displayedItems.length = 0;
    var nodeRect = this.$()[0].getBoundingClientRect();
    this._left = nodeRect.left;
    this._top = nodeRect.top;
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._scrollTop = 0;
    this._virtualRenderFrameId = -1;

    this._minPrerenderedItems = opts.minPrerenderedItems || 15;
    this._maxPrerenderedItems = opts.maxPrerenderedItems || 100;

    this._previousPhysicalHeight = 0;

    this._renderScroller = this._renderScroller.bind(this);
    this._renderItems = this._renderItems.bind(this);

    this._scroller = new Scroller(this._renderScroller, opts);
    this._scrollbar = new Scrollbar(opts.scrollbar, this, opts);
    domUtil.bindScrollerEvents(this.$contentContainer(), this._scroller, opts.shouldScroll || null);
}

FixedItemListScroller.prototype._forceRenderItems = function() {
    return this._renderItems(Date.now(), true);
};

FixedItemListScroller.prototype._renderScrollTop = function() {
    var y = -this._scrollTop;
    domUtil.setTransform(this.$contentContainer()[0], "translate3d(0px, "+y+"px, 0px)");
    this._scrollbar.render(this._scrollTop);
};

FixedItemListScroller.prototype.$ = function() {
    return this._domNode;
};

FixedItemListScroller.prototype.$contentContainer = function() {
    return this._contentContainer;
};

FixedItemListScroller.prototype._renderItems = function(now, forced) {
    this._renderScrollTop();
    this._virtualRenderFrameId = -1;
    var itemHeight = this._itemHeight;
    var scrollTop = this.settledScrollTop();
    var displayedItems = this._displayedItems;
    var contentHeight = this.contentHeight();

    if (displayedItems.length > 2 && forced !== true) {
        var virtualStart = displayedItems[0].getIndex();
        var virtualEnd = displayedItems[displayedItems.length - 1].getIndex();

        var screenStart = scrollTop / itemHeight;
        var screenEnd = (scrollTop + contentHeight) / itemHeight;

        var minPrerenderedItems = this._minPrerenderedItems;
        if (screenStart > (virtualStart + minPrerenderedItems) &&
            screenEnd < (virtualEnd - minPrerenderedItems)) {
            return;
        }
    }

    var container = this.$contentContainer();
    var items = this._itemList;
    var maxPrerenderedItems = this._maxPrerenderedItems;

    var itemsBefore = Math.min(items.length, scrollTop / itemHeight|0);
    var itemsWithin = Math.min(items.length, Math.ceil(contentHeight / itemHeight));

    var start = Math.max(itemsBefore - maxPrerenderedItems, 0);
    var end = Math.min(items.length - 1, itemsWithin + itemsBefore + maxPrerenderedItems);

    for (var i = 0; i < displayedItems.length; ++i) {
        var index = displayedItems[i].getIndex();
        if (!(start <= index && index <= end) && displayedItems[i].isVisible()) {
            displayedItems[i].detach();
        }
    }

    for (var i = start; i <= end; ++i) {
        var item = items[i];
        if (!item.isAttachedToDom()) {
            item.attach(container);
        }
        displayedItems[i - start] = item;
    }
    displayedItems.length = end - start + 1;
};

FixedItemListScroller.prototype._scheduleRender = function() {
    if (this._virtualRenderFrameId === -1) {
        this._virtualRenderFrameId = requestAnimationFrame(this._renderItems);
    }
};

FixedItemListScroller.prototype._renderScroller = function(left, top, zoom) {
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    this._scheduleRender();
};

FixedItemListScroller.prototype.length = function() {
    return this._itemList.length;
};

FixedItemListScroller.prototype.physicalHeight = function() {
    return this.length() * this.itemHeight();
};

FixedItemListScroller.prototype.itemHeight = function() {
    return this._itemHeight;
};

FixedItemListScroller.prototype.needScrollbar = function() {
    return this.physicalHeight() > this.contentHeight();
};

FixedItemListScroller.prototype.scrollToUnsnapped = function(top, animate) {
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    this._scroller.scrollTo(null, top, !!animate);
    this._scheduleRender();
};

FixedItemListScroller.prototype.scrollBy = function(amount) {
    if (amount === 0) return;
    var itemHeight = this.itemHeight();
    var maxTop = this.length() * itemHeight - this.contentHeight();
    var top = this.settledScrollTop() + amount;
    top = Math.max(0, Math.min(Math.round(top), maxTop));
    top = top - (top % this.itemHeight());
    this._scrollTop = top;
    this._scroller.scrollTo(null, top, false);
    this._scheduleRender();
};

FixedItemListScroller.prototype.resize = function() {
    var previousPhysicalHeight = this._previousPhysicalHeight;
    var heightChange = this.physicalHeight() - previousPhysicalHeight;
    this._previousPhysicalHeight = this.physicalHeight();
    var nodeRect = this.$()[0].getBoundingClientRect();
    this._left = nodeRect.left;
    this._top = nodeRect.top;
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._scroller.setPosition(this._left, this._top);
    this._scroller.setDimensions(this._rect.width, this._rect.height, this._rect.width, this.physicalHeight());
    this._scroller.setSnapSize(this._rect.width, this.itemHeight());
    var maxTop = this.length() * this.itemHeight() - this.contentHeight();
    var top = this.needScrollbar() ? Math.min(maxTop, Math.max(0, this._scrollTop)) : 0;
    this._scrollTop = top;
    this._scrollbar.resize();
    this._scroller.scrollTo(null, top, false);
};

FixedItemListScroller.prototype.refresh = function() {
    this._forceRenderItems();
};

FixedItemListScroller.prototype.itemsVisibleInContainer = function() {
    return Math.ceil(this.contentHeight() / this.itemHeight());
};

FixedItemListScroller.prototype.contentHeight = function() {
    var rect = this._rect;
    if (rect.height === 0) {
        this._rect = rect = this.$contentContainer()[0].getBoundingClientRect();
    }
    return rect.height;
};

FixedItemListScroller.prototype.settledScrollTop = function() {
    if (!this.needScrollbar()) return 0;
    var ret = this._scrollTop|0;
    var itemHeight = this.itemHeight();
    var maxTop = this.length() * itemHeight - this.contentHeight();
    ret = Math.min(maxTop, Math.max(0, ret));
    return ret - (ret % itemHeight);
};

FixedItemListScroller.prototype.coordsToIndexRange = function(startY, endY) {
    var top = this._top;
    var scrollTop = this.settledScrollTop();
    var itemHeight = this.itemHeight();

    startY = startY - top + scrollTop;
    endY = endY - top + scrollTop;

    var startIndex = Math.min(this.length() - 1, Math.max(0, (startY / itemHeight)|0));
    var endIndex = Math.min(this.length() - 1, Math.max(0, (endY / itemHeight)|0));

    if (startIndex < 0 || endIndex < 0) {
        return null;
    }

    if (startIndex > endIndex) {
        var tmp = startIndex;
        startIndex = endIndex;
        endIndex = startIndex
    }

    return {
        startIndex: startIndex,
        endIndex: endIndex
    };
};

FixedItemListScroller.prototype.getEdgeByCoordinateWithinMargin = function(y, margin) {
    var top = this._top;
    var bottom = this._top + this._rect.height;
    if (y <= top + margin) {
        return -1;
    } else if (y >= bottom - margin) {
        return 1;
    } else {
        return 0;
    }
};

FixedItemListScroller.prototype.mapYCoordinate = function(y) {
    var top = this._top;
    return Math.min(this.contentHeight(), Math.max(0, y - top)) + this.settledScrollTop();
};

FixedItemListScroller.prototype.indexByYCoordinate = function(y) {
    var index = (this.mapYCoordinate(y) / this.itemHeight())|0;
    index = Math.min(this.length() - 1, Math.max(0, index));
    return index;
};

FixedItemListScroller.prototype.itemByYCoordinate = function(y) {
    var index = this.indexByYCoordinate(y);
    if (index < 0) return null;
    return this._itemList[index];
};

FixedItemListScroller.prototype.itemByRect = function(rect) {
    return this.itemByYCoordinate(rect.top);
};

FixedItemListScroller.prototype.yByIndex = function(index) {
    index = Math.min(this.length() - 1, Math.max(0, index));
    if (index <= 0) return 0;
    return index * this.itemHeight();
};



module.exports = FixedItemListScroller;
