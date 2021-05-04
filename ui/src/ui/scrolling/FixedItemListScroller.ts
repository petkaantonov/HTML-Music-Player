import { SelectDeps } from "ui/Application";
import { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import ContentScroller from "ui/ui/scrolling/ContentScroller";

export interface FixedItemListScrollerOpts<T extends DisplayableItem> {
    target: DomWrapperSelector;
    contentContainer: DomWrapperSelector;
    itemHeight: number;
    minPrerenderedItems: number;
    maxPrerenderedItems: number;
    itemList: T[];
}

export interface DisplayableItem {
    getIndex: () => number;
    isVisible: () => boolean;
    detach: () => DomWrapper | null;
    attach: (target: DomWrapperSelector, node?: DomWrapper) => void;
}

type Deps = SelectDeps<"page">;

export default class FixedItemListScroller<T extends DisplayableItem> extends ContentScroller {
    private _itemHeight: number;
    private _itemList: T[];
    private _displayedItems: T[];
    private _minPrerenderedItems: number;
    private _maxPrerenderedItems: number;
    private _detachedDomNodes: DomWrapper[];
    private _sentinel: DomWrapper;
    constructor(
        {
            target,
            contentContainer,
            itemHeight,
            itemList,
            minPrerenderedItems,
            maxPrerenderedItems,
        }: FixedItemListScrollerOpts<T>,
        deps: Deps
    ) {
        super({ target, contentContainer }, deps);
        this._itemHeight = itemHeight;
        this._itemList = itemList;
        this._displayedItems = new Array(300);
        this._displayedItems.length = 0;
        this._minPrerenderedItems = minPrerenderedItems || 15;
        this._maxPrerenderedItems = maxPrerenderedItems || 100;
        this._sentinel = this._page
            .createElement(`div`)
            .setStyles({
                width: `1px`,
                height: `1px`,
                position: `absolute`,
                transform: `translate3d(0, 0, 0)`,
            })
            .setText(` `)
            .prependTo(this.$contentContainer());
        this._detachedDomNodes = [];
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
            this._rect = rect = this.$contentContainer()[0]!.getBoundingClientRect();
        }
        return rect.height;
    }

    coordsToIndexRange(startY: number, endY: number) {
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
            endIndex,
        };
    }

    getEdgeByCoordinateWithinMargin(y: number, margin: number) {
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

    mapYCoordinate(y: number) {
        const top = this._top;
        return Math.min(this.contentHeight(), Math.max(0, y - top)) + this.getScrollTop();
    }

    indexByYCoordinate(y: number) {
        let index = (this.mapYCoordinate(y) / this.itemHeight()) | 0;
        index = Math.min(this.length() - 1, Math.max(0, index));
        return index;
    }

    itemByYCoordinate(y: number) {
        const index = this.indexByYCoordinate(y);
        if (index < 0) return null;
        return this._itemList[index];
    }

    itemByRect(rect: DOMRect) {
        return this.itemByYCoordinate(rect.top + rect.height / 2);
    }

    yByIndex(index: number) {
        index = Math.min(this.length() - 1, Math.max(0, index));
        if (index <= 0) return 0;
        return index * this.itemHeight();
    }

    get maxIndex() {
        return this._itemList.length - 1;
    }

    _onScroll(forced = false) {
        const scrollTop = super._onScroll(forced);
        const { _itemHeight: itemHeight, _displayedItems: displayedItems } = this;

        const contentHeight = this.contentHeight();

        if (displayedItems.length > 2 && !forced) {
            const virtualStart = displayedItems[0]!.getIndex();
            const virtualEnd = displayedItems[displayedItems.length - 1]!.getIndex();
            const { _minPrerenderedItems: minPrerenderedItems, maxIndex } = this;

            const screenStart = Math.max(0, Math.floor(scrollTop / itemHeight) - minPrerenderedItems);
            const screenEnd = Math.min(
                maxIndex,
                Math.ceil((scrollTop + contentHeight + itemHeight) / itemHeight) + minPrerenderedItems
            );

            if (screenStart >= virtualStart && screenEnd <= virtualEnd) {
                return scrollTop;
            }
        }

        const { _itemList: items, _maxPrerenderedItems: maxPrerenderedItems } = this;
        const container = this.$contentContainer();
        const itemsBefore = Math.min(items.length, (scrollTop / itemHeight) | 0);
        const itemsWithin = Math.min(items.length, Math.ceil(contentHeight / itemHeight));

        const start = Math.max(itemsBefore - maxPrerenderedItems, 0);
        const end = Math.min(items.length - 1, itemsWithin + itemsBefore + maxPrerenderedItems);

        const detachedDomNodes = this._detachedDomNodes;

        for (let i = 0; i < displayedItems.length; ++i) {
            const index = displayedItems[i]!.getIndex();
            if (!(start <= index && index <= end) && displayedItems[i]!.isVisible()) {
                detachedDomNodes.push(displayedItems[i]!.detach()!);
            }
        }

        for (let i = start; i <= end; ++i) {
            const item = items[i]!;
            if (!item.isVisible()) {
                const node = detachedDomNodes.length > 0 ? detachedDomNodes.pop() : undefined;
                item.attach(container, node);
            }
            displayedItems[i - start] = item;
        }

        for (let i = 0; i < detachedDomNodes.length; ++i) {
            detachedDomNodes[i]!.remove();
        }

        displayedItems.length = end - start + 1;
        return scrollTop;
    }
}
