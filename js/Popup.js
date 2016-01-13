"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const EventEmitter = require("events");
const util = require("./util");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const Animator = require("./Animator");

const shownPopups = [];
const NULL = $(null);

const blocker = $(".popup-blocker");

function closePopups() {
    shownPopups.forEach(function(v) {
        v.close();
    });
}

blocker.on("click", closePopups);

if (touch) {
    blocker.on(domUtil.TOUCH_EVENTS, domUtil.tapHandler(closePopups));
}
var anim;
function showBlocker() {
    if (anim) {
        anim.cancel();
        anim = null;
    }
    blocker.css("transform", "translate3d(0, 0, 0)");
    var animator = new Animator(blocker[0], {
        properties: [{
            name: "opacity",
            start: 0,
            end: 55,
            unit: "%",
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });
    animator.animate();
}

function hideBlocker() {
    var animator = new Animator(blocker[0], {
        properties: [{
            name: "opacity",
            start: 55,
            end: 0,
            unit: "%",
            duration: 300
        }],
        interpolate: Animator.DECELERATE_CUBIC
    });
    anim = animator.animate().then(function() {
        blocker.css("transform", "translate3d(-1000%, 0, 0)");
        anim = null;
    });
}

function Popup(opts) {
    EventEmitter.call(this);
    opts = Object(opts);

    this.transitionClass = opts.transitionClass || "";
    this.beforeTransitionIn = opts.beforeTransitionIn || $.noop;
    this.beforeTransitionOut = opts.beforeTransitionOut || $.noop;
    this.containerClass = util.combineClasses(opts.containerClass, "popup-container");
    this.headerClass = util.combineClasses(opts.headerClass, "popup-header");
    this.bodyClass = util.combineClasses(opts.bodyClass, "popup-body");
    this.closerContainerClass = util.combineClasses(opts.closerContainerClass, "popup-closer-container");
    this.body = util.toFunction(opts.body || "");
    this.title = util.toFunction(opts.title || "");
    this.closer = util.toFunction(opts.closer || "");
    this._x = -1;
    this._y = -1;
    this._rect = null;
    this._anchorDistanceX = -1;
    this._anchorDistanceY = -1;
    this._shown = false;
    this._dragging = false;
    this._frameId = -1;

    this.position = this.position.bind(this);
    this.close = this.close.bind(this);
    this.headerMouseDowned = this.headerMouseDowned.bind(this);
    this.draggingEnd = this.draggingEnd.bind(this);
    this.mousemoved = this.mousemoved.bind(this);
    this.closerClicked = this.closerClicked.bind(this);
    this.closerClickedTouch = domUtil.tapHandler(this.closerClicked);
    this.headerMouseDownedTouch = domUtil.touchDownHandler(this.headerMouseDowned);
    this.touchDragHandler = domUtil.dragHandler(this.mousemoved, this.draggingEnd);

    $(window).on("resize blur", this.draggingEnd);
    $(window).on("resize", this.position);
    util.documentHidden.on("change", this.draggingEnd);

    this._popupDom = this._initDom();
    this._rect = this._popupDom[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();
}
util.inherits(Popup, EventEmitter);

Popup.prototype._initDom = function() {
    var ret = $("<div>", {
        class: this.containerClass,
    }).css({
        zIndex: 100001,
        position: "absolute",
        transform: "translate3d(-1000%, 0, 0)"
    }).appendTo("body");

    var headerText = $("<h2>").text(this.title() + "");
    var header = $("<div>", {class: this.headerClass});
    var body = $("<div>", {class: this.bodyClass}).html(this.body() + "");
    var closer = $("<div>", {class: this.closerContainerClass}).html(this.closer() + "");

    headerText.appendTo(header);
    closer.appendTo(header);
    header.appendTo(ret);
    body.appendTo(ret);

    closer.on("click", this.closerClicked);
    header.on("mousedown", this.headerMouseDowned);
    
    if (touch) {
        closer.on(domUtil.TOUCH_EVENTS, this.closerClickedTouch);
        header.on(domUtil.TOUCH_EVENTS_NO_MOVE, this.headerMouseDownedTouch);
    }

    return ret;
};

Popup.prototype.destroy = function() {
    $(window).off("resize blur", this.draggingEnd);
    $(window).off("resize", this.position);
    util.documentHidden.removeListener("change", this.draggingEnd);
    this.$().remove();
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
    this.$().css("transform", "translate3d(" +
        (this._x /*- this._rect.width / 2*/) + "px, " +
        (this._y /*- this._rect.height / 2*/) + "px, 0");
};

Popup.prototype.open = function() {
    if (this._shown) return;
    this._shown = true;
    shownPopups.push(this);

    try {
        if (shownPopups.length === 1) {
            showBlocker();
        }
        
        this.position();

        if (this.transitionClass) {
            var $node = this.$();
            $node[0].offsetHeight;
            $node.detach();
            $node.addClass(this.transitionClass + " initial");
            $node[0].offsetHeight;
            $node.appendTo("body");
            $node[0].offsetHeight;
            $node.removeClass("initial");
            $node[0].offsetHeight;
        }
        this.beforeTransitionIn(this.$());
    } catch (e) {
        this.close();
        throw e;
    }
    this.emit("open", this);
};

Popup.prototype.mousemoved = function(e) {
    if (!this._shown) return;
    if (!domUtil.isTouchEvent(e) && e.which !== 1) {
        return this.draggingEnd();
    }
    this._x = Math.max(0, e.clientX - this._anchorDistanceX);
    this._y = Math.max(0, e.clientY - this._anchorDistanceY);
    if (this._frameId === -1) {
        this._frameId = requestAnimationFrame(this.position);
    }
};

Popup.prototype.headerMouseDowned = function(e, isClick, isTouch) {
    if (!this._shown || this._dragging || (domUtil.isTouchEvent(e) && e.isFirst === false)) return;
    if ($(e.target).closest(this.closerContainerClass).length > 0) return;
    this._dragging = true;
    this._anchorDistanceX = e.clientX - this._x;
    this._anchorDistanceY = e.clientY - this._y;
    this._rect = this._popupDom[0].getBoundingClientRect();
    this._viewPort = this._getViewPort();
    util.onCapture(document, "mouseup", this.draggingEnd);
    util.onCapture(document, "mousemove", this.mousemoved);
    
    if (touch) {
        util.onBubble(document, domUtil.TOUCH_EVENTS, this.touchDragHandler);
    }
};

Popup.prototype.draggingEnd = function() {
    if (!this._dragging) return;
    this._dragging = false;
    util.offCapture(document, "mouseup", this.draggingEnd);
    util.offCapture(document, "mousemove", this.mousemoved);

    if (touch) {
        util.offBubble(document, domUtil.TOUCH_EVENTS, this.touchDragHandler);
    }
};

Popup.prototype.close = function() {
    if (!this._shown) return;
    this._shown = false;
    shownPopups.splice(shownPopups.indexOf(this), 1);
    
    this.emit("close", this);
    var $node = this._popupDom;
    Promise.resolve(this.beforeTransitionOut(this._popupDom)).finally(function() {
        $node.css("transform", "translate3d(-1000%, 0, 0");
    });

    this.draggingEnd();

    if (shownPopups.length === 0) {
        hideBlocker();
    }
};

Popup.prototype.getPreferredPosition = function() {
    if (this._x === -1 || this._y === -1) return null;
    return {
        x: this._x,
        y: this._y
    };
};

Popup.prototype.setPreferredPosition = function(pos) {
    if (!pos) return;
    var x = pos.x;
    var y = pos.y;
    if (!isFinite(x) || !isFinite(y)) return;
    this._x = x;
    this._y = y;
    this.position();
};

module.exports = Popup;
