import EventEmitter from "events";

export const SCROLL_POSITION_CHANGE_EVENT = `scrollPositionChange`;

export default class ContentScroller extends EventEmitter {
    constructor({target, contentContainer}, {page}) {
        super();
        this._page = page;
        this._domNode = this._page.$(target).eq(0);
        this._contentContainer = this._page.$(contentContainer).eq(0);
        this._rect = this.$contentContainer()[0].getBoundingClientRect();
        const {left, top} = this._getTopLeft();
        this._left = left;
        this._top = top;
    }

    $() {
        return this._domNode;
    }

    $contentContainer() {
        return this._contentContainer;
    }

    getScrollTop() {
        return this.$contentContainer()[0].scrollTop | 0;
    }

    setScrollTop(value) {
        this.$contentContainer()[0].scrollTop = value | 0;
    }

    refresh() {
        this._onScroll(true);
    }

    scrollToUnsnapped(top) {
        this.setScrollTop(top);
        this._onScroll();
    }

    scrollBy(amount) {
        if (amount === 0) return;
        this.setScrollTop(amount + this.getScrollTop());
        this._onScroll();
    }

    resize() {
        const {top, left} = this._getTopLeft();
        this._top = top + (this.$()[0].clientHeight - this.$contentContainer()[0].clientHeight);
        this._left = left + (this.$()[0].clientWidth - this.$contentContainer()[0].clientWidth);
        this._rect = this.$contentContainer()[0].getBoundingClientRect();
    }

    scrollIntoViewIfNotVisible(element) {
        const bounds = element.getBoundingClientRect();
        let {top} = this._rect;
        const {left, right, bottom} = this._rect;
        top += this.getScrollTop();
        const isVisible = (!(right < bounds.left || left > bounds.right || bottom < bounds.top || top > bounds.bottom));

        if (!isVisible) {
            element.scrollIntoView(false);
        }
    }

    _getTopLeft() {
        return this.$()[0].getBoundingClientRect();
    }

    _onScroll() {
        const scrollTop = this.getScrollTop();
        this.emit(SCROLL_POSITION_CHANGE_EVENT, scrollTop);
    }
}
