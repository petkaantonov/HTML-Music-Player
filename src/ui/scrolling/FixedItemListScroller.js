"use strict";

import { throttle, ensuredObjectField, ensuredNumberField } from "util";
import Scroller from "scroller";
import Scrollbar from "ui/scrolling/Scrollbar";
import ApplicationDependencies from "ApplicationDependencies";

export default function FixedItemListScroller(opts, deps) {
    opts = Object(opts);

    this._page = deps.page;
    this._domNode = this._page.$(ensuredObjectField(opts, "target")).eq(0);
    this._contentContainer = this._page.$(ensuredObjectField(opts, "contentContainer")).eq(0);
    this._itemHeight =  ensuredNumberField(opts, "itemHeight");
    this._itemList = ensuredObjectField(opts, "itemList");
    this._displayedItems = new Array(300);
    this._displayedItems.length = 0;
    var nodeRect = this.$()[0].getBoundingClientRect();
    this._left = nodeRect.left;
    this._top = nodeRect.top;
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._scrollTop = 0;
    this._virtualRenderFrameId = -1;
    this._clearWillChangeTimerId = -1;
    this._willChangeSet = false;
    this._changingDimensions = false;

    this._minPrerenderedItems = opts.minPrerenderedItems || 15;
    this._maxPrerenderedItems = opts.maxPrerenderedItems || 100;

    this._previousPhysicalHeight = 0;

    this._renderScroller = this._renderScroller.bind(this);
    this._renderItems = this._renderItems.bind(this);
    this._clearWillChange = this._clearWillChange.bind(this);
    this._resetChangingDimensions = throttle(this._resetChangingDimensions, 50);

    this._scroller = new Scroller(this._renderScroller, ensuredObjectField(opts, "scrollerOpts"));
    var scrollbarOpts = ensuredObjectField(opts, "scrollbarOpts");
    scrollbarOpts.scrollerInfo = this;
    this._scrollbar = new Scrollbar(scrollbarOpts, new ApplicationDependencies({
        page: this._page
    }));

    this._scrollBinding = deps.scrollEvents.createBinding({
        target: this.$contentContainer(),
        scroller: this._scroller,
        scrollbar: this._scrollbar,
        shouldScroll: opts.shouldScroll || null,
    });
    deps.ensure();
}

FixedItemListScroller.prototype._clearWillChangeTimer = function() {
    if (this._clearWillChangeTimerId !== -1) {
        this._page.clearTimeout(this._clearWillChangeTimerId);
        this._clearWillChangeTimerId = -1;
    }
};

FixedItemListScroller.prototype._forceRenderItems = function() {
    return this._renderItems(Date.now(), true);
};

FixedItemListScroller.prototype._renderScrollTop = function() {
    var y = -this._scrollTop;
    this.$contentContainer().setTransform("translate3d(0px, "+y+"px, 0px)");
    this._scrollbar.render(this._scrollTop, this._changingDimensions);
};

FixedItemListScroller.prototype.$ = function() {
    return this._domNode;
};

FixedItemListScroller.prototype.$contentContainer = function() {
    return this._contentContainer;
};

FixedItemListScroller.prototype._clearWillChange = function() {
    if (!this._willChangeSet) return;
    this._willChangeSet = false;
    this.$contentContainer().setStyle("willChange", "");
};

FixedItemListScroller.prototype._setWillChange = function() {
    if (this._willChangeSet) return;
    this._willChangeSet = true;
    this.$contentContainer().setStyle("willChange", "transform");
};

FixedItemListScroller.prototype._renderItems = function(now, forced) {
    this._clearWillChangeTimerId = this._page.setTimeout(this._clearWillChange, 500);
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
        if (!item.isVisible()) {
            item.attach(container);
        }
        displayedItems[i - start] = item;
    }
    displayedItems.length = end - start + 1;
};

FixedItemListScroller.prototype._scheduleRender = function() {
    if (this._virtualRenderFrameId === -1) {
        this._clearWillChangeTimer();
        this._setWillChange();
        this._virtualRenderFrameId = this._page.requestAnimationFrame(this._renderItems);
    }
};

FixedItemListScroller.prototype._renderScroller = function(left, top) {
    if (!this.needScrollbar()) top = 0;
    this._scrollTop = top;
    if (this._checkBuggedScrollTop()) {
        return;
    }
    this._scheduleRender();
};

FixedItemListScroller.prototype._checkBuggedScrollTop = function() {
    if (isNaN(this._scrollTop))  {
        this._scrollTop = 0;
        this._scroller.__decelerationVelocityX = 0;
        this._scroller.__decelerationVelocityY = 0;
        this._scroller.__scheduledLeft = 0;
        this._scroller.__scheduledTop = 0;
        this._scroller.__scrollLeft = 0;
        this._scroller.__scrollTop = 0;
        this.scrollBy(1);
        return true;
    }
    return false;
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
    if (this._checkBuggedScrollTop()) {
        return;
    }
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

FixedItemListScroller.prototype._resetChangingDimensions = function() {
    this._changingDimensions = false;
};

FixedItemListScroller.prototype.resize = function() {
    this._previousPhysicalHeight = this.physicalHeight();
    var nodeRect = this.$()[0].getBoundingClientRect();
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._top = nodeRect.top + (this.$()[0].clientHeight - this.$contentContainer()[0].clientHeight);
    this._left = nodeRect.left + (this.$()[0].clientWidth - this.$contentContainer()[0].clientWidth);
    this._scroller.setPosition(this._left, this._top);
    this._scroller.setDimensions(this._rect.width, this._rect.height, this._rect.width, this.physicalHeight());
    this._scroller.setSnapSize(this._rect.width, this.itemHeight());
    var maxTop = this.length() * this.itemHeight() - this.contentHeight();
    var top = this.needScrollbar() ? Math.min(maxTop, Math.max(0, this._scrollTop)) : 0;
    this._scrollTop = top;
    this._scrollbar.resize();
    this._changingDimensions = true;
    this._scroller.scrollTo(null, top, false);
    this._resetChangingDimensions();
    this._checkBuggedScrollTop();
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
        endIndex = tmp;
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
    return this.itemByYCoordinate(rect.top + rect.height / 2);
};

FixedItemListScroller.prototype.yByIndex = function(index) {
    index = Math.min(this.length() - 1, Math.max(0, index));
    if (index <= 0) return 0;
    return index * this.itemHeight();
};
