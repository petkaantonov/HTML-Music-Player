"use strict";
const $ = require("../lib/jquery");
const util = require("./util");
const Selectable = require("./Selectable");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const EventEmitter = require("events");

const DRAG_START_DELAY_MS = 300;

function DraggableSelection(dom, playlist, fixedItemListScroller, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this._mustMatchSelector = opts.mustMatchSelector || null;
    this._mustNotMatchSelector = opts.mustNotMatchSelector || null;
    this._fixedItemListScroller = fixedItemListScroller;
    this._domNode = $(dom);
    this._selection = null;
    this._playlist = playlist;
    this._previousRawY = -1;
    this._currentReferenceTrack = -1;
    this._dragStartDelayId = -1;
    this._holdingStartedY = -1;

    this._startDragFromTimeout = this._startDragFromTimeout.bind(this);
    this._onMovement = this._onMovement.bind(this);
    this._onMouseRelease = this._onMouseRelease.bind(this);
    this._onTrackMouseDown = this._onTrackMouseDown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);
    this._restart = this._restart.bind(this);
    this._onTouchmove = this._onTouchmove.bind(this);
    this._onTouchend = this._onTouchend.bind(this);
    this._touchDragHandler = domUtil.modifierDragHandler(this._onTouchmove, this._onTouchend);
    this._onTrackMouseDownTouch = domUtil.modifierTouchDownHandler(this._onTrackMouseDown);
    this._isDragging = false;
    this._dragStartFired = false;

    this._scroll = this._scroll.bind(this);
    this._scrollIntervalId = -1;
}
util.inherits(DraggableSelection, EventEmitter);

DraggableSelection.prototype.bindEvents = function() {
    this.$().on("mousedown", this._onTrackMouseDown);

    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS_NO_MOVE, this._onTrackMouseDownTouch);
    }
    this.$().on("selectstart", function(e) {e.preventDefault();});
};

DraggableSelection.prototype.isDragging = function() {
    return this._isDragging;
};

DraggableSelection.prototype._clearScrollInterval = function() {
    if (this._scrollIntervalId !== -1) {
        clearInterval(this._scrollIntervalId);
        this._scrollIntervalId = -1;
    }
};

DraggableSelection.prototype._startDragFromTimeout = function() {
    var yMoved = Math.abs(this._holdingStartedY - this._previousRawY);
    this._dragStartDelayId = -1;
    if (yMoved > this._fixedItemListScroller.itemHeight()) {
        this._onMouseRelease();
    } else {
        this._fireDragStart();
    }
};

DraggableSelection.prototype._startDragStartDelay = function() {
    this._clearDragStartDelay();
    this._dragStartDelayId = setTimeout(this._startDragFromTimeout, DRAG_START_DELAY_MS);
};

DraggableSelection.prototype._clearDragStartDelay = function() {
    if (this._dragStartDelayId !== -1) {
        clearTimeout(this._dragStartDelayId);
        this._dragStartDelayId = -1;
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
    this._clearDragStartDelay();
    if (!this._isDragging) return;
    var dragStartWasFired = this._dragStartFired;
    this._dragStartFired = false;
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
    this._holdingStartedY = this._currentReferenceTrack = this._previousRawY = -1;
    this._clearScrollInterval();
    if (dragStartWasFired) {
        for (var i = 0; i < this._selection.length; ++i) {
            this._selection[i].stopDragging();
        }
    }
    this._selection = null;
    this.emit("dragEnd");
};

DraggableSelection.prototype._fireDragStart = function() {
    if (!this._dragStartFired && this._isDragging) {
        this._dragStartFired = true;
        this.emit("dragStart");
        for (var i = 0; i < this._selection.length; ++i) {
            this._selection[i].startDragging();
        }
    }
};

DraggableSelection.prototype._onMovement = function(e) {
    if (!domUtil.isTouchEvent(e) && e.which !== 1) {
        return this._onMouseRelease();
    }

    var clientY = typeof e.clientY === "number" ? e.clientY : this._previousRawY;
    this._previousRawY = clientY;

    if (!this._dragStartFired) {
        return;
    }

    if (this._scrollIntervalId === -1) {
        this._scrollIntervalId = setInterval(this._scroll, 100);
    }

    var itemHeight = this._fixedItemListScroller.itemHeight();

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
        referenceY = this._currentReferenceTrack * itemHeight;
    } else if (y > (referenceY + itemHeight)) {
        var distance = Math.floor((y - (referenceY + itemHeight)) / itemHeight) + 1;
        this._currentReferenceTrack = Math.min(this._playlist.length - 1, this._currentReferenceTrack + distance);
        Selectable.moveSelectedTracksDownBy(tracks, selection, distance);
        changed = true;
        referenceY = this._currentReferenceTrack * itemHeight;
    }

    for (var i = 0; i < selection.length; ++i) {
        selection[i].setOffset(y - referenceY);
    }

    if (changed) {
        this._playlist.trackIndexChanged();
    }
};

DraggableSelection.prototype._restart = function() {
    var oldSelection = this._selection.slice();
    this._selection = this._playlist.getSelection();

    if (this._dragStartFired) {
        for (var i = 0; i < oldSelection.length; ++i) {
            var track = oldSelection[i];

            if (!this._playlist._selectable.contains(track)) {
                track.stopDragging();
            }
        }

        for (var i = 0; i < this._selection.length; ++i) {
            this._selection[i].startDragging();
        }
    }

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

    this._startDragStartDelay();
    this._isDragging = true;
    this._selection = this._playlist.getSelection();
    this._previousRawY = e.clientY;
    this._holdingStartedY = e.clientY;

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
