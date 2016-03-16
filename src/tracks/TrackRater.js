"use strict";

import $ from "jquery";

const HTML = "<div class='track-rating'>                                                               \
        <div data-rating='1' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='2' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='3' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='4' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='5' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
    </div>";

export default function TrackRater(opts) {
    opts = Object(opts);
    this.recognizerContext = opts.recognizerContext;
    this.rippler = opts.rippler;
    this.track = null;
    this._domNode = $(HTML);
    this._doubleClicked = this._doubleClicked.bind(this);
    this._clicked = this._clicked.bind(this);
    this._hovered = this._hovered.bind(this);
    this._doubleTapRecognizer = this.recognizerContext.createDoubleTapRecognizer(this._doubleClicked);
    this._tapRecognizer = this.recognizerContext.createTapRecognizer(this._clicked);
    this._update(-1);
    this._enabled = false;
}

TrackRater.prototype.$ = function() {
    return this._domNode;
};

TrackRater.prototype._addClassToRatingsAtLeast = function(inputs, value, className) {
    inputs.filter(function() {
        return parseInt($(this).data("rating"), 10) <= value;
    }).addClass(className);
};

TrackRater.prototype._hovered = function(e) {
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

TrackRater.prototype.disable = function() {
    this.track = null;
    this._update(-1);
    if (!this._enabled) {
        return;
    }
    this._enabled = false;
    this.$().off("click", ".rating-input", this._clicked);
    this.$().off("mouseleave mouseenter", ".rating-input", this._hovered);
    this._tapRecognizer.unrecognizeBubbledOn(this.$(), ".rating-input");
    this._doubleTapRecognizer.unrecognizeBubbledOn(this.$());
    this.$().off("dblclick", this._doubleClicked);
};

TrackRater.prototype.update = function() {
    if (this.track) {
        this._update(this.track.getRating());
    }
};

TrackRater.prototype.enable = function(track) {
    this.track = track;
    this._update(this.track.getRating());
    if (this._enabled) {
        return;
    }
    this._enabled = true;
    this.$().on("click", ".rating-input", this._clicked);
    this.$().on("dblclick", this._doubleClicked);
    this.$().on("mouseenter mouseleave", ".rating-input", this._hovered);
    this._tapRecognizer.recognizeBubbledOn(this.$(), ".rating-input");
    this._doubleTapRecognizer.recognizeBubbledOn(this.$());
};


TrackRater.prototype._clicked = function(e) {
    this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this._ratingInputClicked(e.currentTarget);
};

TrackRater.prototype._doubleClicked = function() {
    this.track.rate(-1);
    this._update(-1);
};

TrackRater.prototype._update = function(value) {
    var inputs = this.$().find(".rating-input");
    inputs.removeClass("rated");
    this._addClassToRatingsAtLeast(inputs, value, "rated");
};

TrackRater.prototype._ratingInputClicked = function(node) {
    var value = parseInt($(node).data("rating"), 10);
    this.track.rate(value);
    this._update(value);
};
