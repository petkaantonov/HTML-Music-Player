"use strict";

import EventEmitter from "events";
import { inherits, ensuredStringField } from "util";

export default function Slider(opts, deps) {
    opts = Object(opts);
    EventEmitter.call(this);
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.recognizerContext = deps.recognizerContext;
    this._domNode = this.page.$(opts.target);
    this._knobNode = this.$().find(ensuredStringField(opts, "knobSelector"));
    this._fillNode = this.$().find(ensuredStringField(opts, "fillSelector"));
    this._direction = opts && opts.direction || "horizontal";
    this._containerRect = this._fillRect = this._knobRect = null;
    this._sliding = false;
    this._value = "value" in opts ? +opts.value : 0;

    this._onMousemove = this._onMousemove.bind(this);
    this._onMouseup = this._onMouseup.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);

    this.dragRecognizer = this.recognizerContext.createDragRecognizer(this._onMousemove, this._onMouseup);
    this.touchdownRecognizer = this.recognizerContext.createTouchdownRecognizer(this._onMousedown);


    this._shouldUpdateDom = "updateDom" in opts ? !!opts.updateDom : true;
    if (this.shouldUpdateDom()) {
        this._calculateDimensions();
        this._setupKeyboard();
    }

    this.globalEvents.on("foreground", this._onReLayout);
    this.globalEvents.on("resize", this._onReLayout);
    this.$().addEventListener("mousedown", this._onMousedown);
    this.touchdownRecognizer.recognizeBubbledOn(this.$());
    deps.ensure();
}
inherits(Slider, EventEmitter);

Slider.prototype.$ = function() {
    return this._domNode;
};

Slider.prototype.$knob = function() {
    return this._knobNode;
};

Slider.prototype.$fill = function() {
    return this._fillNode;
};

Slider.prototype.shouldUpdateDom = function() {
    return this._shouldUpdateDom;
};

Slider.prototype._onMousedown = function(e) {
    var wasTouchEvent = this.page.isTouchEvent(e);
    if (this._sliding ||
        (!wasTouchEvent && e.which !== 1) ||
        (wasTouchEvent && e.isFirst === false)) {
        return;
    }
    this._sliding = true;
    this._calculateDimensions();

    if (this.shouldUpdateDom()) {
        this.$knob().addClass("focused").setStyle("willChange", "transform");
        this.$fill().setStyle("willChange", "transform");
        this.$().addClass("sliding");
    }

    this.emit("slideBegin", e);
    this.emit("slide", this._percentage(e));

    this.page.addDocumentListener("mousemove", this._onMousemove);
    this.page.addDocumentListener("mouseup", this._onMouseup);
    this.dragRecognizer.recognizeBubbledOn(this.page.document());

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
                    value = this._value - 0.01;
                } else {
                    value = this._value + 0.01;
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
                    value = this._value - 0.01;
                } else {
                    value = this._value + 0.01;
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
    this.$knob().addEventListener("keydown", this._keydowned, true)
                .addClass("focused")
                .setStyle("willChange", "transform");
    this.$fill().setStyle("willChange", "transform");
    this.$().addClass("sliding");
    this.emit("slideBegin");
};

Slider.prototype._knobBlurred = function() {
    this.$knob().removeEventListener("keydown", this._keydowned, true)
                .removeClass("focused").setStyle("willChange", "")
                .setStyle("willChange", "");
    this.$().removeClass("sliding");
    this.emit("slideEnd");
};

Slider.prototype._setupKeyboard = function() {
    this.$knob().setProperty("tabIndex", 0);
    this._knobFocused = this._knobFocused.bind(this);
    this._knobBlurred = this._knobBlurred.bind(this);
    this._keydowned = this._keydowned.bind(this);

    this.$knob().addEventListener("focus", this._knobFocused)
                .addEventListener("blur", this._knobBlurred);
};

Slider.prototype._onMousemove = function(e) {
    if (!this.page.isTouchEvent(e) && e.which !== 1) {
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

        this.$fill().setTransform(fillTranslate);
        this.$knob().setTransform(knobTranslate);
    }
};

Slider.prototype._onMouseup = function(e) {
    if (!this._sliding) return;
    this._sliding = false;

    if (this.shouldUpdateDom()) {
        this.$knob().removeClass("focused").setStyle("willChange", "");
        this.$fill().setStyle("willChange", "");
        this.$().removeClass("sliding");
    }

    this.emit("slideEnd", this._percentage(e));

    this.page.removeDocumentListener("mousemove", this._onMousemove);
    this.page.removeDocumentListener("mouseup", this._onMouseup);
    this.dragRecognizer.unrecognizeBubbledOn(this.page.document());
    e.preventDefault();
};


Slider.prototype._calculateDimensions = function() {
    this._containerRect = this.$()[0].getBoundingClientRect();
    if (this.shouldUpdateDom()) {
        this._knobRect = this.$knob()[0].getBoundingClientRect();
        this._fillRect = this.$fill()[0].getBoundingClientRect();
    }
};

Slider.prototype._onReLayout = function() {
    var self = this;
    this.page.changeDom(function() {
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
