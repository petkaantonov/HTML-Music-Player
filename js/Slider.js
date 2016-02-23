"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

function Slider(domNode, opts) {
    opts = Object(opts);
    EventEmitter.call(this);
    this._domNode = $(domNode);
    this._direction = opts && opts.direction || "horizontal";
    this._containerRect = this._fillRect = this._knobRect = null;
    this._sliding = false;
    this._value = "value" in opts ? +opts.value : 0;

    this._onMousemove = this._onMousemove.bind(this);
    this._onMouseup = this._onMouseup.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);

    this._onMousedownTouch = domUtil.touchDownHandler(this._onMousedown);
    this._touchDragHandler = domUtil.dragHandler(this._onMousemove, this._onMouseup);

    this.$().on("mousedown", this._onMousedown);

    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS_NO_MOVE, this._onMousedownTouch);
    }

    this._shouldUpdateDom = "updateDom" in opts ? !!opts.updateDom : true;
    if (this.shouldUpdateDom()) {
        this._calculateDimensions();
        this._setupKeyboard();
    }
}
util.inherits(Slider, EventEmitter);

Slider.prototype.$ = function() {
    return this._domNode;
};

Slider.prototype.$knob = function() {
    return this.$().find(".slider-knob");
};

Slider.prototype.$fill = function() {
    return this.$().find(".slider-fill");
};

Slider.prototype.shouldUpdateDom = function() {
    return this._shouldUpdateDom;
};

Slider.prototype._onMousedown = function(e) {
    var isTouchEvent = domUtil.isTouchEvent(e);
    if (this._sliding ||
        (!isTouchEvent && e.which !== 1) ||
        (isTouchEvent && e.isFirst === false)) {
        return;
    }
    this._sliding = true;
    this._calculateDimensions();

    if (this.shouldUpdateDom()) {
        this.$().addClass("sliding");
    }

    this.emit("slideBegin", e);
    this.emit("slide", this._percentage(e));

    $(document).on("mousemove", this._onMousemove).on("mouseup", this._onMouseup);

    if (touch) {
        $(document).on(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).on("relayout", this._onReLayout);
    e.preventDefault();
};

Slider.prototype._keydowned = function(e) {
    switch (e.which) {
        case 27:
        case 13:
            this.$knob().blur();
        break;

        case 37:
        case 39:
            if (this._direction === "horizontal") {
                var value;
                if (e.which === 37) {
                    value = this._value - 0.01
                } else {
                    value = this._value + 0.01
                }
                value = Math.min(1, Math.max(0, value));
                this.setValue(value);
                this.emit("slide", value);
            }
        break;

        case 38:
        case 40:
            if (this._direction === "vertical") {
                var value;
                if (e.which === 38) {
                    value = this._value - 0.01
                } else {
                    value = this._value + 0.01
                }
                value = Math.min(1, Math.max(0, value));
                this.setValue(value);
                this.emit("slide", value);
            }
        break;

        default: return;
    }
};

Slider.prototype._knobFocused = function() {
    util.onCapture(this.$knob()[0], "keydown", this._keydowned);
    this.$knob().addClass("focused");
    this.$().addClass("sliding");
    this.emit("slideBegin");
};

Slider.prototype._knobBlurred = function() {
    util.offCapture(this.$knob()[0], "keydown", this._keydowned);
    this.$knob().removeClass("focused");
    this.$().removeClass("sliding");
    this.emit("slideEnd");
};

Slider.prototype._setupKeyboard = function() {
    this.$knob().prop("tabIndex", 0);
    this._knobFocused = this._knobFocused.bind(this);
    this._knobBlurred = this._knobBlurred.bind(this);
    this._keydowned = this._keydowned.bind(this);

    this.$knob().on("focus", this._knobFocused)
                .on("blur", this._knobBlurred);
};

Slider.prototype._onMousemove = function(e) {
    if (!domUtil.isTouchEvent(e) && e.which !== 1) {
        return this._onMouseup(this._lastEvent);
    }

    this._lastEvent = e;
    var percentage = this._percentage(e);
    this.setValue(percentage);
    this.emit("slide", percentage);
};

Slider.prototype.setValue = function(value) {
    if (this._value === value) return;
    this._value = value;
    if (this.shouldUpdateDom()) {
        var knobHalf = (this._direction === "horizontal" ? this._knobRect.width : this._knobRect.height) / 2;
        var knobMin = -knobHalf;
        var full = this._direction === "horizontal" ? this._containerRect.width : this._containerRect.height;
        var knobMax = full - knobHalf;
        var knobTranslate = Math.round(value * (knobMax - knobMin) + knobMin);
        domUtil.setTransform(this.$knob(),  "translateZ(0) translate" +
                                            (this._direction === "horizontal" ? "X" : "Y") +
                                            "("+knobTranslate+"px)");
        var fillTranslate = "translateZ(0) ";
        if (this._direction === "horizontal") {
            fillTranslate += "translateX(-" + ((1 - value) * 100) + "%)";
        } else {
            fillTranslate += "translateY(" + (value * 100) + "%)";
        }
        domUtil.setTransform(this.$fill(), fillTranslate);
    }
};

Slider.prototype._onMouseup = function(e) {
    if (!this._sliding) return;
    this._sliding = false;

    if (this.shouldUpdateDom()) {
        this.$().removeClass("sliding");
    }

    this.emit("slideEnd", this._percentage(e));

    $(document).off("mousemove", this._onMousemove).off("mouseup", this._onMouseup);

    if (touch) {
        $(document).off(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).off("relayout", this._onReLayout);
    e.preventDefault();
};


Slider.prototype._calculateDimensions = function() {
    this._containerRect = this.$()[0].getBoundingClientRect();
    if (this.shouldUpdateDom()) {
        this._knobRect = this.$knob()[0].getBoundingClientRect()
        this._fillRect = this.$fill()[0].getBoundingClientRect();
    }
};

Slider.prototype._onReLayout = function() {
    this._calculateDimensions();
};

Slider.prototype._percentage = function(e) {
    if (this._direction === "vertical") {
        var r = (e.clientY - this._containerRect.top) / this._containerRect.height;
    } else {
        var r = (e.clientX - this._containerRect.left) / this._containerRect.width;
    }
    return Math.max(0, Math.min(1, r));
};

module.exports = Slider;
