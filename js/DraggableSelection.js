"use strict";
const $ = require("../lib/jquery");
const util = require("./util");
const Selectable = require("./Selectable");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");

function DraggableSelection(dom, playlist, fixedItemListScroller, opts) {
    opts = Object(opts);
    this._mustMatchSelector = opts.mustMatchSelector || null;
    this._mustNotMatchSelector = opts.mustNotMatchSelector || null;
    this._fixedItemListScroller = fixedItemListScroller;
    this._domNode = $(dom);
    this._selection = null;
    this._playlist = playlist;
    this._previousRawY = -1;
    this._currentReferenceTrack = -1;
    this._onMovement = this._onMovement.bind(this);
    this._onMouseRelease = this._onMouseRelease.bind(this);
    this._onTrackMouseDown = this._onTrackMouseDown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);
    this._restart = this._restart.bind(this);
    this._onTouchmove = this._onTouchmove.bind(this);
    this._onTouchend = this._onTouchend.bind(this);
    this._touchDragHandler = domUtil.dragHandler(this._onTouchmove, this._onTouchend);
    this._onTrackMouseDownTouch = domUtil.touchDownHandler(this._onTrackMouseDown);
    this._isDragging = false;

    this._scroll = this._scroll.bind(this);
    this._scrollIntervalId = -1;

    this.$().on("mousedown", this._onTrackMouseDown);

    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS_NO_MOVE, this._onTrackMouseDownTouch);
    }
    this.$().on("selectstart", function(e) {e.preventDefault();});

}

DraggableSelection.prototype.isDragging = function() {
    return this._isDragging;
};

DraggableSelection.prototype._clearScrollInterval = function() {
    if (this._scrollIntervalId !== -1) {
        clearInterval(this._scrollIntervalId);
        this._scrollIntervalId = -1;
    }
};

DraggableSelection.prototype._scroll = function() {
    var edge = this._fixedItemListScroller.getEdgeByCoordinateWithinMargin(this._previousRawY,
                                                                           this._fixedItemListScroller.itemHeight());
    this._fixedItemListScroller.scrollBy(edge * this._fixedItemListScroller.itemHeight());
    
    if (edge !== 0) {
        this._onMovement({clientY: this._previousRawY, type: "scroll", which: 1});
    }
};

DraggableSelection.prototype.$ = function() {
    return this._domNode;
};

DraggableSelection.prototype._onReLayout = function() {
    this._currentReferenceTrack = this._fixedItemListScroller.indexByYCoordinate(this._previousRawY);
};

DraggableSelection.prototype._onTouchmove = function(e) {
    return this._onMovement(e);
};

DraggableSelection.prototype._onTouchend = function(e) {
    return this._onMouseRelease(e);
};

DraggableSelection.prototype._onMouseRelease = function() {
    if (!this._isDragging) return;
    this._isDragging = false;
    this.$().off("scroll", this._onMovement);
    
    $(document).off("mousemove", this._onMovement).off("mouseup", this._onMouseRelease);

    if (touch) {
        $(document).off(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }
    this._playlist.removeListener("tracksSelected", this._restart);
    this._playlist.removeListener("lengthChange", this._restart);
    this._playlist.removeListener("trackOrderChange", this._restart);
    $(window).off("relayout", this._onReLayout);
    this._currentReferenceTrack = this._previousRawY = -1;
    this._clearScrollInterval();
    this._selection = null;
};

DraggableSelection.prototype._onMovement = function(e) {
    if (!domUtil.isTouchEvent(e) && e.which !== 1) {
        return this._onMouseRelease();
    }

    if (this._scrollIntervalId === -1) {
        this._scrollIntervalId = setInterval(this._scroll, 100);
    }
    
    var itemHeight = this._fixedItemListScroller.itemHeight();
    var clientY = typeof e.clientY === "number" ? e.clientY : this._previousRawY;
    this._previousRawY = clientY;
    var y = this._fixedItemListScroller.mapYCoordinate(clientY);
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
    }
};

DraggableSelection.prototype._restart = function() {
    this._selection = this._playlist.getSelection();
    if (!this._selection.length) {
        return this._onMouseRelease();
    }
    this._onReLayout();
};

DraggableSelection.prototype._onTrackMouseDown = function(e) {
    if (this._isDragging) {
        return;
    }

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

    if (domUtil.isTouchEvent(e) &&
        (!this._playlist.selectionContainsAnyTracksBetween(e.clientY, e.clientY) ||
        e.isFirst === false)) {
        return;
    }

    this._isDragging = true;
    this._selection = this._playlist.getSelection();
    this._previousRawY = e.clientY;
    this._onReLayout();

    $(document).on("mousemove", this._onMovement);
    $(document).on("mouseup", this._onMouseRelease);

    if (touch) {
        $(document).on(domUtil.TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).on("relayout", this._onReLayout);
    this._playlist.on("tracksSelected", this._restart);
    this._playlist.on("lengthChange", this._restart);
    this._playlist.on("trackOrderChange", this._restart);
};

module.exports = DraggableSelection;
