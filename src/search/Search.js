"use strict";

import ApplicationDependencies from "ApplicationDependencies";
import AbstractTrackContainer from "tracks/AbstractTrackContainer";
import { buildConsecutiveRanges, indexMapper, inherits, normalizeQuery, throttle } from "util";
import Selectable from "ui/Selectable";
import Track from "tracks/Track";
import TrackViewOptions from "tracks/TrackViewOptions";
import SearchResultTrackView from "search/SearchResultTrackView";
import { insert } from "search/sortedArrays";
import { cmp } from "search/SearchResult";

const cmpTrackView = function(a, b) {
    return cmp(a._result, b._result);
};

const MAX_SEARCH_HISTORY_ENTRIES = 100;
const SEARCH_HISTORY_KEY = "search-history";

function SearchHistoryEntry(page, query) {
    query = "" + query;
    this._page = page;
    var opt = page.createElement("option");
    opt.setValue(query);
    this._domNode = opt;
    this._query = query;
}

SearchHistoryEntry.prototype.$ = function() {
    return this._domNode;
};

SearchHistoryEntry.prototype.update = function(query) {
    this._query = query;
    this.$().setValue(query);
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
    this._initialResultsPosted = false;
    this._resultCount = 0;
    this._destroyed = false;
    this._started = false;
    this._id = search.nextSessionId();
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
    this.update();
};

SearchSession.prototype.update = function() {
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

    if (!this._initialResultsPosted) {
        this._initialResultsPosted = true;
        this._resultCount = results.length;
        this._search.newResults(this, results);
    } else {
        this._resultCount = Math.max(this._resultCount, results.length);
        this._search.replaceResults(this, results);
    }
};

export default function Search(opts, deps) {
    AbstractTrackContainer.call(this);
    opts = Object(opts);
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.env = deps.env;
    this.recognizerContext = deps.recognizerContext;
    this.db = deps.db;
    this.dbValues = deps.dbValues;
    this.keyboardShortcuts = deps.keyboardShortcuts;

    this._trackAnalyzer = deps.trackAnalyzer;
    this._domNode = this.page.$(opts.target).eq(0);
    this._trackContainer = this.$().find(".tracklist-transform-container");
    this._inputNode = this.$().find(".search-input-box");
    this._dataListNode = this.$().find(".search-history");
    this._inputContainerNode = this.$().find(".search-input-container");
    this._trackViews = [];
    this._searchHistory = [];
    this._session = null;
    this._playlist = deps.playlist;
    this._selectable = new Selectable({
        listView: this
    }, new ApplicationDependencies({
        page: this.page
    }));

    this._trackViewOptions = new TrackViewOptions(false,
                                                  opts.itemHeight,
                                                  this._playlist,
                                                  this.page,
                                                  deps.tooltipContext,
                                                  this._selectable,
                                                  this);

    this._topHistoryEntry = null;
    this._visible = false;
    this._dirty = false;
    this._nextSessionId = 0;

    this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
        target: this.$(),
        itemList: this._trackViews,
        contentContainer: this.$trackContainer(),

        minPrerenderedItems: 15,
        maxPrerenderedItems: 50,

        scrollerOpts: {
            scrollingX: false,
            snapping: true,
            zooming: false,
            paging: false
        },

        scrollbarOpts: {
            target: this.$().find(".scrollbar-container"),
            railSelector: ".scrollbar-rail",
            knobSelector: ".scrollbar-knob"
        }
    });

    this._keyboardShortcutContext = this.keyboardShortcuts.createContext();
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

    var self = this;
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

    this._bindListEvents();

    this.metadataUpdated = this.metadataUpdated.bind(this);

    this.globalEvents.on("resize", this._windowLayoutChanged.bind(this));
    this.globalEvents.on("clear", this.clearSelection.bind(this));
    this._trackAnalyzer.on("metadataUpdate", this.metadataUpdated);
    this._playlist.on("lengthChange", this.metadataUpdated);

    this.$input().addEventListener("input", this._gotInput.bind(this))
                 .addEventListener("focus", this._inputFocused.bind(this))
                 .addEventListener("blur", this._inputBlurred.bind(this))
                 .addEventListener("keydown", this._inputKeydowned.bind(this));
    this.$().find(".search-next-tab-focus").addEventListener("focus", this._searchNextTabFocused.bind(this));

    if (SEARCH_HISTORY_KEY in this.dbValues) {
        this.tryLoadHistory(this.dbValues[SEARCH_HISTORY_KEY]);
    }
    deps.ensure();
}
inherits(Search, AbstractTrackContainer);

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

Search.prototype.nextSessionId = function() {
    return ++this._nextSessionId;
};

Search.prototype.tabWillHide = function() {
    this._visible = false;
    this.$input().blur();
    this.$().find(".search-next-tab-focus").hide();
    this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
};

Search.prototype.tabDidHide = function() {

};

Search.prototype.tabWillShow = function() {
};

Search.prototype.tabDidShow = function() {
    this.$().find(".search-next-tab-focus").show();
    this._visible = true;

    if (!this.env.isMobile()) {
        this.$input().focus();
    }
    this._fixedItemListScroller.resize();
    this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);

    if (this._dirty && this._session) {
        this._dirty = false;
        this._session.update();
    }
};

Search.prototype.updateResults = throttle(function() {
    this._session.update();
}, 50);

Search.prototype.metadataUpdated = function() {
    if (this._session && this._visible) {
        this.updateResults();
    } else {
        this._dirty = true;
    }
};

Search.prototype.tryLoadHistory = function(values) {
    if (Array.isArray(values) && values.length <= MAX_SEARCH_HISTORY_ENTRIES) {
        this._searchHistory = values.map(function(query) {
            return new SearchHistoryEntry(this.page, query);
        }, this);

        var parent = this.$historyDataList();
        for (var i = 0; i < this._searchHistory.length; ++i) {
            parent.append(this._searchHistory[i].$());
        }
    }
};

Search.prototype.saveHistory = throttle(function(historyEntries) {
    var json = historyEntries.map(function(v) {
        return v.toJSON();
    });
    this.db.set(SEARCH_HISTORY_KEY, json);
}, 1000);

Search.prototype.changeTrackExplicitly = function(track) {
    this._playlist.changeTrackExplicitly(track);
};

Search.prototype._focusInput = function() {
    this.$input().focus();
};

Search.prototype.replaceResults = function(session, results) {
    if (this._session !== session) {
        session.destroy();
        return;
    }
    this._dirty = false;

    var oldLength = this.length;
    var trackViews = this._trackViews;

    for (var i = 0; i < results.length; ++i) {
        var result = results[i];
        var track = Track.byTransientId(result.transientId);
        if (!track || !track.shouldDisplayAsSearchResult()) {
            continue;
        }
        var view = new SearchResultTrackView(track, result, this._trackViewOptions);
        insert(cmpTrackView, trackViews, view);
    }

    var indicesToRemove = [];
    for (var i = 0; i < trackViews.length; ++i) {
        var view = trackViews[i];
        if (view.isDetachedFromPlaylist()) {
            view.destroy();
            indicesToRemove.push(i);
        }
    }


    if (indicesToRemove.length > 0) {
        this._selectable.removeIndices(indicesToRemove);
        var tracksIndexRanges = buildConsecutiveRanges(indicesToRemove);
        this.removeTracksBySelectionRanges(tracksIndexRanges);
    }

    for (var i = 0; i < trackViews.length; ++i) {
        trackViews[i].setIndex(i);
    }

    if (this.length !== oldLength) {
        this.emit("lengthChange", this.length, oldLength);
        this._fixedItemListScroller.resize();
    }
};

Search.prototype.newResults = function(session, results) {
    if (this._session !== session) {
        session.destroy();
        return;
    }
    this._dirty = false;

    var trackViews = this._trackViews;
    var oldLength = this.length;
    this.removeTrackViews(trackViews, true);
    for (var i = 0; i < results.length; ++i) {
        var result = results[i];
        var track = Track.byTransientId(result.transientId);
        if (!track || !track.shouldDisplayAsSearchResult()) {
            continue;
        }
        var view = new SearchResultTrackView(track, result, this._trackViewOptions);
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
    this.page.requestAnimationFrame(function() {
        self._fixedItemListScroller.resize();
    });
};

Search.prototype._inputKeydowned = function(e) {
    if (e.key === "Enter") {
        e.target.blur();
        this.selectFirst();
    } else if (e.key === "Escape" && !e.target.value) {
        e.target.blur();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (this._session && this._session.resultCount() > 0) {
            e.preventDefault();
            e.target.blur();
            this.selectFirst();
        }
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
                    this.saveHistory(searchHistory);
                    return;
                }
            }

            this._topHistoryEntry = new SearchHistoryEntry(this.page, newQuery);
            this._searchHistory.unshift(this._topHistoryEntry);
            this.$historyDataList().prepend(this._topHistoryEntry.$());
            if (this._searchHistory.length > MAX_SEARCH_HISTORY_ENTRIES) {
                this._searchHistory.pop().destroy();
            }
            this.saveHistory(this._searchHistory);
        } else {
            this._topHistoryEntry.update(this._session._rawQuery);
            this.saveHistory(this._searchHistory);
        }
    }
};

Search.prototype._searchNextTabFocused = function(e) {
    if (this._trackViews.length > 0) {
        e.target.blur();
        this.selectFirst();
    }
};

Search.prototype._inputFocused = function() {
    this.$inputContainer().addClass("focused");
};

Search.prototype.removeTrackViews = function(trackViews, silent) {
    if (trackViews.length === 0) return;
    var oldLength = this.length;
    var indices = trackViews.map(indexMapper);
    var tracksIndexRanges = buildConsecutiveRanges(indices);

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

Search.prototype._gotInput = throttle(function() {
    var value = this.$input().value();

    if (value.length === 0) {
        this._topHistoryEntry = null;
    }

    var normalized = normalizeQuery(value);

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
    this._session = new SearchSession(this, value, normalized);
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

