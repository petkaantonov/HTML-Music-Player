import withDeps from "ApplicationDependencies";
import TrackContainerTrait from "tracks/TrackContainerTrait";
import {buildConsecutiveRanges, indexMapper, normalizeQuery, throttle, noUndefinedGet} from "util";
import Selectable from "ui/Selectable";
import {byTransientId} from "tracks/Track";
import TrackViewOptions from "tracks/TrackViewOptions";
import SearchResultTrackView from "search/SearchResultTrackView";
import {insert} from "search/sortedArrays";
import {cmp} from "search/SearchResult";
import TrackRater from "tracks/TrackRater";
import {SEARCH_READY_EVENT_NAME} from "search/SearchBackend";
import WorkerFrontend from "WorkerFrontend";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";

const cmpTrackView = function(a, b) {
    return cmp(a._result, b._result);
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
        this._initialResultsPosted = false;
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
        this._search.postMessage({
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

        if (!this._initialResultsPosted) {
            this._initialResultsPosted = true;
            this._resultCount = results.length;
            this._search.newResults(this, results);
        } else {
            this._resultCount = Math.max(this._resultCount, results.length);
            this._search.replaceResults(this, results);
        }
    }
}

export default class Search extends WorkerFrontend {
    constructor(opts, deps) {
        super(SEARCH_READY_EVENT_NAME, deps.workerWrapper);
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.rippler = deps.rippler;
        this.globalEvents = deps.globalEvents;
        this.env = deps.env;
        this.menuContext = deps.menuContext;
        this.recognizerContext = deps.recognizerContext;
        this.db = deps.db;
        this.dbValues = deps.dbValues;
        this.keyboardShortcuts = deps.keyboardShortcuts;

        this._trackRater = withDeps({
            page: this.page,
            recognizerContext: this.recognizerContext,
            rippler: this.rippler
        }, d => new TrackRater({zIndex}, d));
        this._singleTrackMenu = this.env.hasTouch() ? this._createSingleTrackMenu() : null;
        this._singleTrackViewSelected = null;

        this._trackAnalyzer = deps.trackAnalyzer;
        this._domNode = this.page.$(opts.target).eq(0);
        this._trackContainer = this.$().find(`.tracklist-transform-container`);
        this._inputNode = this.$().find(`.search-input-box`);
        this._dataListNode = this.$().find(`.search-history`);
        this._inputContainerNode = this.$().find(`.search-input-container`);
        this._trackViews = [];
        this._searchHistory = [];
        this._session = null;
        this._playlist = deps.playlist;
        this._selectable = withDeps({page: this.page}, d => new Selectable({listView: this}, d));
        this._trackViewOptions = new TrackViewOptions(false,
                                                      opts.itemHeight,
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

        this._fixedItemListScroller = deps.scrollerContext.createFixedItemListScroller({
            target: this.$(),
            itemList: this._trackViews,
            contentContainer: this.$trackContainer(),
            minPrerenderedItems: 6,
            maxPrerenderedItems: 12
        });

        this._keyboardShortcutContext = this.keyboardShortcuts.createContext();
        this._keyboardShortcutContext.addShortcut(`ctrl+f`, this._focusInput.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+a`, this.selectAll.bind(this));
        this._keyboardShortcutContext.addShortcut(`Enter`, this.playPrioritySelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`ArrowUp`, this.selectPrev.bind(this));
        this._keyboardShortcutContext.addShortcut(`ArrowDown`, this.selectNext.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+ArrowUp`, this.selectPrevAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+ArrowDown`, this.selectNextAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+ArrowDown`, this.removeTopmostSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+ArrowUp`, this.removeBottommostSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+ArrowUp`, this.moveSelectionUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+ArrowDown`, this.moveSelectionDown.bind(this));
        this._keyboardShortcutContext.addShortcut(`PageUp`, this.selectPagePrev.bind(this));
        this._keyboardShortcutContext.addShortcut(`PageDown`, this.selectPageNext.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+PageUp`, this.selectPagePrevAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+PageDown`, this.selectPageNextAppend.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+PageDown`, this.removeTopmostPageSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`alt+PageUp`, this.removeBottommostPageSelection.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+PageUp`, this.moveSelectionPageUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`mod+PageDown`, this.moveSelectionPageDown.bind(this));
        this._keyboardShortcutContext.addShortcut(`Home`, this.selectFirst.bind(this));
        this._keyboardShortcutContext.addShortcut(`End`, this.selectLast.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+Home`, this.selectAllUp.bind(this));
        this._keyboardShortcutContext.addShortcut(`shift+End`, this.selectAllDown.bind(this));

        [1, 2, 3, 4, 5].forEach((ratingValue) => {
            this._keyboardShortcutContext.addShortcut(`alt+${ratingValue}`, () => {
                if (this._selectable.getSelectedItemViewCount() !== 1) return;
                const trackView = this._selectable.first();
                if (trackView) {
                    trackView.track().rate(ratingValue);
                }
            });
        });

        this._keyboardShortcutContext.addShortcut(`alt+0`, () => {
            if (this._selectable.getSelectedItemViewCount() !== 1) return;
            const trackView = this._selectable.first();
            if (trackView) trackView.track().rate(-1);
        });

        this._bindListEvents();

        this.metadataUpdated = this.metadataUpdated.bind(this);

        this.globalEvents.on(`resize`, this._windowLayoutChanged.bind(this));
        this.globalEvents.on(`clear`, this.clearSelection.bind(this));
        this._trackAnalyzer.on(`metadataUpdate`, this.metadataUpdated);
        this._playlist.on(`lengthChange`, this.metadataUpdated);

        this.$input().addEventListener(`input`, this._gotInput.bind(this)).
                     addEventListener(`focus`, this._inputFocused.bind(this)).
                     addEventListener(`blur`, this._inputBlurred.bind(this)).
                     addEventListener(`keydown`, this._inputKeydowned.bind(this));
        this.$().find(`.search-next-tab-focus`).addEventListener(`focus`, this._searchNextTabFocused.bind(this));

        if (SEARCH_HISTORY_KEY in this.dbValues) {
            this.tryLoadHistory(this.dbValues[SEARCH_HISTORY_KEY]);
        }

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

    openSingleTrackMenu(trackView, eventTarget, event) {
        this._trackRater.enable(trackView.track());
        this._singleTrackViewSelected = trackView;
        this._singleTrackMenu.show(event, () => {
            const box = eventTarget.getBoundingClientRect();
            return {
                x: box.right - 5,
                y: box.top
            };
        });
    }

    getTrackRater() {
        return this._trackRater;
    }

    receiveMessage(event) {
        if (this._session) {
            this._session._messaged(event);
        }
    }

    updateSearchIndex(track, metadata) {
        this.postMessage({
            action: `updateSearchIndex`,
            args: {
                transientId: track.transientId(),
                metadata
            }
        });
    }

    removeFromSearchIndex(track) {
        this.postMessage({
            action: `removeFromSearchIndex`,
            args: {transientId: track.transientId()}
        });
    }

    $() {
        return this._domNode;
    }

    $trackContainer() {
        return this._trackContainer;
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
        this._visible = false;
        this.$input().blur();
        this.$().find(`.search-next-tab-focus`).hide();
        this.keyboardShortcuts.deactivateContext(this._keyboardShortcutContext);
    }

    tabDidHide() {
        // Noop
    }

    tabWillShow() {
        // Noop
    }

    tabDidShow() {
        this.$().find(`.search-next-tab-focus`).show();
        this._visible = true;

        if (!this.env.isMobile() || !this._session || !this._session._resultCount) {
            this.$input().focus();
        }
        this._fixedItemListScroller.resize();
        this.keyboardShortcuts.activateContext(this._keyboardShortcutContext);

        if (this._dirty && this._session) {
            this._dirty = false;
            this._session.update();
        }
    }

    updateResults() {
        this._session.update();
    }


    metadataUpdated() {
        if (this._session && this._visible) {
            this.updateResults();
        } else {
            this._dirty = true;
        }
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

    replaceResults(session, results) {
        if (this._session !== session) {
            session.destroy();
            return;
        }
        this._dirty = false;

        const oldLength = this.length;
        const trackViews = this._trackViews;

        for (let i = 0; i < results.length; ++i) {
            const result = results[i];
            const track = byTransientId(result.transientId);
            if (!track || !track.shouldDisplayAsSearchResult()) {
                continue;
            }
            const view = new SearchResultTrackView(track, result, this._trackViewOptions);
            insert(cmpTrackView, trackViews, view);
        }

        const indicesToRemove = [];
        for (let i = 0; i < trackViews.length; ++i) {
            const view = trackViews[i];
            if (view.isDetachedFromPlaylist()) {
                view.destroy();
                indicesToRemove.push(i);
            }
        }


        if (indicesToRemove.length > 0) {
            this._selectable.removeIndices(indicesToRemove);
            const tracksIndexRanges = buildConsecutiveRanges(indicesToRemove);
            this.removeTracksBySelectionRanges(tracksIndexRanges);
        }

        for (let i = 0; i < trackViews.length; ++i) {
            trackViews[i].setIndex(i);
        }

        if (this.length !== oldLength) {
            this.emit(`lengthChange`, this.length, oldLength);
            this._fixedItemListScroller.resize();
        }
    }

    newResults(session, results) {
        if (this._session !== session) {
            session.destroy();
            return;
        }
        this._dirty = false;

        const trackViews = this._trackViews;
        const oldLength = this.length;
        this.removeTrackViews(trackViews, true);
        for (let i = 0; i < results.length; ++i) {
            const result = results[i];
            const track = byTransientId(result.transientId);
            if (!track || !track.shouldDisplayAsSearchResult()) {
                continue;
            }
            const view = new SearchResultTrackView(track, result, this._trackViewOptions);
            const len = trackViews.push(view);
            view.setIndex(len - 1);
        }

        if (this.length !== oldLength) {
            this.emit(`lengthChange`, this.length, oldLength);
        }
        this._fixedItemListScroller.resize();
    }

    clear() {
        this.removeTrackViews(this._trackViews);
        if (this._session) {
            this._session.destroy();
            this._session = null;
        }
    }

    _windowLayoutChanged() {
        this.page.requestAnimationFrame(() => this._fixedItemListScroller.resize());
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

    get length() {
        return this._trackViews.length;
    }

}

Search.prototype.updateResults = throttle(Search.prototype.updateResults, 50);
Search.prototype._gotInput = throttle(Search.prototype._gotInput, 33);
Search.prototype.saveHistory = throttle(Search.prototype.saveHistory, 1000);
Object.assign(Search.prototype, TrackContainerTrait);
