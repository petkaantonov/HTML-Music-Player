import {normalizeQuery, throttle} from "util";
import {SEARCH_READY_EVENT_NAME} from "search/SearchBackend";
import WorkerFrontend from "WorkerFrontend";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";
import {ALIGN_RIGHT_SIDE_AT_TOP as align} from "ui/ActionMenu";
import TrackContainerController, {LENGTH_CHANGE_EVENT} from "tracks/TrackContainerController";
import {CANDIDATE_TRACKS_OUTSIDE_PLAYLIST_FOR_NEXT_TRACK_NEEDED_EVENT} from "player/PlaylistController";
import {indexedDB} from "platform/platform";
import {actionHandler, moreThan0Selected,
        exactly1Selected, lessThanAllSelected} from "ui/MenuContext";

const MAX_SEARCH_HISTORY_ENTRIES = 100;
const SEARCH_HISTORY_KEY = `search-history`;
const SEARCH_QUERY_KEY = `search-query`;

const noSearchResultsTemplate = `
  <div class="status-info-text search-text-container">
     <p>No tracks in your media library match the query <em class='search-query'></em>. Try online search.</p>
</div>`;

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

        this._resultsLoadedPromise = new Promise((resolve) => {
            this._resultsLoadedResolve = resolve;
        });
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

    resultsLoaded() {
        return this._resultsLoadedPromise;
    }

    async _gotResults(results) {
        if (this._destroyed) return;
        this._resultCount = results.length;
        await this._search.newResults(this, results);
        this._resultsLoadedResolve();
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
        opts.playedTrackOriginUsesTrackViewIndex = false;
        opts.supportsRemove = false;
        super(opts, deps);
        this._metadataManager = deps.metadataManager;
        this._searchFrontend = new SearchFrontend(this, deps);
        this._inputNode = this.$().find(`.search-input-box`);
        this._dataListNode = this.$().find(`.search-history`);
        this._inputContainerNode = this.$().find(`.search-input-container`);
        this._searchHistory = [];
        this._session = null;
        this._playlist = deps.playlist;

        this._topHistoryEntry = null;
        this._visible = false;
        this._nextSessionId = 0;

        this._candidateTrackIndex = -1;
        this._playlist.on(CANDIDATE_TRACKS_OUTSIDE_PLAYLIST_FOR_NEXT_TRACK_NEEDED_EVENT,
                          this._candidateTracksNeeded.bind(this));

        this.$input().addEventListener(`input`, this._gotInput.bind(this)).
                     addEventListener(`focus`, this._inputFocused.bind(this)).
                     addEventListener(`blur`, this._inputBlurred.bind(this)).
                     addEventListener(`keydown`, this._inputKeydowned.bind(this));
        this.$().find(`.search-next-tab-focus`).addEventListener(`focus`, this._searchNextTabFocused.bind(this));


        this.$().find(`.search-empty`).setHtml(noSearchResultsTemplate);
        this._preferencesLoaded = this.loadPreferences();
    }

    shutdownSavePreferences(preferences) {
        preferences.push({
            key: SEARCH_HISTORY_KEY,
            value: this._searchHistory.map(v => v.toJSON())
        });
        preferences.push({
            key: SEARCH_QUERY_KEY,
            value: this._getRawQuery()
        });
        super.shutdownSavePreferences(preferences);
    }

    async loadPreferences() {
        this.tryLoadHistory(this.dbValues[SEARCH_HISTORY_KEY]);
        await this._tryLoadQuery(this.dbValues[SEARCH_QUERY_KEY]);
        this.getPlayedTrackOrigin().originInitialTracksLoaded();
        await super.loadPreferences();
    }


    bindKeyboardShortcuts() {
        super.bindKeyboardShortcuts();
        this._keyboardShortcutContext.addShortcut(`ctrl+f`, this._focusInput.bind(this));
    }

    createSingleTrackMenu() {
        const menu = [];

        menu.push({
            id: `play`,
            content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
            onClick: () => {
                this.changeTrackExplicitly(this._singleTrackViewSelected.track(), {
                    trackView: this._singleTrackViewSelected,
                    origin: this.getPlayedTrackOrigin()
                });
                this._singleTrackMenu.hide();
            }
        });

        menu.push({
            id: `add-to-playlist`,
            content: this.menuContext.createMenuItem(`Add to playlist`, `material-icons small-material-icon add-to-playlist`),
            onClick: () => {
                this._addTracksToPlaylist([this._singleTrackViewSelected.track()]);
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

    createMultiSelectionMenuSpec(target) {
        const haveTouch = this.env.hasTouch();
        const menu = [];

        const addToPlaylist = {
            id: `add-to-playlist`,
            disabled: false,
            content: this.menuContext.createMenuItem(`Add to playlist`, `material-icons small-material-icon add-to-playlist`),
            enabledPredicate: moreThan0Selected,
            onClick: actionHandler(false, this, `_addSelectionToPlaylist`)
        };

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: actionHandler(false, this, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected
            });

            menu.push(addToPlaylist);

            menu.push({
                divider: true
            });

            menu.push({
                id: `clear-selection`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select none`, `material-icons small-material-icon crop_square`),
                onClick: actionHandler(true, this, `clearSelection`),
                enabledPredicate: moreThan0Selected
            });

            menu.push({
                id: `select-all`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select all`, `material-icons small-material-icon select_all`),
                onClick: actionHandler(true, this, `selectAll`),
                enabledPredicate: lessThanAllSelected
            });

            menu.push({
                divider: true
            });

            menu.push({
                disabled: true,
                id: `track-rating`,
                enabledPredicate: exactly1Selected,
                content: function() {
                    return this.getTrackRater().$();
                }.bind(this),
                onClick(e) {
                    e.preventDefault();
                }
            });
        } else {
            menu.push(addToPlaylist);
        }

        if (haveTouch) {
            menu.push({
                divider: true
            });
        }

        return {
            target,
            menu,
            zIndex,
            align,
            manualTrigger: true
        };
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
    }

    tabDidShow(thereWasNoPreviousTab) {
        this.$().find(`.search-next-tab-focus`).show();
        this._visible = true;

        if ((!this.env.isMobile() || !this._session || !this._session._resultCount) &&
            !thereWasNoPreviousTab) {
            this.$input().focus();
        }
        super.tabDidShow();
        this.globalEvents.setLastShownPlayedTrackOrigin(this.getPlayedTrackOrigin());
    }

    tryLoadHistory(values) {
        if (Array.isArray(values) && values.length > 0) {
            values = values.slice(0, MAX_SEARCH_HISTORY_ENTRIES + 1);
            this._searchHistory = values.map(function(query) {
                return new SearchHistoryEntry(this.page, query);
            }, this);

            const parent = this.$historyDataList();
            for (let i = 0; i < this._searchHistory.length; ++i) {
                parent.append(this._searchHistory[i].$());
            }
        }
    }

    async _tryLoadQuery(value) {
        if (!value) value = ``;
        await this._metadataManager.ready();
        this.$input().setValue(value);
        await this._performQuery(this.$input().value());
    }

    _candidateTracksNeeded(submitCandidate) {
        if (this.length > 0) {
            const priority = this._visible ? 0
                                           : this.globalEvents.getLastShownPlayedTrackOrigin() === this.getPlayedTrackOrigin()
                                                ? 1
                                                : 2;
            const index = ((this._candidateTrackIndex + 1) % this.length);
            const trackView = this._trackViews[index];
            this._candidateTrackIndex = index;
            submitCandidate(trackView.track(), trackView, this.getPlayedTrackOrigin(), priority);
        }
    }

    changeTrackExplicitly(track, {trackView, origin}) {
        this._candidateTrackIndex = trackView.getIndex();
        this._playlist.changeTrackExplicitly(track, {
            trackView,
            origin
        });
    }

    candidatePlaylistTrackWillPlay(playlistTrack) {
        const index = playlistTrack.trackView().getIndex();
        if (this._candidateTrackIndex === -1 &&
            index >= 0 && index < this.length &&
            this._trackViews[index] === playlistTrack.trackView()) {
            this._candidateTrackIndex = index;
        }
    }

    _addTracksToPlaylist(tracks) {
        this._playlist.add(tracks);
    }

    _addSelectionToPlaylist() {
        this._addTracksToPlaylist(this.getSelection().map(trackView => trackView.track()));
        this.clearSelection();
    }

    _focusInput() {
        this.$input().focus();
    }

    async newResults(session, results) {
        if (this._session !== session) {
            session.destroy();
            return;
        }

        let diff = false;
        if (results.length !== this._trackViews.length) {
            diff = true;
        } else {
            for (let i = 0; i < results.length; ++i) {
                if (indexedDB.cmp(results[i].trackUid, this._trackViews[i].track().uid()) !== 0) {
                    diff = true;
                    break;
                }
            }
        }

        if (!diff) {
            return;
        }

        this.destroyTrackViews();
        if (results.length > 0) {
            const {_metadataManager} = this;
            const tracks =
                await Promise.all(results.map(result => _metadataManager.getTrackByFileReferenceAsync(result.trackUid)));
            this.add(tracks);
        } else {
            this.listBecameEmpty();
        }

        this._playlist.invalidateNextPlaylistTrackFromOrigin(this.getPlayedTrackOrigin());
        if (!this._playlist.hasNextTrack() && this.length > 0) {
            const index = ((++this._candidateTrackIndex) % this.length);
            this._candidateTrackIndex = index;
            const trackView = this._trackViews[index];
            this._playlist.playlistTrackCandidateFromOrigin(trackView.track(),
                                                            trackView,
                                                            this.getPlayedTrackOrigin());
        }
    }

    playingTrackAddedToList(track, trackView) {
        this._candidateTrackIndex = trackView.getIndex();
    }

    clear() {
        this.destroyTrackViews();
        if (this._session) {
            this._session.destroy();
            this._session = null;
        }
        this.listBecameEmpty();
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

    _getRawQuery() {
        return this._session ? this._session._rawQuery : ``;
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
                        return;
                    }
                }

                this._topHistoryEntry = new SearchHistoryEntry(this.page, newQuery);
                this._searchHistory.unshift(this._topHistoryEntry);
                this.$historyDataList().prepend(this._topHistoryEntry.$());
                if (this._searchHistory.length > MAX_SEARCH_HISTORY_ENTRIES) {
                    this._searchHistory.pop().destroy();
                }
            } else {
                this._topHistoryEntry.update(this._session._rawQuery);
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

    destroyTrackViews() {
        this._candidateTrackIndex = -1;
        this.clearSelection();

        const {length} = this;

        for (let i = 0; i < length; ++i) {
            this._trackViews[i].destroy();
        }
        this._trackViews.length = 0;
        if (length !== 0) {
            this.emit(LENGTH_CHANGE_EVENT, 0, length);
        }
        this._fixedItemListScroller.resize();
    }

    async _performQuery(value) {
        this.$().find(`.search-query`).setText(value);

        if (value.length === 0) {
            this._topHistoryEntry = null;
        }

        const normalized = normalizeQuery(value);

        if (this._session && this._session._normalizedQuery === normalized) {
            return;
        }

        if (normalized.length <= 1) {
            this.clear();
            this._playlist.invalidateNextPlaylistTrackFromOrigin(this.getPlayedTrackOrigin());
            this.$().find(`.search-empty .search-text-container`).hide();
            return;
        } else {
            this.$().find(`.search-empty .search-text-container`).show();
        }

        if (this._session) {
            this._session.destroy();
        }
        this._session = new SearchSession(this, value, normalized);
        this._session.start();
        await this._session.resultsLoaded();
    }

    _gotInput() {
        const value = this.$input().value();
        this._performQuery(value);
    }

    playFirst() {
        if (!this.length) return;
        const firstSelectedTrack = this._selectable.first();
        if (firstSelectedTrack) {
            this.changeTrackExplicitly(firstSelectedTrack.track(), {
                trackView: firstSelectedTrack,
                origin: this.getPlayedTrackOrigin()
            });
            return;
        }

        const firstView = this._trackViews.first();
        if (firstView) {
            this.changeTrackExplicitly(firstView.track(), {
                trackView: firstView,
                origin: this.getPlayedTrackOrigin()
            });
        }
    }

    listBecameEmpty() {
        this.$().find(`.search-empty`).show();
        this.$().find(`.tracklist-transform-container`).hide();
    }

    listBecameNonEmpty() {
        this.$().find(`.search-empty`).hide();
        this.$().find(`.tracklist-transform-container`).show();
    }

    /* eslint-disable class-methods-use-this */
    didAddTracksToView() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */
}

SearchController.prototype._gotInput = throttle(SearchController.prototype._gotInput, 33);
