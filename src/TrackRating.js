"use strict";

const domUtil = require("lib/DomUtil");
const touch = require("features").touch;
const GlobalUi = require("ui/GlobalUi");

const HTML = "<div class='track-rating'>                                                               \
        <div data-rating='1' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='2' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='3' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='4' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='5' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
    </div>"

function TrackRating() {
    this.track = null;
    this._domNode = $(HTML);
    this._doubleClicked = this._doubleClicked.bind(this);
    this._clicked = this._clicked.bind(this);
    this._hovered = this._hovered.bind(this);
    this._touchDoubleClicked = domUtil.doubleTapHandler(this._doubleClicked);
    this._touchClicked = domUtil.tapHandler(function(e) {
        GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this._ratingInputClicked(e.currentTarget);
    }.bind(this));
    this._update(-1);
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
    if (this.track !== null) {
        this.track = null;
        this.$().off("click", ".rating-input", this._clicked);
        this.$().off("mouseleave mouseenter", ".rating-input", this._hovered);
        this.$().off(domUtil.TOUCH_EVENTS, ".rating-input", this._touchClicked);
        this.$().off(domUtil.TOUCH_EVENTS, this._touchDoubleClicked);
        this.$().off("dblclick", this._doubleClicked);
        this._update(-1);
    }
};

TrackRating.prototype.enable = function(track) {
    this.track = track;
    this.$().on("click", ".rating-input", this._clicked);
    this.$().on("dblclick", this._doubleClicked);
    this.$().on("mouseenter mouseleave", ".rating-input", this._hovered);
    this.$().on(domUtil.TOUCH_EVENTS, ".rating-input", this._touchClicked);
    this.$().on(domUtil.TOUCH_EVENTS, this._touchDoubleClicked);
    this._update(this.track.getRating());
};

TrackRating.prototype._clicked = function(e) {
    GlobalUi.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
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

module.exports = TrackRating;