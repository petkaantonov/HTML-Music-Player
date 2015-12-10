const Selectable = (function() { "use strict";

const modifierKeyProp = util.modifierKeyProp;

function Selectable(playlist) {
    EventEmitter.call(this);
    var self = this;
    this._playlist = playlist;
    this._selectionPointer = null;
    this._lastIdx = null;
    this._lastStart = null;
    this._lastEnd = null;
    this._selection = new DS.SortedSet(util.TRACK_SORTER);
}
util.inherits(Selectable, EventEmitter);

Selectable.prototype.trackMouseDown = function(e, track) {
    if (e.which !== 1 && e.which !== 3) {
        return true;
    }
    var idx = track.getIndex();

    if (e.shiftKey && e[modifierKeyProp]) {
        if (this._selectionPointer === null) {
            this._shiftSelection(idx);
        } else {
            this._appendingShiftSelection(idx);
        }

    } else if (e.shiftKey && !e[modifierKeyProp]) {
        this._shiftSelection(idx);
    } else if (e[modifierKeyProp]) {
        if (this._selection.contains(track)) {
            this._remove(idx);
        } else {
            this._add(idx);
            this._selectionPointer = idx;
        }
        this._lastIdx = null;
    } else if (!e[modifierKeyProp] && !e.shiftKey) {
        if (this._selection.contains(track)) {
            this._selectionPointer = idx;
            return true;
        }
        this._resetPointers();
        this._clearSelection();
        this._add(idx);
    }
    this._playlist.emit("tracksSelected", this);
    e.preventDefault();
};

Selectable.prototype.trackClick = function(e, track) {
    if (!e[modifierKeyProp] && !e.shiftKey) {
        this._resetPointers();
        this._clearSelection();
        this._add(track.getIndex());
        this._playlist.emit("tracksSelected", this);
    }
};

Selectable.prototype._clearSelection = function() {
    this._selection.forEach(function(track) {
        track.unselected();
    });
    this._selection.clear();
};

Selectable.prototype._add = function(index) {
    var track = this._playlist.getTrackByIndex(index);
    track.selected();
    this._selection.add(track);
};

Selectable.prototype._shiftSelection = function(idx) {
    if (this._selection.isEmpty()) {
        this._resetPointers();
        this._add(idx);
        this._selectionPointer = idx;
    }
    var j;
    this._selectionPointer = null;

    if (!this._lastStart) {
        this._lastEnd = this._selection.last().getIndex();
        this._lastStart = this._selection.first().getIndex();
    }

    if (idx < this._lastStart) {
        if (this._lastIdx === this._lastEnd || this._lastIdx ===
            null) { // user changed this._selection directions to UP
            this._clearSelection();
            for (j = idx; j <= this._lastStart; ++j) {
                this._add(j);
            }
            this._lastIdx = idx;
            this._selectionPointer = idx;
            this._lastEnd = this._selection.last().getIndex();
            this._lastStart = this._selection.first().getIndex();
        } else if (this._lastIdx === this._lastStart) { // user preserved this._selection direction UP
            for (j = idx; j <= this._lastStart; ++j) {
                this._add(j);
            }
            this._selectionPointer = idx;
        }
    } else if (idx > this._lastEnd) {
        if (this._lastIdx === this._lastStart || this._lastIdx ===
            null) { // user changed this._selection directions to DOWN
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
        } else if (this._lastIdx === this._lastEnd) { // user preserved this._selection direction DOWN
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
    var j, start = this._selection.first().getIndex(),
        end = this._selection.last().getIndex();
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
    var track = this._playlist.getTrackByIndex(idx);
    track.unselected();
    this._selection.remove(track);
};

Selectable.prototype._getMiddleOfSelection = function() {
    var length = this._selection.size();
    var mid = Math.floor(length / 2);
    return this._selection.get(mid);
};

Selectable.prototype._moveToMiddleOfSelection = function() {
    this._playlist.centerOnTrack(this._getMiddleOfSelection());
};

Selectable.prototype.contains = function(track) {
    return this._selection.contains(track);
};

Selectable.prototype.addTrack = function(track) {
    if (track.getIndex() >= 0) {
        this._add(track.getIndex());
        this._playlist.emit("tracksSelected", this);
    }
};

Selectable.prototype.moveUp = function(distance) {
    if (distance === undefined) distance = 1;

    if (!this._selection.isEmpty()) {
        this._resetPointers();
        Selectable.moveSelectedTracksUpBy(this._playlist.getTracks(),
                                          this._selection.toArray(),
                                          distance);
        this._selectionPointer = this.first().getIndex();
        this._playlist.trackIndexChanged();
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.moveDown = function(distance) {
    if (distance === undefined) distance = 1;

    if (!this._selection.isEmpty()) {
        this._resetPointers();
        Selectable.moveSelectedTracksDownBy(this._playlist.getTracks(),
                                            this._selection.toArray(),
                                            distance);
        this._selectionPointer = this.last().getIndex();
        this._playlist.trackIndexChanged();
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.removeTopmostSelection = function(distance) {
    if (distance === undefined) distance = 1;
    distance = Math.min(this._selection.size() - 1, distance);

    if (distance > 0) {
        this._resetPointers();
        var start = this._selection.first().getIndex();
        var end = start + distance;

        for (var i = start; i < end; ++i) {
            this._remove(i);
        }

        this._selectionPointer = this._selection.first().getIndex();
        this._playlist.emit("tracksSelected", this);
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.removeBottommostSelection = function(distance) {
    if (distance === undefined) distance = 1;
    distance = Math.min(this._selection.size() - 1, distance);

    if (distance > 0) {
        this._resetPointers();
        var start = this._selection.last().getIndex() - distance + 1;
        var end = start + distance;
        for (var i = start; i < end; ++i) {
            this._remove(i);
        }

        this._selectionPointer = this._selection.last().getIndex();
        this._playlist.emit("tracksSelected", this);
        this._moveToMiddleOfSelection();
    }
};

Selectable.prototype.appendPrev = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    var cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.first().getIndex();
        if (cur > 0) {
            var end = cur;
            var start = Math.max(0, cur - distance);

            for (var i = start; i < end; ++i) {
                this._add(i);
            }
            this._selectionPointer = start;
        }
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.appendNext = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    var cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.last().getIndex();
        if (cur < this._playlist.length - 1) {
            var end = Math.min(this._playlist.length, cur + distance + 1);
            var start = cur + 1;

            for (var i = start; i < end; ++i) {
                this._add(i);
            }
            this._selectionPointer = end - 1;
        }
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.prev = function(distance) {
    if (distance === undefined) distance = 1;

    this._resetPointers();
    var cur;
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
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.next = function(distance) {
    if (distance === undefined) distance = 1;
    this._resetPointers();
    var cur;
    if (!this._selection.isEmpty()) {
        cur = this._selection.last().getIndex();
        this._clearSelection();
        cur += distance;
        this._add(Math.min(cur, this._playlist.length - 1));
        this._selectionPointer = this._selection.last().getIndex();
    } else {
        this._add(0);
        this._selectionPointer = 0;
    }
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.selectLast = function() {
    this._resetPointers();
    this._clearSelection();
    this._add(this._playlist.length - 1);
    this._selectionPointer = this._playlist.length - 1;
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.selectFirst = function() {
    this._resetPointers();
    this._clearSelection();
    this._add(0);
    this._selectionPointer = 0;
    this._playlist.emit("tracksSelected", this);
    this._moveToMiddleOfSelection();
};

Selectable.prototype.getSelectedItemCount = function() {
    return this._selection.size();
};

Selectable.prototype._resetPointers = function() {
    this._selectionPointer = null;
    this._lastEnd = null;
    this._lastIdx = null;
    this._lastStart = null;
};

Selectable.prototype.updateOrder = function(selection) {
    this._selection.clear();
    for (var i = 0; i < selection.length; ++i) {
        this._selection.add(selection[i]);
    }
};

Selectable.prototype.clearSelection = function() {
    this._resetPointers();
    this._clearSelection();
    this._playlist.emit("tracksSelected", this);
};

Selectable.prototype.getSelection = function() {
    return this._selection.toArray();
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
    var tracks = this._playlist.getTracks();
    for (var i = 0; i < tracks.length; ++i) {
        this._add(i);
    }
    this._playlist.emit("tracksSelected", this);
};

Selectable.prototype.remove = function(track) {
    if (this._selection.remove(track) === track) {
        track.unselected();
    }
};

Selectable.moveSelectedTracksDownBy = function(tracks, selection, distance) {
    var selectedTrackRanges = util.buildConsecutiveRanges(selection, util.indexMapper);

    while(distance-- > 0 && selectedTrackRanges.last().last().getIndex() < tracks.length - 1) {
        for (var i = 0; i < selectedTrackRanges.length; ++i) {
            var selectedTracks = selectedTrackRanges[i];
            var bumpedTrack = tracks[selectedTracks.last().getIndex() + 1];
            var bumpedTrackNewIndex = selectedTracks.first().getIndex();
            for (var j = 0; j < selectedTracks.length; ++j) {
                var track = selectedTracks[j];
                var newIndex = track.getIndex() + 1;
                tracks[newIndex] = track;
                track.setIndex(newIndex);
            }
            tracks[bumpedTrackNewIndex] = bumpedTrack;
            bumpedTrack.setIndex(bumpedTrackNewIndex);
        }
    }
};

Selectable.moveSelectedTracksUpBy = function(tracks, selection, distance) {
    var selectedTrackRanges = util.buildConsecutiveRanges(selection, util.indexMapper);

    while(distance-- > 0 && selectedTrackRanges.first().first().getIndex() > 0) {
        for (var i = selectedTrackRanges.length - 1; i >= 0; --i) {
            var selectedTracks = selectedTrackRanges[i];
            var bumpedTrack = tracks[selectedTracks.first().getIndex() - 1];
            var bumpedTrackNewIndex = selectedTracks.last().getIndex();
            for (var j = 0; j < selectedTracks.length; ++j) {
                var track = selectedTracks[j];
                var newIndex = track.getIndex() - 1;
                tracks[newIndex] = track;
                track.setIndex(newIndex);
            }
            tracks[bumpedTrackNewIndex] = bumpedTrack;
            bumpedTrack.setIndex(bumpedTrackNewIndex);
        }
    }
};

return Selectable; })();
