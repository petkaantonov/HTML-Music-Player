
import EventEmitter from "events";
import {noUndefinedGet, TRACK_SORTER, buildConsecutiveRanges, indexMapper} from "util";
import {SortedSet} from "DataStructures";

export default class Selectable extends EventEmitter {
    constructor(opts, deps) {
        super();
        opts = noUndefinedGet(opts);
        this._page = deps.page;
        this._listView = opts.listView;
        this._selectionPointer = null;
        this._lastIdx = null;
        this._lastStart = null;
        this._lastEnd = null;
        this._prioritySelection = null;
        this._selection = new SortedSet(TRACK_SORTER);
    }

    trackViewMouseDown(e, trackView) {
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
    }

    trackViewClick(e, trackView) {
        if (!e[this._page.modifierKeyPropertyName()] && !e.shiftKey) {
            this._resetPointers();
            this._clearSelection();
            this._add(trackView.getIndex());
            this._listView.emit(`tracksSelected`, this);
        }
    }

    _clearSelection() {
        this._prioritySelection = null;
        this._selection.forEach((trackView) => {
            trackView.unselected();
        });
        this._selection.clear();
    }

    _add(index) {
        const trackView = this._listView.getTrackViewByIndex(index);
        trackView.selected();
        this._selection.add(trackView);
    }

    _shiftSelection(idx) {
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
    }

    _appendingShiftSelection(idx) {
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
    }

    _remove(idx) {
        const trackView = this._listView.getTrackViewByIndex(idx);
        if (trackView === this._prioritySelection) {
            this._prioritySelection = null;
        }
        trackView.unselected();
        this._selection.remove(trackView);
    }

    _getMiddleOfSelection() {
        const length = this._selection.size();
        const mid = Math.floor(length / 2);
        return this._selection.get(mid);
    }

    _moveToMiddleOfSelection() {
        this._listView.centerOnTrackView(this._getMiddleOfSelection());
    }

    contains(trackView) {
        return this._selection.contains(trackView);
    }

    removeTrackView(trackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            this._remove(index);
            this._listView.emit(`tracksSelected`, this);
        }
    }

    addTrackView(trackView) {
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
    }

    moveUp(distance) {
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
    }

    moveDown(distance) {
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
    }

    removeTopmostSelection(distance) {
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
    }

    removeBottommostSelection(distance) {
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
    }

    appendPrev(distance) {
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
    }

    appendNext(distance) {
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
    }

    prev(distance) {
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
    }

    next(distance) {
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
    }

    selectLast() {
        this._resetPointers();
        this._clearSelection();
        this._add(this._listView.length - 1);
        this._selectionPointer = this._listView.length - 1;
        this._listView.emit(`tracksSelected`, this);
        this._moveToMiddleOfSelection();
    }

    selectFirst() {
        this._resetPointers();
        this._clearSelection();
        this._add(0);
        this._selectionPointer = 0;
        this._listView.emit(`tracksSelected`, this);
        this._moveToMiddleOfSelection();
    }

    getSelectedItemViewCount() {
        return this._selection.size();
    }

    removeIndices(indices) {
        for (let i = 0; i < indices.length; ++i) {
            this._remove(indices[i]);
        }
        this._listView.emit(`tracksSelected`, this);
    }

    addIndices(indices) {
        for (let i = 0; i < indices.length; ++i) {
            this._add(indices[i]);
        }
        this._listView.emit(`tracksSelected`, this);
    }

    selectIndices(indices) {
        this._resetPointers();
        this._clearSelection();
        this.addIndices(indices);
    }

    _resetPointers() {
        this._selectionPointer = null;
        this._lastEnd = null;
        this._lastIdx = null;
        this._lastStart = null;
    }

    updateOrder(selection) {
        this._selection.clear();
        for (let i = 0; i < selection.length; ++i) {
            this._selection.add(selection[i]);
        }
    }

    clearSelection() {
        this._resetPointers();
        this._clearSelection();
        this._listView.emit(`tracksSelected`, this);
    }

    getSelection() {
        return this._selection.toArray();
    }

    selectTrackView(trackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            this.selectRange(index, index);
        }
    }

    setPriorityTrackView(trackView) {
        const index = trackView.getIndex();
        if (index >= 0) {
            if (!this._selection.contains(trackView)) {
                this._add(index);
                this._listView.emit(`tracksSelected`, this);
            }
            this._prioritySelection = trackView;
        }
    }

    getPriorityTrackView() {
        if (this._prioritySelection && this._prioritySelection.getIndex() < 0) {
            this._prioritySelection = null;
            return null;
        }
        return this._prioritySelection;
    }

    containsAnyInRange(start, end) {
        for (let i = start; i <= end; ++i) {
            if (this._selection.contains(this._listView.getTrackViewByIndex(i))) {
                return true;
            }
        }
        return false;
    }

    selectRange(start, end) {
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
    }

    first() {
        if (this._selection.isEmpty()) return null;
        return this._selection.first();
    }

    last() {
        if (this._selection.isEmpty()) return null;
        return this._selection.last();
    }

    all() {
        const trackViews = this._listView.getTrackViews();
        for (let i = 0; i < trackViews.length; ++i) {
            this._add(i);
        }
        this._listView.emit(`tracksSelected`, this);
    }

    remove(trackView) {
        if (this._selection.remove(trackView) === trackView) {
            trackView.unselected();
        }
    }
}


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
