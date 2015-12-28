"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");

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
        $(document)
            .off("mousemove", self.__onmousemove)
            .off("mouseup", self.__onmouseup);
        $(window).off("relayout", self._onReLayout);
    };
};

Slider.prototype.__createMouseMover = function() {
    var self = this;
    return function(e) {
        if (typeof e.which === "number" && e.which !== 1) {
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
    this.$().on("mousedown", function(e) {
        if (e.which !== 1) {
            return true;
        }

        self._calculateDimensions();
        self.emit("slideBegin", e);

        if (self._clickMove) {
            self.emit("slide", self.__percentage(e));
        }

        $(document)
            .on("mousemove", self.__onmousemove)
            .on("mouseup", self.__onmouseup);
        $(window).on("relayout", self._onReLayout);
        e.preventDefault();
        return false;
    });

};

module.exports = Slider;
