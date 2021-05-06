import { PlaylistMode, PreferenceArray, SerializedPlaylistTrack } from "shared/src/preferences";
import { throttle } from "shared/util";
import { SelectDeps } from "ui/Application";
import MetadataManagerFrontend, { Track } from "ui/metadata/MetadataManagerFrontend";
import { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import TrackContainerController, {
    ChangeTrackOpts,
    DUMMY_PLAYLIST_TRACK,
    PlayedTrackOrigin,
    TrackChangeKind,
    TrackContainerControllerDeps,
    TrackWithOrigin,
} from "ui/tracks/TrackContainerController";
import TrackSorterTrait, { TrackSorterTrait as TrackSorterTraitI } from "ui/tracks/TrackSorterTrait";
import TrackView from "ui/tracks/TrackView";
import { ALIGN_RIGHT_SIDE_AT_TOP as align, VirtualButtonMenu } from "ui/ui/ActionMenu";
import ApplicationPreferencesBindingContext from "ui/ui/ApplicationPreferencesBindingContext";
import {
    actionHandler,
    ButtonMenuCallerOptions,
    exactly1Selected,
    lessThanAllSelected,
    MenuItemSpecList,
    moreThan0Selected,
    moreThan1Selected,
} from "ui/ui/MenuContext";
import Snackbar, { ACTION_CLICKED } from "ui/ui/Snackbar";
import { ABOVE_TOOLBAR_Z_INDEX as zIndex } from "ui/ui/ToolbarManager";

const PLAYLIST_TRACKS_ADDED_TAG = `playlist-tracks-added`;
const PLAYLIST_TRACKS_REMOVED_TAG = `playlist-tracks-removed`;
const MAX_ERRORS = 50;
const MAX_HISTORY = 25;

const playlistEmptyTemplate = `<p>Playlist empty. There <span class="media-library-size"></span> available in your media library.</p>`;

let nextPlayId = 10;

export interface PlaylistControllerEventsMap {
    playlistTrackPlayingStatusChanged: (two: TrackWithOrigin) => void;
    playlistNoNextTrackWillBeAvailable: (
        handler: (track: Track, trackView: TrackView, origin: PlayedTrackOrigin, priority: number) => void
    ) => void;
    playlistNextTrackChanged: () => void;
    playlistStopped: () => void;
    playlistHistoryChanged: () => void;
    playlistCurrentTrackChanged: (
        t: Track,
        o: { isUserInitiatedSkip: boolean; initialProgress: number; resumeIfPaused: boolean }
    ) => void;
    playlistModeChanged: (newMode: PlaylistMode, oldMode: PlaylistMode) => void;
}

type Deps = SelectDeps<"snackbar" | "applicationPreferencesBindingContext" | "metadataManager"> &
    TrackContainerControllerDeps;

export default class PlaylistController extends TrackContainerController<"playlist"> {
    snackbar: Snackbar;
    applicationPreferencesBindingContext: ApplicationPreferencesBindingContext;
    metadataManager: MetadataManagerFrontend;
    private _mode: PlaylistMode;
    private _nextPlaylistTrackFromCurrentMode: (playlistTrack: TrackWithOrigin) => TrackWithOrigin;
    private _currentPlaylistTrack: TrackWithOrigin;
    private _nextPlaylistTrack: TrackWithOrigin;
    private _currentPlayId: number;
    private _trackHistory: TrackWithOrigin[];
    private _errorCount: number;
    private _pendingTrackRemovals: Track[];

    constructor(opts: { itemHeight: number; target: DomWrapperSelector }, deps: Deps) {
        super(
            {
                ...opts,
                trackRaterZIndex: zIndex,
                playedTrackOriginUsesTrackViewIndex: true,
                supportsRemove: true,
                supportsDragging: true,
            },
            deps,
            "playlist",
            "playlistController"
        );

        this.snackbar = deps.snackbar;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.metadataManager = deps.metadataManager;

        this._mode = "normal";
        this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromNormalMode;
        this._currentPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;

        this._currentPlayId = -1;
        this._trackHistory = [];
        this._errorCount = 0;

        this._persistHistory = throttle(this._persistHistory, 1000);
        this._persistMode = throttle(this._persistMode, 500);
        this._removePendingTracks = throttle(this._removePendingTracks, 1000);

        this.on("lengthChanged", this._lengthChanged);
        this._persistPlaylist = throttle(this._persistPlaylist, 500);
        this.metadataManager.on("allFilesPersisted", this._persistPlaylist);
        this.metadataManager.on("mediaLibrarySizeChanged", this._mediaLibrarySizeUpdated);
        this.metadataManager.on("newTrackFromTmpFileReceived", this._newTrackFromTmpFile);
        this.metadataManager.on("trackBackingFileRemoved", this._trackBackingFileRemoved);

        this._pendingTrackRemovals = [];

        this.$().find(`.js-playlist-empty`).setHtml(playlistEmptyTemplate);
        this._mediaLibrarySizeUpdated(this.metadataManager.getMediaLibrarySize());
        this._preferencesLoaded = this.loadPreferences();
    }

    shutdownSavePreferences(preferences: PreferenceArray) {
        if (this.metadataManager.areAllFilesPersisted()) {
            // TODO limit could be more on desktop
            if (this.length < 5000) {
                const trackUids = this._trackViews.map(v => v.track().uid());
                preferences.push({
                    key: "playlistContents",
                    value: trackUids,
                });
            }

            preferences.push({
                key: "playlistHistory",
                value: this._trackHistory.map(v => v.toJSON()),
            });
        }

        preferences.push({
            key: "playlistMode",
            value: this._mode,
        });
        super.shutdownSavePreferences(preferences);
    }

    async loadPreferences() {
        const persistedPlaylist = this.dbValues.playlistContents;
        await this._loadPersistedPlaylist(persistedPlaylist);
        this.getPlayedTrackOrigin().originInitialTracksLoaded();

        const playlistHistory = this.dbValues.playlistHistory;
        await this._loadPersistedHistory(playlistHistory);

        this.tryChangeMode(this.dbValues.playlistMode);
        super.loadPreferences();
    }

    getCurrentPlaylistTrack() {
        return this._currentPlaylistTrack;
    }

    hasNextTrack() {
        return !this._nextPlaylistTrack.isDummy();
    }

    getNextPlaylistTrack() {
        if (this._nextPlaylistTrack.isDummy()) {
            const nextPlaylistTrack = this._maybeGetNextPlaylistTrackFromAnotherOrigin();
            if (nextPlaylistTrack) {
                this._nextPlaylistTrack = nextPlaylistTrack;
                return this._nextPlaylistTrack;
            }
            return DUMMY_PLAYLIST_TRACK;
        }
        return this._nextPlaylistTrack;
    }

    playlistTrackCandidateFromOrigin(track: Track, trackView: TrackView, origin: PlayedTrackOrigin) {
        if (this._nextPlaylistTrack.isDummy()) {
            const playlistTrack = new TrackWithOrigin(track, trackView, origin);
            this._nextPlaylistTrack = playlistTrack;
            this.emit("playlistNextTrackChanged");
        }
    }

    invalidateNextPlaylistTrackFromOrigin(origin: PlayedTrackOrigin) {
        if (this._nextPlaylistTrack.isFromOrigin(origin)) {
            this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
            this._updateNextTrack();
        }
    }

    listBecameNonEmpty() {
        this.$().find(`.js-playlist-empty`).hide();
        this.$().find(`.js-tracklist`).show("block");
    }

    listBecameEmpty() {
        this.$().find(`.js-playlist-empty`).show("block");
        this.$().find(`.js-tracklist`).hide();
    }

    playFirst() {
        if (!this.length) return;
        const firstSelectedTrackView = this._selectable.first();
        if (firstSelectedTrackView) {
            this.changeTrackExplicitly(firstSelectedTrackView.track(), {
                trackView: firstSelectedTrackView,
                origin: this.getPlayedTrackOrigin(),
            });
            return;
        }
        const nextPlaylistTrack = this.getNextPlaylistTrack();

        if (!nextPlaylistTrack.isDummy()) {
            this.changeTrackExplicitly(nextPlaylistTrack.track()!, {
                trackView: nextPlaylistTrack.trackView()!,
                origin: nextPlaylistTrack.origin()!,
            });
        } else {
            const firstView = this._trackViews.first();
            if (firstView) {
                this.changeTrackExplicitly(firstView.track(), {
                    trackView: firstView,
                    origin: this.getPlayedTrackOrigin(),
                });
            }
        }
    }

    stop() {
        this._setCurrentTrack(DUMMY_PLAYLIST_TRACK);
        this._errorCount = 0;
        this.emit("playlistStopped");
    }

    trackIndexChanged() {
        this.edited();
        this._lengthChanged();
    }

    undoForTrackRemovalExpired() {
        this.snackbar.removeByTag(PLAYLIST_TRACKS_REMOVED_TAG);
        this._persistPlaylist();
    }

    didAddTracksToView(tracks: Track[]) {
        const addedTracksCount = tracks.length;
        const tracksWord = addedTracksCount === 1 ? `track` : `tracks`;
        void this.snackbar.show(`Added ${addedTracksCount} ${tracksWord} to the playlist`, {
            visibilityTime: 3000,
            tag: PLAYLIST_TRACKS_ADDED_TAG,
        });
    }

    async shouldUndoTracksRemoved(tracksRemovedCount: number) {
        const tracksWord = tracksRemovedCount === 1 ? `track` : `tracks`;
        const outcome = await this.snackbar.show(`Removed ${tracksRemovedCount} ${tracksWord} from the playlist`, {
            action: `undo`,
            visibilityTime: 5000,
            tag: PLAYLIST_TRACKS_REMOVED_TAG,
        });
        return outcome === ACTION_CLICKED.value;
    }

    /* eslint-disable class-methods-use-this */
    candidatePlaylistTrackWillPlay() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    async restoreSerializedPlaylistTrack(serializedPlaylistTrack: SerializedPlaylistTrack, progress: number) {
        const playlistTrack = await this._deserializePlaylistTrack(serializedPlaylistTrack);

        if (playlistTrack) {
            this._changeTrack(playlistTrack, true, "implicit", { progress });
            return true;
        }
        return false;
    }

    changeTrackExplicitly(track: Track, { doNotRecordHistory = false, trackView, origin }: ChangeTrackOpts): void {
        const playlistTrack = new TrackWithOrigin(track, trackView, origin);
        this._changeTrack(playlistTrack, !!doNotRecordHistory, "explicit");
    }

    getCurrentTrack() {
        return this.getCurrentPlaylistTrack().track();
    }

    getNextTrack() {
        return this.getNextPlaylistTrack().track();
    }

    getPreviousTrack() {
        if (this._trackHistory.length > 1) {
            return this._trackHistory[this._trackHistory.length - 2]!.track();
        }
        return null;
    }

    getCurrentPlayId() {
        return this._currentPlayId;
    }

    trackPlayedSuccessfully() {
        this._errorCount = 0;
    }

    hasHistory() {
        return this._trackHistory.length > 0;
    }

    prev() {
        const history = this._trackHistory;
        const { length } = history;
        if (length > 0) {
            let playlistTrack;
            while (history.length > 0) {
                playlistTrack = this._trackHistory.pop()!;
                if (playlistTrack.hasError()) {
                    playlistTrack = null;
                } else {
                    break;
                }
            }

            if (length !== history.length) {
                this.emit("playlistHistoryChanged");
            }

            if (!playlistTrack) {
                this.prev();
            } else {
                this.changeTrackExplicitly(playlistTrack.track()!, {
                    trackView: playlistTrack.trackView()!,
                    origin: playlistTrack.origin()!,
                    doNotRecordHistory: true,
                });
            }
            this._persistHistory();
        } else {
            this.emit("playlistHistoryChanged");
        }
    }

    next(userInitiated: boolean): boolean {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            if (!userInitiated) {
                this.stop();
            }
            return false;
        } else {
            this._changeTrackImplicitly(nextPlaylistTrack, false, userInitiated);
        }
        return true;
    }

    tryChangeMode(mode?: PlaylistMode) {
        if (!mode) {
            return;
        }
        const oldMode = this._mode;
        if (mode === oldMode) {
            return false;
        }

        switch (mode) {
            case "normal":
                this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromNormalMode;
                break;
            case "shuffle":
                this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromShuffleMode;
                break;
            case "repeat":
                this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromRepeatMode;
                break;
            default:
                return false;
        }

        this._mode = mode;
        this.emit("playlistModeChanged", mode, oldMode);
        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._updateNextTrack();
        this._persistMode();
        return true;
    }

    getMode() {
        return this._mode;
    }

    async _deserializePlaylistTracks(serializedPlaylistTracks: SerializedPlaylistTrack[]): Promise<TrackWithOrigin[]> {
        await this.playedTrackOriginContext.allOriginsInitialTracksLoaded();
        const tracks = await this.metadataManager.mapTrackUidsToTracks(
            serializedPlaylistTracks.map(serializedPlaylistTrack => serializedPlaylistTrack.trackUid)
        );
        return tracks
            .map((track, index) => {
                const serializedPlaylistTrack = serializedPlaylistTracks[index]!;
                const origin = this.playedTrackOriginContext.originByName(serializedPlaylistTrack.origin);
                if (!origin) {
                    return null;
                }
                const trackView = origin.trackViewByIndex(serializedPlaylistTrack.index);

                if (!trackView || trackView.track() !== track) {
                    return null;
                }

                return new TrackWithOrigin(track, trackView, origin);
            })
            .filter<Exclude<TrackWithOrigin, null>>(
                (v: TrackWithOrigin | null): v is Exclude<TrackWithOrigin, null> => v !== null
            );
    }

    async _deserializePlaylistTrack(serializedPlaylistTrack: SerializedPlaylistTrack) {
        await this.playedTrackOriginContext.allOriginsInitialTracksLoaded();
        const { index, trackUid, origin: originName } = serializedPlaylistTrack;
        const track = await this.metadataManager.getTrackByFileReferenceAsync(trackUid);

        if (track) {
            const origin = this.playedTrackOriginContext.originByName(originName);

            if (origin) {
                const trackView = origin.trackViewByIndex(index);

                if (trackView && trackView.track() === track) {
                    return new TrackWithOrigin(track, trackView, origin);
                }
            }
        }
        return null;
    }

    _mediaLibrarySizeUpdated = (count: number) => {
        const text = count === 1 ? `is 1 track` : `are ${count} tracks`;
        this.$().find(`.js-playlist-empty .media-library-size`).setText(text);
    };

    _removePendingTracks() {
        const tracksToRemove = new Set<Track>(this._pendingTrackRemovals);
        this._pendingTrackRemovals = [];
        const viewsToRemove = [];
        for (let i = 0; i < this._trackViews.length; ++i) {
            const trackView = this._trackViews[i]!;
            if (tracksToRemove.has(trackView.track())) {
                viewsToRemove.push(trackView);
            }
        }

        if (tracksToRemove.has(this._currentPlaylistTrack.track()!)) {
            this.stop();
        }

        void this.removeTrackViews(viewsToRemove, { silent: true });
        this._trackHistory = this._trackHistory.filter(t => !tracksToRemove.has(t.track()!));

        this.emit("playlistHistoryChanged");
        this._persistHistory();
    }

    _trackBackingFileRemoved(track: Track) {
        this._pendingTrackRemovals.push(track);
        this._removePendingTracks();
    }

    _newTrackFromTmpFile(track: Track) {
        this.add([track], { noReport: true });
    }

    /* eslint-disable class-methods-use-this */
    playingTrackAddedToList() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    async _loadPersistedHistory(playlistHistory?: SerializedPlaylistTrack[]) {
        if (!playlistHistory || !playlistHistory.length) {
            return;
        }
        await this.metadataManager.ready();
        const deserializedHistory = await this._deserializePlaylistTracks(playlistHistory);
        if (this._trackHistory.length > 0) {
            deserializedHistory.push(...this._trackHistory);
        }
        this._trackHistory = deserializedHistory;
        this._trackHistory.splice(0, Math.max(0, this._trackHistory.length - MAX_HISTORY));
        this.emit("playlistHistoryChanged");
    }

    async _loadPersistedPlaylist(trackUids?: ArrayBuffer[]) {
        if (!trackUids || !trackUids.length) {
            return;
        }
        const tracks = await this.metadataManager.mapTrackUidsToTracks(trackUids);
        this.add(tracks, { noReport: true });
    }

    _persistMode() {
        void this.db.set("playlistMode", this._mode);
    }

    _persistHistory() {
        if (this.metadataManager.areAllFilesPersisted()) {
            void this.db.set(
                "playlistHistory",
                this._trackHistory.map(v => v.toJSON()!)
            );
        }
    }

    _persistPlaylist() {
        if (this.metadataManager.areAllFilesPersisted()) {
            const trackUids = this._trackViews.map(v => v.track().uid());
            void this.db.set("playlistContents", trackUids);
        }
    }

    _lengthChanged = () => {
        this._persistPlaylist();
        this.emit("playlistTrackPlayingStatusChanged", this.getCurrentPlaylistTrack());
        this._updateNextTrack();
    };

    _maybeGetNextPlaylistTrackFromAnotherOrigin() {
        const nextTrackCandidates: {
            track: Track;
            trackView: TrackView;
            origin: PlayedTrackOrigin;
            priority: number;
        }[] = [];
        this.emit("playlistNoNextTrackWillBeAvailable", (track, trackView, origin, priority) => {
            nextTrackCandidates.push({ track, trackView, origin, priority });
        });
        if (nextTrackCandidates.length > 1) {
            nextTrackCandidates.sort((a, b) => a.priority - b.priority);
        }
        if (nextTrackCandidates.length > 0) {
            const [nextTrackCandidate] = nextTrackCandidates;
            const { trackView, track, origin } = nextTrackCandidate!;
            return new TrackWithOrigin(track, trackView, origin);
        }
        return null;
    }

    _nextPlaylistTrackFromNormalMode(playlistTrack: TrackWithOrigin) {
        let index = playlistTrack.getIndex() + 1;

        let ret;
        let trials = 0;

        do {
            index = Math.max(0, index);
            if (index >= this.length) {
                index = 0;
            }

            const trackView = this._trackViews[index];
            if (trackView) {
                ret = new TrackWithOrigin(trackView.track(), trackView, this.getPlayedTrackOrigin());
            }
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret || DUMMY_PLAYLIST_TRACK;
    }

    _nextPlaylistTrackFromShuffleMode(playlistTrack: TrackWithOrigin) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isValidGeneratedFromShuffle()) {
            return nextPlaylistTrack;
        }
        const trackViews = this.getTrackViews();
        const currentTrack = playlistTrack.track()!;
        const nextTrack = nextPlaylistTrack.track()!;

        let maxWeight = 0;
        for (let i = 0; i < trackViews.length; ++i) {
            maxWeight += trackViews[i]!.track().getWeight(currentTrack, nextTrack);
        }

        let target = (Math.random() * maxWeight) | 0;
        for (let i = 0; i < trackViews.length; ++i) {
            const trackView = trackViews[i]!;
            const track = trackView.track();
            const weight = track.getWeight(currentTrack, nextTrack);

            if (target < weight) {
                return new TrackWithOrigin(track, trackView, this.getPlayedTrackOrigin(), {
                    generatedFromShuffle: true,
                });
            }
            target -= weight;
        }

        target = (Math.random() * trackViews.length) | 0;
        const view = trackViews[target];

        if (view && view.track()) {
            return new TrackWithOrigin(view.track(), view, this.getPlayedTrackOrigin(), {
                generatedFromShuffle: true,
            });
        }
        return nextPlaylistTrack;
    }

    _nextPlaylistTrackFromRepeatMode(currentPlaylistTrack: TrackWithOrigin) {
        if (currentPlaylistTrack.hasError()) {
            return this._nextPlaylistTrackFromNormalMode(currentPlaylistTrack);
        }
        return currentPlaylistTrack;
    }

    _setCurrentTrack(playlistTrack: TrackWithOrigin) {
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            currentPlaylistTrack.track()!.stopPlaying();
        }

        this._setCurrentPlaylistTrack(playlistTrack);

        if (!playlistTrack.isDummy()) {
            playlistTrack.track()!.startPlaying();
        }

        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._updateNextTrack();
    }

    _nextTrackIsSameAs(playlistTrack: TrackWithOrigin) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            return playlistTrack.isDummy();
        }
        return nextPlaylistTrack.track() === playlistTrack.track();
    }

    _changeTrackImplicitly(
        playlistTrack: TrackWithOrigin,
        doNotRecordHistory: boolean,
        isUserInitiatedSkip: boolean = false
    ) {
        return this._changeTrack(playlistTrack, !!doNotRecordHistory, "implicit", { isUserInitiatedSkip });
    }

    _setNextPlaylistTrack(playlistTrack: TrackWithOrigin) {
        this._nextPlaylistTrack = playlistTrack;
    }

    _setCurrentPlaylistTrack(playlistTrack: TrackWithOrigin) {
        this._currentPlaylistTrack = playlistTrack;
    }

    _updateNextTrack() {
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();
        const nextPlaylistTrack = this._nextPlaylistTrackFromCurrentMode(currentPlaylistTrack);
        this._setNextPlaylistTrack(nextPlaylistTrack);

        if (this.getNextPlaylistTrack().hasError()) {
            this._setNextPlaylistTrack(DUMMY_PLAYLIST_TRACK);
        }

        this.emit("playlistNextTrackChanged");
    }

    _changeTrack(
        playlistTrack: TrackWithOrigin,
        doNotRecordHistory: boolean,
        trackChangeKind: TrackChangeKind,
        { isUserInitiatedSkip = false, progress = 0 }: { isUserInitiatedSkip?: boolean; progress?: number } = {
            isUserInitiatedSkip: false,
            progress: 0,
        }
    ): void {
        if (!playlistTrack || playlistTrack.isDummy() || this._errorCount >= MAX_ERRORS) {
            this._errorCount = 0;
            this._setCurrentTrack(DUMMY_PLAYLIST_TRACK);
            this.emit("playlistStopped");
            return;
        }
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            if (!doNotRecordHistory) {
                if (this._trackHistory.push(currentPlaylistTrack) > MAX_HISTORY) {
                    this._trackHistory.shift();
                }
                this.emit("playlistHistoryChanged");
                this._persistHistory();
            }
        }

        this._setCurrentTrack(playlistTrack);
        const trackHasError = playlistTrack.hasError();
        if (trackHasError && trackChangeKind === "implicit") {
            this._errorCount++;
            if (this._mode === `repeat` && this.length > 1) {
                playlistTrack = this._nextPlaylistTrackFromNormalMode(playlistTrack);
                this._setCurrentTrack(playlistTrack);
            } else {
                this.next(false);
            }
        }

        progress = Math.max(0, Math.min(1, +progress || 0));
        const resumeIfPaused = trackChangeKind === "explicit" || isUserInitiatedSkip;
        this._currentPlayId = nextPlayId++;
        this.emit("playlistTrackPlayingStatusChanged", playlistTrack);
        this.emit("playlistCurrentTrackChanged", playlistTrack.track()!, {
            isUserInitiatedSkip,
            initialProgress: progress,
            resumeIfPaused,
        });
        playlistTrack.startedPlay();
    }

    createSingleTrackMenu(): VirtualButtonMenu {
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
            id: `remove-from-playlist`,
            content: this.menuContext.createMenuItem(
                `Remove from playlist`,
                `material-icons small-material-icon delete`
            ),
            onClick: () => {
                this.removeTrackView(this._singleTrackViewSelected!);
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
                e.preventRipple();
            },
        });

        const ret = this.menuContext.createVirtualButtonMenu({ menu, zIndex });
        ret.on(`willHideMenu`, () => {
            this._singleTrackViewSelected = null;
        });
        return ret;
    }

    createMultiSelectionMenuSpec(target: DomWrapper): ButtonMenuCallerOptions {
        const haveTouch = this.env.hasTouch();
        const menu: MenuItemSpecList = [];

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: actionHandler(false, this, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected,
            });
        }

        menu.push({
            id: `remove-from-playlist`,
            disabled: true,
            content: this.menuContext.createMenuItem(
                `Remove from playlist`,
                `material-icons small-material-icon delete`
            ),
            onClick: actionHandler(false, this, `removeSelected`),
            enabledPredicate: moreThan0Selected,
        });

        menu.push({
            divider: true,
        });

        if (!haveTouch) {
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
        }

        menu.push({
            id: `sort`,
            disabled: true,
            content: this.menuContext.createMenuItem(`Sort by`, `glyphicon glyphicon-sort`),
            enabledPredicate: moreThan1Selected,
            children: [
                {
                    id: `sort-by-album`,
                    content: this.menuContext.createMenuItem(`Album`, `material-icons small-material-icon album`),
                    onClick: actionHandler(true, this, `sortByAlbum`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-artist`,
                    content: this.menuContext.createMenuItem(`Artist`, `material-icons small-material-icon mic`),
                    onClick: actionHandler(true, this, `sortByArtist`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-album-artist`,
                    content: this.menuContext.createMenuItem(
                        `Album artist`,
                        `material-icons small-material-icon perm_camera_mic`
                    ),
                    onClick: actionHandler(true, this, `sortByAlbumArtist`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-title`,
                    content: this.menuContext.createMenuItem(`Title`, `material-icons small-material-icon music_note`),
                    onClick: actionHandler(true, this, `sortByTitle`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-rating`,
                    content: this.menuContext.createMenuItem(`Rating`, `material-icons small-material-icon grade`),
                    onClick: actionHandler(true, this, `sortByRating`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-duration`,
                    content: this.menuContext.createMenuItem(
                        `Duration`,
                        `material-icons small-material-icon access_time`
                    ),
                    onClick: actionHandler(true, this, `sortByDuration`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    divider: true,
                },
                {
                    id: `sort-by-shuffling`,
                    content: this.menuContext.createMenuItem(`Shuffle`, `material-icons small-material-icon shuffle`),
                    onClick: actionHandler(true, this, `sortByShuffling`),
                    enabledPredicate: moreThan1Selected,
                },
                {
                    id: `sort-by-reverse-order`,
                    content: this.menuContext.createMenuItem(
                        `Reverse order`,
                        `material-icons small-material-icon undo`
                    ),
                    onClick: actionHandler(true, this, `sortByReverseOrder`),
                    enabledPredicate: moreThan1Selected,
                },
            ],
        });

        if (!haveTouch) {
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
        }

        return {
            target,
            menu,
            zIndex,
            align,
            manualTrigger: true,
        };
    }
}

export default interface PlaylistController extends TrackSorterTraitI {}
Object.assign(PlaylistController.prototype, TrackSorterTrait);
