

import {throttle} from "util";
import Scroller from "scroller";
import Scrollbar from "ui/scrolling/Scrollbar";
import withDeps from "ApplicationDependencies";
import {performance} from "platform/platform";

export default function FixedItemListScroller({
    target, contentContainer, itemHeight, itemList,
    minPrerenderedItems, maxPrerenderedItems, scrollbarOpts, scrollerOpts,
    shouldScroll
}, deps) {
    const {page, scrollEvents} = deps;

    this._page = page;
    this._domNode = this._page.$(target).eq(0);
    this._contentContainer = this._page.$(contentContainer).eq(0);
    this._itemHeight = itemHeight;
    this._itemList = itemList;
    this._displayedItems = new Array(300);
    this._displayedItems.length = 0;
    const {left, top} = this.$()[0].getBoundingClientRect();
    this._left = left;
    this._top = top;
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._scrollTop = 0;
    this._virtualRenderFrameId = -1;
    this._clearWillChangeTimerId = -1;
    this._willChangeSet = false;
    this._changingDimensions = false;

    this._minPrerenderedItems = minPrerenderedItems || 15;
    this._maxPrerenderedItems = maxPrerenderedItems || 100;

    this._previousPhysicalHeight = 0;

    this._renderScroller = this._renderScroller.bind(this);
    this._renderItems = this._renderItems.bind(this);
    this._clearWillChange = this._clearWillChange.bind(this);
    this._resetChangingDimensions = throttle(this._resetChangingDimensions, 50);

    this._scroller = new Scroller(this._renderScroller, scrollerOpts);
    scrollbarOpts.scrollerInfo = this;
    this._scrollbar = withDeps({page}, d => new Scrollbar(scrollbarOpts, d));

    this._scrollBinding = scrollEvents.createBinding({
        target: this.$contentContainer(),
        scroller: this._scroller,
        scrollbar: this._scrollbar,
        shouldScroll: shouldScroll || null
    });

}

FixedItemListScroller.prototype._clearWillChangeTimer = function() {
    if (this._clearWillChangeTimerId !== -1) {
        this._page.clearTimeout(this._clearWillChangeTimerId);
        this._clearWillChangeTimerId = -1;
    }
};

FixedItemListScroller.prototype._forceRenderItems = function() {
    return this._renderItems(performance.now(), true);
};

FixedItemListScroller.prototype._renderScrollTop = function() {
    const y = -this._scrollTop;
    this.$contentContainer().setTransform(`translate3d(0px, ${y}px, 0px)`);
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
    this.$contentContainer().setStyle(`willChange`, ``);
};

FixedItemListScroller.prototype._setWillChange = function() {
    if (this._willChangeSet) return;
    this._willChangeSet = true;
    this.$contentContainer().setStyle(`willChange`, `transform`);
};

FixedItemListScroller.prototype._renderItems = function(now, forced) {
    const {_itemHeight: itemHeight, _displayedItems: displayedItems} = this;

    this._clearWillChangeTimerId = this._page.setTimeout(this._clearWillChange, 500);
    this._renderScrollTop();
    this._virtualRenderFrameId = -1;

    const scrollTop = this.settledScrollTop();
    const contentHeight = this.contentHeight();

    if (displayedItems.length > 2 && forced !== true) {
        const virtualStart = displayedItems[0].getIndex();
        const virtualEnd = displayedItems[displayedItems.length - 1].getIndex();

        const screenStart = scrollTop / itemHeight;
        const screenEnd = (scrollTop + contentHeight) / itemHeight;

        const {_minPrerenderedItems: minPrerenderedItems} = this;
        if (screenStart > (virtualStart + minPrerenderedItems) &&
            screenEnd < (virtualEnd - minPrerenderedItems)) {
            return;
        }
    }

    const container = this.$contentContainer();
    const {_itemList: items, _maxPrerenderedItems: maxPrerenderedItems} = this;

    const itemsBefore = Math.min(items.length, scrollTop / itemHeight | 0);
    const itemsWithin = Math.min(items.length, Math.ceil(contentHeight / itemHeight));

    const start = Math.max(itemsBefore - maxPrerenderedItems, 0);
    const end = Math.min(items.length - 1, itemsWithin + itemsBefore + maxPrerenderedItems);

    const detachedDomNodes = [];

    for (let i = 0; i < displayedItems.length; ++i) {
        const index = displayedItems[i].getIndex();
        if (!(start <= index && index <= end) && displayedItems[i].isVisible()) {
            detachedDomNodes.push(displayedItems[i].detach());
        }
    }

    for (let i = start; i <= end; ++i) {
        const item = items[i];
        if (!item.isVisible()) {
            item.attach(container, detachedDomNodes.length > 0 ? detachedDomNodes.pop() : null);
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
    if (isNaN(this._scrollTop)) {
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
    const itemHeight = this.itemHeight();
    const maxTop = this.length() * itemHeight - this.contentHeight();
    let top = this.settledScrollTop() + amount;
    top = Math.max(0, Math.min(Math.round(top), maxTop));
    top -= (top % this.itemHeight());
    this._scrollTop = top;
    this._scroller.scrollTo(null, top, false);
    this._scheduleRender();
};

FixedItemListScroller.prototype._resetChangingDimensions = function() {
    this._changingDimensions = false;
};

FixedItemListScroller.prototype.resize = function() {
    this._previousPhysicalHeight = this.physicalHeight();
    const nodeRect = this.$()[0].getBoundingClientRect();
    this._rect = this.$contentContainer()[0].getBoundingClientRect();
    this._top = nodeRect.top + (this.$()[0].clientHeight - this.$contentContainer()[0].clientHeight);
    this._left = nodeRect.left + (this.$()[0].clientWidth - this.$contentContainer()[0].clientWidth);
    this._scroller.setPosition(this._left, this._top);
    this._scroller.setDimensions(this._rect.width, this._rect.height, this._rect.width, this.physicalHeight());
    this._scroller.setSnapSize(this._rect.width, this.itemHeight());
    const maxTop = this.length() * this.itemHeight() - this.contentHeight();
    const top = this.needScrollbar() ? Math.min(maxTop, Math.max(0, this._scrollTop)) : 0;
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
    let rect = this._rect;
    if (rect.height === 0) {
        this._rect = rect = this.$contentContainer()[0].getBoundingClientRect();
    }
    return rect.height;
};

FixedItemListScroller.prototype.settledScrollTop = function() {
    if (!this.needScrollbar()) return 0;
    let ret = this._scrollTop | 0;
    const itemHeight = this.itemHeight();
    const maxTop = this.length() * itemHeight - this.contentHeight();
    ret = Math.min(maxTop, Math.max(0, ret));
    return ret - (ret % itemHeight);
};

FixedItemListScroller.prototype.coordsToIndexRange = function(startY, endY) {
    const top = this._top;
    const scrollTop = this.settledScrollTop();
    const itemHeight = this.itemHeight();

    startY = startY - top + scrollTop;
    endY = endY - top + scrollTop;

    let startIndex = Math.min(this.length() - 1, Math.max(0, (startY / itemHeight) | 0));
    let endIndex = Math.min(this.length() - 1, Math.max(0, (endY / itemHeight) | 0));

    if (startIndex < 0 || endIndex < 0) {
        return null;
    }

    if (startIndex > endIndex) {
        const tmp = startIndex;
        startIndex = endIndex;
        endIndex = tmp;
    }

    return {
        startIndex,
        endIndex
    };
};

FixedItemListScroller.prototype.getEdgeByCoordinateWithinMargin = function(y, margin) {
    const top = this._top;
    const bottom = this._top + this._rect.height;
    if (y <= top + margin) {
        return -1;
    } else if (y >= bottom - margin) {
        return 1;
    } else {
        return 0;
    }
};

FixedItemListScroller.prototype.mapYCoordinate = function(y) {
    const top = this._top;
    return Math.min(this.contentHeight(), Math.max(0, y - top)) + this.settledScrollTop();
};

FixedItemListScroller.prototype.indexByYCoordinate = function(y) {
    let index = (this.mapYCoordinate(y) / this.itemHeight()) | 0;
    index = Math.min(this.length() - 1, Math.max(0, index));
    return index;
};

FixedItemListScroller.prototype.itemByYCoordinate = function(y) {
    const index = this.indexByYCoordinate(y);
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
