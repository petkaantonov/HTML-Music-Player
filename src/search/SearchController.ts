import { SelectDeps } from "Application";
import MetadataManagerFrontend, { Track } from "metadata/MetadataManagerFrontend";
import {
    DatabaseClosedEmitterTrait,
    DatabaseClosedResult,
    DatabaseEventsMap,
} from "platform/DatabaseClosedEmitterTrait";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import PlaylistController, { PlaylistControllerEventsMap } from "player/PlaylistController";
import { PreferenceArray } from "preferences/PreferenceCreator";
import TrackContainerController, {
    ChangeTrackOpts,
    TrackContainerControllerDeps,
    TrackWithOrigin,
} from "tracks/TrackContainerController";
import TrackView from "tracks/TrackView";
import { PromiseResolve } from "types/helpers";
import { ALIGN_RIGHT_SIDE_AT_TOP as align } from "ui/ActionMenu";
import {
    actionHandler,
    ButtonMenuCallerOptions,
    exactly1Selected,
    lessThanAllSelected,
    MenuItemSpecList,
    moreThan0Selected,
} from "ui/MenuContext";
import { ABOVE_TOOLBAR_Z_INDEX as zIndex } from "ui/ToolbarManager";
import { normalizeQuery } from "utils/searchUtil";
import WorkerFrontend from "WorkerFrontend";

import { throttle } from "../util";

const MAX_SEARCH_HISTORY_ENTRIES = 100;
const noSearchResultsTemplate = `<p>No tracks in your media library match the query <em class='search-query'></em>. Try online search.</p>`;

class SearchHistoryEntry {
    _page: Page;
    private _domNode: DomWrapper;
    private _query: string;

    constructor(page: Page, query: string) {
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

    update(query: string) {
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
    private _search: SearchController | null;
    private _resultCount: number;
    private _destroyed: boolean;
    private _started: boolean;
    private _id: number;
    private _resultsLoadedPromise: Promise<void>;
    readonly rawQuery: string;
    readonly normalizedQuery: string;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private _resultsLoadedResolve: PromiseResolve<void> = () => {};
    constructor(search: SearchController, rawQuery: string, normalizedQuery: string) {
        this._search = search;
        this._resultCount = 0;
        this._destroyed = false;
        this._started = false;
        this._id = search.nextSessionId();
        this.rawQuery = rawQuery;
        this.normalizedQuery = normalizedQuery;

        this._resultsLoadedPromise = new Promise(resolve => {
            this._resultsLoadedResolve = resolve;
        });
    }

    _messaged = (r: SearchResults) => {
        if (r.searchSessionId !== this._id) return;
        void this._gotResults(r.results);
    };

    start() {
        if (this._destroyed) return;
        if (this._started) return;
        this._started = true;
        this.update();
    }

    update() {
        this._search!._searchFrontend.postMessageToSearchBackend("search", {
            sessionId: this._id,
            normalizedQuery: this.normalizedQuery,
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

    async _gotResults(results: SearchResult[]) {
        if (this._destroyed) return;
        this._resultCount = results.length;
        await this._search!.newResults(this, results);
        this._resultsLoadedResolve();
    }
}

export interface SearchOpts {
    sessionId: number;
    normalizedQuery: string;
}

export interface SearchBackendActions<T> {
    search: (this: T, o: SearchOpts) => void;
}

export interface SearchResult {
    trackUid: ArrayBuffer;
    distance: number;
}

export interface SearchResults {
    type: "searchResults";
    searchSessionId: number;
    results: SearchResult[];
}

export type SearchWorkerResult = SearchResults | DatabaseClosedResult;

type SFDeps = SelectDeps<"workerWrapper">;

class SearchFrontend extends WorkerFrontend<SearchWorkerResult> {
    searchController: SearchController;
    constructor(searchController: SearchController, deps: SFDeps) {
        super("search", deps.workerWrapper);
        this.searchController = searchController;
    }

    receiveMessageFromBackend(r: SearchWorkerResult) {
        switch (r.type) {
            case "searchResults":
                const session = this.searchController.getSession();
                if (session) {
                    session._messaged(r);
                }
                break;
            case "databaseClosed":
                this.searchController.databaseClosed();
                break;
        }
    }

    postMessageToSearchBackend = <T extends string & keyof SearchBackendActions<unknown>>(
        action: T,
        ...args: Parameters<SearchBackendActions<unknown>[T]>
    ) => {
        this.postMessageToBackend(action, args);
    };
}
export type SearchControllerEventsMap = DatabaseEventsMap;
type Deps = TrackContainerControllerDeps & SelectDeps<"metadataManager" | "playlist"> & SFDeps;

export default class SearchController extends TrackContainerController<"search"> {
    _searchFrontend: SearchFrontend;
    private _metadataManager: MetadataManagerFrontend;
    private _inputNode: DomWrapper;
    private _dataListNode: DomWrapper;
    private _inputContainerNode: DomWrapper;
    private _playlist: PlaylistController;
    private _visible: boolean;
    private _nextSessionId: number;
    private _candidateTrackIndex: number;
    private _searchHistory: SearchHistoryEntry[];
    private _session: SearchSession | null;
    private _topHistoryEntry: null | SearchHistoryEntry;

    constructor(opts: { itemHeight: number; target: DomWrapperSelector }, deps: Deps) {
        super(
            {
                ...opts,
                trackRaterZIndex: zIndex,
                playedTrackOriginUsesTrackViewIndex: false,
                supportsDragging: false,
                supportsRemove: false,
            },
            deps,
            "search",
            "searchController"
        );
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

        this._persistHistory = throttle(this._persistHistory, 2500, this);
        this._persistQuery = throttle(this._persistQuery, 2500, this);

        this._playlist.on("playlistNoNextTrackWillBeAvailable", this._candidateTracksNeeded);

        this.$input()
            .addEventListener(`input`, this._gotInput)
            .addEventListener(`focus`, this._inputFocused)
            .addEventListener(`blur`, this._inputBlurred)
            .addEventListener(`keydown`, this._inputKeydowned);
        this.$().find(`.search-next-tab-focus`).addEventListener(`focus`, this._searchNextTabFocused);

        this.$().find(`.js-search-empty`).setHtml(noSearchResultsTemplate);
        this._preferencesLoaded = this.loadPreferences();
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    trackIndexChanged(): void {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    undoForTrackRemovalExpired(): void {}
    async shouldUndoTracksRemoved(_tracksRemovedCount: number): Promise<boolean> {
        return false;
    }

    shutdownSavePreferences = (preferences: PreferenceArray) => {
        preferences.push({
            key: "searchHistory",
            value: this._searchHistory.map(v => v.toJSON()),
        });
        preferences.push({
            key: "searchQuery",
            value: this._getRawQuery(),
        });
        super.shutdownSavePreferences(preferences);
    };

    loadPreferences = async () => {
        this.tryLoadHistory(this.dbValues.searchHistory);
        await this._tryLoadQuery(this.dbValues.searchQuery);
        this.getPlayedTrackOrigin().originInitialTracksLoaded();
        super.loadPreferences();
    };

    bindKeyboardShortcuts = () => {
        super.bindKeyboardShortcuts();
        this._keyboardShortcutContext.addShortcut(`ctrl+f`, this._focusInput);
    };

    createSingleTrackMenu = () => {
        const menu: MenuItemSpecList = [];

        menu.push({
            id: `play`,
            content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
            onClick: () => {
                this.changeTrackExplicitly(this._singleTrackViewSelected!.track(), {
                    trackView: this._singleTrackViewSelected!,
                    origin: this.getPlayedTrackOrigin(),
                });
                this._singleTrackMenu!.hide();
            },
        });

        menu.push({
            id: `add-to-playlist`,
            content: this.menuContext.createMenuItem(
                `Add to playlist`,
                `material-icons small-material-icon add-to-playlist`
            ),
            onClick: () => {
                this._addTracksToPlaylist([this._singleTrackViewSelected!.track()]);
                this._singleTrackMenu!.hide();
            },
        });

        menu.push({
            divider: true,
        });

        menu.push({
            id: `track-rating`,
            content: () => this._trackRater.$(),
            onClick(e) {
                e.preventDefault();
            },
        });

        const ret = this.menuContext.createVirtualButtonMenu({ menu, zIndex });
        ret.on(`willHideMenu`, () => {
            this._singleTrackViewSelected = null;
        });
        return ret;
    };

    createMultiSelectionMenuSpec = (target: DomWrapper): ButtonMenuCallerOptions => {
        const haveTouch = this.env.hasTouch();
        const menu: MenuItemSpecList = [];

        const addToPlaylist = {
            id: `add-to-playlist`,
            disabled: false,
            content: this.menuContext.createMenuItem(
                `Add to playlist`,
                `material-icons small-material-icon add-to-playlist`
            ),
            enabledPredicate: moreThan0Selected,
            onClick: actionHandler(false, this, `_addSelectionToPlaylist`),
        };

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: actionHandler(false, this, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected,
            });

            menu.push(addToPlaylist);

            menu.push({
                divider: true,
            });

            menu.push({
                id: `clear-selection`,
                disabled: true,
                content: this.menuContext.createMenuItem(
                    `Select none`,
                    `material-icons small-material-icon crop_square`
                ),
                onClick: actionHandler(true, this, `clearSelection`),
                enabledPredicate: moreThan0Selected,
            });

            menu.push({
                id: `select-all`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Select all`, `material-icons small-material-icon select_all`),
                onClick: actionHandler(true, this, `selectAll`),
                enabledPredicate: lessThanAllSelected,
            });

            menu.push({
                divider: true,
            });

            menu.push({
                disabled: true,
                id: `track-rating`,
                enabledPredicate: exactly1Selected,
                content: () => {
                    return this.getTrackRater().$();
                },
                onClick(e) {
                    e.preventDefault();
                },
            });
        } else {
            menu.push(addToPlaylist);
        }

        if (haveTouch) {
            menu.push({
                divider: true,
            });
        }

        return {
            target,
            menu,
            zIndex,
            align,
            manualTrigger: true,
        };
    };

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

    getSession() {
        return this._session;
    }

    tabWillHide = () => {
        super.tabWillHide();
        this._visible = false;
        this.$input().blur();
        this.$().find(`.search-next-tab-focus`).hide();
    };

    tabDidShow = (thereWasNoPreviousTab: boolean) => {
        this.$().find(`.search-next-tab-focus`).show("block");
        this._visible = true;

        if ((!this.env.isMobile() || !this._session || !this._session.resultCount()) && !thereWasNoPreviousTab) {
            this.$input().focus();
        }
        super.tabDidShow(thereWasNoPreviousTab);
        this.globalEvents.setLastShownPlayedTrackOrigin(this.getPlayedTrackOrigin());
    };

    tryLoadHistory = (values?: string[]) => {
        if (Array.isArray(values) && values.length > 0) {
            values = values.slice(0, MAX_SEARCH_HISTORY_ENTRIES + 1);
            this._searchHistory = values.map(query => new SearchHistoryEntry(this.page, query));

            const parent = this.$historyDataList();
            for (let i = 0; i < this._searchHistory.length; ++i) {
                parent.append(this._searchHistory[i]!.$());
            }
        }
    };

    _tryLoadQuery = async (value?: string) => {
        if (!value) value = ``;
        await this._metadataManager.ready();
        this.$input().setValue(value);
        await this._performQuery(this.$input().value() as string);
    };

    _candidateTracksNeeded = (
        submitCandidate: Parameters<PlaylistControllerEventsMap["playlistNoNextTrackWillBeAvailable"]>[0]
    ) => {
        if (this.length > 0) {
            const priority = this._visible
                ? 0
                : this.globalEvents.getLastShownPlayedTrackOrigin() === this.getPlayedTrackOrigin()
                ? 1
                : 2;
            const index = (this._candidateTrackIndex + 1) % this.length;
            const trackView = this._trackViews[index]!;
            this._candidateTrackIndex = index;
            submitCandidate(trackView.track(), trackView, this.getPlayedTrackOrigin(), priority);
        }
    };

    changeTrackExplicitly = (track: Track, { trackView, origin }: ChangeTrackOpts) => {
        this._candidateTrackIndex = trackView.getIndex();
        this._playlist.changeTrackExplicitly(track, {
            trackView,
            origin,
        });
    };

    candidatePlaylistTrackWillPlay = (playlistTrack: TrackWithOrigin) => {
        const index = playlistTrack.trackView()!.getIndex();
        if (
            this._candidateTrackIndex === -1 &&
            index >= 0 &&
            index < this.length &&
            this._trackViews[index] === playlistTrack.trackView()
        ) {
            this._candidateTrackIndex = index;
        }
    };

    _addTracksToPlaylist = (tracks: Track[]) => {
        this._playlist.add(tracks);
    };

    _addSelectionToPlaylist = () => {
        this._addTracksToPlaylist(this.getSelection().map(trackView => trackView.track()));
        this.clearSelection();
    };

    _focusInput = () => {
        this.$input().focus();
    };

    newResults = async (session: SearchSession, results: SearchResult[]) => {
        if (this._session !== session) {
            session.destroy();
            return;
        }

        let diff = false;
        if (results.length !== this._trackViews.length) {
            diff = true;
        } else {
            for (let i = 0; i < results.length; ++i) {
                if (indexedDB.cmp(results[i]!.trackUid, this._trackViews[i]!.track().uid()) !== 0) {
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
            const { _metadataManager } = this;
            const tracks = await Promise.all(
                results.map(result => _metadataManager.getTrackByFileReferenceAsync(result.trackUid))
            );
            this.add(tracks);
        } else {
            this.listBecameEmpty();
        }

        this._playlist.invalidateNextPlaylistTrackFromOrigin(this.getPlayedTrackOrigin());
        if (!this._playlist.hasNextTrack() && this.length > 0) {
            const index = ++this._candidateTrackIndex % this.length;
            this._candidateTrackIndex = index;
            const trackView = this._trackViews[index]!;
            this._playlist.playlistTrackCandidateFromOrigin(trackView.track(), trackView, this.getPlayedTrackOrigin());
        }
    };

    playingTrackAddedToList = (_track: Track, trackView: TrackView) => {
        this._candidateTrackIndex = trackView.getIndex();
    };

    clear = () => {
        this.destroyTrackViews();
        if (this._session) {
            this._session.destroy();
            this._session = null;
        }
        this.listBecameEmpty();
    };

    _inputKeydowned = (e: KeyboardEvent) => {
        const target = e.target as HTMLInputElement;
        if (e.key === `Enter`) {
            target.blur();
            this.selectFirst();
        } else if (e.key === `Escape` && !target.value) {
            target.blur();
        } else if (e.key === `ArrowUp` || e.key === `ArrowDown`) {
            if (this._session && this._session.resultCount() > 0) {
                e.preventDefault();
                target.blur();
                this.selectFirst();
            }
        }
    };

    _getRawQuery = () => {
        return this._session ? this._session.rawQuery : ``;
    };

    _inputBlurred = () => {
        this.$inputContainer().removeClass(`focused`);
        if (this._session && this._session.resultCount() > 0) {
            if (this._topHistoryEntry === null) {
                const searchHistory = this._searchHistory;
                const newQuery = this._session.rawQuery;

                for (let i = 0; i < searchHistory.length; ++i) {
                    if (searchHistory[i]!.query() === newQuery) {
                        this._topHistoryEntry = searchHistory[i]!;

                        for (let j = i; j > 0; --j) {
                            searchHistory[j] = searchHistory[j - 1]!;
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
                    this._searchHistory.pop()!.destroy();
                }
            } else {
                this._topHistoryEntry.update(this._session.rawQuery);
            }
            this._persistHistory();
        }
    };

    _searchNextTabFocused = (e: FocusEvent) => {
        if (this._trackViews.length > 0) {
            (e.target as any).blur();
            this.selectFirst();
        }
    };

    _inputFocused = () => {
        this.$inputContainer().addClass(`focused`);
    };

    destroyTrackViews = () => {
        this._candidateTrackIndex = -1;
        this.clearSelection();

        const { length } = this;

        for (let i = 0; i < length; ++i) {
            this._trackViews[i]!.destroy();
        }
        this._trackViews.length = 0;
        if (length !== 0) {
            this.emit("lengthChanged", 0, length);
        }
        this._fixedItemListScroller.resize();
    };

    _performQuery = async (value: string) => {
        this.$().find(`.search-query`).setText(value);

        if (value.length === 0) {
            this._topHistoryEntry = null;
        }

        const normalized = normalizeQuery(value);

        if (this._session && this._session.normalizedQuery === normalized) {
            return;
        }

        if (normalized.length <= 1) {
            this.clear();
            this._playlist.invalidateNextPlaylistTrackFromOrigin(this.getPlayedTrackOrigin());
            this.$().find(`.js-search-empty .search-text-container`).hide();
            return;
        } else {
            this.$().find(`.js-search-empty .search-text-container`).show("block");
        }

        if (this._session) {
            this._session.destroy();
        }
        this._session = new SearchSession(this, value, normalized);
        this._session.start();
        await this._session.resultsLoaded();
    };

    _persistQuery = () => {
        void this.db.set("searchQuery", this._getRawQuery());
    };

    _persistHistory = () => {
        void this.db.set(
            "searchHistory",
            this._searchHistory.map(v => v.toJSON())
        );
    };

    _gotInput = () => {
        const value = this.$input().value() as string;
        void this._performQuery(value);
        this._persistQuery();
    };

    playFirst = () => {
        if (!this.length) return;
        const firstSelectedTrack = this._selectable.first();
        if (firstSelectedTrack) {
            this.changeTrackExplicitly(firstSelectedTrack.track(), {
                trackView: firstSelectedTrack,
                origin: this.getPlayedTrackOrigin(),
            });
            return;
        }

        const firstView = this._trackViews.first();
        if (firstView) {
            this.changeTrackExplicitly(firstView.track(), {
                trackView: firstView,
                origin: this.getPlayedTrackOrigin(),
            });
        }
    };

    listBecameEmpty = () => {
        this.$().find(`.js-search-empty`).show("block");
        this.$().find(`.js-tracklist`).hide();
    };

    listBecameNonEmpty = () => {
        this.$().find(`.js-search-empty`).hide();
        this.$().find(`.js-tracklist`).show("block");
    };

    /* eslint-disable class-methods-use-this */
    didAddTracksToView() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */
}

export default interface SearchController extends DatabaseClosedEmitterTrait {}

SearchController.prototype._gotInput = throttle(SearchController.prototype._gotInput, 33);
Object.assign(SearchController.prototype, DatabaseClosedEmitterTrait);
