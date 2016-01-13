"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

function Slider(domNode, opts) {
    EventEmitter.call(this);
    this._domNode = $(domNode);
    this._direction = opts && opts.direction || "horizontal";

    if (this._direction == "vertical") {
        this._mouseCoordinateProp = "clientY";
        this._offsetDirectionProp = "top";
        this._offsetDimensionFunc = "outerHeight";
    } else {
        this._mouseCoordinateProp = "clientX";
        this._offsetDirectionProp = "left";
        this._offsetDimensionFunc = "outerWidth";
    }

    this._onMousemove = this._onMousemove.bind(this);
    this._onMouseup = this._onMouseup.bind(this);
    this._onMousedown = this._onMousedown.bind(this);

    this._onMousedownTouch = domUtil.touchDownHandler(this._onMousedown);
    this._touchDragHandler = domUtil.dragHandler(this._onMousemove, this._onMouseup);

    this.$().on("mousedown", this._onMousedown);

    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS_NO_MOVE, this._onMousedownTouch);
    }

    this._clickMove = opts && opts.clickMove || true;
    this._offset = 0;
    this._dimension = 0;
    this._sliding = false;
    this._onReLayout = $.proxy(this._onReLayout, this);
}
util.inherits(Slider, EventEmitter);

Slider.prototype._onMousedown = function(e) {
    var isTouchEvent = domUtil.isTouchEvent(e);
    if (this._sliding ||
        (!isTouchEvent && e.which !== 1) ||
        (isTouchEvent && e.isFirst === false)) {
        return;
    }
    this._sliding = true;
    this._calculateDimensions();
    this.emit("slideBegin", e);

    if (this._clickMove) {
        this.emit("slide", this._percentage(e));
    }

    $(document).on("mousemove", this._onMousemove).on("mouseup", this._onMouseup);

    if (touch) {
        $(document).on(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).on("relayout", this._onReLayout);
    e.preventDefault();
};

Slider.prototype._onMousemove = function(e) {
    if (!domUtil.isTouchEvent(e) && e.which !== 1) {
        return this._onMouseup(this._lastEvent);
    }

    this._lastEvent = e;
    this.emit("slide", this._percentage(e));
};

Slider.prototype._onMouseup = function(e) {
    if (!this._sliding) return;
    this._sliding = false;
    this.emit("slideEnd", this._percentage(e));

    $(document).off("mousemove", this._onMousemove).off("mouseup", this._onMouseup);

    if (touch) {
        $(document).off(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).off("relayout", this._onReLayout);
    e.preventDefault();
};

Slider.prototype.$ = function() {
    return this._domNode;
};

Slider.prototype._calculateDimensions = function() {
    this._offset = this.$().offset()[this._offsetDirectionProp];
    this._dimension = this.$()[this._offsetDimensionFunc]();
};

Slider.prototype._onReLayout = function() {
    this._calculateDimensions();
};

Slider.prototype._percentage = function(e) {
    var r = (e[this._mouseCoordinateProp] - this._offset) / this._dimension;
    r = r > 1 ? 1 : r;
    r = r < 0 ? 0 : r;
    return r;
};

module.exports = Slider;
