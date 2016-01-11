"use strict";
const $ = require("../lib/jquery");
const util = require("./util");
const Selectable = require("./Selectable");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

function DraggableSelection(dom, playlist, opts) {
    opts = Object(opts);
    this._mustMatchSelector = opts.mustMatchSelector || null;
    this._mustNotMatchSelector = opts.mustNotMatchSelector || null;
    this._domNode = $(dom);
    this._selection = null;
    this._playlist = playlist;
    this._previousRawY = -1;
    this._listOffset = 0;
    this._listHeight = 0;
    this._currentReferenceTrack = -1;
    this._onMovement = this._onMovement.bind(this);
    this._onMouseRelease = this._onMouseRelease.bind(this);
    this._onTrackMouseDown = this._onTrackMouseDown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);
    this._restart = this._restart.bind(this);
    this._onTouchmove = domUtil.touchMoveHandler(this._onTouchmove.bind(this));
    this._onTouchend = domUtil.touchUpHandler(this._onTouchend.bind(this));

    this._scrollUp = this._scrollUp.bind(this);
    this._scrollDown = this._scrollDown.bind(this);

    this._scrollIntervalId = -1;

    if (!touch) {
        this.$().on("mousedown", this._onTrackMouseDown);
    } else {
        this._onTrackMouseDown = domUtil.touchDownHandler(this._onTrackMouseDown);
        this.$().on("touchstart", this._onTrackMouseDown);
    }
    this.$().bind("selectstart", function(e) {e.preventDefault();});
}

DraggableSelection.prototype._clearScrollInterval = function() {
    if (this._scrollIntervalId !== -1) {
        clearInterval(this._scrollIntervalId);
        this._scrollIntervalId = -1;
    }
};

DraggableSelection.prototype._shouldScrollUp = function() {
    var box = this.$()[0].getBoundingClientRect();
    var lastY = this._previousRawY;
    var itemHeight = this._playlist.getItemHeight();
    var wiggleArea = touch ? itemHeight : itemHeight / 2;
    return lastY <= box.top + wiggleArea;
};

DraggableSelection.prototype._shouldScrollDown = function() {
    var box = this.$()[0].getBoundingClientRect();
    var lastY = this._previousRawY;
    var itemHeight = this._playlist.getItemHeight();
    var wiggleArea = touch ? itemHeight : itemHeight / 2;
    return lastY >= box.bottom - wiggleArea;
};

DraggableSelection.prototype._scrollUp = function() {
    if (this._shouldScrollUp()) {
        util.scrollUp(this.$()[0], this._playlist.getItemHeight());
    } else {
        this._clearScrollInterval();
    }
};

DraggableSelection.prototype._scrollDown = function() {
    if (this._shouldScrollDown()) {
        util.scrollDown(this.$()[0], this._playlist.getItemHeight());
    } else {
        this._clearScrollInterval();
    }
};

DraggableSelection.prototype._maybeStartUpScroller = function() {
    if (this._scrollIntervalId === -1 && this._shouldScrollUp()) {
        this._scrollIntervalId = setInterval(this._scrollUp, 100);
    }
};

DraggableSelection.prototype._maybeStartDownScroller = function() {
    if (this._scrollIntervalId === -1 && this._shouldScrollDown()) {
        this._scrollIntervalId = setInterval(this._scrollDown, 100);
    }
};

DraggableSelection.prototype._coordinateToTrackIndex = function(y) {
    return Math.floor(this._translateYCoordinate(y) / this._playlist.getItemHeight());
};

DraggableSelection.prototype.$ = function() {
    return this._domNode;
};

DraggableSelection.prototype._onReLayout = function() {
    this._calculateDimensions();
    this._currentReferenceTrack = this._coordinateToTrackIndex(this._previousRawY);
};

DraggableSelection.prototype._onTouchmove = function(e) {
    return this._onMovement(e);
};

DraggableSelection.prototype._onTouchend = function(e) {
    return this._onMouseRelease(e);
};

DraggableSelection.prototype._onMouseRelease = function() {
    this.$().unbind("scroll", this._onMovement);
    if (!touch) {
        $(document).off("mousemove", this._onMovement)
                    .off("mouseup", this._onMouseRelease);
    } else {
        $(document).off("touchmove", this._onTouchmove)
                    .off("touchend", this._onTouchend);
    }
    this._playlist.removeListener("tracksSelected", this._restart);
    this._playlist.removeListener("lengthChange", this._restart);
    this._playlist.removeListener("trackOrderChange", this._restart);
    $(window).off("relayout", this._onReLayout);
    this._currentReferenceTrack = this._previousRawY = -1;
    this._clearScrollInterval();
    this._selection = null;
};

DraggableSelection.prototype._translateYCoordinate = function(rawY) {
    var dom = this.$()[0];
    return Math.max(0, Math.min(rawY - this._listOffset, this._listHeight)) + dom.scrollTop;
};

DraggableSelection.prototype._onMovement = function(e) {
    if (!domUtil.isTouchEvent(e) && e.type !== "scroll" && e.which !== 1) {
        return this._onMouseRelease();
    }
    this._maybeStartDownScroller();
    this._maybeStartUpScroller();

    var itemHeight = this._playlist.getItemHeight();
    var clientY = typeof e.clientY === "number" ? e.clientY : this._previousRawY;
    this._previousRawY = clientY;
    var y = this._translateYCoordinate(clientY);
    var selection = this._selection;
    var tracks = this._playlist.getTracks();
    var referenceY = this._currentReferenceTrack * itemHeight;
    var changed = false;
    if (y < referenceY) {
        var distance = Math.floor((referenceY - y) / itemHeight) + 1;
        this._currentReferenceTrack = Math.max(0, this._currentReferenceTrack - distance);
        Selectable.moveSelectedTracksUpBy(tracks, selection, distance);
        changed = true;
    } else if (y > (referenceY + itemHeight)) {
        var distance = Math.floor((y - (referenceY + itemHeight)) / itemHeight) + 1;
        this._currentReferenceTrack = Math.min(this._playlist.length - 1, this._currentReferenceTrack + distance);
        Selectable.moveSelectedTracksDownBy(tracks, selection, distance);
        changed = true;
    }

    if (changed) {
        this._playlist.trackIndexChanged();
        this._playlist.trackVisibilityChanged();
    }
};

DraggableSelection.prototype._calculateDimensions = function() {
    this._listOffset = this.$()[0].offsetTop;
    this._listHeight = this.$()[0].offsetHeight;
};

DraggableSelection.prototype._restart = function() {
    this._selection = this._playlist.getSelection();
    if (!this._selection.length) {
        return this._onMouseRelease();
    }
    this._onReLayout();
};

DraggableSelection.prototype._onTrackMouseDown = function(e) {
    var $target = $(e.target);
    if (this._mustMatchSelector && !$target.closest(this._mustMatchSelector).length) {
        return;
    }

    if (this._mustNotMatchSelector && $target.closest(this._mustNotMatchSelector).length) {
        return;
    }

    if (!this._playlist.getSelectedTrackCount()) {
        return;
    }

    this._selection = this._playlist.getSelection();
    this._previousRawY = e.clientY;
    this._onReLayout();

    this.$().on("scroll", this._onMovement);
    if (!touch) {
        $(document).on("mousemove", this._onMovement);
        $(document).on("mouseup", this._onMouseRelease);
    } else {
        $(document).on("touchmove", this._onTouchmove);
        $(document).on("touchend", this._onTouchend);
    }
    $(window).on("relayout", this._onReLayout);
    this._playlist.on("tracksSelected", this._restart);
    this._playlist.on("lengthChange", this._restart);
    this._playlist.on("trackOrderChange", this._restart);
};

module.exports = DraggableSelection;
