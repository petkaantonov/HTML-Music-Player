import { SelectDeps } from "Application";
import EventEmitter from "eventsjs";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import { EventEmitterInterface } from "types/helpers";

export interface ContentScrollerOpts {
    target: DomWrapperSelector;
    contentContainer: DomWrapperSelector;
}

interface ContentScrollerEventsMap {
    scrollPositionChanged: (position: number) => void;
}

export default interface ContentScroller extends EventEmitterInterface<ContentScrollerEventsMap> {}

type Deps = SelectDeps<"page">;

export default class ContentScroller extends EventEmitter {
    protected _page: Page;
    protected _domNode: DomWrapper;
    protected _contentContainer: DomWrapper;
    protected _rect: DOMRect;
    protected _left: number;
    protected _top: number;
    constructor({ target, contentContainer }: ContentScrollerOpts, { page }: Deps) {
        super();
        this._page = page;
        this._domNode = this._page.$(target).eq(0);
        this._contentContainer = this._page.$(contentContainer).eq(0);
        this._rect = this.$contentContainer()[0]!.getBoundingClientRect();
        const { left, top } = this._getTopLeft();
        this._left = left;
        this._top = top;
        this.$contentContainer().addEventListener(`scroll`, () => {
            this._onScroll();
        });
    }

    $() {
        return this._domNode;
    }

    $contentContainer() {
        return this._contentContainer;
    }

    getScrollTop() {
        return this.$contentContainer()[0]!.scrollTop | 0;
    }

    setScrollTop(value: number) {
        this.$contentContainer()[0]!.scrollTop = value | 0;
    }

    refresh() {
        this._onScroll(true);
    }

    scrollToUnsnapped(top: number) {
        this.setScrollTop(top);
        this._onScroll();
    }

    scrollBy(amount: number) {
        if (amount === 0) return;
        this.setScrollTop(amount + this.getScrollTop());
        this._onScroll();
    }

    resize() {
        const { top, left } = this._getTopLeft();
        this._top = top + (this.$()[0]!.clientHeight - this.$contentContainer()[0]!.clientHeight);
        this._left = left + (this.$()[0]!.clientWidth - this.$contentContainer()[0]!.clientWidth);
        this._rect = this.$contentContainer()[0]!.getBoundingClientRect();
    }

    scrollIntoViewIfNotVisible(element: HTMLElement) {
        const bounds = element.getBoundingClientRect();
        let { top } = this._rect;
        const { left, right, bottom } = this._rect;
        top += this.getScrollTop();
        const isVisible = !(right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom);

        if (!isVisible) {
            element.scrollIntoView(false);
        }
    }

    _getTopLeft() {
        return this.$()[0]!.getBoundingClientRect();
    }

    _onScroll(_forced?: boolean) {
        const scrollTop = this.getScrollTop();
        this.emit("scrollPositionChanged", scrollTop);
        return scrollTop;
    }
}
