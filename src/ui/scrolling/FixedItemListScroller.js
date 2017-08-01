import ContentScroller, {SCROLL_POSITION_CHANGE_EVENT} from "ui/scrolling/ContentScroller";
import {IntersectionObserver} from "platform/platform";
import {throttle} from "util";

export default class FixedItemListScroller extends ContentScroller {
    constructor({
        target, contentContainer, itemHeight, itemList
    }, deps) {
        super({target, contentContainer}, deps);
        this._itemHeight = itemHeight;
        this._itemList = itemList;
        this._displayedItems = new Array(300);
        this._displayedItems.length = 0;
        this._itemsVisibleInContainer = 0;
        this._sentinel = this._page.createElement(`div`).setStyles({
            width: `1px`,
            height: `1px`,
            position: `absolute`,
            transform: `translateY(0)`
        }).setText(` `).prependTo(this.$contentContainer());
        this._startSentinel = this._page.createElement(`div`).setStyles({
            position: `absolute`,
            width: `100%`,
            transform: `translateY(0)`,
            contain: "strict",
            visibility: `hidden`,
            pointerEvents: `none`,
            zIndex: 9999,
            height: `${itemHeight}px`
        }).setText(` `).prependTo(this.$contentContainer());
        this._endSentinel = this._page.$(this._startSentinel[0].cloneNode()).setText(` `).prependTo(this.$contentContainer());
        this._observer = new IntersectionObserver(this._observerCallback.bind(this), {
            root: this.$contentContainer()[0]
        });
        this._startSentinelIndex = 0;
        this._endSentinelIndex = 0;
        this._observer.observe(this._startSentinel[0]);
        this._observer.observe(this._endSentinel[0]);
        this._emitScrollPositionChange = throttle(this._emitScrollPositionChange, 100, this);
    }

    $sentinel() {
        return this._sentinel;
    }

    length() {
        return this._itemList.length;
    }

    physicalHeight() {
        return this.length() * this.itemHeight();
    }

    itemHeight() {
        return this._itemHeight;
    }

    resize() {
        this.$sentinel().setTransform(`translate3d(0px, ${this.physicalHeight()}px, 0px)`);
        super.resize();
        this._onScroll();
    }

    itemsVisibleInContainer() {
        return Math.ceil(this.contentHeight() / this.itemHeight());
    }

    contentHeight() {
        let rect = this._rect;
        if (rect.height === 0) {
            this._rect = rect = this.$contentContainer()[0].getBoundingClientRect();
        }
        this._itemsVisibleInContainer = Math.ceil(rect.height / this._itemHeight);
        return rect.height;
    }

    coordsToIndexRange(startY, endY) {
        const top = this._top;
        const scrollTop = this.getScrollTop();
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
    }

    getEdgeByCoordinateWithinMargin(y, margin) {
        const top = this._top;
        const bottom = this._top + this.contentHeight();
        if (y <= top + margin) {
            return -1;
        } else if (y >= bottom - margin) {
            return 1;
        } else {
            return 0;
        }
    }

    mapYCoordinate(y) {
        const top = this._top;
        return Math.min(this.contentHeight(), Math.max(0, y - top)) + this.getScrollTop();
    }

    indexByYCoordinate(y) {
        let index = (this.mapYCoordinate(y) / this.itemHeight()) | 0;
        index = Math.min(this.length() - 1, Math.max(0, index));
        return index;
    }

    itemByYCoordinate(y) {
        const index = this.indexByYCoordinate(y);
        if (index < 0) return null;
        return this._itemList[index];
    }

    itemByRect(rect) {
        return this.itemByYCoordinate(rect.top + rect.height / 2);
    }

    yByIndex(index) {
        index = Math.min(this.length() - 1, Math.max(0, index));
        if (index <= 0) return 0;
        return index * this.itemHeight();
    }

    _emitScrollPositionChange() {
        const scrollTop = this.getScrollTop();
        this.emit(SCROLL_POSITION_CHANGE_EVENT, scrollTop);
    }

    _observerCallback(entries) {
        const [entry] = entries;
        const {height} = entry.rootBounds;
        if (entry.isIntersecting) {
            this._itemsVisibleInContainer = Math.ceil(height / this._itemHeight);
            const {_itemsVisibleInContainer: itemsVisibleInContainer,
                   _startSentinelIndex: startSentinelIndex,
                   _endSentinelIndex: endSentinelIndex} = this;

            let startIndex, endIndex;
            if (entry.target === this._startSentinel[0]) {
                startIndex = startSentinelIndex - itemsVisibleInContainer;
                endIndex = startIndex + itemsVisibleInContainer * 3;
                //console.log("triggered start", startIndex, endIndex);
            } else {
                endIndex = endSentinelIndex + itemsVisibleInContainer;
                startIndex = endIndex - itemsVisibleInContainer * 3;
                //console.log("triggered end", startIndex, endIndex);
            }
            startIndex = Math.max(0, startIndex);
            endIndex = Math.min(this._itemList.length - 1, endIndex);
            this._renderItems(startIndex, endIndex);
        }
    }

    _renderItems(startIndex, endIndex) {
        const container = this.$contentContainer();
        const {_itemList: items,
                _itemsVisibleInContainer: itemsVisibleInContainer,
                _itemHeight: itemHeight,
                _displayedItems: displayedItems} = this;
        const detachedDomNodes = [];

        for (let i = 0; i < displayedItems.length; ++i) {
            const index = displayedItems[i].getIndex();
            if (!(startIndex <= index && index <= endIndex) && displayedItems[i].isVisible()) {
                detachedDomNodes.push(displayedItems[i].detach());
            }
        }

        for (let i = startIndex; i <= endIndex; ++i) {
            const item = items[i];
            if (!item.isVisible()) {
                item.attach(container, detachedDomNodes.length > 0 ? detachedDomNodes.pop() : null);
            }
            displayedItems[i - startIndex] = item;
        }

        for (let i = 0; i < detachedDomNodes.length; ++i) {
            detachedDomNodes[i].remove();
        }

        displayedItems.length = endIndex - startIndex + 1;

        let startSentinelIndex = 0;
        let endSentinelIndex = 0;

        if (displayedItems.length > 2) {
            startSentinelIndex = Math.max(0, Math.min(items.length - 1, (startIndex + Math.ceil(itemsVisibleInContainer / 2))));
            endSentinelIndex = Math.min(items.length - 1, Math.max(0, (endIndex - Math.ceil(itemsVisibleInContainer / 2))));
        }
        this._startSentinelIndex = startSentinelIndex;
        this._endSentinelIndex = endSentinelIndex;
        this._startSentinel.setTransform(`translateY(${startSentinelIndex * itemHeight}px)`);
        this._endSentinel.setTransform(`translateY(${endSentinelIndex * itemHeight}px)`);
        this._emitScrollPositionChange();
    }

    _onScroll() {
        if (this._itemList.length === 0) {
            return;
        }
        const scrollTop = this.getScrollTop();
        const contentHeight = this.contentHeight();
        const {_itemList: items,
                _itemsVisibleInContainer: itemsVisibleInContainer,
                _itemHeight: itemHeight} = this;

        const itemsBefore = Math.min(items.length, scrollTop / itemHeight | 0);
        const itemsWithin = Math.min(items.length, Math.ceil(contentHeight / itemHeight));
        const startIndex = Math.max(itemsBefore - itemsVisibleInContainer, 0);
        const endIndex = Math.min(items.length - 1, itemsWithin + itemsBefore + itemsVisibleInContainer);
        this._renderItems(startIndex, endIndex);
    }
}
