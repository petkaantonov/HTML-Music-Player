"use strict";
const $ = require("../lib/jquery");
const EventEmitter = require("events");
const util = require("./util");
const Selectable = require("./Selectable");
const DraggableSelection = require("./DraggableSelection");
const keyValueDatabase = require("./KeyValueDatabase");
const Track = require("./Track");
const touch = require("./features").touch;
const domUtil = require("./DomUtil");
const FixedItemListScroller = require("./FixedItemListScroller");
const PLAYLIST_MODE_KEY = "playlist-mode";
const GlobalUi = require("./GlobalUi");
const Snackbar = require("./Snackbar");

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;

const PLAYLIST_TRACKS_REMOVED_TAG = "playlist-tracks-removed";

const MAX_ERRORS = 200;
const MAX_HISTORY = 500;
const EMPTY_ARRAY = [];
const DUMMY_TRACK = {
    getIndex: function() {
        return -1;
    },

    isDetachedFromPlaylist: function() {
        return true;
    },

    hasError: function() {
        return false;
    }
};

const SHUFFLE_MODE = "shuffle";

function TrackListDeletionUndo(playlist) {
    this.trackList = playlist.getTracks().slice();
    this.selectionIndices = playlist.getSelection().map(function(v) {
        return v.getIndex();
    });
    var priorityTrack =  playlist._selectable.getPriorityTrack();
    this.priorityTrackIndex = priorityTrack ? priorityTrack.getIndex() : -1;
}

TrackListDeletionUndo.prototype.destroy = function() {
    GlobalUi.snackbar.removeByTag(PLAYLIST_TRACKS_REMOVED_TAG);
    for (var i = 0; i < this.trackList.length; ++i) {
        if (this.trackList[i].isDetachedFromPlaylist()) {
            this.trackList[i].remove();
        }
    }
};

var playlistRunningPlayId = 0;
function Playlist(domNode, opts) {
    EventEmitter.call(this);
    this._trackList = [];
    this._unparsedTrackList = [];

    this._mode = Playlist.Modes.hasOwnProperty(opts.mode) ? opts.mode : "normal";
    this._currentTrack = null;
    this._trackListDeletionUndo = null;
    this._currentPlayId = -1;
    this._trackHistory = [];

    this._errorCount = 0;
    this._$domNode = $(domNode);
    this._$trackContainer = this._$domNode.find(".tracklist-transform-container");
    this._nextTrack = null;

    this._fixedItemListScroller = new FixedItemListScroller(this.$(), this._trackList, opts.itemHeight, {
        shouldScroll: function() {
            return !this._draggable.isDragging()
        }.bind(this),
        scrollingX: false,
        snapping: true,
        zooming: false,
        paging: false,
        minPrerenderedItems: 15,
        maxPrerenderedItems: 50,
        contentContainer: this.$trackContainer(),
        scrollbar: this.$().find(".scrollbar-container"),
        railSelector: ".scrollbar-rail",
        knobSelector: ".scrollbar-knob"
    });
    this._selectable = new Selectable(this);
    this._draggable = new DraggableSelection(this.$(), this, this._fixedItemListScroller, {
        mustNotMatchSelector: ".track-rating",
        mustMatchSelector: ".track-container"
    });

    this._highlyRelevantTrackMetadataUpdated = this._highlyRelevantTrackMetadataUpdated.bind(this);

    $(window).on("resize", this._windowLayoutChanged.bind(this));

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (PLAYLIST_MODE_KEY in values) {
            self.tryChangeMode(values[PLAYLIST_MODE_KEY]);
        }
    });

    this.$().on("click mousedown dblclick", function(e) {
        if ($(e.target).closest(".unclickable").length > 0) return;
        if ($(e.target).closest(".track-container").length === 0) return;
        var track = this._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
        if (!track) return;
        switch (e.type) {
            case "click": {
                return this._selectable.trackClick(e, track);
            }
            case "mousedown": return this._selectable.trackMouseDown(e, track);
            case "dblclick": return track.doubleClicked(e);
        }
    }.bind(this));

    if (touch) {
        this.$().on(domUtil.TOUCH_EVENTS, ".track-container", domUtil.modifierTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var track = this._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!track) return;

            if (this._selectable.contains(track)) {
                this._selectable.removeTrack(track);
            } else {
                this._selectable.addTrack(track);
                this._selectable.setPriorityTrack(track);
            }
        }.bind(this)));

        this.$().on(domUtil.TOUCH_EVENTS, ".track-container", domUtil.tapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var track = this._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!track) return;
            this._selectable.selectTrack(track);
        }.bind(this)));

        this.$().on(domUtil.TOUCH_EVENTS, ".track-container", domUtil.longTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var track = this._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!track) return;
            if (!this._selectable.contains(track)) {
                this._selectable.selectTrack(track);
            }
            this._selectable.setPriorityTrack(track);
        }.bind(this)));

        this.$().on(domUtil.TOUCH_EVENTS, ".track-container", domUtil.doubleTapHandler(function(e) {
            if ($(e.target).closest(".unclickable").length > 0) return;
            var track = this._fixedItemListScroller.itemByRect(e.target.getBoundingClientRect());
            if (!track) return;
            track.doubleClicked(e);
        }.bind(this)));


    }
    if (!this.length) {
        this.showPlaylistEmptyIndicator();
    }
}
util.inherits(Playlist, EventEmitter);

Playlist.Modes = {
    normal: function(track) {
        var index = track.getIndex() + 1;

        var ret;
        var trials = 0;

        do {
            index = Math.max(0, index);
            if (index >= this.length) {
                index = 0;
            }

            ret = this.getTrackByIndex(index);
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret;
    },

    shuffle: function(track) {
        var lastHour = Date.now() - 60 * 60 * 1000;

        function getWeight(track) {
            for (var j = 0; j < zeroWeights.length; ++j) {
                if (zeroWeights[j] === track) {
                    return 0;
                }
            }

            if (track.hasError()) {
                return 0;
            }

            var rating = track.isRated() ? track.getRating() : 3;
            var weight = Math.pow(1.5, rating - 1);

            if (track.hasBeenPlayedWithin(lastHour)) {
                weight = weight / Math.pow(3, 2);
            }

            return Math.ceil(weight);
        }

        var zeroWeights = [track, this.getNextTrack()].filter(function(track) {
            return track && !track.isDetachedFromPlaylist() && !track.hasError();
        });

        var maxWeight = 0;
        var tracks = this.getTracks();

        for (var i = 0; i < tracks.length; ++i) {
            var track = tracks[i];
            maxWeight += getWeight(track);
        }



        var target = ((Math.random() * maxWeight + 1) | 0) - 1;
        var currentWeight = -1;
        for (var i = 0; i < tracks.length; ++i) {
            var track = tracks[i];
            var weight = getWeight(track);

            if (currentWeight + weight >= target) {
                return track;
            }
            currentWeight += weight;
        }

        track = track && track.hasError() ? tracks.last() : track;
        track = track && track.hasError() ? null : track;
        return track;
    },

    repeat: function(track) {
        if (track.isDetachedFromPlaylist() || track.hasError()) {
            return Playlist.Modes.normal.call(this, track);
        }
        return track;
    }
};

Playlist.prototype._windowLayoutChanged = function() {
    var rect = this.$()[0].getBoundingClientRect();
    const USED_HEIGHT = rect.top;

    var itemHeight = this._fixedItemListScroller.itemHeight();
    var height = $(window).height() - USED_HEIGHT;
    height = Math.max(height - 22, itemHeight + 22);

    var remainder = height % itemHeight;
    if (remainder !== 0) {
        height -= remainder;
    }

    this.$().css("height", height + "px");
    this._fixedItemListScroller.resize();
};

Playlist.prototype._listContentsChanged = function() {
    this._fixedItemListScroller.resize();
    if (this._fixedItemListScroller.needScrollbar()) {
        this.$().addClass("has-scrollbar");
    } else {
        this.$().removeClass("has-scrollbar");
    }
};

Playlist.prototype.$trackContainer = function() {
    return this._$trackContainer;
};

Playlist.prototype._updateNextTrack = function(forced) {
    var currentTrack = this.getCurrentTrack() || DUMMY_TRACK;
    var nextTrack = this._nextTrack;

    if (!forced && nextTrack && !nextTrack.isDetachedFromPlaylist() &&
        this.isUsingShuffleMode()) {
        return;
    }

    if (nextTrack && nextTrack !== DUMMY_TRACK) {
        nextTrack.removeListener("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
    }

    this._nextTrack = Playlist.Modes[this._mode].call(this, currentTrack) || DUMMY_TRACK;

    if (this._nextTrack === DUMMY_TRACK ||
        this._nextTrack.isDetachedFromPlaylist() ||
        this._nextTrack.hasError()) {
        this._nextTrack = DUMMY_TRACK;
    } else {
        this._nextTrack.on("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
    }

    this.emit("nextTrackChange", this._nextTrack === DUMMY_TRACK ? null : this._nextTrack);
};

Playlist.prototype._highlyRelevantTrackMetadataUpdated = function() {
    this.emit("highlyRelevantTrackMetadataUpdate");
};

Playlist.prototype._changeTrack = function(track, doNotRecordHistory, trackChangeKind) {
    if (track === undefined || track === null || this._errorCount >= MAX_ERRORS) {
        this._errorCount = 0;
        this.setCurrentTrack(null, trackChangeKind);
        this.emit("playlistEmpty");
        return false;
    }

    if (!(track instanceof Track)) {
        throw new Error("invalid track");
    }

    var currentTrack = this.getCurrentTrack();

    if (currentTrack && currentTrack !== DUMMY_TRACK) {
        currentTrack.willBeReplaced();
        if (!doNotRecordHistory) {
            if (this._trackHistory.push(currentTrack) > MAX_HISTORY) {
                this._trackHistory.shift();
            }
            this.emit("historyChange");
        }
    }

    this.setCurrentTrack(track, trackChangeKind);
    var trackHasError = track.hasError();
    if (trackHasError && trackChangeKind === KIND_IMPLICIT) {
        this._errorCount++;
        if (this._mode === "repeat" && this.length > 1) {
            track = Playlist.Modes.normal.call(this, track);
            this.setCurrentTrack(track, KIND_IMPLICIT);
        } else {
            return this.next();
        }
    }

    track.played();
    this._currentPlayId = playlistRunningPlayId++;
    this.emit("trackChange", track);
    this.emit("loadNeed", track);
    return true;
};

Playlist.prototype.selectionContainsAnyTracksBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return false;
    return this._selectable.containsAnyInRange(indices.startIndex, indices.endIndex);
};

Playlist.prototype.selectTracksBetween = function(startY, endY) {
    var indices = this._fixedItemListScroller.coordsToIndexRange(startY, endY);
    if (!indices) return;
    this._selectable.selectRange(indices.startIndex, indices.endIndex);
};

Playlist.prototype.getItemHeight = function() {
    return this._fixedItemListScroller.itemHeight();
};

Playlist.prototype.$ = function() {
    return this._$domNode;
};

Playlist.prototype.hidePlaylistEmptyIndicator = function() {
    this.$().find(".playlist-empty").hide();
    this.$().find(".playlist-spacer").show();
    this.$().find(".tracklist-transform-container").show();
};

Playlist.prototype.showPlaylistEmptyIndicator = function() {
    this.$().find(".playlist-spacer").hide();
    this.$().find(".playlist-empty").show();
    this.$().find(".tracklist-transform-container").hide();
};

Playlist.prototype.playPrioritySelection = function() {
    if (!this.length) return;

    var track = this._selectable.getPriorityTrack();
    if (!track) return this.playFirstSelected();
    this.changeTrackExplicitly(track);
};

Playlist.prototype.playFirstSelected = function() {
    if (!this.length) return;

    var firstTrack = this._selectable.first();
    if (!firstTrack) return;
    this.changeTrackExplicitly(firstTrack);
};

Playlist.prototype.playFirst = function() {
    if (!this.length) return;
    var firstSelectedTrack = this._selectable.first();
    if (firstSelectedTrack) {
        return this.changeTrackExplicitly(firstSelectedTrack);
    }
    var nextTrack = this.getNextTrack();
    if (nextTrack) {
        this.changeTrackExplicitly(nextTrack);
    } else {
        this.changeTrackExplicitly(this._trackList.first());
    }
};

Playlist.prototype.getTracks = function() {
    return this._trackList;
};

Playlist.prototype.getUnparsedTracks = function() {
    var tracks = this._unparsedTrackList;
    if (!tracks.length) return EMPTY_ARRAY;
    var ret = new Array(tracks.length);
    ret.length = 0;
    while (tracks.length > 0) {
        var track = tracks.shift();
        if (!track.isDetachedFromPlaylist() && track.needsParsing()) {
            ret.push(track);
        }
    }
    return ret;
};

Playlist.prototype.centerOnTrack = function(track) {
    if (track && !track.isDetachedFromPlaylist()) {
        var y = this._fixedItemListScroller.yByIndex(track.getIndex());
        y -= (this._fixedItemListScroller.contentHeight() / 2);
        this._fixedItemListScroller.scrollToUnsnapped(y, false);
    }
};

Playlist.prototype.getTrackByIndex = function(index) {
    return this._trackList[index];
};

Playlist.prototype.removeTracksBySelectionRanges = (function() {
    function remove(tracks, selection, indexOffset) {
        var tracksLength = tracks.length;
        var tracksToRemove = selection.length;
        var count = tracksLength - tracksToRemove;
        var index = selection[0] - indexOffset;

        for (var i = index; i < count && i + tracksToRemove < tracksLength; ++i) {
            var track = tracks[i + tracksToRemove];
            track.setIndex(i);
            tracks[i] = track;
        }
        tracks.length = count;
    }

    return function(selectionRanges) {
        var tracks = this._trackList;
        var indexOffset = 0;
        selectionRanges.forEach(function(selection) {
            remove(tracks, selection, indexOffset);
            indexOffset += selection.length;
        });
    };
})();


Playlist.prototype.removeTrack = function(track) {
    this.removeTracks([track]);
};

Playlist.prototype._edited = function() {
    if (this._trackListDeletionUndo) {
        this._trackListDeletionUndo.destroy();
        this._trackListDeletionUndo = null;
    }
};

Playlist.prototype._saveStateForUndo = function() {
    if (this._trackListDeletionUndo) throw new Error("already saved");
    this._trackListDeletionUndo = new TrackListDeletionUndo(this);
};

Playlist.prototype._restoreStateForUndo = function() {
    if (!this._trackListDeletionUndo) return;
    var oldLength = this.length;

    if (oldLength === 0) {
        this.hidePlaylistEmptyIndicator();
    }

    var previousTrackList = this._trackListDeletionUndo.trackList;
    var selectionIndices = this._trackListDeletionUndo.selectionIndices;
    var priorityTrackIndex = this._trackListDeletionUndo.priorityTrackIndex;

    for (var i = 0; i < previousTrackList.length; ++i) {
        this._trackList[i] = previousTrackList[i];
    }
    this._trackList.length = previousTrackList.length;
    this._trackListDeletionUndo = null;

    for (var i = 0; i < this._trackList.length; ++i) {
        var track = this._trackList[i];
        if (track.isDetachedFromPlaylist()) {
            this._unparsedTrackList.push(track);
            track.unstageRemoval();
        }
        track.setIndex(i);
    }

    this.emit("trackChange", this.getCurrentTrack());
    this.emit("lengthChange", this.length, oldLength);
    this._updateNextTrack();
    this._fixedItemListScroller.refresh();
    this._listContentsChanged();
    this._selectable.selectIndices(selectionIndices);

    if (priorityTrackIndex >= 0) {
        this._selectable.setPriorityTrack(this._trackList[priorityTrackIndex]);
        this.centerOnTrack(this._trackList[priorityTrackIndex]);
    } else {
        var mid = selectionIndices[selectionIndices.length / 2 | 0];
        this.centerOnTrack(this._trackList[mid]);
    }
    this.emit("unparsedTracksAvailable");
};

Playlist.prototype.removeTracks = function(tracks) {
    tracks = tracks.filter(function(track) {
        return !track.isDetachedFromPlaylist();
    });
    if (tracks.length === 0) return;
    var oldLength = this.length;
    var tracksIndexRanges = util.buildConsecutiveRanges(tracks.map(util.indexMapper));

    this._edited();
    this._saveStateForUndo();

    this._selectable.removeIndices(tracks.map(function(track) {
        return track.getIndex();
    }));

    for (var i = 0; i < tracks.length; ++i) {
        tracks[i].stageRemoval();
    }

    this.removeTracksBySelectionRanges(tracksIndexRanges);
    this.emit("lengthChange", this.length, oldLength);


    if (!this.length) {
        this.showPlaylistEmptyIndicator();
        if (this.getCurrentTrack()) {
            this.getCurrentTrack().setIndex(-1);
        }
    }

    this.emit("trackChange", this.getCurrentTrack());
    this._updateNextTrack();
    this._fixedItemListScroller.refresh();
    this._listContentsChanged();
    var tracksRemoved = oldLength - this.length;

    var tracksWord = tracksRemoved === 1 ? "track" : "tracks";
    var self = this;
    GlobalUi.snackbar.show("Removed " + tracksRemoved + " " + tracksWord + " from the playlist", {
        action: "undo",
        visibilityTime: 10000,
        tag: PLAYLIST_TRACKS_REMOVED_TAG
    }).then(function(outcome) {
        if (outcome === Snackbar.ACTION_CLICKED) {
            self._restoreStateForUndo();
        } else if (self._trackListDeletionUndo) {
            self._trackListDeletionUndo.destroy();
        }
    });
};

Playlist.prototype.removeSelected = function() {
    var selection = this.getSelection();
    if (!selection.length) return;
    this.removeTracks(selection);
};

Playlist.prototype.isTrackHighlyRelevant = function(track) {
    if (!track || !(track instanceof Track)) {
        return false;
    }
    return track.isDetachedFromPlaylist() ? false
                                          : (track === this.getCurrentTrack() ||
                                             track === this.getNextTrack());
};

Playlist.prototype.getSelectable = function() {
    return this._selectable;
};

Playlist.prototype.add = function(tracks) {
    if (!tracks.length) return;

    this._edited();

    if (!this.length) {
        this.hidePlaylistEmptyIndicator();
    }

    var oldLength = this.length;

    tracks.forEach(function(track) {
        var len = this._trackList.push(track);
        this._unparsedTrackList.push(track);
        track.setIndex(len - 1);
    }, this);

    this.emit("lengthChange", this.length, oldLength);
    this._updateNextTrack();
    this._listContentsChanged();
    this.emit("unparsedTracksAvailable");
};

Playlist.prototype.stop = function() {
    this.setCurrentTrack(null, KIND_EXPLICIT);
    this._errorCount = 0;
    this._updateNextTrack();
    this.emit("playlistEmpty");
};

Playlist.prototype.trackIndexChanged = function() {
    this._edited();
    this.emit("trackChange", this.getCurrentTrack());
    this._updateNextTrack();
};

Playlist.prototype.setCurrentTrack = function(track, trackChangeKind) {
    var current = this.getCurrentTrack();

    if (current) {
        current.stopPlaying();
        current.removeListener("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
    }

    this._currentTrack = track;

    if (track) {
        track.on("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
        track.startPlaying();
    }

    if (this.isUsingShuffleMode() &&
        trackChangeKind === KIND_EXPLICIT &&
        !this.nextTrackIsSameAs(track)) {
        return;
    }
    this._updateNextTrack(true);
};

Playlist.prototype.nextTrackIsSameAs = function(track) {
    if (!this.getNextTrack()) return false;
    return this.getNextTrack() === track;
};

Playlist.prototype.isUsingShuffleMode = function() {
    return this._mode === SHUFFLE_MODE;
};

Playlist.prototype.changeTrackImplicitly = function(track, doNotRecordHistory) {
    return this._changeTrack(track, !!doNotRecordHistory, KIND_IMPLICIT);
};

Playlist.prototype.changeTrackExplicitly = function(track, doNotRecordHistory) {
    return this._changeTrack(track, !!doNotRecordHistory, KIND_EXPLICIT);
};

Playlist.prototype.getPreviousTrack = function() {
    if (this._trackHistory.length > 1) {
        return this._trackHistory[this._trackHistory.length - 2];
    }
    return null;
};

Playlist.prototype.getCurrentTrack = function() {
    return this._currentTrack;
};

Playlist.prototype.getNextTrack = function() {
    if (this._nextTrack === DUMMY_TRACK) return null;
    return this._nextTrack;
};

Playlist.prototype.getCurrentPlayId = function() {
    return this._currentPlayId;
};

Playlist.prototype.trackPlayedSuccessfully = function() {
    var currentTrack = this.getCurrentTrack();
    if (currentTrack && currentTrack.hasError()) {
        currentTrack.unsetError();
        this._unparsedTrackList.push(currentTrack);
        this.emit("unparsedTracksAvailable");
    }
    this._errorCount = 0;
};

Playlist.prototype.hasHistory = function() {
    return this._trackHistory.length > 0;
};

Playlist.prototype.prev = function() {
    var history = this._trackHistory;
    var length = history.length;
    if (length > 0) {
        var i = history.length - 1;
        var track;
        do {
            track = this._trackHistory[i];
            if (track.isDetachedFromPlaylist()) {
                track = null;
            } else {
                this._trackHistory.splice(i, 1);

            }
            i--;
        } while (i >= 0 && track == null);

        if (length !== history.length) {
            this.emit("historyChange");
        }

        if (!track) {
            return this.prev();
        } else if (!track.isDetachedFromPlaylist()) {
            return this.changeTrackExplicitly(track, true);
        }
    }
};

Playlist.prototype.next = function() {
    if (!this.getNextTrack()) return this.stop();
    return this.changeTrackImplicitly(this.getNextTrack());
};

Playlist.prototype.tryChangeMode = function(mode) {
    if (this._mode === mode) {
        return false;
    } else if (Playlist.Modes.hasOwnProperty(mode)) {
        var oldMode = this._mode;
        this._mode = mode;
        this.emit("modeChange", mode, oldMode);
        this._updateNextTrack(true);
        keyValueDatabase.set(PLAYLIST_MODE_KEY, mode);
        return true;
    }
    return false;
};

Playlist.prototype.getSelectedTrackCount = function() {
    return this._selectable.getSelectedItemCount();
};

Playlist.prototype.getMode = function() {
    return this._mode;
};

Playlist.prototype.toArray = function() {
    return this._trackList.slice();
};

Playlist.prototype.getSelection = function() {
    return this._selectable.getSelection();
};

Playlist.prototype.clearSelection = function() {
    this._selectable.clearSelection();
};

Playlist.prototype.selectAll = function() {
    if (this.length) {
        this._selectable.all();
    }
};

// Home and End selection stuff.

Playlist.prototype.selectFirst = function() {
    if (this.length) {
        this._selectable.selectFirst();
    }
};

Playlist.prototype.selectLast = function() {
    if (this.length) {
        this._selectable.selectLast();
    }
};

Playlist.prototype.selectAllUp = function() {
    if (this.length) {
        this._selectable.appendPrev(this.length);
    }
};

Playlist.prototype.selectAllDown = function() {
    if (this.length) {
        this._selectable.appendNext(this.length);
    }
};

// Arrow up and arrow down selection stuff.

Playlist.prototype.selectPrev = function() {
    if (this.length) {
        this._selectable.prev();
    }
};

Playlist.prototype.selectNext = function() {
    if (this.length) {
        this._selectable.next();
    }
};

Playlist.prototype.selectPrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev();
    }
};

Playlist.prototype.selectNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext();
    }
};

Playlist.prototype.removeTopmostSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection();
    }
};

Playlist.prototype.removeBottommostSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection();
    }
};

Playlist.prototype.moveSelectionUp = function() {
    if (this.length) {
        this._selectable.moveUp();
    }
};

Playlist.prototype.moveSelectionDown = function() {
    if (this.length) {
        this._selectable.moveDown();
    }
};

// Page up and page down selection stuff.

Playlist.prototype.selectPagePrevAppend = function() {
    if (this.length) {
        this._selectable.appendPrev(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.selectPageNextAppend = function() {
    if (this.length) {
        this._selectable.appendNext(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.selectPagePrev = function() {
    if (this.length) {
        this._selectable.prev(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.selectPageNext = function() {
    if (this.length) {
        this._selectable.next(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.removeTopmostPageSelection = function() {
    if (this.length) {
        this._selectable.removeTopmostSelection(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.removeBottommostPageSelection = function() {
    if (this.length) {
        this._selectable.removeBottommostSelection(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.moveSelectionPageUp = function() {
    if (this.length) {
        this._selectable.moveUp(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.moveSelectionPageDown = function() {
    if (this.length) {
        this._selectable.moveDown(this.halfOfTracksVisibleInContainer());
    }
};

Playlist.prototype.selectTrack = function(track) {
    var index = track.getIndex();
    if (index >= 0) {
        this.clearSelection();
        this._selectable.addTrack(track);
        this.centerOnTrack(track);
    }
};

const compareAlbum = function(a, b) {
    return a.getAlbumForSort().localeCompare(b.getAlbumForSort());
};

const compareAlbumIndex = function(a, b) {
    return a.getAlbumIndexForSort() - b.getAlbumIndexForSort();
};

const compareDiscNumber = function(a, b) {
    return a.getDiscNumberForSort() - b.getDiscNumberForSort();
};

const compareTitle = function(a, b) {
    return a.getTitleForSort().localeCompare(b.getTitleForSort());
};

const compareAlbumArtist = function(a, b) {
    return a.getAlbumArtistForSort().localeCompare(b.getAlbumArtistForSort());
};

const compareArtist = function(a, b) {
    return a.getArtistForSort().localeCompare(b.getArtistForSort());
};

const compareDuration = function(a, b) {
    var aDuration = a.basicInfo.duration;
    var bDuration = b.basicInfo.duration;

    if (!aDuration) return bDuration ? -1 : 0;
    else if (!bDuration) return 1;

    return aDuration - bDuration;
};

const compareRating = function(a, b) {
    var aRating = a.getRating();
    var bRating = b.getRating();

    if (aRating === -1) return bRating !== -1 ? 1 : 0;
    else if (bRating === -1) return -1;

    return bRating - aRating;
};

const compareOrder = [
    compareAlbum,
    compareDiscNumber,
    compareAlbumIndex,
    compareAlbumArtist,
    compareArtist,
    compareTitle,
    compareRating,
    compareDuration
];

const makeComparer = function(mainComparer) {
    const comparers = compareOrder.slice(0);
    comparers.splice(comparers.indexOf(mainComparer), 1);
    const length = comparers.length;

    const comparer = function(aTrack, bTrack) {
        var aTagData = aTrack.getTagData();
        var bTagData = bTrack.getTagData();
        var comparison = 0;

        if (!aTagData) {
            return bTagData ? -1 : aTrack.formatName().localeCompare(bTrack.formatName());
        } else if (!bTagData) {
            return 1;
        }

        if ((comparison = mainComparer(aTagData, bTagData)) !== 0) {
            return comparison;
        }

        for (var i = 0; i < length; ++i) {
            var theComparer = comparers[i];
            if ((comparison = theComparer(aTagData, bTagData)) !== 0) {
                return comparison;
            }
        }

        return aTrack.formatName().localeCompare(bTrack.formatName());
    };

    const sorter = function(tracks) {
        tracks.sort(comparer);
    };

    return function() {
        return this.changeTrackOrderWithinSelection(sorter);
    };
};

Playlist.prototype.sortByAlbum = makeComparer(compareAlbum);
Playlist.prototype.sortByAlbumArtist = makeComparer(compareAlbumArtist);
Playlist.prototype.sortByArtist = makeComparer(compareArtist);
Playlist.prototype.sortByTitle = makeComparer(compareTitle);
Playlist.prototype.sortByRating = makeComparer(compareRating);
Playlist.prototype.sortByDuration = makeComparer(compareDuration);

Playlist.prototype.sortByReverseOrder = function() {
    return this.changeTrackOrderWithinSelection(function(tracks) {
        tracks.reverse();
    });
};

Playlist.prototype.sortByShuffling = function() {
    return this.changeTrackOrderWithinSelection(function(tracks) {
        for (var i = tracks.length; i > 0; --i) {
            var index = (Math.random() * i)|0;
            var tmp = tracks[i - 1];
            tracks[i - 1] = tracks[index];
            tracks[index] = tmp;
        }
    });
};

Playlist.prototype.changeTrackOrderWithinSelection = function(callback) {
    var selectedTracks = this.getSelection();
    if (selectedTracks.length <= 1) return;

    var indices = selectedTracks.map(function(v) {
        return v.getIndex();
    });
    callback(selectedTracks);

    for (var i = 0; i < selectedTracks.length; ++i) {
        var track = selectedTracks[i];
        var index = indices[i];
        this._trackList[index] = track;
        track.setIndex(index);
    }
    this._selectable.updateOrder(selectedTracks);
    this._fixedItemListScroller.refresh();
    this._edited();
    this.trackIndexChanged();
    this.emit("trackOrderChange");
};

Object.defineProperty(Playlist.prototype, "length", {
    get: function() {
        return this._trackList.length;
    },
    configurable: false
});

module.exports = Playlist;
