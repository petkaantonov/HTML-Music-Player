"use strict";

import { TOUCH_EVENTS, doubleTapHandler, tapHandler } from "lib/DomUtil";
import { touch as touch } from "features";
import { rippler } from "ui/GlobalUi";

const HTML = "<div class='track-rating'>                                                               \
        <div data-rating='1' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='2' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='3' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='4' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='5' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
    </div>"

export default function TrackRating() {
    this.track = null;
    this._domNode = $(HTML);
    this._doubleClicked = this._doubleClicked.bind(this);
    this._clicked = this._clicked.bind(this);
    this._hovered = this._hovered.bind(this);
    this._touchDoubleClicked = doubleTapHandler(this._doubleClicked);
    this._touchClicked = tapHandler(function(e) {
        rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this._ratingInputClicked(e.currentTarget);
    }.bind(this));
    this._update(-1);
    this._enabled = false;
}

TrackRating.prototype.$ = function() {
    return this._domNode;
};

TrackRating.prototype._addClassToRatingsAtLeast = function(inputs, value, className) {
    inputs.filter(function() {
        return parseInt($(this).data("rating"), 10) <= value;
    }).addClass(className);
}

TrackRating.prototype._hovered = function(e) {
    var inputs = this.$().find(".rating-input");
    inputs.removeClass("hovered");
    if (e.type === "mouseleave") {
        var related = $(e.relatedTarget);
        var value = parseInt(related.data("rating"), 10);
        if (related.is(".rating-input")) {
            this._addClassToRatingsAtLeast(inputs, value, "hovered");
        }
    } else if (e.type === "mouseenter") {
        var value = parseInt($(e.currentTarget).data("rating"), 10);
        this._addClassToRatingsAtLeast(inputs, value, "hovered");
    }
};

TrackRating.prototype.disable = function() {
    this.track = null;
    this._update(-1);
    if (!this._enabled) {
        return;
    }
    this._enabled = false;
    this.$().off("click", ".rating-input", this._clicked);
    this.$().off("mouseleave mouseenter", ".rating-input", this._hovered);
    this.$().off(TOUCH_EVENTS, ".rating-input", this._touchClicked);
    this.$().off(TOUCH_EVENTS, this._touchDoubleClicked);
    this.$().off("dblclick", this._doubleClicked);
};

TrackRating.prototype.update = function() {
    if (this.track) {
        this._update(this.track.getRating());
    }
};

TrackRating.prototype.enable = function(track) {
    this.track = track;
    this._update(this.track.getRating());
    if (this._enabled) {
        return;
    }
    this._enabled = true;
    this.$().on("click", ".rating-input", this._clicked);
    this.$().on("dblclick", this._doubleClicked);
    this.$().on("mouseenter mouseleave", ".rating-input", this._hovered);
    this.$().on(TOUCH_EVENTS, ".rating-input", this._touchClicked);
    this.$().on(TOUCH_EVENTS, this._touchDoubleClicked);
};

TrackRating.prototype._clicked = function(e) {
    rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this._ratingInputClicked(e.currentTarget);
};

TrackRating.prototype._doubleClicked = function() {
    this.track.rate(-1);
    this._update(-1);
};

TrackRating.prototype._update = function(value) {
    var inputs = this.$().find(".rating-input");
    inputs.removeClass("rated");
    this._addClassToRatingsAtLeast(inputs, value, "rated");
};

TrackRating.prototype._ratingInputClicked = function(node) {
    var value = parseInt($(node).data("rating"), 10);
    this.track.rate(value);
    this._update(value);
};
