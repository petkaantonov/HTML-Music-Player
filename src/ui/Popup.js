import EventEmitter from "events";
import {inherits, toFunction, noop, noUndefinedGet} from "util";

function PopupButton(popup, opts) {
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
            addEventListener(`mousedown`, this.page().preventDefaultHandler);
    this._tapRecognizer.recognizeBubbledOn(this.$());
}

PopupButton.prototype.page = function() {
    return this._popup.page;
};

PopupButton.prototype.id = function() {
    return this._id;
};

PopupButton.prototype.$ = function() {
    return this._domNode;
};

PopupButton.prototype.disable = function() {
    if (!this._enabled) return;
    this._enabled = false;
    this.$().blur().setProperty(`tabIndex`, -1);
    this.$().addClass(this._popup.buttonDisabledClass);
};

PopupButton.prototype.enable = function() {
    if (this._enabled) return;
    this._enabled = true;
    this.$().setProperty(`tabIndex`, 0);
    this.$().removeClass(this._popup.buttonDisabledClass);
};

PopupButton.prototype._clicked = function(e) {
    this._popup.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, this._popup.zIndexAbove());
    if (!this._enabled) return;
    this._action.call(null, e);
};

PopupButton.prototype.destroy = function() {
    this.$().remove();
};

export default function Popup(opts, deps) {
    EventEmitter.call(this);
    opts = noUndefinedGet(opts);
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.recognizerContext = deps.recognizerContext;
    this.scrollerContext = deps.scrollerContext;
    this.rippler = deps.rippler;
    this.transitionClass = opts.transitionClass || ``;
    this.beforeTransitionIn = opts.beforeTransitionIn || noop;
    this.beforeTransitionOut = opts.beforeTransitionOut || noop;
    this.containerClass = opts.containerClass;
    this.headerClass = opts.headerClass;
    this.footerClass = opts.footerClass;
    this.bodyClass = opts.bodyClass;
    this.scrollAreaContainerClass = opts.scrollAreaContainerClass;
    this.bodyContentClass = opts.bodyContentClass;
    this.closerContainerClass = opts.closerContainerClass;
    this.scrollbarContainerClass = opts.scrollbarContainerClass;
    this.scrollbarRailClass = opts.scrollbarRailClass;
    this.scrollbarKnobClass = opts.scrollbarKnobClass;
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

    this._bodyScrolled = this._bodyScrolled.bind(this);
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
    this._rect = null;
    this._viewPort = null;
    this._activeElementBeforeOpen = null;

}
inherits(Popup, EventEmitter);

Popup.prototype._buttonById = function(id) {
    for (let i = 0; i < this._footerButtons.length; ++i) {
        if (this._footerButtons[i].id() === id) {
            return this._footerButtons[i];
        }
    }
    return null;
};

Popup.prototype.disableButton = function(id) {
    this._buttonById(id).disable();
};

Popup.prototype.enableButton = function(id) {
    this._buttonById(id).enable();
};

Popup.prototype.setButtonEnabledState = function(id, state) {
    const button = this._buttonById(id);
    if (state) {
        button.enable();
    } else {
        button.disable();
    }
};

Popup.prototype._deinitDom = function() {
    this.$().hide().removeClass([this.transitionClass, `initial`]);
};

Popup.prototype._initDom = function() {
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

    const body = this.page.createElement(`div`).addClass([this.bodyClass, this.scrollAreaContainerClass]);
    const bodyContent = this.page.createElement(`div`).addClass(this.bodyContentClass).setHtml(`${this.body()}`);
    const closer = this.page.createElement(`div`).addClass(this.closerContainerClass).setHtml(`${this.closer()}`);
    const scrollbar = this.page.createElement(`div`).addClass(this.scrollbarContainerClass);
    const scrollbarRail = this.page.createElement(`div`).addClass(this.scrollbarRailClass);
    const scrollbarKnob = this.page.createElement(`div`).addClass(this.scrollbarKnobClass);

    headerText.appendTo(header);
    closer.appendTo(header);
    header.appendTo(ret);
    bodyContent.appendTo(body);
    scrollbar.appendTo(body);
    body.appendTo(ret);

    if (this._footerButtons.length > 0) {
        const footer = this.page.createElement(`div`).addClass(this.footerClass);
        for (let i = 0; i < this._footerButtons.length; ++i) {
            this._footerButtons[i].$().appendTo(footer);
        }
        footer.appendTo(ret);
    } else {
        ret.addClass(`no-footer`);
    }
    lastFocusItem.appendTo(ret);

    scrollbarRail.appendTo(scrollbar);
    scrollbarKnob.appendTo(scrollbar);

    closer.addEventListener(`click`, this.closerClicked);
    header.addEventListener(`mousedown`, this.headerMouseDowned);
    this.closerTapRecognizer.recognizeBubbledOn(closer);
    this.headerTouchedRecognizer.recognizeBubbledOn(header);

    this._contentScroller = this.scrollerContext.createContentScroller({
        target: body,
        contentContainer: bodyContent,

        scrollerOpts: {
            scrollingX: false,
            snapping: false,
            zooming: false,
            paging: false
        },

        scrollbarOpts: {
            target: scrollbar,
            railSelector: `.${this.scrollbarRailClass}`,
            knobSelector: `.${this.scrollbarKnobClass}`
        }
    });

    this._popupDom = ret;
};


Popup.prototype.zIndex = function() {
    return this._zIndex;
};

Popup.prototype.zIndexAbove = function() {
    return this.zIndex() + 40;
};

Popup.prototype.destroy = function() {
    this.globalEvents.removeListener(`resize`, this._reLayout);
    this._deinitDom();
};

Popup.prototype.$ = function() {
    return this._popupDom;
};

Popup.prototype._getViewPort = function() {
    return {
        width: this.page.width(),
        height: this.page.height()
    };
};

Popup.prototype._bodyScrolled = function(e) {
    e.target.scrollTop = 0;
};

Popup.prototype._elementFocused = function(e) {
    if (this._shown) {
        const $target = this.page.$(e.target);
        if ($target.closest(this.$()).length === 0 || $target.hasClass(`last-focus-item`)) {
            e.stopPropagation();
            this.$().focus();
        } else {
            const body = this.$().find(`.popup-body`);
            if ($target.closest(body).length !== 0) {
                this._contentScroller.scrollIntoView(e.target, true);
            }
        }
    }
};

Popup.prototype._reLayout = function() {
    if (!this._shown) return;
    this.page.changeDom(() => {
        this._viewPort = this._getViewPort();
        this.position();
        this._setMinimumNecessaryHeight();
        this._contentScroller.resize();
    });
};

Popup.prototype.position = function() {
    this._frameId = -1;
    if (!this._shown) return;
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
    this._renderCssPosition();
};

Popup.prototype.refresh = function() {
    if (!this._shown) return;
    this.draggingEnd();
    this.position();
};

Popup.prototype.closerClicked = function() {
    this.close();
};

Popup.prototype._renderCssPosition = function() {
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
};

Popup.prototype._setMinimumNecessaryHeight = function() {
    const headerHeight = this.$().find(`.popup-header`).outerHeight();
    const footerHeight = this.$().find(`.popup-footer`).outerHeight();
    const contentHeight = this.$().find(`.popup-body-content`)[0].offsetHeight + 2;
    this.$().setStyle(`height`, `${Math.min(this._viewPort.height, contentHeight + footerHeight + headerHeight)}px`);
};

Popup.prototype.open = function() {
    if (this._shown) return;
    this._activeElementBeforeOpen = this.page.activeElement();
    this._shown = true;

    const firstOpen = this._popupDom === this.page.NULL();
    this._initDom();
    this.emit(`open`, this, firstOpen);
    this._rect = this.$()[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();
    this.position();
    this._setMinimumNecessaryHeight();
    this._contentScroller.loadScrollTop(this._scrollTop);

    if (this.transitionClass) {
        this.$().
            detach().
            addClass([this.transitionClass, `initial`]).
            forceReflow().
            appendTo(`body`).
            removeClass(`initial`).
            forceReflow();
    }
    this.beforeTransitionIn(this.$());
    this.$().focus();

    this.page.addDocumentListener(`focus`, this._elementFocused, true);
    this.$().find(`.popup-body`).addEventListener(`scroll`, this._bodyScrolled, true);
};

Popup.prototype.mousemoved = function(e) {
    if (!this._shown) return;
    if (!this.page.isTouchEvent(e) && e.which !== 1) {
        this.draggingEnd();
        return;
    }
    this._x = Math.max(0, e.clientX - this._anchorDistanceX);
    this._y = Math.max(0, e.clientY - this._anchorDistanceY);
    if (this._frameId === -1) {
        this._frameId = this.page.requestAnimationFrame(this.position);
    }
};

Popup.prototype.headerMouseDowned = function(e) {
    if (!this._shown || this._dragging || (this.page.isTouchEvent(e) && e.isFirst === false)) return;
    if (this.page.$(e.target).closest(`.${this.closerContainerClass}`).length > 0) return;
    this._dragging = true;
    this._anchorDistanceX = e.clientX - this._x;
    this._anchorDistanceY = e.clientY - this._y;
    this._rect = this._popupDom[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();

    this.page.addDocumentListener(`mouseup`, this.draggingEnd);
    this.page.addDocumentListener(`mousemove`, this.mousemoved);
    this.popupDragRecognizer.recognizeCapturedOn(this.page.document());

    this.$().
        setStyles({left: `0px`, top: `0px`, willChange: `transform`}).
        setTransform(`translate(${this._x}px,${this._y}px)`);
};

Popup.prototype.draggingEnd = function() {
    if (!this._dragging) return;
    this._dragging = false;
    this.page.removeDocumentListener(`mouseup`, this.draggingEnd);
    this.page.removeDocumentListener(`mousemove`, this.mousemoved);
    this.popupDragRecognizer.unrecognizeCapturedOn(this.page.document());

    this.$().setStyles({left: `${this._x}px`, top: `${this._y}px`, willChange: ``}).
            setTransform(`none`);
};

Popup.prototype.close = async function() {
    if (!this._shown) return;
    const elementToFocus = this._activeElementBeforeOpen;
    this._activeElementBeforeOpen = null;

    this.page.removeDocumentListener(`focus`, this._elementFocused, true);
    this.$().find(`.popup-body`).removeEventListener(`scroll`, this._bodyScrolled, true);
    this._shown = false;
    this._scrollTop = this._contentScroller.settledScrollTop();

    this.emit(`close`, this);
    const deferredDeinit = Promise.resolve(this.beforeTransitionOut(this._popupDom));
    this.draggingEnd();

    if (elementToFocus) {
        elementToFocus.focus();
    }

    try {
        await deferredDeinit;
    } finally {
        this._deinitDom();
    }
};

Popup.prototype.getScrollPosition = function() {
    return {
        x: 0,
        y: this._scrollTop
    };
};

Popup.prototype.setScrollPosition = function(pos) {
    if (!pos) return;
    const y = +pos.y;
    if (!isFinite(y)) return;
    this._scrollTop = y;
    if (this._contentScroller && this._shown) {
        this._contentScroller.loadScrollTop(this._scrollTop);
    }
};

Popup.prototype.getScreenPosition = function() {
    if (this._x === -1 || this._y === -1) return null;
    return {
        x: this._x,
        y: this._y
    };
};

Popup.prototype.setScreenPosition = function(pos) {
    if (!pos) return;
    const {x, y} = pos;
    if (!isFinite(x) || !isFinite(y)) return;
    this._x = x;
    this._y = y;
    this.position();
};
