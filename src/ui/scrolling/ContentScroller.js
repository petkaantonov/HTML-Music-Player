import {noUndefinedGet} from "util";
import withDeps from "ApplicationDependencies";

export default class ContentScroller {
    constructor({target, contentContainer}, {page}) {
        this._page = page;
        this._domNode = this._page.$(target).eq(0);
        this._contentContainer = this._page.$(contentContainer).eq(0);
        this._rect = this.$contentContainer()[0].getBoundingClientRect();
        const {left, top} = this._getTopLeft();
        this._left = left;
        this._top = top;
        this.$contentContainer().addEventListener(`scroll`, () => { this._onScroll(); });
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

    scrollToUnsnapped(top, animate) {
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
    }

    _getTopLeft() {
        return this.$()[0].getBoundingClientRect();
    }

    _onScroll() {
        // NOOP.
    }
}
