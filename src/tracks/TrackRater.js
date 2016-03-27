"use strict";

const HTML = "<div class='track-rating'>                                                               \
        <div data-rating='1' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='2' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='3' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='4' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
        <div data-rating='5' class='rating-input'><span class='glyphicon glyphicon-star'></span></div> \
    </div>";

export default function TrackRater(deps) {
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.rippler = deps.rippler;
    this.track = null;
    this._domNode = this.page.parse(HTML);
    this._doubleClicked = this.page.delegatedEventHandler(this._doubleClicked, ".rating-input", this);
    this._clicked = this.page.delegatedEventHandler(this._clicked, ".rating-input", this);
    this._hovered = this.page.delegatedEventHandler(this._hovered, ".rating-input", this);
    this._doubleTapRecognizer = this.recognizerContext.createDoubleTapRecognizer(this._doubleClicked);
    this._tapRecognizer = this.recognizerContext.createTapRecognizer(this._clicked);
    this._update(-1);
    this._enabled = false;
    deps.ensure();
}

TrackRater.prototype.$ = function() {
    return this._domNode;
};

TrackRater.prototype._addClassToRatingsAtLeast = function(inputs, value, className) {
    inputs.filter(function(elem) {
        return +elem.dataset.rating <= value;
    }).addClass(className);
};

TrackRater.prototype._hovered = function(e) {
    var inputs = this.$().find(".rating-input").removeClass("hovered");

    if (e.type === "mouseleave") {
        var related = this.page.$(e.relatedTarget);
        if (related.is(".rating-input")) {
            var value = +e.relatedTarget.dataset.rating;
            this._addClassToRatingsAtLeast(inputs, value, "hovered");
        }
    } else if (e.type === "mouseenter") {
        var value = +e.delegateTarget.dataset.rating;
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
    this.$().removeEventListener("click", this._clicked)
            .removeEventListener("mouseenter", this._hovered)
            .removeEventListener("mouseleave", this._hovered)
            .removeEventListener("dblclick", this._doubleClicked);
    this._tapRecognizer.unrecognizeBubbledOn(this.$());
    this._doubleTapRecognizer.unrecognizeBubbledOn(this.$());
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
    this.$().addEventListener("click", this._clicked)
            .addEventListener("mouseenter", this._hovered)
            .addEventListener("mouseleave", this._hovered)
            .addEventListener("dblclick", this._doubleClicked);
    this._tapRecognizer.recognizeBubbledOn(this.$());
    this._doubleTapRecognizer.recognizeBubbledOn(this.$());
};


TrackRater.prototype._clicked = function(e) {
    this.rippler.rippleElement(e.delegateTarget, e.clientX, e.clientY);
    this._ratingInputClicked(e.delegateTarget);
};

TrackRater.prototype._doubleClicked = function() {
    this.track.rate(-1);
    this._update(-1);
};

TrackRater.prototype._update = function(value) {
    var inputs = this.$().find(".rating-input").removeClass("rated");
    this._addClassToRatingsAtLeast(inputs, value, "rated");
};

TrackRater.prototype._ratingInputClicked = function(node) {
    var value = +node.dataset.rating;
    this.track.rate(value);
    this._update(value);
};
