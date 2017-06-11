
import EventEmitter from "events";
import {noUndefinedGet, TRACK_SORTER, buildConsecutiveRanges, indexMapper, inherits} from "util";
import {SortedSet} from "DataStructures";

export default function Selectable(opts, deps) {
    opts = noUndefinedGet(opts);
    EventEmitter.call(this);
    this._page = deps.page;
    this._listView = opts.listView;
    this._selectionPointer = null;
    this._lastIdx = null;
    this._lastStart = null;
    this._lastEnd = null;
    this._prioritySelection = null;
    this._selection = new SortedSet(TRACK_SORTER);

}
inherits(Selectable, EventEmitter);

Selectable.prototype.trackViewMouseDown = function(e, trackView) {
    if (e.which !== 1 && e.which !== 3) {
        return;
    }

    const modifierKeyPropertyName = this._page.modifierKeyPropertyName();

    if (e.which === 3) {
        if (!this.contains(trackView)) {
            this.selectTrackView(trackView);
        }
        this.setPriorityTrackView(trackView);
        return;
    }

    const idx = trackView.getIndex();

    if (e.shiftKey && e[modifierKeyPropertyName]) {
        if (this._selectionPointer === null) {
            this._shiftSelection(idx);
        } else {
            this._appendingShiftSelection(idx);
        }

    } else if (e.shiftKey && !e[modifierKeyPropertyName]) {
        this._shiftSelection(idx);
    } else if (e[modifierKeyPropertyName]) {
        if (this._selection.contains(trackView)) {
            this._remove(idx);
        } else {
            this._add(idx);
            this._selectionPointer = idx;
        }
        this._lastIdx = null;
    } else if (!e[modifierKeyPropertyName] && !e.shiftKey) {
        if (this._selection.contains(trackView)) {
            this._selectionPointer = idx;
            return;
        }
        this._resetPointers();
        this._clearSelection();
        this._add(idx);
    }
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.trackViewClick = function(e, trackView) {
    if (!e[this._page.modifierKeyPropertyName()] && !e.shiftKey) {
        this._resetPointers();
        this._clearSelection();
        this._add(trackView.getIndex());
        this._listView.emit(`tracksSelected`, this);
    }
};

Selectable.prototype._clearSelection = function() {
    this._prioritySelection = null;
    this._selection.forEach((trackView) => {
        trackView.unselected();
    });
    this._selection.clear();
};

Selectable.prototype._add = function(index) {
    const trackView = this._listView.getTrackViewByIndex(index);
    trackView.selected();
    this._selection.add(trackView);
};

Selectable.prototype._shiftSelection = function(idx) {
    if (this._selection.isEmpty()) {
        this._resetPointers();
        this._add(idx);
        this._selectionPointer = idx;
    }
    let j;
    this._selectionPointer = null;

    if (!this._lastStart) {
        this._lastEnd = this._selection.last().getIndex();
        this._lastStart = this._selection.first().getIndex();
    }

    if (idx < this._lastStart) {
        // User changed this._selection directions to UP
        if (this._lastIdx === this._lastEnd || this._lastIdx === null) {
            this._clearSelection();
            for (j = idx; j <= this._lastStart; ++j) {
                this._add(j);
            }
            this._lastIdx = idx;
            this._selectionPointer = idx;
            this._lastEnd = this._selection.last().getIndex();
            this._lastStart = this._selection.first().getIndex();
        // User preserved this._selection direction UP
        } else if (this._lastIdx === this._lastStart) {
            for (j = idx; j <= this._lastStart; ++j) {
                this._add(j);
            }
            this._selectionPointer = idx;
        }
    } else if (idx > this._lastEnd) {
        // User changed this._selection directions to DOWN
        if (this._lastIdx === this._lastStart || this._lastIdx === null) {
            this._clearSelection();
            if (this._lastIdx === null) {
                for (j = this._lastStart; j <= idx; ++j) {
                    this._add(j);
                }
            } else {
                for (j = this._lastEnd; j <= idx; ++j) {
                    this._add(j);
                }
            }

            this._lastIdx = idx;
            this._selectionPointer = idx;
            this._lastEnd = this._selection.last().getIndex();
            this._lastStart = this._selection.first().getIndex();
        // User preserved this._selection direction DOWN
        } else if (this._lastIdx === this._lastEnd) {
            for (j = this._lastEnd; j <= idx; ++j) {
                this._add(j);
            }
            this._selectionPointer = idx;
        }
    } else if (idx > this._lastStart && idx < this._lastEnd) {
        if (this._selectionPointer === this._lastEnd) {
            for (j = idx; j <= this._lastEnd; ++j) {
                this._add(j);
            }
            this._selectionPointer = idx;
        } else if (this._selectionPointer === this._lastStart) {
            for (j = this._lastStart; j <= idx; ++j) {
                this._add(j);
            }
            this._selectionPointer = idx;
        }
    }
};

Selectable.prototype._appendingShiftSelection = function(idx) {
    let j;
    if (idx < this._selectionPointer) {
        for (j = idx; j <= this._selectionPointer; ++j) {
            this._add(j);
        }
    } else if (idx > this._selectionPointer) {
        for (j = this._selectionPointer; j <= idx; ++j) {
            this._add(j);
        }
    }
    this._selectionPointer = idx;
};

Selectable.prototype._remove = function(idx) {
    const trackView = this._listView.getTrackViewByIndex(idx);
    if (trackView === this._prioritySelection) {
        this._prioritySelection = null;
    }
    trackView.unselected();
    this._selection.remove(trackView);
};

Selectable.prototype._getMiddleOfSelection = function() {
    const length = this._selection.size();
    const mid = Math.floor(length / 2);
    return this._selection.get(mid);
};

Selectable.prototype._moveToMiddleOfSelection = function() {
    this._listView.centerOnTrackView(this._getMiddleOfSelection());
};

Selectable.prototype.contains = function(trackView) {
    return this._selection.contains(trackView);
};

Selectable.prototype.removeTrackView = function(trackView) {
    const index = trackView.getIndex();
    if (index >= 0) {
        this._remove(index);
        this._listView.emit(`tracksSelected`, this);
    }
};

Selectable.prototype.addTrackView = function(trackView) {
    const index = trackView.getIndex();
    if (index >= 0) {
        if (this._selection.contains(trackView)) {
            return false;
        }
        this._add(index);
        this._listView.emit(`tracksSelected`, this);
        return true;
    }
    return false;
};

Selectable.prototype.moveUp = function(distance) {
    if (distance === undefined) distance = 1;

    if (!this._selection.isEmpty()) {
        this._resetPointers();
        Selectable.moveSelectedItemViewsUpBy(this._listView.getTrackViews(),
                                              this._selection.toArray(),
                                              distance);
        this._selectionPointer = this.first().getIndex();
        this._listView.trackIndexChanged();
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.moveDown = function(distance) {
    if (distance === undefined) distance = 1;

    if (!this._selection.isEmpty()) {
        this._resetPointers();
        Selectable.moveSelectedItemViewsDownBy(this._listView.getTrackViews(),
                                                this._selection.toArray(),
                                                distance);
        this._selectionPointer = this.last().getIndex();
        this._listView.trackIndexChanged();
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.removeTopmostSelection = function(distance) {
    if (distance === undefined) distance = 1;
    distance = Math.min(this._selection.size() - 1, distance);

    if (distance > 0) {
        this._resetPointers();
        const start = this._selection.first().getIndex();
        const end = start + distance;

        for (let i = start; i < end; ++i) {
            this._remove(i);
        }

        this._selectionPointer = this._selection.first().getIndex();
        this._listView.emit(`tracksSelected`, this);
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.removeBottommostSelection = function(distance) {
    if (distance === undefined) distance = 1;
    distance = Math.min(this._selection.size() - 1, distance);

    if (distance > 0) {
        this._resetPointers();
        const start = this._selection.last().getIndex() - distance + 1;
        const end = start + distance;
        for (let i = start; i < end; ++i) {
            this._remove(i);
        }

        this._selectionPointer = this._selection.last().getIndex();
        this._listView.emit(`tracksSelected`, this);
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.appendPrev = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    let cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.first().getIndex();
        if (cur > 0) {
            const end = cur;
            const start = Math.max(0, cur - distance);

            for (let i = start; i < end; ++i) {
                this._add(i);
            }
            this._selectionPointer = start;
        }
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.appendNext = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    let cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.last().getIndex();
        if (cur < this._listView.length - 1) {
            const end = Math.min(this._listView.length, cur + distance + 1);
            const start = cur + 1;

            for (let i = start; i < end; ++i) {
                this._add(i);
            }
            this._selectionPointer = end - 1;
        }
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.prev = function(distance) {
    if (distance === undefined) distance = 1;

    this._resetPointers();
    let cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.first().getIndex();
        this._clearSelection();
        cur -= distance;
        this._add(Math.max(cur, 0));
        this._selectionPointer = this._selection.first().getIndex();
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.next = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    let cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.last().getIndex();
        this._clearSelection();
        cur += distance;
        this._add(Math.min(cur, this._listView.length - 1));
        this._selectionPointer = this._selection.last().getIndex();
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.selectLast = function() {
    this._resetPointers();
    this._clearSelection();
    this._add(this._listView.length - 1);
    this._selectionPointer = this._listView.length - 1;
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.selectFirst = function() {
    this._resetPointers();
    this._clearSelection();
    this._add(0);
    this._selectionPointer = 0;
    this._listView.emit(`tracksSelected`, this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.getSelectedItemViewCount = function() {
    return this._selection.size();
};

Selectable.prototype.removeIndices = function(indices) {
    for (let i = 0; i < indices.length; ++i) {
        this._remove(indices[i]);
    }
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.addIndices = function(indices) {
    for (let i = 0; i < indices.length; ++i) {
        this._add(indices[i]);
    }
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.selectIndices = function(indices) {
    this._resetPointers();
    this._clearSelection();
    this.addIndices(indices);
};

Selectable.prototype._resetPointers = function() {
    this._selectionPointer = null;
    this._lastEnd = null;
    this._lastIdx = null;
    this._lastStart = null;
};

Selectable.prototype.updateOrder = function(selection) {
    this._selection.clear();
    for (let i = 0; i < selection.length; ++i) {
        this._selection.add(selection[i]);
    }
};

Selectable.prototype.clearSelection = function() {
    this._resetPointers();
    this._clearSelection();
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.getSelection = function() {
    return this._selection.toArray();
};

Selectable.prototype.selectTrackView = function(trackView) {
    const index = trackView.getIndex();
    if (index >= 0) {
        this.selectRange(index, index);
    }
};

Selectable.prototype.setPriorityTrackView = function(trackView) {
    const index = trackView.getIndex();
    if (index >= 0) {
        if (!this._selection.contains(trackView)) {
            this._add(index);
            this._listView.emit(`tracksSelected`, this);
        }
        this._prioritySelection = trackView;
    }
};

Selectable.prototype.getPriorityTrackView = function() {
    if (this._prioritySelection && this._prioritySelection.getIndex() < 0) {
        this._prioritySelection = null;
        return null;
    }
    return this._prioritySelection;
};

Selectable.prototype.containsAnyInRange = function(start, end) {
    for (let i = start; i <= end; ++i) {
        if (this._selection.contains(this._listView.getTrackViewByIndex(i))) {
            return true;
        }
    }
    return false;
};

Selectable.prototype.selectRange = function(start, end) {
    const first = this.first();
    const last = this.last();

    if (first !== null && first.getIndex() === start &&
        last !== null && last.getIndex() === end) {
        return;
    }

    this._resetPointers();
    this._clearSelection();
    for (let i = start; i <= end; ++i) {
        this._add(i);
    }
    this._lastStart = start;
    this._lastEnd = end;
    this._lastStart = start;
    this._selectionPointer = end;
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.first = function() {
    if (this._selection.isEmpty()) return null;
    return this._selection.first();
};

Selectable.prototype.last = function() {
    if (this._selection.isEmpty()) return null;
    return this._selection.last();
};

Selectable.prototype.all = function() {
    const trackViews = this._listView.getTrackViews();
    for (let i = 0; i < trackViews.length; ++i) {
        this._add(i);
    }
    this._listView.emit(`tracksSelected`, this);
};

Selectable.prototype.remove = function(trackView) {
    if (this._selection.remove(trackView) === trackView) {
        trackView.unselected();
    }
};

Selectable.moveSelectedItemViewsDownBy = function(trackViews, selection, distance) {
    const selectedTrackRanges = buildConsecutiveRanges(selection, indexMapper);

    while (distance-- > 0 && selectedTrackRanges.last().last().getIndex() < trackViews.length - 1) {
        for (let i = 0; i < selectedTrackRanges.length; ++i) {
            const selectedTracks = selectedTrackRanges[i];
            const bumpedTrackView = trackViews[selectedTracks.last().getIndex() + 1];
            const bumpedTrackNewIndex = selectedTracks.first().getIndex();
            for (let j = 0; j < selectedTracks.length; ++j) {
                const trackView = selectedTracks[j];
                const newIndex = trackView.getIndex() + 1;
                trackViews[newIndex] = trackView;
                trackView.setIndex(newIndex);
            }
            trackViews[bumpedTrackNewIndex] = bumpedTrackView;
            bumpedTrackView.setIndex(bumpedTrackNewIndex);
        }
    }
};

Selectable.moveSelectedItemViewsUpBy = function(trackViews, selection, distance) {
    const selectedTrackRanges = buildConsecutiveRanges(selection, indexMapper);

    while (distance-- > 0 && selectedTrackRanges.first().first().getIndex() > 0) {
        for (let i = selectedTrackRanges.length - 1; i >= 0; --i) {
            const selectedTracks = selectedTrackRanges[i];
            const bumpedTrackView = trackViews[selectedTracks.first().getIndex() - 1];
            const bumpedTrackNewIndex = selectedTracks.last().getIndex();
            for (let j = 0; j < selectedTracks.length; ++j) {
                const trackView = selectedTracks[j];
                const newIndex = trackView.getIndex() - 1;
                trackViews[newIndex] = trackView;
                trackView.setIndex(newIndex);
            }
            trackViews[bumpedTrackNewIndex] = bumpedTrackView;
            bumpedTrackView.setIndex(bumpedTrackNewIndex);
        }
    }
};
