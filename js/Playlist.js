const Playlist = (function() {"use strict";

const PLAYLIST_MODE_KEY = "playlist-mode";

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;

const MINIMUM_PLAYLIST_HEIGHT = 300;
const MAX_ERRORS = 200;
const MAX_HISTORY = 500;
const EMPTY_ARRAY = [];
const DUMMY_TRACK = {
    getIndex: function() {
        return -1
    },

    isDetachedFromPlaylist: function() {
        return true;
    }
};


const REPEAT_MODE = "repeat";
const SHUFFLE_MODE = "shuffle";
const NORMAL_MODE = "normal";

var playlistRunningPlayId = 0;
function Playlist(domNode, opts) {
    EventEmitter.call(this);
    this._trackList = [];
    this._mode = Playlist.Modes.hasOwnProperty(opts.mode) ? opts.mode : "normal";
    this._itemHeight = opts && opts.itemHeight || 19;
    this._currentTrack = null;
    this._currentPlayId = -1;
    this._trackHistory = [];
    this._displayedTracks = new Array(100);
    this._displayedTracks.length = 0;
    this._mayContainUnparsedTracks = false;
    this._errorCount = 0;
    this._$domNode = $(domNode);
    if (!this.length) {
        this.showPlaylistEmptyIndicator();
    }

    this._selectable = new Selectable(this);
    this._draggable = new DraggableSelection(this.$(), this, {
        mustNotMatchSelector: ".app-track-rating",
        mustMatchSelector: ".app-track-container"
    });

    this.$().perfectScrollbar({
        useKeyboard: false,
        suppressScrollX: true,
    });

    this.requestedRenderFrame = null;
    this.renderItems = $.proxy(this.renderItems, this);

    $(window).on("resize", $.proxy(this.windowLayoutChanged, this))
    this.$().on("scroll ps-scroll-y", $.proxy(this.scrolled, this));

    this._nextTrack = null;

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (PLAYLIST_MODE_KEY in values) {
            self.tryChangeMode(values[PLAYLIST_MODE_KEY]);
        }
    });
}
util.inherits(Playlist, EventEmitter);

Playlist.Modes = {
    normal: function(track) {
        var index = track.getIndex() + 1;

        if (index > this.length - 1) {
            return this._trackList.first();
        } else {
            return this.getTrackByIndex(index);
        }
    },

    shuffle: function(track) {
        var lastHour = Date.now() - 60 * 60 * 1000;

        function getWeight(track) {
            for (var j = 0; j < zeroWeights.length; ++j) {
                if (zeroWeights[j] === track) {
                    return 0;
                }
            }

            var rating = track.isRated() ? track.getRating() : 3;
            var weight = Math.pow(3, rating - 1);

            if (track.hasBeenPlayedWithin(lastHour)) {
                weight = weight / Math.pow(3, 2);
            }

            return Math.ceil(weight);
        }

        var zeroWeights = [track, this.getNextTrack()].filter(function(track) {
            return track && !track.isDetachedFromPlaylist();
        });

        var maxWeight = 0;
        var tracks = this.getTracks();

        for (var i = 0; i < tracks.length; ++i) {
            var track = tracks[i];
            maxWeight += getWeight(track);
        }

        var target = Random.nextUpTo(maxWeight);
        var currentWeight = -1;
        for (var i = 0; i < tracks.length; ++i) {
            var track = tracks[i];
            var weight = getWeight(track);

            if (currentWeight + weight >= target) {
                return track;
            }
            currentWeight += weight;
        }
        return track || tracks.last() || null;
    },

    repeat: function(track) {
        if (track.isDetachedFromPlaylist()) {
            return Playlist.Modes.normal.call(this, track);
        }
        return track;
    }
};

Playlist.prototype._updateNextTrack = function(forced) {
    var currentTrack = this.getCurrentTrack() || DUMMY_TRACK;
    var nextTrack = this._nextTrack;

    if (!forced && nextTrack && !nextTrack.isDetachedFromPlaylist() &&
        this.isUsingShuffleMode()) {
        return;
    }

    this._nextTrack = Playlist.Modes[this._mode].call(this, currentTrack);
    this.emit("nextTrackChange", this._nextTrack);
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

    this.setCurrentTrack(track, trackChangeKind);

    if (track.hasError()) {
        this._errorCount++;
        if (this._mode === "repeat" && this.length > 1) {
            track = Playlist.Modes.normal.call(this, track);
            this.setCurrentTrack(track, trackChangeKind);
        } else {
            return this.next();
        }
    }

    track.played();
    this._currentPlayId = playlistRunningPlayId++;
    this.emit("trackChange", track);

    if (!doNotRecordHistory) {
        if (this._trackHistory.push(this.getCurrentTrack()) > MAX_HISTORY) {
            this._trackHistory.shift();
        }
        this.emit("historyChange");
    }
    this.emit("loadNeed", track);
    return true;
};

Playlist.prototype.windowLayoutChanged = function() {
    const USED_HEIGHT = $("#visualizer-container").outerHeight() +
                        $("#visualizer-container").offset().top;

    var height = $(window).height() - USED_HEIGHT;
    height = Math.max(height, MINIMUM_PLAYLIST_HEIGHT) - this.getItemHeight() - 50;
    this.$().css("height", height + "px");
    this.updateScrollBar();
    this.trackVisibilityChanged();
};

Playlist.prototype.scrolled = function() {
    this.trackVisibilityChanged();
};

Playlist.prototype.tracksVisibleInContainer = function() {
    return Math.ceil(this.$().height() / this._itemHeight);
};

Playlist.prototype.halfOfTracksVisibleInContainer = function() {
    return Math.ceil(this.tracksVisibleInContainer() / 2);
};

Playlist.prototype.renderItems = function() {
    this.requestedRenderFrame = null;
    var container = this.$()[0];
    var $topSpacer = this.$().find(".top-spacer");
    var $bottomSpacer= this.$().find(".bottom-spacer");
    var tracks = this.getTracks();
    var visibleTracks = this._visibleTracks;
    var itemHeight = this._itemHeight;
    var scrollTop = container.scrollTop;
    var displayedTracks = this._displayedTracks;

    var tracksBefore = Math.min(tracks.length, Math.ceil(scrollTop / itemHeight));
    var tracksWithin = Math.min(tracks.length, this.tracksVisibleInContainer());
    var tracksAfter = Math.max(0, this.length - tracksWithin - tracksBefore);

    $topSpacer.css("height", tracksBefore * itemHeight);
    $bottomSpacer.css({
        height: tracksAfter * itemHeight,
        top: tracksWithin * itemHeight + tracksBefore * itemHeight
    });

    var start = Math.max(tracksBefore - 2, 0);
    var end = Math.min(this.length - 1, tracksWithin + tracksBefore + 2);

    for (var i = 0; i < displayedTracks.length; ++i) {
        var index = displayedTracks[i].getIndex();
        if (!(start <= index && index <= end) &&
            displayedTracks[i].isVisible()) {
            displayedTracks[i].detach();
        }
    }

    for (var i = start; i <= end; ++i) {
        var track = tracks[i];
        if (!track.isAttachedToDom()) {
            track.attach(container);
        }
        displayedTracks[i - start] = track;
    }
    displayedTracks.length = end - start + 1;
};

Playlist.prototype.trackVisibilityChanged = function() {
    if (this.requestedRenderFrame) {
        cancelAnimationFrame(this.requestedRenderFrame);
    }
    this.requestedRenderFrame = requestAnimationFrame(this.renderItems);
};

Playlist.prototype.$ = function() {
    return this._$domNode;
};

Playlist.prototype.hidePlaylistEmptyIndicator = function() {
    var self = this;
    var maxLeft = this.$().outerWidth();
    this.$().find(".playlist-empty").animate({
        left: maxLeft
    }, 400, "swiftOut", function() {
        if (self.length > 0) {
            $(this).hide();
        }
    });
    this.$().find(".playlist-spacer").show();
};

Playlist.prototype.showPlaylistEmptyIndicator = function() {
    this.$().find(".playlist-spacer").hide();
    this.$().find(".playlist-empty").show().animate({
        left: 0
    }, 400, "swiftOut");
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

Playlist.prototype.getContainer = function() {
    return this._trackList;
};

Playlist.prototype.getTracks = function() {
    return this._trackList;
};

Playlist.prototype.getUnparsedTracks = function(maxCount) {
    if (!this._mayContainUnparsedTracks) return EMPTY_ARRAY;
    var ret = [];

    for (var i = 0; i < this._trackList.length; ++i) {
        var track = this._trackList[i];
        if (track.needsParsing()) {
            ret.push(track);
            if (ret.length >= maxCount) {
                break;
            }
        }
    }
    if (!ret.length) this._mayContainUnparsedTracks = false;
    return ret;
};

Playlist.prototype.centerOnTrack = function(track) {
    if (track && !track.isDetachedFromPlaylist()) {
        var scrollTop = (track.getIndex() * this._itemHeight) +
                        (this.halfOfTracksVisibleInContainer() * this._itemHeight) -
                        ((this._itemHeight / 2) | 0) -
                        this.$().height();
        this.$()[0].scrollTop = scrollTop;
        this.$().trigger("scroll");
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

Playlist.prototype.updateScrollBar = function() {
    this.$().perfectScrollbar("update");
    this.renderItems();
    util.perfectScrollBarPostUpdate(playlist.main.$()[0]);
};

Playlist.prototype.contentsChanged = function() {
    this.updateScrollBar();
    this.trackVisibilityChanged();

    var dom = this.$()[0];
    if (dom.scrollHeight === dom.offsetHeight) {
        this.$().removeClass("has-scrollbar");
    } else {
        this.$().addClass("has-scrollbar");
    }
};

Playlist.prototype.removeTrack = function(track) {
    this._selectable.remove(track);
    this.removeTracks([track]);
};

Playlist.prototype.removeTracks = function(tracks) {
    tracks = tracks.filter(function(track) {
        return !track.isDetachedFromPlaylist();
    });
    var oldLength = this.length;

    var tracksIndexRanges = util.buildConsecutiveRanges(tracks.map(util.indexMapper));

    for (var i = 0; i < tracks.length; ++i) {
        tracks[i].remove();
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
    this.contentsChanged();
};

Playlist.prototype.removeSelected = function() {
    var selection = this.getSelection();
    if (!selection.length) return;
    this.clearSelection();
    this.removeTracks(selection);
};

Playlist.prototype.add = function(tracks) {
    if (!tracks.length) return;

    if (!this.length) {
        this.hidePlaylistEmptyIndicator();
    }

    this._mayContainUnparsedTracks = true;
    var oldLength = this.length;

    tracks.forEach(function(track) {
        var len = this._trackList.push(track);
        track.setIndex(len - 1);
        track.registerToSelectable(this._selectable);
    }, this);

    this.emit("lengthChange", this.length, oldLength);
    this._updateNextTrack();
    this.contentsChanged();
    this.animateVisibleNewTracks(tracks);
};

Playlist.prototype.animateVisibleNewTracks = function(tracks) {
    var delay = 0;

    for (var i = 0; i < tracks.length; ++i) {
        if (tracks[i].isVisible()) {
            tracks[i].bringInTrackAfter(delay);
            delay += 33;
        }
    }
};

Playlist.prototype.stop = function() {
    this.setCurrentTrack(null, KIND_EXPLICIT);
    this._updateNextTrack();
};

Playlist.prototype.trackIndexChanged = function() {
    this.emit("trackChange", this.getCurrentTrack());
    this._updateNextTrack();
};

Playlist.prototype.setCurrentTrack = function(track, trackChangeKind) {
    var current = this.getCurrentTrack();

    if (current) {
        current.stopPlaying();
    }

    this._currentTrack = track;

    if (track) {
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
    this._errorCount = 0;
};

Playlist.prototype.hasHistory = function() {
    return this._trackHistory.length > 0;
};

Playlist.prototype.prev = function() {
    var history = this._trackHistory;
    if (history.length > 0) {
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

        if (!track) {
            return this.prev();
        } else if (!track.isDetachedFromPlaylist()) {
            this.emit("historyChange");
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

const compareTitle = function(a, b) {
    return a.getTitleForSort().localeCompare(b.getTitleForSort());
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
    compareAlbumIndex,
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
            var comparer = comparers[i];
            if ((comparison = comparer(aTagData, bTagData)) !== 0) {
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

Playlist.prototype.sortByAlbum = makeComparer(compareAlbum)
Playlist.prototype.sortByArtist = makeComparer(compareArtist)
Playlist.prototype.sortByTitle = makeComparer(compareTitle)
Playlist.prototype.sortByRating = makeComparer(compareRating)
Playlist.prototype.sortByDuration = makeComparer(compareDuration);

Playlist.prototype.sortByReverseOrder = function() {
    return this.changeTrackOrderWithinSelection(function(tracks) {
        tracks.reverse();
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
    this.trackVisibilityChanged();
    this.emit("trackChange", this.getCurrentTrack());
    this.emit("trackOrderChange");
};

Playlist.prototype.setItemHeight = function(newHeight) {
    throw new Error("Not implemented");
};

Playlist.prototype.getItemHeight = function() {
    return this._itemHeight;
};

Object.defineProperty(Playlist.prototype, "length", {
    get: function() {
        return this._trackList.length;
    },
    configurable: false
});

return Playlist; })();
