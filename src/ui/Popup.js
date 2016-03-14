"use strict";
import $ from "jquery";
import Promise from "bluebird";
import EventEmitter from "events";
import { combineClasses, inherits, offCapture, onCapture, toFunction } from "lib/util";
import { reflow, isTouchEvent, preventDefault, setTransform } from "lib/DomUtil";

const NULL = $(null);

function PopupButton(popup, opts) {
    opts = Object(opts);
    this._popup = popup;
    this._id = opts.id;
    this._action = opts.action;
    this._text = opts.text;
    this._enabled = true;
    this._domNode = $("<div>", {class: popup.popupButtonClass}).prop("tabIndex", 0).text(this._text);

    this._clicked = this._clicked.bind(this);
    this._tapRecognizer = this._popup.recognizerMaker.createTapRecognizer(this._clicked);

    this.$().on("click", this._clicked).mousedown(preventDefault);
    this._tapRecognizer.recognizeBubbledOn(this.$());
}

PopupButton.prototype.id = function() {
    return this._id;
};

PopupButton.prototype.$ = function() {
    return this._domNode;
};

PopupButton.prototype.disable = function() {
    if (!this._enabled) return;
    this._enabled = false;
    this.$().blur().prop("tabIndex", -1);
    this.$().addClass(this._popup.buttonDisabledClass);
};

PopupButton.prototype.enable = function() {
    if (this._enabled) return;
    this._enabled = true;
    this.$().prop("tabIndex", 0);
    this.$().removeClass(this._popup.buttonDisabledClass);
};

PopupButton.prototype._clicked = function(e) {
    if (!this._enabled) return;
    this._popup.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, Popup.HIGHER_ZINDEX);
    this._action.call(null, e);
};

PopupButton.prototype.destroy = function() {
    this.removeAllListeners();
    this.$().remove();
};

export default function Popup(opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.globalEvents = opts.globalEvents;
    this.recognizerMaker = opts.recognizerMaker;
    this.scrollerMaker = opts.scrollerMaker;
    this.rippler = opts.rippler;
    this.transitionClass = opts.transitionClass || "";
    this.beforeTransitionIn = opts.beforeTransitionIn || $.noop;
    this.beforeTransitionOut = opts.beforeTransitionOut || $.noop;
    this.containerClass = combineClasses(opts.containerClass, "popup-container");
    this.headerClass = combineClasses(opts.headerClass, "popup-header");
    this.footerClass = combineClasses(opts.footerClass, "popup-footer");
    this.bodyClass = combineClasses(opts.bodyClass, "popup-body scrollbar-scrollarea");
    this.bodyContentClass = combineClasses(opts.bodyContentClass, "popup-body-content");
    this.closerContainerClass = combineClasses(opts.closerContainerClass, "popup-closer-container");
    this.scrollbarContainerClass = combineClasses(opts.scrollbarContainerClass, "scrollbar-container");
    this.scrollbarRailClass = combineClasses(opts.scrollbarRailClass, "scrollbar-rail");
    this.scrollbarKnobClass = combineClasses(opts.scrollbarKnobClass, "scrollbar-knob");
    this.popupButtonClass = combineClasses(opts.popupButtonClass, "popup-button");
    this.buttonDisabledClass = combineClasses(opts.buttonDisabledClass, "popup-button-disabled");

    this.body = toFunction(opts.body || "");
    this.title = toFunction(opts.title || "");
    this.closer = toFunction(opts.closer || "");
    this._x = -1;
    this._y = -1;
    this._rect = null;
    this._anchorDistanceX = -1;
    this._anchorDistanceY = -1;
    this._shown = false;
    this._dragging = false;
    this._frameId = -1;
    this._scrollTop = 0;

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

    this.closerTapRecognizer = this.recognizerMaker.createTapRecognizer(this.closerClicked);
    this.headerTouchedRecognizer = this.recognizerMaker.createTouchdownRecognizer(this.headerMouseDowned);
    this.popupDragRecognizer = this.recognizerMaker.createDragRecognizer(this.mousemoved, this.draggingEnd);

    this.globalEvents.on("resize", this._reLayout);

    this._popupDom = NULL;
    this._rect = null;
    this._viewPort = null;
    this._activeElementBeforeOpen = null;
}
inherits(Popup, EventEmitter);

Popup.prototype._buttonById = function(id) {
    for (var i = 0; i < this._footerButtons.length; ++i) {
        if (this._footerButtons[i].id() === id) {
            return this._footerButtons[i];
        }
    }
};

Popup.prototype.disableButton = function(id) {
    this._buttonById(id).disable();
};

Popup.prototype.enableButton = function(id) {
    this._buttonById(id).enable();
};

Popup.prototype.setButtonEnabledState = function(id, state) {
    var button = this._buttonById(id);
    if (state) {
        button.enable();
    } else {
        button.disable();
    }
};

Popup.prototype._deinitDom = function() {
    this.$().hide().removeClass(this.transitionClass).removeClass("initial");
};

Popup.prototype._initDom = function() {
    if (this._popupDom !== NULL) {
        this.$().show();
        return;
    }

    var ret = $("<div>", {
        class: this.containerClass,
    }).css({
        position: "absolute"
    }).prop("tabIndex", -1).appendTo("body");

    var lastFocusItem = $("<div>", {class: "last-focus-item"}).prop("tabIndex", 0);
    var headerText = $("<h2>").text(this.title() + "");
    var header = $("<div>", {class: this.headerClass});

    var body = $("<div>", {class: this.bodyClass});
    var bodyContent = $("<div>", {class: this.bodyContentClass}).html(this.body() + "");
    var closer = $("<div>", {class: this.closerContainerClass}).html(this.closer() + "");
    var scrollbar = $("<div>", {class: this.scrollbarContainerClass});
    var scrollbarRail = $("<div>", {class: this.scrollbarRailClass});
    var scrollbarKnob = $("<div>", {class: this.scrollbarKnobClass});

    headerText.appendTo(header);
    closer.appendTo(header);
    header.appendTo(ret);
    bodyContent.appendTo(body);
    scrollbar.appendTo(body);
    body.appendTo(ret);

    if (this._footerButtons.length > 0) {
        var footer = $("<div>", {class: this.footerClass});
        for (var i = 0; i < this._footerButtons.length; ++i) {
            this._footerButtons[i].$().appendTo(footer);
        }
        footer.appendTo(ret);
    } else {
        ret.addClass("no-footer");
    }
    lastFocusItem.appendTo(ret);

    scrollbarRail.appendTo(scrollbar);
    scrollbarKnob.appendTo(scrollbar);

    closer.on("click", this.closerClicked);
    header.on("mousedown", this.headerMouseDowned);
    this.closerTapRecognizer.recognizeBubbledOn(closer);
    this.headerTouchedRecognizer.recognizeBubbledOn(header);

    this._contentScroller = this.scrollerMaker.createContentScroller(body, {
        scrollingX: false,
        snapping: false,
        zooming: false,
        paging: false,
        contentContainer: bodyContent,
        scrollbar: scrollbar,
        railSelector: "." + this.scrollbarRailClass,
        knobSelector: "." + this.scrollbarKnobClass
    });

    this._popupDom = ret;
};

Popup.prototype.destroy = function() {
    this.globalEvents.removeListener("resize", this._reLayout);
    this._deinitDom();
};

Popup.prototype.$ = function() {
    return this._popupDom;
};

Popup.prototype._getViewPort = function() {
    return {
        width: $(window).width(),
        height: $(window).height()
    };
};

Popup.prototype._bodyScrolled = function(e) {
    e.target.scrollTop = 0;
};

Popup.prototype._elementFocused = function(e) {
    if (this._shown) {
        var $target = $(e.target);
        if ($target.closest(this.$()).length === 0 || $target.hasClass("last-focus-item")) {
            e.stopPropagation();
            this.$().focus();
        } else {
            var body = this.$().find(".popup-body");
            if ($target.closest(body).length !== 0) {
                this._contentScroller.scrollIntoView(e.target, true);
            }
        }
    }
};

Popup.prototype._reLayout = function() {
    if (!this._shown) return;
    var self = this;
    requestAnimationFrame(function() {
        self._viewPort = self._getViewPort();
        self.position();
        self._setMinimumNecessaryHeight();
        self._contentScroller.resize();
    });
};

Popup.prototype.position = function() {
    this._frameId = -1;
    if (!this._shown) return;
    var x = this._x;
    var y = this._y;
    var box = this._rect;
    var maxX = this._viewPort.width - box.width;
    var maxY = this._viewPort.height - box.height;

    if (x === -1) x = ((maxX + box.width) / 2) -  (box.width / 2);
    if (y === -1) y = ((maxY + box.height) / 2) -  (box.height / 2);

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
        setTransform(this.$()[0], "translate(" +
            (this._x /*- this._rect.width / 2*/) + "px, " +
            (this._y /*- this._rect.height / 2*/) + "px");
    } else {
        this.$().css({
            left: this._x,
            top: this._y
        });
    }
};

Popup.prototype._setMinimumNecessaryHeight = function() {
    var headerHeight = this.$().find(".popup-header").outerHeight(true);
    var footerHeight = this.$().find(".popup-footer").outerHeight(true) || 0;
    var contentHeight = this.$().find(".popup-body-content").outerHeight() + 2;
    this.$().css("height", Math.min(this._viewPort.height, contentHeight + footerHeight + headerHeight));
};

Popup.prototype.open = function() {
    if (this._shown) return;
    this._activeElementBeforeOpen = document.activeElement;
    this._shown = true;

    var firstOpen = this._popupDom === NULL;
    this._initDom();
    this.emit("open", this, firstOpen);
    this._rect = this.$()[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();
    this.position();
    this._setMinimumNecessaryHeight();
    this._contentScroller.loadScrollTop(this._scrollTop);

    if (this.transitionClass) {
        var $node = this.$();
        reflow($node);
        $node.detach();
        $node.addClass(this.transitionClass + " initial");
        reflow($node[0]);
        $node.appendTo("body");
        reflow($node[0]);
        $node.removeClass("initial");
        reflow($node[0]);
    }
    this.beforeTransitionIn(this.$());
    this.$().focus();
    onCapture(document, "focus", this._elementFocused);
    onCapture(this.$().find(".popup-body")[0], "scroll", this._bodyScrolled);
};

Popup.prototype.mousemoved = function(e) {
    if (!this._shown) return;
    if (!isTouchEvent(e) && e.which !== 1) {
        return this.draggingEnd();
    }
    this._x = Math.max(0, e.clientX - this._anchorDistanceX);
    this._y = Math.max(0, e.clientY - this._anchorDistanceY);
    if (this._frameId === -1) {
        this._frameId = requestAnimationFrame(this.position);
    }
};

Popup.prototype.headerMouseDowned = function(e) {
    if (!this._shown || this._dragging || (isTouchEvent(e) && e.isFirst === false)) return;
    if ($(e.target).closest("." + this.closerContainerClass).length > 0) return;
    this._dragging = true;
    this._anchorDistanceX = e.clientX - this._x;
    this._anchorDistanceY = e.clientY - this._y;
    this._rect = this._popupDom[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();
    onCapture(document, "mouseup", this.draggingEnd);
    onCapture(document, "mousemove", this.mousemoved);
    this.popupDragRecognizer.recognizeCapturedOn(document);

    this.$().css({
        left: 0,
        top: 0,
        willChange: "transform"
    });
    setTransform(this.$()[0], "translate("+this._x+"px,"+this._y+"px)");
};

Popup.prototype.draggingEnd = function() {
    if (!this._dragging) return;
    this._dragging = false;
    offCapture(document, "mouseup", this.draggingEnd);
    offCapture(document, "mousemove", this.mousemoved);
    this.popupDragRecognizer.unrecognizeCapturedOn(document);

    this.$().css({
        left: this._x,
        top: this._y,
        willChange: ""
    });
    setTransform(this.$()[0], "none");
};

Popup.prototype.close = function() {
    if (!this._shown) return;
    var elementToFocus = this._activeElementBeforeOpen;
    this._activeElementBeforeOpen = null;
    offCapture(document, "focus", this._elementFocused);
    offCapture(this.$().find(".popup-body")[0], "scroll", this._bodyScrolled);
    this._shown = false;
    this._scrollTop = this._contentScroller.settledScrollTop();

    this.emit("close", this);
    var self = this;
    Promise.resolve(this.beforeTransitionOut(this._popupDom)).finally(function() {
        self._deinitDom();
    });

    this.draggingEnd();

    if (elementToFocus) {
        elementToFocus.focus();
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
    var y = +pos.y;
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
    var x = pos.x;
    var y = pos.y;
    if (!isFinite(x) || !isFinite(y)) return;
    this._x = x;
    this._y = y;
    this.position();
};

Popup.HIGHER_ZINDEX = 1000;
