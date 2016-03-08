"use strict";

const util = require("lib/util");
const domUtil = require("lib/DomUtil");

const NO_PREFERENCE = -1;
const NO_INVERSION = 0;
const INVERT = 1;
var invertedScrolling = NO_PREFERENCE;

const isInverted = function(e) {
    if (invertedScrolling === NO_PREFERENCE) {
        var directionInvertedFromDevice;

        if ("webkitDirectionInvertedFromDevice" in e) {
            directionInvertedFromDevice = e.webkitDirectionInvertedFromDevice;
        } else if ("directionInvertedFromDevice" in e) {
            directionInvertedFromDevice = e.directionInvertedFromDevice;
        } else if (e.sourceCapabilities && ("directionInvertedFromDevice" in e.sourceCapabilities)) {
            directionInvertedFromDevice = e.sourceCapabilities.directionInvertedFromDevice;
        }

        return directionInvertedFromDevice === true;
    } else {
        return invertedScrolling === INVERT;
    }
};


function Scrollbar(container, scrollerInfo, opts) {
    opts = Object(opts);
    this._domNode = $($(container)[0]);
    this._rail = this.$().find(opts.railSelector);
    this._knob = this.$().find(opts.knobSelector);
    this._rect = this.$()[0].getBoundingClientRect();
    this._knobRect = this.$knob()[0].getBoundingClientRect();
    this._scrollerInfo = scrollerInfo;
    this._scrolling = false;
    this._timerId = -1;
    this._anchorDistance = -1;
    this._hasScroll = false;

    this._stopScrolling = this._stopScrolling.bind(this);
    this._railMousedowned = this._railMousedowned.bind(this);
    this._knobMousedowned = this._knobMousedowned.bind(this);
    this._knobMousereleased = this._knobMousereleased.bind(this);
    this._knobMousemoved = this._knobMousemoved.bind(this);
    this._rebindRailmouseDowned = this._rebindRailmouseDowned.bind(this);
    this._clicked = this._clicked.bind(this);
    this._restoreClicks = this._restoreClicks.bind(this);
    this.resize();

    this.$knob().on("mousedown", this._knobMousedowned);
    util.onCapture(this.$knob()[0], "click", this._clicked);
    util.onCapture(this.$rail()[0], "click", this._clicked);
    $(document).on("mouseup", this._rebindRailmouseDowned);
    this._rebindRailmouseDowned();
}

Scrollbar.prototype.willScroll = function() {
    this.$knob().css("willChange", "transform");
};

Scrollbar.prototype.willStopScrolling = function() {
    this.$knob().css("willChange", "");
};

Scrollbar.prototype.determineScrollInversion = function(delta, e) {
    return delta;
};

Scrollbar.prototype.$ = function() {
    return this._domNode;
};

Scrollbar.prototype.$rail = function() {
    return this._rail;
};

Scrollbar.prototype.$knob = function() {
    return this._knob;
};

Scrollbar.prototype._restoreClicks = function() {
    util.offCapture(document, "click dblclick", this._clicked);
};

Scrollbar.prototype._rebindRailmouseDowned = function() {
    setTimeout(this._restoreClicks, 0);
    this.$rail().off("mousedown", this._railMousedowned)
                .on("mousedown", this._railMousedowned);
};

Scrollbar.prototype._scrollByCoordinate = function(y, animate) {
    y = Math.min(this._rect.height, Math.max(0, y - this._rect.top));
    var percentage = y / this._rect.height;
    var px = Math.round(percentage * this._scrollerInfo.physicalHeight());
    this._scrollerInfo.scrollToUnsnapped(px, animate);
};

Scrollbar.prototype._railMousedowned = function(e) {
    if (!this._hasScroll) return;
    if ($(e.target).closest(this.$knob()[0]).length > 0) return;
    if (e.which !== 1) return;
    this.willScroll();
    e.stopImmediatePropagation();
    this._scrollByCoordinate(e.clientY, false);
    this.$rail().off("mousedown", this._railMousedowned);
    util.onCapture(document, "click dblclick", this._clicked);
};

Scrollbar.prototype._knobMousedowned = function(e) {
    if (!this._hasScroll) return;
    if (e.which !== 1) return;
    this.willScroll();
    e.stopImmediatePropagation();
    this._rect = this.$()[0].getBoundingClientRect();
    this._knobRect = this.$knob()[0].getBoundingClientRect();
    this._anchorDistance = e.clientY - this._knobRect.top;
    $(document).on("mousemove", this._knobMousemoved);
    $(document).on("mouseup", this._knobMousereleased);
    util.onCapture(document, "click dblclick", this._clicked);
};

Scrollbar.prototype._knobMousereleased = function() {
    $(document).off("mousemove", this._knobMousemoved);
    $(document).off("mouseup", this._knobMousereleased);
    setTimeout(this._restoreClicks, 0);
    this.willStopScrolling();
};

Scrollbar.prototype._clicked = function(e) {
    e.stopPropagation();
    e.preventDefault();
};

Scrollbar.prototype._stopScrolling = function() {
    if (this._timerId !== -1) {
        clearTimeout(this._timerId);
    }
    this._scrolling = false;
    this.$().removeClass("scrolling");
    this._timerId = -1;
    this.willStopScrolling();
};

Scrollbar.prototype._knobMousemoved = function(e) {
    if (e.which !== 1 || !this._hasScroll) {
        return this._knobMousereleased();
    }
    this._scrollByCoordinate(Math.max(0, e.clientY - this._anchorDistance), false);
};

Scrollbar.prototype.render = function(y, dimensionsChanged) {
    if (!dimensionsChanged && !this._hasScroll) return;
    var percentage;
    var physicalHeight = Math.max(this._scrollerInfo.physicalHeight() - this._scrollerInfo.contentHeight(), 0);
    if (physicalHeight === 0) {
        percentage = 0;
    } else {
        percentage = y / physicalHeight;
    }
    percentage = Math.min(1, Math.max(0, percentage));
    var room = this._rect.height - this._knobRect.height;
    var px = Math.round(room * percentage);

    if (!dimensionsChanged) {
        if (!this._scrolling) {
            this._scrolling = true;
            this.$().addClass("scrolling");
        }
        if (this._timerId !== -1) {
            clearTimeout(this._timerId);
        }
        this._timerId = setTimeout(this._stopScrolling, 450);
    }

    domUtil.setTransform(this.$knob()[0], "translate3d(0, " + px + "px, 0)");
};

Scrollbar.prototype.resize = function() {
    var physicalHeight = this._scrollerInfo.physicalHeight();
    var rect = this._rect = this.$()[0].getBoundingClientRect();

    if (rect.height >= physicalHeight) {
        this.$knob().css("height", 0);
        this._hasScroll = false;
        this._stopScrolling();
    } else {
        var percentage = rect.height / physicalHeight;
        var pxHeight = Math.max(20, percentage * rect.height|0);
        this.$knob().css("height", pxHeight);
        this._hasScroll = true;
    }

    this._knobRect = this.$knob()[0].getBoundingClientRect();
    this.render(this._scrollerInfo.settledScrollTop(), true);
};


module.exports = Scrollbar;
