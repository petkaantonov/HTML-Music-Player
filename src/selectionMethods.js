"use strict";

const getSelection = function() {
    return this._selectable.getSelection();
};

const clearSelection = function() {
    this._selectable.clearSelection();
};

const selectAll = function() {
    if (this.length) {
        this._selectable.all();
    }
};

const selectFirst = function() {
    if (this.length) {
        this._selectable.selectFirst();
    }
};

const selectLast = function() {
    if (this.length) {
        this._selectable.selectLast();
    }
};

const selectAllUp = function() {
    if (this.length) {
        this._selectable.appendPrev(this.length);
    }
};

const selectAllDown = function() {
    if (this.length) {
        this._selectable.appendNext(this.length);
    }
};

const selectPrev = function() {
    if (this.length) {
        this._selectable.prev();
    }
};

const selectNext = function() {
    if (this.length) {
        this._selectable.next();
    }
};

const selectPrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev();
    }
};

const selectNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext();
    }
};

const removeTopmostSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection();
    }
};

const removeBottommostSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection();
    }
};

const moveSelectionUp = function() {
    if (this.length) {
        this._selectable.moveUp();
    }
};

const moveSelectionDown = function() {
    if (this.length) {
        this._selectable.moveDown();
    }
};

const tracksVisibleInContainer = function() {
    return this._fixedItemListScroller.itemsVisibleInContainer();
};

const halfOfTracksVisibleInContainer = function() {
    return Math.ceil(this.tracksVisibleInContainer() / 2);
};

const selectPagePrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev(this.halfOfTracksVisibleInContainer());
    }
};

const selectPageNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext(this.halfOfTracksVisibleInContainer());
    }
};

const selectPagePrev = function() {
    if (this.length) {
        this._selectable.prev(this.halfOfTracksVisibleInContainer());
    }
};

const selectPageNext = function() {
    if (this.length) {
        this._selectable.next(this.halfOfTracksVisibleInContainer());
    }
};

const removeTopmostPageSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection(this.halfOfTracksVisibleInContainer());
    }
};

const removeBottommostPageSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection(this.halfOfTracksVisibleInContainer());
    }
};

const moveSelectionPageUp = function() {
    if (this.length) {
        this._selectable.moveUp(this.halfOfTracksVisibleInContainer());
    }
};

const moveSelectionPageDown = function() {
    if (this.length) {
        this._selectable.moveDown(this.halfOfTracksVisibleInContainer());
    }
};

const selectTrackView = function(trackView) {
    var index = trackView.getIndex();
    if (index >= 0) {
        this.clearSelection();
        this._selectable.addTrackView(trackView);
        this.centerOnTrackView(trackView);
    }
};

const selectionContainsAnyItemViewsBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return false;
    return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
};

const selectTracksBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return;
    this._selectable.selectRange(indices.startIndex, indices.endIndex);
};

const getItemHeight = function() {
    return this._fixedItemListScroller.itemHeight();
};

const playPrioritySelection = function() {
    if (!this.length) return;

    var trackView = this._selectable.getPriorityTrackView();
    if (!trackView) return this.playFirstSelected();
    this.changeTrackExplicitly(trackView.track());
};

const playFirstSelected = function() {
    if (!this.length) return;

    var firstTrackView = this._selectable.first();
    if (!firstTrackView) return;
    this.changeTrackExplicitly(firstTrackView.track());
};

const getTrackViews = function() {
    return this._trackViews;
};

const centerOnTrackView = function(trackView) {
    if (trackView && !trackView.isDetachedFromPlaylist()) {
        var y = this._fixedItemListScroller.yByIndex(trackView.getIndex());
        y -= (this._fixedItemListScroller.contentHeight() / 2);
        this._fixedItemListScroller.scrollToUnsnapped(y, false);
    }
};

const getTrackByIndex = function(index) {
    return this._trackViews[index].track();
};

const getTrackViewByIndex = function(index) {
    return this._trackViews[index];
};

const getSelectable = function() {
    return this._selectable;
};

const getSelectedItemViewCount = function() {
    return this._selectable.getSelectedItemViewCount();
};

const toArray = function() {
    return this._trackViews.slice();
};


const removeTracksBySelectionRanges = (function() {
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

exports.addSelectionMethods = function(ContentConstructor) {
    ContentConstructor.prototype.selectionContainsAnyItemViewsBetween = selectionContainsAnyItemViewsBetween;
    ContentConstructor.prototype.selectTracksBetween = selectTracksBetween;
    ContentConstructor.prototype.getItemHeight = getItemHeight;
    ContentConstructor.prototype.playPrioritySelection = playPrioritySelection;
    ContentConstructor.prototype.playFirstSelected = playFirstSelected;
    ContentConstructor.prototype.getTrackViews = getTrackViews;
    ContentConstructor.prototype.centerOnTrackView = centerOnTrackView;
    ContentConstructor.prototype.getTrackByIndex = getTrackByIndex;
    ContentConstructor.prototype.getTrackViewByIndex = getTrackViewByIndex;
    ContentConstructor.prototype.getSelectable = getSelectable;
    ContentConstructor.prototype.getSelectedItemViewCount = getSelectedItemViewCount;
    ContentConstructor.prototype.toArray = toArray;
    ContentConstructor.prototype.getSelection = getSelection;
    ContentConstructor.prototype.clearSelection = clearSelection;
    ContentConstructor.prototype.selectAll = selectAll;
    // Home and End selection stuff.
    ContentConstructor.prototype.selectFirst = selectFirst;
    ContentConstructor.prototype.selectLast = selectLast;
    ContentConstructor.prototype.selectAllUp = selectAllUp;
    ContentConstructor.prototype.selectAllDown = selectAllDown;
    // Arrow up and arrow down selection stuff.
    ContentConstructor.prototype.selectPrev = selectPrev;
    ContentConstructor.prototype.selectNext = selectNext;
    ContentConstructor.prototype.selectPrevAppend = selectPrevAppend;
    ContentConstructor.prototype.selectNextAppend = selectNextAppend;
    ContentConstructor.prototype.removeTopmostSelection = removeTopmostSelection;
    ContentConstructor.prototype.removeBottommostSelection = removeBottommostSelection;
    ContentConstructor.prototype.moveSelectionUp = moveSelectionUp;
    ContentConstructor.prototype.moveSelectionDown = moveSelectionDown;
    ContentConstructor.prototype.tracksVisibleInContainer = tracksVisibleInContainer;
    ContentConstructor.prototype.halfOfTracksVisibleInContainer = halfOfTracksVisibleInContainer;
    // Page up and page down selection stuff.
    ContentConstructor.prototype.selectPagePrevAppend = selectPagePrevAppend;
    ContentConstructor.prototype.selectPageNextAppend = selectPageNextAppend;
    ContentConstructor.prototype.selectPagePrev = selectPagePrev;
    ContentConstructor.prototype.selectPageNext = selectPageNext;
    ContentConstructor.prototype.removeTopmostPageSelection = removeTopmostPageSelection;
    ContentConstructor.prototype.removeBottommostPageSelection = removeBottommostPageSelection;
    ContentConstructor.prototype.moveSelectionPageUp = moveSelectionPageUp;
    ContentConstructor.prototype.moveSelectionPageDown = moveSelectionPageDown;
    ContentConstructor.prototype.selectTrackView = selectTrackView;

    ContentConstructor.prototype.removeTracksBySelectionRanges = removeTracksBySelectionRanges;
};
