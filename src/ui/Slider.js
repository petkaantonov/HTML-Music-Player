"use strict";
import $ from "lib/jquery";
import EventEmitter from "lib/events";
import { documentHidden, inherits, offCapture, onCapture } from "lib/util";
import { TOUCH_EVENTS, TOUCH_EVENTS_NO_MOVE, dragHandler, isTouchEvent, setTransform, touchDownHandler } from "lib/DomUtil";

export default function Slider(domNode, opts) {
    opts = Object(opts);
    EventEmitter.call(this);
    this.env = opts.env;
    this._domNode = $(domNode);
    this._direction = opts && opts.direction || "horizontal";
    this._containerRect = this._fillRect = this._knobRect = null;
    this._sliding = false;
    this._value = "value" in opts ? +opts.value : 0;

    this._onMousemove = this._onMousemove.bind(this);
    this._onMouseup = this._onMouseup.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);

    this._onMousedownTouch = touchDownHandler(this._onMousedown);
    this._touchDragHandler = dragHandler(this._onMousemove, this._onMouseup);

    this.$().on("mousedown", this._onMousedown);

    if (this.env.hasTouch()) {
        this.$().on(TOUCH_EVENTS_NO_MOVE, this._onMousedownTouch);
    }

    this._shouldUpdateDom = "updateDom" in opts ? !!opts.updateDom : true;
    if (this.shouldUpdateDom()) {
        this._calculateDimensions();
        this._setupKeyboard();
    }

    documentHidden.on("foreground", this._onReLayout);
    $(window).on("sizechange", this._onReLayout);
}
inherits(Slider, EventEmitter);

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
    var isTouchEvent = isTouchEvent(e);
    if (this._sliding ||
        (!isTouchEvent && e.which !== 1) ||
        (isTouchEvent && e.isFirst === false)) {
        return;
    }
    this._sliding = true;
    this._calculateDimensions();

    if (this.shouldUpdateDom()) {
        this.$knob().addClass("focused").css("willChange", "transform");
        this.$fill().css("willChange", "transform");
        this.$().addClass("sliding");
    }

    this.emit("slideBegin", e);
    this.emit("slide", this._percentage(e));

    $(document).on("mousemove", this._onMousemove).on("mouseup", this._onMouseup);

    if (this.env.hasTouch()) {
        $(document).on(TOUCH_EVENTS, this._touchDragHandler);
    }


    e.preventDefault();
};

Slider.prototype._keydowned = function(e) {
    var key = e.key;

    switch (key) {
        case "Escape":
        case "Enter":
            this.$knob().blur();
        break;

        case "ArrowLeft":
        case "ArrowRight":
            if (this._direction === "horizontal") {
                var value;
                if (key === "ArrowLeft") {
                    value = this._value - 0.01
                } else {
                    value = this._value + 0.01
                }
                value = Math.min(1, Math.max(0, value));
                this.setValue(value);
                this.emit("slide", value);
            }
        break;

        case "ArrowDown":
        case "ArrowUp":
            if (this._direction === "vertical") {
                var value;
                if (key === "ArrowDown") {
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
    onCapture(this.$knob()[0], "keydown", this._keydowned);
    this.$knob().addClass("focused").css("willChange", "transform");
    this.$fill().css("willChange", "transform");
    this.$().addClass("sliding");
    this.emit("slideBegin");
};

Slider.prototype._knobBlurred = function() {
    offCapture(this.$knob()[0], "keydown", this._keydowned);
    this.$knob().removeClass("focused").css("willChange", "");
    this.$fill().css("willChange", "");
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
    if (!isTouchEvent(e) && e.which !== 1) {
        return this._onMouseup(this._lastEvent);
    }

    this._lastEvent = e;
    var percentage = this._percentage(e);
    this.setValue(percentage);
    this.emit("slide", percentage);
};

Slider.prototype.setValue = function(value, force) {
    value = Math.min(1, Math.max(0, +value));
    if (!force && this._value === value) return;
    this._value = value;
    if (this.shouldUpdateDom()) {
        var knobHalf = (this._direction === "horizontal" ? this._knobRect.width : this._knobRect.height) / 2;
        var full = this._direction === "horizontal" ? this._containerRect.width : this._containerRect.height;

        var knobTranslate, fillTranslate;
        knobTranslate = fillTranslate = "translateZ(0) ";
        if (this._direction === "horizontal") {
            var knobMin = -knobHalf;
            var knobMax = full - knobHalf;
            var knobValuePx =  Math.round(value * (knobMax - knobMin) + knobMin);
            knobTranslate += "translateX(" + knobValuePx + "px)";
            fillTranslate += "translateX(-" + ((1 - value) * 100) + "%)";
        } else {
            var knobMin = full - knobHalf;
            var knobMax = -knobHalf;
            var knobValuePx = Math.round(value * (knobMax - knobMin) + knobMin);
            knobTranslate += "translateY(" + knobValuePx + "px)";
            fillTranslate += "translateY(" + ((1 - value) * 100) + "%)";
        }
        setTransform(this.$fill(), fillTranslate);
        setTransform(this.$knob(), knobTranslate);
    }
};

Slider.prototype._onMouseup = function(e) {
    if (!this._sliding) return;
    this._sliding = false;

    if (this.shouldUpdateDom()) {
        this.$knob().removeClass("focused").css("willChange", "");
        this.$fill().css("willChange", "");
        this.$().removeClass("sliding");
    }

    this.emit("slideEnd", this._percentage(e));

    $(document).off("mousemove", this._onMousemove).off("mouseup", this._onMouseup);

    if (this.env.hasTouch()) {
        $(document).off(TOUCH_EVENTS, this._touchDragHandler);
    }

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
    var self = this;
    requestAnimationFrame(function() {
        self._calculateDimensions();
        self.setValue(self._value, true);
    });
};

Slider.prototype._percentage = function(e) {
    if (this._direction === "vertical") {
        var r = 1 - ((e.clientY - this._containerRect.top) / this._containerRect.height);
    } else {
        var r = (e.clientX - this._containerRect.left) / this._containerRect.width;
    }
    return Math.max(0, Math.min(1, r));
};
