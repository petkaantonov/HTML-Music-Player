"use strict";
import $ from "lib/jquery";
import EventEmitter from "lib/events";
import { buildConsecutiveRanges, indexMapper, inherits } from "lib/util";
import Selectable from "ui/Selectable";
import DraggableSelection from "ui/DraggableSelection";
import Track from "Track";
import Snackbar from "ui/Snackbar";
import TrackView from "ui/TrackView";
import AbstractTrackContainer from "AbstractTrackContainer";

const PLAYLIST_TRACKS_REMOVED_TAG = "playlist-tracks-removed";
const PLAYLIST_MODE_KEY = "playlist-mode";
const SHUFFLE_MODE = "shuffle";

const TrackViewOptions = {
    updateTrackIndex: true,
    updateSearchDisplayStatus: false,
    itemHeight: -1,
    playlist: null
};

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;
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

function TrackListDeletionUndo(playlist) {
    this.tracksAndViews = playlist.getTrackViews().map(function(v) {
        return {
            track: v.track(),
            view: v
        };
    });
    this.selectionIndices = playlist.getSelection().map(function(v) {
        return v.getIndex();
    });
    var priorityTrackView = playlist._selectable.getPriorityTrackView();
    this.priorityTrackViewIndex = priorityTrackView ? priorityTrackView.getIndex() : -1;
}

TrackListDeletionUndo.prototype.destroy = function() {
    snackbar.removeByTag(PLAYLIST_TRACKS_REMOVED_TAG);
    for (var i = 0; i < this.tracksAndViews.length; ++i) {
        var track = this.tracksAndViews[i].track;
        if (track.isDetachedFromPlaylist()) {
            track.destroy();
        }
    }
};

export default function Playlist(domNode, opts) {
    AbstractTrackContainer.call(this);
    this.recognizerMaker = opts.recognizerMaker;
    this.env = opts.env;
    this.db = opts.db;
    this.dbValues = opts.dbValues;
    this.rippler = opts.rippler;
    this.snackbar = opts.snackbar;
    this.applicationPreferences = opts.applicationPreferences;
    this.tooltipMaker = opts.tooltipMaker;

    this._trackViews = [];
    this._unparsedTrackList = [];

    this._mode = Playlist.Modes.hasOwnProperty(opts.mode) ? opts.mode : "normal";
    this._currentTrack = null;
    this._trackListDeletionUndo = null;
    this._currentPlayId = -1;
    this._trackHistory = [];

    TrackViewOptions.playlist = this;
    TrackViewOptions.itemHeight = opts.itemHeight;

    this._errorCount = 0;
    this._$domNode = $(domNode);
    this._$trackContainer = this.$().find(".tracklist-transform-container");
    this._nextTrack = null;

    this._fixedItemListScroller = opts.scrollerMaker.createFixedItemListScroller(this.$(), this._trackViews, {
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
        mustMatchSelector: ".track-container",
        env: this.env
    });

    this._highlyRelevantTrackMetadataUpdated = this._highlyRelevantTrackMetadataUpdated.bind(this);

    $(window).on("sizechange", this._windowLayoutChanged.bind(this));

    if (PLAYLIST_MODE_KEY in this.dbValues) {
        this.tryChangeMode(this.dbValues[PLAYLIST_MODE_KEY]);
    }

    var self = this;
    this._keyboardShortcutContext = this.keyboardShortcuts.createContext();
    this._keyboardShortcutContext.addShortcut("mod+a", this.selectAll.bind(this));
    this._keyboardShortcutContext.addShortcut("Enter", this.playPrioritySelection.bind(this));
    this._keyboardShortcutContext.addShortcut("Delete", this.removeSelected.bind(this));
    this._keyboardShortcutContext.addShortcut("ArrowUp", this.selectPrev.bind(this));
    this._keyboardShortcutContext.addShortcut("ArrowDown", this.selectNext.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+ArrowUp", this.selectPrevAppend.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+ArrowDown", this.selectNextAppend.bind(this));
    this._keyboardShortcutContext.addShortcut("alt+ArrowDown", this.removeTopmostSelection.bind(this));
    this._keyboardShortcutContext.addShortcut("alt+ArrowUp", this.removeBottommostSelection.bind(this));
    this._keyboardShortcutContext.addShortcut("mod+ArrowUp", this.moveSelectionUp.bind(this));
    this._keyboardShortcutContext.addShortcut("mod+ArrowDown", this.moveSelectionDown.bind(this));
    this._keyboardShortcutContext.addShortcut("PageUp", this.selectPagePrev.bind(this));
    this._keyboardShortcutContext.addShortcut("PageDown", this.selectPageNext.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+PageUp", this.selectPagePrevAppend.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+PageDown", this.selectPageNextAppend.bind(this));
    this._keyboardShortcutContext.addShortcut("alt+PageDown", this.removeTopmostPageSelection.bind(this));
    this._keyboardShortcutContext.addShortcut("alt+PageUp", this.removeBottommostPageSelection.bind(this));
    this._keyboardShortcutContext.addShortcut("mod+PageUp", this.moveSelectionPageUp.bind(this));
    this._keyboardShortcutContext.addShortcut("mod+PageDown", this.moveSelectionPageDown.bind(this));
    this._keyboardShortcutContext.addShortcut("Home", this.selectFirst.bind(this));
    this._keyboardShortcutContext.addShortcut("End", this.selectLast.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+Home", this.selectAllUp.bind(this));
    this._keyboardShortcutContext.addShortcut("shift+End", this.selectAllDown.bind(this));

    [1, 2, 3, 4, 5].forEach(function(ratingValue) {
        this._keyboardShortcutContext.addShortcut("alt+" + ratingValue, function() {
            if (self._selectable.getSelectedItemViewCount() !== 1) return;
            var trackView = self._selectable.first();
            if (trackView) {
                trackView.track().rate(ratingValue);
            }
        });
    }, this);

    this._keyboardShortcutContext.addShortcut("alt+0", function() {
        if (self._selectable.getSelectedItemViewCount() !== 1) return;
        var trackView = self._selectable.first();
        if (trackView) trackView.track().rate(-1);
    });

    if (!this.length) {
        this.showPlaylistEmptyIndicator();
    }

    this._bindListEvents({dragging: true});
    this._draggable.bindEvents();
}
inherits(Playlist, AbstractTrackContainer);

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
        var trackViews = this.getTrackViews();

        for (var i = 0; i < trackViews.length; ++i) {
            var trackView = trackViews[i];
            maxWeight += getWeight(trackView.track());
        }

        var target = ((Math.random() * maxWeight + 1) | 0) - 1;
        var currentWeight = -1;
        for (var i = 0; i < trackViews.length; ++i) {
            var trackView = trackViews[i];
            var weight = getWeight(trackView.track());

            if (currentWeight + weight >= target) {
                return trackView.track();
            }
            currentWeight += weight;
        }

        trackView = trackView && trackView.track().hasError() ? trackViews.last() : trackView;
        trackView = trackView && trackView.track().hasError() ? null : trackView;
        return trackView ? trackView.track() : null;
    },

    repeat: function(track) {
        if (track.isDetachedFromPlaylist() || track.hasError()) {
            return Playlist.Modes.normal.call(this, track);
        }
        return track;
    }
};

Playlist.prototype._windowLayoutChanged = function() {
    var self = this;
    requestAnimationFrame(function() {
        self._fixedItemListScroller.resize();
    });
};

Playlist.prototype._listContentsChanged = function() {
    this._fixedItemListScroller.resize();
    if (this._fixedItemListScroller.needScrollbar()) {
        this.$().addClass("has-scrollbar");
    } else {
        this.$().removeClass("has-scrollbar");
    }
};

Playlist.prototype.tabWillHide = function() {
    this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
};

Playlist.prototype.tabDidHide = function() {

};

Playlist.prototype.tabWillShow = function() {

};

Playlist.prototype.tabDidShow = function() {
    this._fixedItemListScroller.resize();
    this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);
};

Playlist.prototype.$trackContainer = function() {
    return this._$trackContainer;
};

Playlist.prototype._updateNextTrack = function(forced) {
    var currentTrack = this.getCurrentTrack() || DUMMY_TRACK;
    var nextTrack = this._nextTrack;

    if (!forced && nextTrack && !nextTrack.isDetachedFromPlaylist() &&
        this.isUsingShuffleMode()) {
        return;
    }

    if (nextTrack && nextTrack !== DUMMY_TRACK) {
        nextTrack.removeListener("tagDataUpdate", this._highlyRelevantTrackMetadataUpdated);
    }

    this._nextTrack = Playlist.Modes[this._mode].call(this, currentTrack) || DUMMY_TRACK;

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

var nextPlayId = 10;
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
    this._currentPlayId = nextPlayId++;
    this.emit("trackChange", track);
    this.emit("loadNeed", track);
    return true;
};

Playlist.prototype.selectionContainsAnyItemViewsBetween = function(startY, endY) {
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

Playlist.prototype.playFirst = function() {
    if (!this.length) return;
    var firstSelectedTrack = this._selectable.first();
    if (firstSelectedTrack) {
        return this.changeTrackExplicitly(firstSelectedTrack.track());
    }
    var nextTrack = this.getNextTrack();
    if (nextTrack) {
        this.changeTrackExplicitly(nextTrack);
    } else {
        var first = this._trackViews.first();
        if (first) first = first.track();
        this.changeTrackExplicitly(first);
    }
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

Playlist.prototype.removeTrackView = function(trackView) {
    this.removeTrackViews([trackView]);
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

    var previousTracksAndViews = this._trackListDeletionUndo.tracksAndViews;
    var selectionIndices = this._trackListDeletionUndo.selectionIndices;
    var priorityTrackViewIndex = this._trackListDeletionUndo.priorityTrackViewIndex;

    for (var i = 0; i < previousTracksAndViews.length; ++i) {
        var trackAndView = previousTracksAndViews[i];

        if (trackAndView.track.isDetachedFromPlaylist()) {
            if (!trackAndView.view._isDestroyed) {
                throw new Error("should be destroyed");
            }
            trackAndView.track.unstageRemoval();
            this._trackViews[i] = new TrackView(trackAndView.track, this._selectable, TrackViewOptions);
        } else {
            if (trackAndView.view._isDestroyed) {
                throw new Error("should not be destroyed");
            }
            this._trackViews[i] = trackAndView.view;
        }
    }
    this._trackViews.length = previousTracksAndViews.length;
    this._trackListDeletionUndo = null;

    for (var i = 0; i < this._trackViews.length; ++i) {
        var trackView = this._trackViews[i];
        if (trackView.isDetachedFromPlaylist()) {
            this._unparsedTrackList.push(trackView.track());
        }
        trackView.setIndex(i);
    }

    this.emit("trackChange", this.getCurrentTrack());
    this.emit("lengthChange", this.length, oldLength);
    this._updateNextTrack();
    this._fixedItemListScroller.refresh();
    this._listContentsChanged();
    this._selectable.selectIndices(selectionIndices);

    if (priorityTrackViewIndex >= 0) {
        this._selectable.setPriorityTrackView(this._trackViews[priorityTrackViewIndex]);
        this.centerOnTrackView(this._trackViews[priorityTrackViewIndex]);
    } else {
        var mid = selectionIndices[selectionIndices.length / 2 | 0];
        this.centerOnTrackView(this._trackViews[mid]);
    }
    this.emit("unparsedTracksAvailable");
};

Playlist.prototype.removeTrackViews = function(trackViews) {
    trackViews = trackViews.filter(function(v) {
        return !v.isDetachedFromPlaylist();
    });
    if (trackViews.length === 0) return;
    var oldLength = this.length;
    var tracksIndexRanges = buildConsecutiveRanges(trackViews.map(indexMapper));

    this._edited();
    this._saveStateForUndo();

    this._selectable.removeIndices(trackViews.map(indexMapper));

    for (var i = 0; i < trackViews.length; ++i) {
        trackViews[i].track().stageRemoval();
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
    this.snackbar.show("Removed " + tracksRemoved + " " + tracksWord + " from the playlist", {
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

    this.emit("tracksRemoved");
};

Playlist.prototype.removeSelected = function() {
    var selection = this.getSelection();
    if (!selection.length) return;
    this.removeTrackViews(selection);
};

Playlist.prototype.isTrackHighlyRelevant = function(track) {
    if (!track || !(track instanceof Track)) {
        return false;
    }
    return track.isDetachedFromPlaylist() ? false
                                          : (track === this.getCurrentTrack() ||
                                             track === this.getNextTrack());
};

Playlist.prototype.add = function(tracks) {
    if (!tracks.length) return;

    this._edited();

    if (!this.length) {
        this.hidePlaylistEmptyIndicator();
    }

    var oldLength = this.length;

    tracks.forEach(function(track) {
        var view = new TrackView(track, this._selectable, TrackViewOptions);
        var len = this._trackViews.push(view);
        this._unparsedTrackList.push(track);
        view.setIndex(len - 1);
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
        var track;
        while (history.length > 0) {
            track = this._trackHistory.pop();
            if (track.hasError() || track.isDetachedFromPlaylist()) {
                track = null;
            } else {
                break;
            }
        }

        if (length !== history.length) {
            this.emit("historyChange");
        }

        if (!track) {
            return this.prev();
        } else {
            return this.changeTrackExplicitly(track, true);
        }
    } else {
        this.emit("historyChange");
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
        this.db.set(PLAYLIST_MODE_KEY, mode);
        return true;
    }
    return false;
};

Playlist.prototype.getMode = function() {
    return this._mode;
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

    const comparer = function(aTrackView, bTrackView) {
        var aTrack = aTrackView.track();
        var bTrack = bTrackView.track();
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
    var selectedTrackViews = this.getSelection();
    if (selectedTrackViews.length <= 1) return;

    var indices = selectedTrackViews.map(function(v) {
        return v.track().getIndex();
    });
    callback(selectedTrackViews);

    for (var i = 0; i < selectedTrackViews.length; ++i) {
        var trackView = selectedTrackViews[i];
        var index = indices[i];
        this._trackViews[index] = trackView;
        trackView.setIndex(index);
    }
    this._selectable.updateOrder(selectedTrackViews);
    this._fixedItemListScroller.refresh();
    this._edited();
    this.trackIndexChanged();
    this.emit("trackOrderChange");
};

Object.defineProperty(Playlist.prototype, "length", {
    get: function() {
        return this._trackViews.length;
    },
    configurable: false
});

module.exports = Playlist;
