import EventEmitter from "events";
import {toFunction, noop, noUndefinedGet, _equals, _, _call} from "util";
import {isTouchEvent, preventDefaultHandler} from "platform/dom/Page";

class PopupButton {
    constructor(popup, opts) {
        opts = noUndefinedGet(opts);
        this._popup = popup;
        this._id = opts.id;
        this._action = opts.action;
        this._text = opts.text;
        this._enabled = true;
        this._domNode = this.page().createElement(`div`).addClass(popup.popupButtonClass).
                                setProperty(`tabIndex`, 0).
                                setText(this._text);

        this._clicked = this._clicked.bind(this);
        this._tapRecognizer = this._popup.recognizerContext.createTapRecognizer(this._clicked);

        this.$().addEventListener(`click`, this._clicked).
                addEventListener(`mousedown`, preventDefaultHandler);
        this._tapRecognizer.recognizeBubbledOn(this.$());
    }

    page() {
        return this._popup.page;
    }

    id() {
        return this._id;
    }

    $() {
        return this._domNode;
    }

    setWidth(width) {
        this.$().setStyle(`width`, `${width}px`);
    }

    disable() {
        if (!this._enabled) return;
        this._enabled = false;
        this.$().blur().setProperty(`tabIndex`, -1);
        this.$().addClass(this._popup.buttonDisabledClass);
    }

    enable() {
        if (this._enabled) return;
        this._enabled = true;
        this.$().setProperty(`tabIndex`, 0);
        this.$().removeClass(this._popup.buttonDisabledClass);
    }

    _clicked(e) {
        this._popup.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this._popup.zIndexAbove());
        if (!this._enabled) return;
        this._action.call(null, e);
    }

    destroy() {
        this.$().remove();
    }
}

export default class Popup extends EventEmitter {

    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.env = deps.env;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.scrollerContext = deps.scrollerContext;
        this.rippler = deps.rippler;
        this.beforeTransitionIn = opts.beforeTransitionIn || noop;
        this.beforeTransitionOut = opts.beforeTransitionOut || noop;
        this.containerClass = opts.containerClass;
        this.headerClass = opts.headerClass;
        this.footerClass = opts.footerClass;
        this.bodyClass = opts.bodyClass;
        this.bodyContentClass = opts.bodyContentClass;
        this.closerContainerClass = opts.closerContainerClass;
        this.popupButtonClass = opts.popupButtonClass;
        this.buttonDisabledClass = opts.buttonDisabledClass;

        this.body = toFunction(opts.body || ``);
        this.title = toFunction(opts.title || ``);
        this.closer = toFunction(opts.closer || ``);
        this._x = -1;
        this._y = -1;
        this._rect = null;
        this._anchorDistanceX = -1;
        this._anchorDistanceY = -1;
        this._shown = false;
        this._dragging = false;
        this._frameId = -1;
        this._scrollTop = 0;
        this._zIndex = +opts.zIndex;

        this._footerButtons = (opts.footerButtons || []).map(function(v) {
            return new PopupButton(this, v);
        }, this);
        this._contentScroller = null;

        this._elementFocused = this._elementFocused.bind(this);
        this._reLayout = this._reLayout.bind(this);
        this.position = this.position.bind(this);
        this.close = this.close.bind(this);
        this.headerMouseDowned = this.headerMouseDowned.bind(this);
        this.draggingEnd = this.draggingEnd.bind(this);
        this.mousemoved = this.mousemoved.bind(this);
        this.closerClicked = this.closerClicked.bind(this);

        this.closerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closerClicked);
        this.headerTouchedRecognizer = this.recognizerContext.createTouchdownRecognizer(this.headerMouseDowned);
        this.popupDragRecognizer = this.recognizerContext.createDragRecognizer(this.mousemoved, this.draggingEnd);

        this.globalEvents.on(`resize`, this._reLayout);

        this._popupDom = this.page.NULL();
        this._viewPort = null;
        this._activeElementBeforeOpen = null;
    }

    $() {
        return this._popupDom;
    }

    $footer() {
        return this.$().find(`.${this.footerClass}`);
    }

    isMobile() {
        return this.env.isMobileScreenSize(this._viewPort);
    }

    _buttonById(id) {
        return this._footerButtons.find(_equals.id(id));
    }

    disableButton(id) {
        this._buttonById(id).disable();
    }

    enableButton(id) {
        this._buttonById(id).enable();
    }

    setButtonEnabledState(id, state) {
        const button = this._buttonById(id);
        if (state) {
            button.enable();
        } else {
            button.disable();
        }
    }

    _deinitDom() {
        this.$().hide();
    }

    _initDom() {
        if (this._popupDom !== this.page.NULL()) {
            this.$().show();
            return;
        }

        const ret = this.page.createElement(`div`).
           addClass(this.containerClass).
           setStyle(`position`, `absolute`).
           setProperty(`tabIndex`, -1).
           appendTo(`body`);

        const lastFocusItem = this.page.createElement(`div`).addClass(`last-focus-item`).setProperty(`tabIndex`, 0);
        const headerText = this.page.createElement(`h2`).setText(`${this.title()}`);
        const header = this.page.createElement(`div`).addClass(this.headerClass);

        const body = this.page.createElement(`div`).addClass([this.bodyClass]);
        const bodyContent = this.page.createElement(`div`).addClass(this.bodyContentClass).setHtml(`${this.body()}`);
        const closer = this.page.createElement(`div`).addClass(this.closerContainerClass).setHtml(`${this.closer()}`);

        headerText.appendTo(header);
        closer.appendTo(header);
        header.appendTo(ret);
        bodyContent.appendTo(body);
        body.appendTo(ret);

        if (this._footerButtons.length > 0) {
            const footer = this.page.createElement(`div`).addClass(this.footerClass);
            this._footerButtons.map(_.$).forEach(_call.appendTo(footer));
            footer.appendTo(ret);
        } else {
            ret.addClass(`no-footer`);
        }
        lastFocusItem.appendTo(ret);

        closer.addEventListener(`click`, this.closerClicked);
        header.addEventListener(`mousedown`, this.headerMouseDowned);
        this.closerTapRecognizer.recognizeBubbledOn(closer);
        this.headerTouchedRecognizer.recognizeBubbledOn(header);

        this._contentScroller = this.scrollerContext.createContentScroller({
            target: body,
            contentContainer: bodyContent
        });
        this._popupDom = ret;
    }


    zIndex() {
        return this._zIndex;
    }

    zIndexAbove() {
        return this.zIndex() + 40;
    }

    destroy() {
        this.globalEvents.removeListener(`resize`, this._reLayout);
        this._deinitDom();
    }

    _getViewPort() {
        return {
            width: this.page.width(),
            height: this.page.height()
        };
    }

    _elementFocused(e) {
        if (this._shown) {
            const $target = this.page.$(e.target);
            if ($target.closest(this.$()).length === 0 || $target.hasClass(`last-focus-item`)) {
                e.stopPropagation();
                this.$().focus();
            } else {
                const body = this.$().find(`.popup-body`);
                if ($target.closest(body).length !== 0) {
                    this._contentScroller.scrollIntoViewIfNotVisible(e.target);
                }
            }
        }
    }

    _updateFooterButtonWidths() {
        if (this._footerButtons.length > 0) {
            const footerWidth = this.$footer().innerWidth();
            const buttonWidth = (footerWidth / this._footerButtons.length) | 0;
            this._footerButtons.forEach(_call.setWidth(buttonWidth));
        }
    }

    _updateLayout() {
        this._setMinimumNecessaryDimensions();
        this._updateRect();
        this.position();
        this._updateFooterButtonWidths();
        this._contentScroller.resize();
    }

    _reLayout() {
        if (!this._shown) return;
        this.page.changeDom(() => {
            this._viewPort = this._getViewPort();
            this._updateLayout();
            this.emit(`layoutUpdate`);
        });
    }

    position() {
        this._frameId = -1;
        if (!this._shown) return;
        if (this.isMobile()) {
            this._x = 0;
            this._y = 0;
        } else {
            let x = this._x;
            let y = this._y;
            const box = this._rect;
            const maxX = this._viewPort.width - box.width;
            const maxY = this._viewPort.height - box.height;

            if (x === -1) x = ((maxX + box.width) / 2) - (box.width / 2);
            if (y === -1) y = ((maxY + box.height) / 2) - (box.height / 2);

            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));

            this._x = x;
            this._y = y;
        }
        this._renderCssPosition();
    }

    refresh() {
        if (!this._shown) return;
        this.draggingEnd();
        this.position();
    }

    closerClicked() {
        this.close();
    }

    _renderCssPosition() {
        if (this._dragging) {
            this.$().setTransform(`translate(${
                this._x}px, ${
                this._y}px`);
        } else {
            this.$().setStyles({
                left: `${this._x}px`,
                top: `${this._y}px`
            });
        }
    }

    _setMinimumNecessaryDimensions() {
        if (this.isMobile()) {
            this.$().setStyles({
                height: `${this._viewPort.height}px`,
                width: `${this._viewPort.width}px`
            });
        } else {
            const headerHeight = this.$().find(`.popup-header`).outerHeight();
            const footerHeight = this.$().find(`.popup-footer`).outerHeight();
            const contentHeight = this.$().find(`.popup-body-content`)[0].offsetHeight + 2;
            const height = `${Math.min(this._viewPort.height, contentHeight + footerHeight + headerHeight)}px`;
            const width = `auto`;
            this.$().setStyles({width, height});
        }
    }

    _updateRect() {
        this._rect = this._popupDom[0].getBoundingClientRect();
    }

    isShown() {
        return this._shown;
    }

    async open() {
        if (this._shown) return;
        this._activeElementBeforeOpen = this.page.activeElement();
        this._shown = true;

        const firstOpen = this._popupDom === this.page.NULL();
        this._initDom();
        this.emit(`open`, this, firstOpen);
        this._viewPort = this._getViewPort();
        this._updateLayout();
        this._contentScroller.setScrollTop(this._scrollTop);

        this.emit(`layoutUpdate`);
        await this.beforeTransitionIn(this.$(), this._rect);
        this.emit(`layoutUpdate`);
        this.$().focus();

        this.page.addDocumentListener(`focus`, this._elementFocused, true);
    }

    mousemoved(e) {
        if (!this._shown || this.isMobile()) return;
        if (!isTouchEvent(e) && ((e.buttons & 1) !== 1)) {
            this.draggingEnd();
            return;
        }
        this._x = Math.max(0, e.clientX - this._anchorDistanceX);
        this._y = Math.max(0, e.clientY - this._anchorDistanceY);
        if (this._frameId === -1) {
            this._frameId = this.page.requestAnimationFrame(this.position);
        }
    }

    headerMouseDowned(e) {
        if (this.isMobile() || !this._shown || this._dragging || (isTouchEvent(e) && e.isFirst === false)) return;
        if (this.page.$(e.target).closest(`.${this.closerContainerClass}`).length > 0) return;
        this._dragging = true;
        this._anchorDistanceX = e.clientX - this._x;
        this._anchorDistanceY = e.clientY - this._y;
        this._updateRect();
        this._viewPort = this._getViewPort();

        this.page.addDocumentListener(`mouseup`, this.draggingEnd);
        this.page.addDocumentListener(`mousemove`, this.mousemoved);
        this.popupDragRecognizer.recognizeCapturedOn(this.page.document());

        this.$().
            setStyles({left: `0px`, top: `0px`, willChange: `transform`}).
            setTransform(`translate(${this._x}px,${this._y}px)`);
    }

    draggingEnd() {
        if (!this._dragging) return;
        this._dragging = false;
        this.page.removeDocumentListener(`mouseup`, this.draggingEnd);
        this.page.removeDocumentListener(`mousemove`, this.mousemoved);
        this.popupDragRecognizer.unrecognizeCapturedOn(this.page.document());

        this.$().setStyles({left: `${this._x}px`, top: `${this._y}px`, willChange: ``}).
                setTransform(`none`);
    }

    async close() {
        if (!this._shown) return;
        const elementToFocus = this._activeElementBeforeOpen;
        this._activeElementBeforeOpen = null;

        this.page.removeDocumentListener(`focus`, this._elementFocused, true);
        this._shown = false;
        this._scrollTop = this._contentScroller.getScrollTop();

        this.emit(`close`, this);
        const deferredDeinit = Promise.resolve(this.beforeTransitionOut(this._popupDom, this._rect));
        this.draggingEnd();

        if (elementToFocus) {
            elementToFocus.focus();
        }

        try {
            await deferredDeinit;
        } finally {
            this._deinitDom();
        }
    }

    getScrollPosition() {
        return {
            x: 0,
            y: this._scrollTop
        };
    }

    setScrollPosition(pos) {
        if (!pos) return;
        const y = +pos.y;
        if (!isFinite(y)) return;
        this._scrollTop = y;
        if (this._contentScroller && this._shown) {
            this._contentScroller.setScrollTop(this._scrollTop);
        }
    }

    getScreenPosition() {
        if (this._x === -1 || this._y === -1) return null;
        return {
            x: this._x,
            y: this._y
        };
    }

    setScreenPosition(pos) {
        if (!pos) return;
        const {x, y} = pos;
        if (!isFinite(x) || !isFinite(y)) return;
        this._x = x;
        this._y = y;
        this.position();
    }

}
