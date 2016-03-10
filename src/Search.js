"use strict";

const $ = require("lib/jquery");
const EventEmitter = require("lib/events");
const util = require("lib/util");
const Selectable = require("ui/Selectable");
const DraggableSelection = require("ui/DraggableSelection");
const keyValueDatabase = require("KeyValueDatabase");
const Track = require("Track");
const touch = require("features").touch;
const domUtil = require("lib/DomUtil");
const FixedItemListScroller = require("ui/FixedItemListScroller");
const GlobalUi = require("ui/GlobalUi");
const Snackbar = require("ui/Snackbar");
const KeyboardShortcuts = require("ui/KeyboardShortcuts");
const TrackView = require("ui/TrackView");
const listEvents = require("ui/listEvents");
const selectionMethods = require("selectionMethods");

const MAX_SEARCH_HISTORY_ENTRIES = 100;
const SEARCH_HISTORY_KEY = "search-history";
const TrackViewOptions = {
    updateTrackIndex: false,
    updateSearchDisplayStatus: true
};

var searchSessionNextId = 0;

function SearchHistoryEntry(query) {
    query = "" + query;
    var opt = document.createElement("option");
    opt.value = query;
    this._domNode = $(opt);
    this._query = query;
}

SearchHistoryEntry.prototype.$ = function() {
    return this._domNode;
};

SearchHistoryEntry.prototype.update = function(query) {
    this._query = query;
    this.$()[0].value = query;
};

SearchHistoryEntry.prototype.query = function() {
    return this._query;
};

SearchHistoryEntry.prototype.toJSON = function() {
    return this._query;
};

SearchHistoryEntry.prototype.destroy = function() {
    this.$().remove();
};

function SearchSession(search, rawQuery, normalizedQuery) {
    this._search = search;
    this._rawQuery = rawQuery;
    this._normalizedQuery = normalizedQuery;
    this._resultCount = 0;
    this._destroyed = false;
    this._started = false;
    this._id = ++searchSessionNextId;
    this._messaged = this._messaged.bind(this);
}

SearchSession.prototype._messaged = function(event) {
    var payload = event.data;
    if (!payload) return;
    if (payload.searchSessionId !== this._id) return;

    if (payload.type === "searchResults") {
        this._gotResults(payload.results);
    }
};

SearchSession.prototype.worker = function() {
    return this._search._trackAnalyzer._worker;
};

SearchSession.prototype.start = function() {
    if (this._destroyed) return;
    if (this._started) return;
    this.worker().addEventListener("message", this._messaged, false);
    this._started = true;
    this.worker().postMessage({
        action: "search",
        args: {
            sessionId: this._id,
            normalizedQuery: this._normalizedQuery
        }
    });
};

SearchSession.prototype.destroy = function() {
    if (this._destroyed) return;
    this.worker().removeEventListener("message", this._messaged, false);
    this._destroyed = true;
    this._search = null;
};

SearchSession.prototype.resultCount = function() {
    return this._resultCount;
};

SearchSession.prototype._gotResults = function(results) {
    if (this._destroyed) return;
    this._resultCount += results.length;
    this._search.newResults(this, results);
};

function Search(domNode, opts) {
    opts = Object(opts);
    EventEmitter.call(this);
    this._domNode = $($(domNode)[0]);
    this._trackContainer = this.$().find(".tracklist-transform-container");
    this._inputNode = this.$().find(".search-input-box");
    this._dataListNode = this.$().find(".search-history");
    this._inputContainerNode = this.$().find(".search-input-container");
    this._trackViews = [];
    this._searchHistory = [];
    this._session = null;
    this._trackAnalyzer = null;
    this._playlist = opts.playlist;
    this._topHistoryEntry = null;
    this._visible = false;

    this._fixedItemListScroller = new FixedItemListScroller(this.$(), this._trackViews, opts.itemHeight || 44, {
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
    this._keyboardShortcutContext = new KeyboardShortcuts.KeyboardShortcutContext();
    this._keyboardShortcutContext.addShortcut("ctrl+f", this._focusInput.bind(this));
    this._keyboardShortcutContext.addShortcut("mod+a", this.selectAll.bind(this));
    this._keyboardShortcutContext.addShortcut("Enter", this.playPrioritySelection.bind(this));
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

    listEvents.bindListEvents(this, {
        dragging: false
    });

    var self = this;
    keyValueDatabase.getInitialValues().then(function(values) {
        if (SEARCH_HISTORY_KEY in values) {
            self.tryLoadHistory(values[SEARCH_HISTORY_KEY]);
        }
    });

    $(window).on("sizechange", this._windowLayoutChanged.bind(this));
    this.$input().on("input", this._gotInput.bind(this));
    this.$input().on("focus", this._inputFocused.bind(this));
    this.$input().on("blur", this._inputBlurred.bind(this));
    this.$input().on("keydown", this._inputKeydowned.bind(this));
    this.$().find(".search-next-tab-focus").on("focus", this._searchNextTabFocused.bind(this));
    this._playlist.on("tracksRemoved", this._trackViewsWereDestroyed.bind(this));
}
util.inherits(Search, EventEmitter);

Search.prototype.$ = function() {
    return this._domNode;
};

Search.prototype.$trackContainer = function() {
    return this._trackContainer;
};

Search.prototype.$input = function() {
    return this._inputNode;
};

Search.prototype.$historyDataList = function() {
    return this._dataListNode;
};

Search.prototype.$inputContainer = function() {
    return this._inputContainerNode;
};

Search.prototype.tabWillHide = function() {
    this._visible = false;
    if (this._session) {
        this._session.destroy();
        this._session = null;
    }
    this.$input().blur();
    this.$().find(".search-next-tab-focus").hide();
    KeyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
};

Search.prototype.tabDidHide = function() {

};

Search.prototype.tabWillShow = function() {
    KeyboardShortcuts.activateContext(this._keyboardShortcutContext);
};

Search.prototype.tabDidShow = function() {
    this.$().find(".search-next-tab-focus").show();
    this._visible = true;
    this.$input().focus();
    this._fixedItemListScroller.resize();
};

Search.prototype.tryLoadHistory = function(values) {
    if (Array.isArray(values) && values.length <= MAX_SEARCH_HISTORY_ENTRIES) {
        this._searchHistory = values.map(function(query) {
            return new SearchHistoryEntry(query);
        });

        var parent = this.$historyDataList();
        for (var i = 0; i < this._searchHistory.length; ++i) {
            parent.append(this._searchHistory[i].$());
        }
    }
};

const saveHistory = util.throttle(function(historyEntries) {
    var json = historyEntries.map(function(v) {
        return v.toJSON();
    });
    keyValueDatabase.set(SEARCH_HISTORY_KEY, json);
}, 1000);

Search.prototype.changeTrackExplicitly = function(track) {
    this._playlist.changeTrackExplicitly(track);
};

Search.prototype.setTrackAnalyzer = function(trackAnalyzer) {
    this._trackAnalyzer = trackAnalyzer;
};

Search.prototype._focusInput = function() {
    this.$input().focus();
};

Search.prototype.newResults = function(session, results) {
    if (this._session !== session) {
        session.destroy();
        return;
    }
    var trackViews = this._trackViews;
    var oldLength = this.length;
    this.removeTrackViews(trackViews, true);
    for (var i = 0; i < results.length; ++i) {
        var track = Track.byTransientId(results[i]);
        if (!track || !track.shouldDisplayAsSearchResult()) {
            continue;
        }
        var view = new TrackView(track, this._selectable, TrackViewOptions);
        var len = trackViews.push(view);
        view.setIndex(len - 1);
    }

    if (this.length !== oldLength) {
        this.emit("lengthChange", this.length, oldLength);
    }
    this._fixedItemListScroller.resize();
};

Search.prototype.clear = function() {
    this.removeTrackViews(this._trackViews);
    if (this._session) {
        this._session.destroy();
        this._session = null;
    }
};

Search.prototype._windowLayoutChanged = function() {
    var self = this;
    requestAnimationFrame(function() {
        self._fixedItemListScroller.resize();
    });
};

Search.prototype._trackViewsWereDestroyed = function() {
    var oldLength = this.length;
    var indices = [];

    for (var i = 0; i < this._trackViews.length; ++i) {
        if (this._trackViews[i].isDestroyed()) {
            indices.push(i);
        }
    }

    var tracksIndexRanges = util.buildConsecutiveRanges(indices);
    this._selectable.removeIndices(indices);
    this.removeTracksBySelectionRanges(tracksIndexRanges);

    if (this.length !== oldLength) {
        this.emit("lengthChange", this.length, oldLength);
        if (this._visible) {
            this._fixedItemListScroller.resize();
        }
    }
};

Search.prototype._inputKeydowned = function(e) {
    if (e.key === "Enter") {
        $(e.target).blur();
        this.selectFirst();
    } else if (e.key === "Escape" && !$(e.target).val()) {
        $(e.target).blur();
    }
};

Search.prototype._inputBlurred = function() {
    this.$inputContainer().removeClass("focused");
    if (this._session && this._session.resultCount() > 0) {
        if (this._topHistoryEntry === null) {
            var searchHistory = this._searchHistory;
            var newQuery = this._session._rawQuery;

            for (var i = 0; i < searchHistory.length; ++i) {
                if (searchHistory[i].query() === newQuery) {
                    this._topHistoryEntry = searchHistory[i];

                    for (var j = i; j > 0; --j) {
                        searchHistory[j] = searchHistory[j - 1];
                    }
                    searchHistory[0] = this._topHistoryEntry;

                    this.$historyDataList().prepend(this._topHistoryEntry.$());
                    saveHistory(searchHistory);
                    return;
                }
            }

            this._topHistoryEntry = new SearchHistoryEntry(newQuery);
            this._searchHistory.unshift(this._topHistoryEntry);
            this.$historyDataList().prepend(this._topHistoryEntry.$());
            if (this._searchHistory.length > MAX_SEARCH_HISTORY_ENTRIES) {
                this._searchHistory.pop().destroy();
            }
            saveHistory(this._searchHistory);
        } else {
            this._topHistoryEntry.update(this._session._rawQuery);
            saveHistory(this._searchHistory);
        }
    }
};

Search.prototype._searchNextTabFocused = function(e) {
    if (this._trackViews.length > 0) {
        $(e.target).blur();
        this.selectFirst();
    }
};

Search.prototype._inputFocused = function() {
    this.$inputContainer().addClass("focused");
};

Search.prototype.removeTrackViews = function(trackViews, silent) {
    if (trackViews.length === 0) return;
    var oldLength = this.length;
    var indices = trackViews.map(util.indexMapper);
    var tracksIndexRanges = util.buildConsecutiveRanges(indices);

    this._selectable.removeIndices(indices);

    for (var i = 0; i < trackViews.length; ++i) {
        trackViews[i].destroy();
    }

    this.removeTracksBySelectionRanges(tracksIndexRanges);
    if (this.length !== oldLength && !silent) {
        this.emit("lengthChange", this.length, oldLength);
        this._fixedItemListScroller.resize();
    }
};

Search.prototype._gotInput = util.throttle(function() {
    var value = this.$input().val() + "";

    if (value.length === 0) {
        this._topHistoryEntry = null;
    }

    var normalized = util.normalizeQuery(value);

    if (this._session && this._session._normalizedQuery === normalized) {
        return;
    }

    if (normalized.length <= 1) {
        this.clear();
        return;
    }

    if (this._session) {
        this._session.destroy();
    }
    this._session = new SearchSession(this, value, normalized)
    this._session.start();
}, 33);

Search.prototype.playFirst = function() {
    if (!this.length) return;
    var firstSelectedTrack = this._selectable.first();
    if (firstSelectedTrack) {
        return this.changeTrackExplicitly(firstSelectedTrack.track());
    }

    var first = this._trackViews.first();
    if (first) first = first.track();
    this.changeTrackExplicitly(first);
};

Object.defineProperty(Search.prototype, "length", {
    get: function() {
        return this._trackViews.length;
    },
    configurable: false
});

selectionMethods.addSelectionMethods(Search);

module.exports = Search;
