"use strict";
import $ from "lib/jquery";
import { inherits } from "lib/util";
import Selectable from "ui/Selectable";
import { TOUCH_EVENTS, TOUCH_EVENTS_NO_MOVE, isTouchEvent, modifierDragHandler, modifierTouchDownHandler } from "lib/DomUtil";
import EventEmitter from "lib/events";

const DRAG_START_DELAY_MS = 300;

export default function DraggableSelection(dom, viewList, fixedItemListScroller, opts) {
    EventEmitter.call(this);
    opts = Object(opts);
    this.env = opts.env;
    this._mustMatchSelector = opts.mustMatchSelector || null;
    this._mustNotMatchSelector = opts.mustNotMatchSelector || null;
    this._fixedItemListScroller = fixedItemListScroller;
    this._domNode = $(dom);
    this._selection = null;
    this._viewList = viewList;
    this._previousRawY = -1;
    this._currentReferenceItemView = -1;
    this._dragStartDelayId = -1;
    this._holdingStartedY = -1;
    this._draggableDirections = {down: false, up: false};
    this._startDragFromTimeout = this._startDragFromTimeout.bind(this);
    this._onMovement = this._onMovement.bind(this);
    this._onMouseRelease = this._onMouseRelease.bind(this);
    this._onItemViewMouseDown = this._onItemViewMouseDown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);
    this._restart = this._restart.bind(this);
    this._onTouchmove = this._onTouchmove.bind(this);
    this._onTouchend = this._onTouchend.bind(this);
    this._touchDragHandler = modifierDragHandler(this._onTouchmove, this._onTouchend);
    this._onItemViewMouseDownTouch = modifierTouchDownHandler(this._onItemViewMouseDown);
    this._isDragging = false;
    this._dragStartFired = false;
    this._scroll = this._scroll.bind(this);
    this._scrollIntervalId = -1;
    this._justStoppedDragging = false;
}
inherits(DraggableSelection, EventEmitter);

DraggableSelection.prototype.recentlyStoppedDragging = function() {
    return this._justStoppedDragging;
};

DraggableSelection.prototype.bindEvents = function() {
    this.$().on("mousedown", this._onItemViewMouseDown);

    if (this.env.hasTouch()) {
        this.$().on(TOUCH_EVENTS_NO_MOVE, this._onItemViewMouseDownTouch);
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
    this._justStoppedDragging = false;
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
    this._currentReferenceItemView = this._fixedItemListScroller.indexByYCoordinate(this._previousRawY);
};

DraggableSelection.prototype._onTouchmove = function(e) {
    return this._onMovement(e);
};

DraggableSelection.prototype._onTouchend = function(e) {
    return this._onMouseRelease(e);
};

DraggableSelection.prototype._onMouseRelease = function(e) {
    this._clearDragStartDelay();
    if (!this._isDragging) return;
    var dragStartWasFired = this._dragStartFired;
    this._dragStartFired = false;
    this._isDragging = false;
    this.$().off("scroll", this._onMovement);

    $(document).off("mousemove", this._onMovement).off("mouseup", this._onMouseRelease);

    if (this.env.hasTouch()) {
        $(document).off(TOUCH_EVENTS, this._touchDragHandler);
    }
    this._viewList.removeListener("tracksSelected", this._restart);
    this._viewList.removeListener("lengthChange", this._restart);
    this._viewList.removeListener("trackOrderChange", this._restart);
    $(window).off("relayout", this._onReLayout);
    this._holdingStartedY = this._currentReferenceItemView = this._previousRawY = -1;
    this._clearScrollInterval();
    if (dragStartWasFired) {
        for (var i = 0; i < this._selection.length; ++i) {
            this._selection[i].stopDragging();
        }
    }
    this._selection = null;
    this.emit("dragEnd");

    if (dragStartWasFired) {
        var self = this;
        this._justStoppedDragging = true;
        this._dragStartDelayId = setTimeout(function() {
            self._justStoppedDragging = false;
        }, 13);
    }
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
    if (!isTouchEvent(e) && e.which !== 1) {
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
    var itemViews = this._viewList.getTrackViews();
    var referenceY = this._currentReferenceItemView * itemHeight;

    var changed = false;
    if (y < referenceY && this._draggableDirections.up) {
        var distance = Math.floor((referenceY - y) / itemHeight) + 1;
        this._currentReferenceItemView = Math.max(0, this._currentReferenceItemView - distance);
        Selectable.moveSelectedItemViewsUpBy(itemViews, selection, distance);
        changed = true;
        referenceY = this._currentReferenceItemView * itemHeight;
    } else if (y > (referenceY + itemHeight) && this._draggableDirections.down) {
        var distance = Math.floor((y - (referenceY + itemHeight)) / itemHeight) + 1;
        this._currentReferenceItemView = Math.min(this._viewList.length - 1, this._currentReferenceItemView + distance);
        Selectable.moveSelectedItemViewsDownBy(itemViews, selection, distance);
        changed = true;
        referenceY = this._currentReferenceItemView * itemHeight;
    }

    for (var i = 0; i < selection.length; ++i) {
        selection[i].setOffset(y - referenceY);
    }

    if (changed) {
        this._determineDraggableDirections(selection);
        this._viewList.trackIndexChanged();
    }
};

DraggableSelection.prototype._restart = function() {
    var oldSelection = this._selection.slice();
    this._selection = this._viewList.getSelection();

    if (this._dragStartFired) {
        for (var i = 0; i < oldSelection.length; ++i) {
            var itemView = oldSelection[i];

            if (!this._viewList._selectable.contains(itemView)) {
                itemView.stopDragging();
            }
        }

        for (var i = 0; i < this._selection.length; ++i) {
            this._selection[i].startDragging();
        }

        this._determineDraggableDirections(this._selection);
    }

    if (!this._selection.length) {
        return this._onMouseRelease();
    }
    this._onReLayout();
};

DraggableSelection.prototype._determineDraggableDirections = function(selection) {
    if (selection.length > 0) {
        this._draggableDirections.down = selection[selection.length - 1].getIndex() < this._viewList.length - 1;
        this._draggableDirections.up = selection[0].getIndex() > 0;
    } else {
        this._draggableDirections.down = this._draggableDirections.up = false;
    }
};

DraggableSelection.prototype._onItemViewMouseDown = function(e) {
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

    if (!this._viewList.getSelectedItemViewCount()) {
        return;
    }

    if (isTouchEvent(e) &&
        (!this._viewList.selectionContainsAnyItemViewsBetween(e.clientY, e.clientY) ||
        e.isFirst === false)) {
        return;
    }

    var selection = this._viewList.getSelection();
    this._determineDraggableDirections(selection);
    this._selection = selection;

    this._startDragStartDelay();
    this._isDragging = true;
    this._previousRawY = e.clientY;
    this._holdingStartedY = e.clientY;

    this._onReLayout();

    $(document).on("mousemove", this._onMovement);
    $(document).on("mouseup", this._onMouseRelease);

    if (this.env.hasTouch()) {
        $(document).on(TOUCH_EVENTS, this._touchDragHandler);
    }

    $(window).on("relayout", this._onReLayout);
    this._viewList.on("tracksSelected", this._restart);
    this._viewList.on("lengthChange", this._restart);
    this._viewList.on("trackOrderChange", this._restart);
};
