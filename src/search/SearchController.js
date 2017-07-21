import {buildConsecutiveRanges, indexMapper, normalizeQuery, throttle} from "util";
import {byTransientId} from "tracks/Track";
import TrackView from "tracks/TrackView";
import TrackViewOptions from "tracks/TrackViewOptions";
import {insert} from "search/sortedArrays";
import {SEARCH_READY_EVENT_NAME, trackSearchIndexResultCmp} from "search/SearchBackend";
import WorkerFrontend from "WorkerFrontend";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";
import TrackContainerController from "tracks/TrackContainerController";

const cmpTrackView = function(a, b) {
    return trackSearchIndexResultCmp(a._result, b._result);
};

const MAX_SEARCH_HISTORY_ENTRIES = 100;
const SEARCH_HISTORY_KEY = `search-history`;

class SearchHistoryEntry {
    constructor(page, query) {
        query = `${query}`;
        this._page = page;
        const opt = page.createElement(`option`);
        opt.setValue(query);
        this._domNode = opt;
        this._query = query;
    }

    $() {
        return this._domNode;
    }

    update(query) {
        this._query = query;
        this.$().setValue(query);
    }

    query() {
        return this._query;
    }

    toJSON() {
        return this._query;
    }

    destroy() {
        this.$().remove();
    }
}

class SearchSession {
    constructor(search, rawQuery, normalizedQuery) {
        this._search = search;
        this._rawQuery = rawQuery;
        this._normalizedQuery = normalizedQuery;
        this._resultCount = 0;
        this._destroyed = false;
        this._started = false;
        this._id = search.nextSessionId();
        this._messaged = this._messaged.bind(this);
    }

    _messaged(event) {
        const payload = event.data;
        if (!payload) return;
        if (payload.searchSessionId !== this._id) return;

        if (payload.type === `searchResults`) {
            this._gotResults(payload.results);
        }
    }

    start() {
        if (this._destroyed) return;
        if (this._started) return;
        this._started = true;
        this.update();
    }

    update() {
        this._search._searchFrontend.postMessage({
            action: `search`,
            args: {
                sessionId: this._id,
                normalizedQuery: this._normalizedQuery
            }
        });
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._search = null;
    }

    resultCount() {
        return this._resultCount;
    }

    _gotResults(results) {
        if (this._destroyed) return;
        this._search.newResults(this, results);
    }
}

class SearchFrontend extends WorkerFrontend {
    constructor(searchController, deps) {
        super(SEARCH_READY_EVENT_NAME, deps.workerWrapper);
        this.searchController = searchController;
    }

    receiveMessage(event) {
        const {_session} = this.searchController;
        if (_session) {
            _session._messaged(event);
        }
    }
}

export default class SearchController extends TrackContainerController {
    constructor(opts, deps) {
        opts.trackRaterZIndex = zIndex;
        super(opts, deps);
        this._metadataManager = deps.metadataManager;
        this._searchFrontend = new SearchFrontend(this, deps);
        this._inputNode = this.$().find(`.search-input-box`);
        this._dataListNode = this.$().find(`.search-history`);
        this._inputContainerNode = this.$().find(`.search-input-container`);
        this._searchHistory = [];
        this._session = null;
        this._playlist = deps.playlist;
        this._trackViewOptions = new TrackViewOptions(opts.itemHeight,
                                                      this._playlist,
                                                      this.page,
                                                      deps.tooltipContext,
                                                      this._selectable,
                                                      this,
                                                      this.env.hasTouch());

        this._topHistoryEntry = null;
        this._visible = false;
        this._dirty = false;
        this._nextSessionId = 0;

        this._metadataManager.on(`metadataUpdate`, this.metadataUpdated.bind(this));

        this.$input().addEventListener(`input`, this._gotInput.bind(this)).
                     addEventListener(`focus`, this._inputFocused.bind(this)).
                     addEventListener(`blur`, this._inputBlurred.bind(this)).
                     addEventListener(`keydown`, this._inputKeydowned.bind(this));
        this.$().find(`.search-next-tab-focus`).addEventListener(`focus`, this._searchNextTabFocused.bind(this));

        if (SEARCH_HISTORY_KEY in this.dbValues) {
            this.tryLoadHistory(this.dbValues[SEARCH_HISTORY_KEY]);
        }
    }

    bindKeyboardShortcuts() {
        super.bindKeyboardShortcuts();
        this._keyboardShortcutContext.addShortcut(`ctrl+f`, this._focusInput.bind(this));
    }

    _createSingleTrackMenu() {
        const menu = [];

        menu.push({
            id: `play`,
            content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
            onClick: () => {
                this.changeTrackExplicitly(this._singleTrackViewSelected.track());
                this._singleTrackMenu.hide();
            }
        });

        menu.push({
            divider: true
        });

        menu.push({
            id: `track-rating`,
            content: () => this._trackRater.$(),
            onClick(e) {
                e.preventDefault();
            }
        });


        const ret = this.menuContext.createVirtualButtonMenu({menu, zIndex});
        ret.on(`willHideMenu`, () => {
            this._singleTrackViewSelected = null;

        });
        return ret;
    }

    updateSearchIndex(track, metadata) {
    }

    removeFromSearchIndex(track) {
    }

    $input() {
        return this._inputNode;
    }

    $historyDataList() {
        return this._dataListNode;
    }

    $inputContainer() {
        return this._inputContainerNode;
    }

    nextSessionId() {
        return ++this._nextSessionId;
    }

    tabWillHide() {
        super.tabWillHide();
        this._visible = false;
        this.$input().blur();
        this.$().find(`.search-next-tab-focus`).hide();
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidShow() {
        this.$().find(`.search-next-tab-focus`).show();
        this._visible = true;

        if (!this.env.isMobile() || !this._session || !this._session._resultCount) {
            this.$input().focus();
        }
        super.tabDidShow();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);

        if (this._dirty && this._session) {
            this._dirty = false;
            this._session.update();
        }
    }

    updateResults() {
        this._session.update();
    }

    _resultsStale() {
        if (this._session && this._visible) {
            this.updateResults();
        } else {
            this._dirty = true;
        }
    }

    metadataUpdated(tracks) {
        for (const track of tracks) {
            const {genres, album, artist, title, albumArtist} = track.tagData;
            this.updateSearchIndex(track, {genres, album, artist, title, albumArtist});
        }

        this._resultsStale();
    }

    tryLoadHistory(values) {
        if (Array.isArray(values) && values.length <= MAX_SEARCH_HISTORY_ENTRIES) {
            this._searchHistory = values.map(function(query) {
                return new SearchHistoryEntry(this.page, query);
            }, this);

            const parent = this.$historyDataList();
            for (let i = 0; i < this._searchHistory.length; ++i) {
                parent.append(this._searchHistory[i].$());
            }
        }
    }

    saveHistory(historyEntries) {
        const json = historyEntries.map(v => v.toJSON());
        this.db.set(SEARCH_HISTORY_KEY, json);
    }

    changeTrackExplicitly(track) {
        this._playlist.changeTrackExplicitly(track);
    }

    _focusInput() {
        this.$input().focus();
    }

    newResults(session, results) {
        if (this._session !== session) {
            session.destroy();
            return;
        }
        this._dirty = false;
    }

    clear() {
        this.removeTrackViews(this._trackViews);
        if (this._session) {
            this._session.destroy();
            this._session = null;
        }
    }

    _inputKeydowned(e) {
        if (e.key === `Enter`) {
            e.target.blur();
            this.selectFirst();
        } else if (e.key === `Escape` && !e.target.value) {
            e.target.blur();
        } else if (e.key === `ArrowUp` || e.key === `ArrowDown`) {
            if (this._session && this._session.resultCount() > 0) {
                e.preventDefault();
                e.target.blur();
                this.selectFirst();
            }
        }
    }

    _inputBlurred() {
        this.$inputContainer().removeClass(`focused`);
        if (this._session && this._session.resultCount() > 0) {
            if (this._topHistoryEntry === null) {
                const searchHistory = this._searchHistory;
                const newQuery = this._session._rawQuery;

                for (let i = 0; i < searchHistory.length; ++i) {
                    if (searchHistory[i].query() === newQuery) {
                        this._topHistoryEntry = searchHistory[i];

                        for (let j = i; j > 0; --j) {
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
    }

    _searchNextTabFocused(e) {
        if (this._trackViews.length > 0) {
            e.target.blur();
            this.selectFirst();
        }
    }

    _inputFocused() {
        this.$inputContainer().addClass(`focused`);
    }

    removeTrackViews(trackViews, silent) {
        if (trackViews.length === 0) return;
        const oldLength = this.length;
        const indices = trackViews.map(indexMapper);
        const tracksIndexRanges = buildConsecutiveRanges(indices);

        this._selectable.removeIndices(indices);

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i].destroy();
        }

        this.removeTracksBySelectionRanges(tracksIndexRanges);
        if (this.length !== oldLength && !silent) {
            this.emit(`lengthChange`, this.length, oldLength);
            this._fixedItemListScroller.resize();
        }
    }

    _gotInput() {
        const value = this.$input().value();

        if (value.length === 0) {
            this._topHistoryEntry = null;
        }

        const normalized = normalizeQuery(value);

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
    }

    playFirst() {
        if (!this.length) return;
        const firstSelectedTrack = this._selectable.first();
        if (firstSelectedTrack) {
            this.changeTrackExplicitly(firstSelectedTrack.track());
            return;
        }

        let first = this._trackViews.first();
        if (first) first = first.track();
        this.changeTrackExplicitly(first);
    }
}

SearchController.prototype.updateResults = throttle(SearchController.prototype.updateResults, 50);
SearchController.prototype._gotInput = throttle(SearchController.prototype._gotInput, 33);
SearchController.prototype.saveHistory = throttle(SearchController.prototype.saveHistory, 1000);
