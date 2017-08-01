import ContentScroller from "ui/scrolling/ContentScroller";
import {throttle} from "util";

export default class FixedItemListScroller extends ContentScroller {
    constructor({
        target, contentContainer, itemHeight, itemList, minPrerenderedItems, maxPrerenderedItems
    }, deps) {
        super({target, contentContainer}, deps);
        this._itemHeight = itemHeight;
        this._itemList = itemList;
        this._displayedItems = new Array(300);
        this._displayedItems.length = 0;
        this._minPrerenderedItems = minPrerenderedItems || 15;
        this._maxPrerenderedItems = maxPrerenderedItems || 100;
        this._sentinel = this._page.createElement(`div`).setStyles({
            width: `1px`,
            height: `1px`,
            position: `absolute`,
            transform: `translate3d(0, 0, 0)`
        }).setText(` `).prependTo(this.$contentContainer());
        this._onScroll = throttle(this._onScroll, 33, this);
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

    _onScroll(forced = false) {
        const scrollTop = super._onScroll(forced);
        const {_itemHeight: itemHeight, _displayedItems: displayedItems} = this;

        const contentHeight = this.contentHeight();

        if (displayedItems.length > 2 && !forced) {

            const virtualStart = displayedItems[0].getIndex();
            const virtualEnd = displayedItems[displayedItems.length - 1].getIndex();

            const screenStart = Math.ceil(scrollTop / itemHeight);
            const screenEnd = Math.floor((scrollTop + contentHeight) / itemHeight);

            if (screenStart >= virtualStart && screenEnd <= virtualEnd) {
                return scrollTop;
            }
        }

        const {_itemList: items, _maxPrerenderedItems: maxPrerenderedItems} = this;
        const container = this.$contentContainer();
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

        for (let i = 0; i < detachedDomNodes.length; ++i) {
            detachedDomNodes[i].remove();
        }

        displayedItems.length = end - start + 1;
        return scrollTop;
    }
}
