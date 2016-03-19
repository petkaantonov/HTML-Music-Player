"use strict";

import EventEmitter from "events";
import { inherits } from "util";

export default function AbstractTrackContainer() {
    EventEmitter.call(this);
}
inherits(AbstractTrackContainer, EventEmitter);

AbstractTrackContainer.prototype._bindListEvents = function() {
    var page = this.page;
    var self = this;

    self.$().addEventListener("click", page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        if (self._draggable && self._draggable.recentlyStoppedDragging()) return;
        return self._selectable.trackViewClick(e, trackView);
    }, ".track-container"));

    self.$().addEventListener("mousedown", page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        self._selectable.trackViewMouseDown(e, trackView);
    }, ".track-container"));

    self.$().addEventListener("dblclick", page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        self.changeTrackExplicitly(trackView.track());
    }, ".track-container"));

    self.recognizerContext.createModifierTapRecognizer(page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;

        if (self._selectable.contains(trackView)) {
            self._selectable.removeTrackView(trackView);
        } else {
            self._selectable.addTrackView(trackView);
            self._selectable.setPriorityTrackView(trackView);
        }
    }, ".track-container")).recognizeBubbledOn(self.$());

    self.recognizerContext.createTapRecognizer(page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        self._selectable.selectTrackView(trackView);
    }, ".track-container")).recognizeBubbledOn(self.$());

    self.recognizerContext.createLongTapRecognizer(page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        if (!self._selectable.contains(trackView)) {
            self._selectable.selectTrackView(trackView);
        }
        self._selectable.setPriorityTrackView(trackView);
    }, ".track-container")).recognizeBubbledOn(self.$());

    self.recognizerContext.createDoubleTapRecognizer(page.delegatedEventHandler(function(e) {
        if (page.$(e.target).closest(".unclickable").length > 0) return;
        var trackView = self._fixedItemListScroller.itemByRect(e.delegateTarget.getBoundingClientRect());
        if (!trackView) return;
        self.changeTrackExplicitly(trackView.track());
    }, ".track-container")).recognizeBubbledOn(self.$());

    if (self._draggable) {
        self._draggable.on("dragStart", function() {
            self.$().find(".tracklist-transform-container").addClass("tracks-dragging");
        });
        self._draggable.on("dragEnd", function() {
            self.$().find(".tracklist-transform-container").removeClass("tracks-dragging");
        });
    }
};

AbstractTrackContainer.prototype.getSelection = function() {
    return this._selectable.getSelection();
};

AbstractTrackContainer.prototype.clearSelection = function() {
    this._selectable.clearSelection();
};

AbstractTrackContainer.prototype.selectAll = function() {
    if (this.length) {
        this._selectable.all();
    }
};

AbstractTrackContainer.prototype.selectFirst = function() {
    if (this.length) {
        this._selectable.selectFirst();
    }
};

AbstractTrackContainer.prototype.selectLast = function() {
    if (this.length) {
        this._selectable.selectLast();
    }
};

AbstractTrackContainer.prototype.selectAllUp = function() {
    if (this.length) {
        this._selectable.appendPrev(this.length);
    }
};

AbstractTrackContainer.prototype.selectAllDown = function() {
    if (this.length) {
        this._selectable.appendNext(this.length);
    }
};

AbstractTrackContainer.prototype.selectPrev = function() {
    if (this.length) {
        this._selectable.prev();
    }
};

AbstractTrackContainer.prototype.selectNext = function() {
    if (this.length) {
        this._selectable.next();
    }
};

AbstractTrackContainer.prototype.selectPrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev();
    }
};

AbstractTrackContainer.prototype.selectNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext();
    }
};

AbstractTrackContainer.prototype.removeTopmostSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection();
    }
};

AbstractTrackContainer.prototype.removeBottommostSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection();
    }
};

AbstractTrackContainer.prototype.moveSelectionUp = function() {
    if (this.length) {
        this._selectable.moveUp();
    }
};

AbstractTrackContainer.prototype.moveSelectionDown = function() {
    if (this.length) {
        this._selectable.moveDown();
    }
};

AbstractTrackContainer.prototype.tracksVisibleInContainer = function() {
    return this._fixedItemListScroller.itemsVisibleInContainer();
};

AbstractTrackContainer.prototype.halfOfTracksVisibleInContainer = function() {
    return Math.ceil(this.tracksVisibleInContainer() / 2);
};

AbstractTrackContainer.prototype.selectPagePrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.selectPageNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.selectPagePrev = function() {
    if (this.length) {
        this._selectable.prev(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.selectPageNext = function() {
    if (this.length) {
        this._selectable.next(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.removeTopmostPageSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.removeBottommostPageSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.moveSelectionPageUp = function() {
    if (this.length) {
        this._selectable.moveUp(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.moveSelectionPageDown = function() {
    if (this.length) {
        this._selectable.moveDown(this.halfOfTracksVisibleInContainer());
    }
};

AbstractTrackContainer.prototype.selectTrackView = function(trackView) {
    var index = trackView.getIndex();
    if (index >= 0) {
        this.clearSelection();
        this._selectable.addTrackView(trackView);
        this.centerOnTrackView(trackView);
    }
};

AbstractTrackContainer.prototype.selectionContainsAnyItemViewsBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return false;
    return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
};

AbstractTrackContainer.prototype.selectTracksBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return;
    this._selectable.selectRange(indices.startIndex, indices.endIndex);
};

AbstractTrackContainer.prototype.getItemHeight = function() {
    return this._fixedItemListScroller.itemHeight();
};

AbstractTrackContainer.prototype.playPrioritySelection = function() {
    if (!this.length) return;

    var trackView = this._selectable.getPriorityTrackView();
    if (!trackView) return this.playFirstSelected();
    this.changeTrackExplicitly(trackView.track());
};

AbstractTrackContainer.prototype.playFirstSelected = function() {
    if (!this.length) return;

    var firstTrackView = this._selectable.first();
    if (!firstTrackView) return;
    this.changeTrackExplicitly(firstTrackView.track());
};

AbstractTrackContainer.prototype.getTrackViews = function() {
    return this._trackViews;
};

AbstractTrackContainer.prototype.centerOnTrackView = function(trackView) {
    if (trackView && !trackView.isDetachedFromPlaylist()) {
        var y = this._fixedItemListScroller.yByIndex(trackView.getIndex());
        y -= (this._fixedItemListScroller.contentHeight() / 2);
        this._fixedItemListScroller.scrollToUnsnapped(y, false);
    }
};

AbstractTrackContainer.prototype.getTrackByIndex = function(index) {
    if (index >= 0 && index <= this._trackViews.length - 1) {
        return this._trackViews[index].track();
    }
    return null;
};

AbstractTrackContainer.prototype.getTrackViewByIndex = function(index) {
    if (index >= 0 && index <= this._trackViews.length - 1) {
        return this._trackViews[index];
    }
    return null;
};

AbstractTrackContainer.prototype.getSelectable = function() {
    return this._selectable;
};

AbstractTrackContainer.prototype.getSelectedItemViewCount = function() {
    return this._selectable.getSelectedItemViewCount();
};

AbstractTrackContainer.prototype.toArray = function() {
    return this._trackViews.slice();
};

AbstractTrackContainer.prototype.removeTracksBySelectionRanges = (function() {
    function remove(trackViews, selection, indexOffset) {
        var trackViewsLength = trackViews.length;
        var tracksToRemove = selection.length;
        var count = trackViewsLength - tracksToRemove;
        var index = selection[0] - indexOffset;

        for (var i = index; i < count && i + tracksToRemove < trackViewsLength; ++i) {
            var trackView = trackViews[i + tracksToRemove];
            trackView.setIndex(i);
            trackViews[i] = trackView;
        }
        trackViews.length = count;
    }

    return function(selectionRanges) {
        var trackViews = this._trackViews;
        var indexOffset = 0;
        selectionRanges.forEach(function(selection) {
            remove(trackViews, selection, indexOffset);
            indexOffset += selection.length;
        });
    };
})();
