"use strict";
const $ = require("../lib/jquery");
const Promise = require("../lib/bluebird.js");

const EventEmitter = require("events");
const util = require("./util");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

const shownPopups = [];
const NULL = $(null);
var blocker = NULL;

function showBlocker() {
    function closePopups() {
        shownPopups.forEach(function(v) {
            v.close();
        });
    }

    blocker = $('<div>')
        .css({
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 99999
        })
        .addClass("popup-blocker")
        .appendTo("body")
        .on("click", closePopups);

    if (touch) {
        blocker.on("touchstart touchend", domUtil.tapHandler(closePopups));
    }

    blocker.addClass("initial");
    blocker[0].offsetWidth;
    blocker.detach();
    blocker.appendTo("body");
    blocker[0].offsetWidth;
    blocker.removeClass("initial");
}

function hideBlocker() {
    blocker.remove();
    blocker = NULL;
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
    this._anchorDistanceX = -1;
    this._anchorDistanceY = -1;
    this._popupDom = NULL;
    this._shown = false;

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
}
util.inherits(Popup, EventEmitter);

Popup.prototype.destroy = function() {
    $(window).off("resize blur", this.draggingEnd);
    $(window).off("resize", this.position);
    util.documentHidden.removeListener("change", this.draggingEnd);
};

Popup.prototype.$ = function() {
    return this._popupDom;
};

Popup.prototype.position = function() {
    if (!this._shown) return;
    var x = this._x;
    var y = this._y;
    var box = this.$()[0].getBoundingClientRect();
    var maxX = $(window).width() - box.width;
    var maxY = $(window).height() - box.height;

    if (x === -1) x = ((maxX + box.width) / 2) -  (box.width / 2);
    if (y === -1) y = ((maxY + box.height) / 2) -  (box.height / 2);

    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    

    this.$().css({left: x, top: y});
};

Popup.prototype.refresh = function() {
    if (!this._shown) return;
    this.draggingEnd();
    this.position();
};

Popup.prototype.closerClicked = function() {
    this.close();
};

Popup.prototype.open = function() {
    if (this._shown) return;
    this._shown = true;
    shownPopups.push(this);

    try {
        if (shownPopups.length === 1) {
            showBlocker();
        }

        this._popupDom = $("<div>", {
            class: this.containerClass,
        }).css({
            zIndex: 100000 + shownPopups.length,
            position: "fixed"
        });

        var headerText = $("<h2>").text(this.title() + "");
        var header = $("<div>", {class: this.headerClass});
        var body = $("<div>", {class: this.bodyClass}).html(this.body() + "");
        var closer = $("<div>", {class: this.closerContainerClass}).html(this.closer() + "");

        headerText.appendTo(header);
        closer.appendTo(header);
        header.appendTo(this.$());
        body.appendTo(this.$());

        this.$().appendTo("body");
        
        closer.on("click", this.closerClicked);
        header.on("mousedown", this.headerMouseDowned);
        
        if (touch) {
            closer.on("touchstart touchend", this.closerClickedTouch);
            header.on("touchstart", this.headerMouseDownedTouch);
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
    this.position();
};

Popup.prototype.headerMouseDowned = function(e, isClick, isTouch) {
    if (!this._shown) return;
    if ($(e.target).closest(this.closerContainerClass).length > 0) return;
    var box = this.$()[0].getBoundingClientRect();
    this._anchorDistanceX = e.clientX - box.left;
    this._anchorDistanceY = e.clientY - box.top;
    util.onCapture(document, "mouseup", this.draggingEnd);
    util.onCapture(document, "mousemove", this.mousemoved);
    
    if (touch) {
        util.onBubble(document, "touchstart touchmove touchend", this.touchDragHandler);
    }

    this.$().addClass("popup-dragging");
};

Popup.prototype.draggingEnd = function() {
    util.offCapture(document, "mouseup", this.draggingEnd);
    util.offCapture(document, "mousemove", this.mousemoved);

    if (touch) {
        util.offBubble(document, "touchstart touchmove touchend", this.touchDragHandler);
    }

    this.$().removeClass("popup-dragging");
};

Popup.prototype.close = function() {
    if (!this._shown) return;
    this._shown = false;
    shownPopups.splice(shownPopups.indexOf(this), 1);
    
    this.emit("close", this);
    var $node = this._popupDom;
    Promise.resolve(this.beforeTransitionOut(this._popupDom)).finally(function() {
        $node.remove();
    });

    this.draggingEnd();
    this._popupDom = NULL;

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
