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

    this._clickMove = opts && opts.clickMove || true;
    this._offset = 0;
    this._dimension = 0;
    this._percentage = -1;

    this._onReLayout = $.proxy(this._onReLayout, this);

    this._init();
}
util.inherits(Slider, EventEmitter);

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

Slider.prototype.__percentage = function(e) {
    var r = (e[this._mouseCoordinateProp] - this._offset) / this._dimension;
    r = r > 1 ? 1 : r;
    r = r < 0 ? 0 : r;
    return r;
};

Slider.prototype.__createMouseUp = function() {
    var self = this;
    return function(e) {
        self.emit("slideEnd", self.__percentage(e));
        if (!touch) {
            $(document)
                .off("mousemove", self.__onmousemove)
                .off("mouseup", self.__onmouseup);
        } else {
            $(document)
                .off("touchmove", self.__onmousemove)
                .off("touchend", self.__onmouseup);
        }
        $(window).off("relayout", self._onReLayout);
    };
};

Slider.prototype.__createMouseMover = function() {
    var self = this;
    return function(e) {
        if (!domUtil.isTouchEvent(e) && typeof e.which === "number" && e.which !== 1) {
            return self.__onmouseup(self._lastEvent);
        }
        self._lastEvent = e;
        self.emit("slide", self.__percentage(e));
    };
};

Slider.prototype._init = function() {
    var self = this;
    this.__onmouseup = this.__createMouseUp();
    this.__onmousemove = this.__createMouseMover();
    if (touch) {
        this.__onmousemove = domUtil.touchMoveHandler(this.__onmousemove);
        this.__onmouseup = domUtil.touchUpHandler(this.__onmouseup);
    }

    var handler = function(e) {
        if (!domUtil.isTouchEvent(e) && e.which !== 1) {
            return true;
        }

        self._calculateDimensions();
        self.emit("slideBegin", e);

        if (self._clickMove) {
            self.emit("slide", self.__percentage(e));
        }

        if (!touch) {
            $(document)
                .on("mousemove", self.__onmousemove)
                .on("mouseup", self.__onmouseup);
        } else {
            $(document)
                .on("touchmove", self.__onmousemove)
                .on("touchend", self.__onmouseup);
        }
        $(window).on("relayout", self._onReLayout);
        e.preventDefault();
        return false;
    };


    if (!touch) {
        this.$().on("mousedown", handler);
    } else {
        this.$().on("touchstart", domUtil.touchDownHandler(handler));
    }

};

module.exports = Slider;
