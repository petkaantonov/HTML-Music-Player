import withDeps from "ApplicationDependencies";
import DraggableSelection from "ui/DraggableSelection";
import {ACTION_CLICKED} from "ui/Snackbar";
import TrackViewOptions from "tracks/TrackViewOptions";
import TrackSorterTrait from "tracks/TrackSorterTrait";
import {ALL_FILES_PERSISTED_EVENT, MEDIA_LIBRARY_SIZE_CHANGE_EVENT} from "metadata/MetadataManagerFrontend";
import TrackContainerController, {LENGTH_CHANGE_EVENT} from "tracks/TrackContainerController";
import {throttle, delay} from "util";
import {ABOVE_TOOLBAR_Z_INDEX as zIndex} from "ui/ToolbarManager";
import {ALIGN_RIGHT_SIDE_AT_TOP as align} from "ui/ActionMenu";
import {actionHandler, moreThan1Selected, moreThan0Selected,
    exactly1Selected, lessThanAllSelected} from "ui/MenuContext";

export const NEXT_TRACK_CHANGE_EVENT = `nextTrackChange`;
export const CURRENT_TRACK_CHANGE_EVENT = `currentTrackChange`;
export const TRACK_PLAYING_STATUS_CHANGE_EVENT = `trackPlayingStatusChange`;
export const HISTORY_CHANGE_EVENT = `historyChange`;
export const MODE_CHANGE_EVENT = `modeChange`;
export const PLAYLIST_STOPPED_EVENT = `playlistStopped`;
export const CANDIDATE_TRACKS_OUTSIDE_PLAYLIST_FOR_NEXT_TRACK_NEEDED_EVENT = `noNextTrackAvailable`;
export const SHUFFLE_MODE = `shuffle`;
export const NORMAL_MODE = `normal`;
export const REPEAT_MODE = `repeat`;

const PLAYLIST_TRACKS_ADDED_TAG = `playlist-tracks-added`;
const PLAYLIST_TRACKS_REMOVED_TAG = `playlist-tracks-removed`;
const PLAYLIST_MODE_KEY = `playlist-mode`;
const PLAYLIST_CONTENTS_KEY = `playlist-contents`;

const KIND_IMPLICIT = 0;
const KIND_EXPLICIT = 1;
const MAX_ERRORS = 200;
const MAX_HISTORY = 500;

const dummyTrack = {};

const playlistEmptyTemplate = `<div class='app-info-status-text'>Playlist empty</div>
  <div class="playlist-empty-instructions">
     <p>There <span class="media-library-size"></span> available in your media library.</p>
</div>`;

class PlaylistTrack {
    constructor(track, trackView, origin, {
        generatedFromShuffle = false
    } = {generatedFromShuffle: false}) {
        if (!track) throw new Error(`track cannot be null`);
        if (!trackView) throw new Error(`trackView cannot be null`);
        if (!origin) throw new Error(`origin cannot be null`);

        this._track = track;
        this._trackView = trackView;
        this._origin = origin;
        this._generatedFromShuffle = generatedFromShuffle;
    }

    isDummy() {
        return this._track === dummyTrack;
    }

    track() {
        if (this.isDummy()) {
            return null;
        }
        return this._track;
    }

    trackView() {
        if (this.isDummy()) {
            return null;
        }
        return this._trackView;
    }

    origin() {
        if (this.isDummy()) {
            return null;
        }
        return this._origin;
    }

    isFromOrigin(origin) {
        return this.origin() === origin;
    }

    getIndex() {
        if (this.isDummy()) {
            return -1;
        }
        return this.origin().usesTrackViewIndex() ? this.trackView().getIndex() : -1;
    }

    formatIndex() {
        return this.getIndex() <= 0 ? `` : `${this.getIndex() + 1}. `;
    }

    formatFullName() {
        return this.isDummy() ? `` : this.track().formatFullName();
    }

    hasError() {
        return this.isDummy() ? false : this.track().hasError();
    }

    startedPlay() {
        if (this.isDummy()) {
            return;
        }
        this.origin().startedPlay(this);
    }

    isValidGeneratedFromShuffle() {
        if (this.isDummy()) return false;
        return this._generatedFromShuffle && this.origin().isTrackViewValidInController(this.trackView());
    }
}

const DUMMY_PLAYLIST_TRACK = new PlaylistTrack(dummyTrack, dummyTrack, dummyTrack);

let nextPlayId = 10;

export default class PlaylistController extends TrackContainerController {
    constructor(opts, deps) {
        opts.trackRaterZIndex = zIndex;
        opts.playedTrackOriginUsesTrackViewIndex = true;
        opts.supportsRemove = true;
        super(opts, deps);
        this.snackbar = deps.snackbar;
        this.applicationPreferencesBindingContext = deps.applicationPreferencesBindingContext;
        this.metadataManager = deps.metadataManager;

        this._mode = NORMAL_MODE;
        this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromNormalMode;
        this._currentPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;

        this._trackListDeletionUndo = null;
        this._currentPlayId = -1;
        this._trackHistory = [];

        this._trackViewOptions = new TrackViewOptions(opts.itemHeight,
                                                      this,
                                                      this.page,
                                                      this._selectable,
                                                      null,
                                                      this.env.hasTouch());
        this._errorCount = 0;

        this._draggable = withDeps({
            recognizerContext: this.recognizerContext,
            page: this.page,
            globalEvents: this.globalEvents
        }, d => new DraggableSelection({
            target: this.$(),
            listView: this,
            scroller: this._fixedItemListScroller,
            mustNotMatchSelector: `.track-rating`,
            mustMatchSelector: `.track-container`
        }, d));

        this._draggable.bindEvents();

        this.on(LENGTH_CHANGE_EVENT, this._lengthChanged.bind(this));
        this._persistPlaylist = throttle(this._persistPlaylist.bind(this), 500);
        this.metadataManager.on(ALL_FILES_PERSISTED_EVENT, this._persistPlaylist);
        this.metadataManager.on(MEDIA_LIBRARY_SIZE_CHANGE_EVENT, this._mediaLibrarySizeUpdated.bind(this));

        if (PLAYLIST_MODE_KEY in this.dbValues) {
            this.tryChangeMode(this.dbValues[PLAYLIST_MODE_KEY]);
        }

        if (PLAYLIST_CONTENTS_KEY in this.dbValues) {
            const persistedPlaylist = this.dbValues[PLAYLIST_CONTENTS_KEY];
            this._loadPersistedPlaylist(persistedPlaylist);
        }

        this.$().find(`.playlist-empty`).setHtml(playlistEmptyTemplate);
        this._mediaLibrarySizeUpdated(this.metadataManager.getMediaLibrarySize());
    }

    getCurrentPlaylistTrack() {
        return this._currentPlaylistTrack;
    }

    hasNextTrack() {
        return !this._nextPlaylistTrack.isDummy();
    }

    getNextPlaylistTrack() {
        if (this._nextPlaylistTrack.isDummy()) {
            const nextPlaylistTrack = this._maybeGetNextPlaylistTrackFromOutsideSource();
            if (nextPlaylistTrack) {
                this._nextPlaylistTrack = nextPlaylistTrack;
                return this._nextPlaylistTrack;
            }
            return DUMMY_PLAYLIST_TRACK;
        }
        return this._nextPlaylistTrack;
    }

    playlistTrackCandidateFromOrigin(track, trackView, origin) {
        if (this._nextPlaylistTrack.isDummy()) {
            const playlistTrack = new PlaylistTrack(track, trackView, origin);
            this._nextPlaylistTrack = playlistTrack;
            this.emit(NEXT_TRACK_CHANGE_EVENT);
        }
    }

    invalidateNextPlaylistTrackFromOrigin(origin) {
        if (this._nextPlaylistTrack.isFromOrigin(origin)) {
            this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
            this._updateNextTrack();
        }
    }

    listBecameNonEmpty() {
        this.$().find(`.playlist-empty`).hide();
        this.$().find(`.playlist-spacer`).show();
        this.$().find(`.tracklist-transform-container`).show();
    }

    listBecameEmpty() {
        this.$().find(`.playlist-spacer`).hide();
        this.$().find(`.playlist-empty`).show();
        this.$().find(`.tracklist-transform-container`).hide();
    }

    playFirst() {
        if (!this.length) return;
        const firstSelectedTrackView = this._selectable.first();
        if (firstSelectedTrackView) {
            this.changeTrackExplicitly(firstSelectedTrackView.track(), {
                trackView: firstSelectedTrackView,
                origin: this.getPlayedTrackOrigin()
            });
            return;
        }
        const nextPlaylistTrack = this.getNextPlaylistTrack();

        if (!nextPlaylistTrack.isDummy()) {
            this.changeTrackExplicitly(nextPlaylistTrack.track(), {
                trackView: nextPlaylistTrack.trackView(),
                origin: nextPlaylistTrack.origin()
            });
        } else {
            const firstView = this._trackViews.first();
            if (firstView) {
                this.changeTrackExplicitly(firstView.track(), {
                    trackView: firstView,
                    origin: this.getPlayedTrackOrigin()
                });
            }
        }
    }

    stop() {
        this._setCurrentTrack(DUMMY_PLAYLIST_TRACK);
        this._errorCount = 0;
        this.emit(PLAYLIST_STOPPED_EVENT);
    }

    trackIndexChanged() {
        this.edited();
        this._lengthChanged();
    }

    undoForTrackRemovalExpired() {
        this.snackbar.removeByTag(PLAYLIST_TRACKS_REMOVED_TAG);
        this._persistPlaylist();
    }

    didAddTracksToView(tracks) {
        const addedTracksCount = tracks.length;
        const tracksWord = addedTracksCount === 1 ? `track` : `tracks`;
        this.snackbar.show(`Added ${addedTracksCount} ${tracksWord} to the playlist`, {
            visibilityTime: 3000,
            tag: PLAYLIST_TRACKS_ADDED_TAG
        });
    }

    async shouldUndoTracksRemoved(tracksRemovedCount) {
        const tracksWord = tracksRemovedCount === 1 ? `track` : `tracks`;
        const outcome = await this.snackbar.show(`Removed ${tracksRemovedCount} ${tracksWord} from the playlist`, {
            action: `undo`,
            visibilityTime: 5000,
            tag: PLAYLIST_TRACKS_REMOVED_TAG
        });
        return outcome === ACTION_CLICKED;
    }

    /* eslint-disable class-methods-use-this */
    candidatePlaylistTrackWillPlay() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    changeTrackExplicitly(track, {
        doNotRecordHistory = false,
        trackView = null,
        origin = null
    }) {
        const playlistTrack = new PlaylistTrack(track, trackView, origin);
        return this._changeTrack(playlistTrack, !!doNotRecordHistory, KIND_EXPLICIT);
    }

    getCurrentTrack() {
        return this.getCurrentPlaylistTrack().track();
    }

    getNextTrack() {
        return this.getNextPlaylistTrack().track();
    }

    getPreviousTrack() {
        if (this._trackHistory.length > 1) {
            return this._trackHistory[this._trackHistory.length - 2].track();
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
        const {length} = history;
        if (length > 0) {
            let playlistTrack;
            while (history.length > 0) {
                playlistTrack = this._trackHistory.pop();
                if (playlistTrack.hasError()) {
                    playlistTrack = null;
                } else {
                    break;
                }
            }

            if (length !== history.length) {
                this.emit(HISTORY_CHANGE_EVENT);
            }

            if (!playlistTrack) {
                this.prev();
            } else {
                this.changeTrackExplicitly(playlistTrack.track(), {
                    trackView: playlistTrack.trackView(),
                    origin: playlistTrack.origin(),
                    doNotRecordHistory: true
                });
            }
        } else {
            this.emit(HISTORY_CHANGE_EVENT);
        }
    }

    next(userInitiated) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            return userInitiated ? null : this.stop();
        }
        return this._changeTrackImplicitly(nextPlaylistTrack, false, userInitiated);
    }

    tryChangeMode(mode) {
        const oldMode = this._mode;
        if (mode === oldMode) {
            return false;
        }

        switch (mode) {
        case NORMAL_MODE:
            this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromNormalMode;
            break;
        case SHUFFLE_MODE:
            this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromShuffleMode;
            break;

        case REPEAT_MODE:
            this._nextPlaylistTrackFromCurrentMode = this._nextPlaylistTrackFromRepeatMode;
            break;
        default:
            return false;
        }

        this._mode = mode;
        this.emit(MODE_CHANGE_EVENT, mode, oldMode);
        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._updateNextTrack();
        this.db.set(PLAYLIST_MODE_KEY, mode);
        return true;
    }

    getMode() {
        return this._mode;
    }

    _mediaLibrarySizeUpdated(count) {
        const text = count === 1 ? `is 1 track` : `are ${count} tracks`;
        this.$().find(`.playlist-empty .media-library-size`).setText(text);
    }

    /* eslint-disable class-methods-use-this */
    playingTrackAddedToList() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    async _loadPersistedPlaylist(persistedPlaylist) {
        // Let the ui load a bit first
        await delay(50);
        const {trackUids} = persistedPlaylist;
        const tracks = await this.metadataManager.mapTrackUidsToTracks(trackUids);
        this.add(tracks, {noReport: true});
    }

    _persistPlaylist() {
        if (this.metadataManager.areAllFilesPersisted()) {
            const trackUids = this._trackViews.map(v => v.track().uid());
            this.db.set(PLAYLIST_CONTENTS_KEY, {trackUids});
        }
    }

    _lengthChanged() {
        this._persistPlaylist();
        this.emit(TRACK_PLAYING_STATUS_CHANGE_EVENT, this.getCurrentPlaylistTrack());
        this._updateNextTrack();
    }

    _maybeGetNextPlaylistTrackFromOutsideSource() {
        const nextTrackCandidates = [];
        this.emit(CANDIDATE_TRACKS_OUTSIDE_PLAYLIST_FOR_NEXT_TRACK_NEEDED_EVENT, (track, trackView, origin, priority) => {
            nextTrackCandidates.push({track, trackView, origin, priority});
        });
        if (nextTrackCandidates.length > 1) {
            nextTrackCandidates.sort((a, b) => a.priority - b.priority);
        }
        if (nextTrackCandidates.length > 0) {
            const [nextTrackCandidate] = nextTrackCandidates;
            const {trackView, track, origin} = nextTrackCandidate;
            return new PlaylistTrack(track, trackView, origin);
        }
        return null;
    }

    _nextPlaylistTrackFromNormalMode(playlistTrack) {
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
                ret = new PlaylistTrack(trackView.track(), trackView, this.getPlayedTrackOrigin());
            }
            index++;
            trials++;
        } while (ret && ret.hasError() && trials <= this.length);
        return ret || DUMMY_PLAYLIST_TRACK;
    }

    _nextPlaylistTrackFromShuffleMode(playlistTrack) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isValidGeneratedFromShuffle()) {
            return nextPlaylistTrack;
        }
        const trackViews = this.getTrackViews();
        const currentTrack = playlistTrack.track();
        const nextTrack = nextPlaylistTrack.track();

        let maxWeight = 0;
        for (let i = 0; i < trackViews.length; ++i) {
            maxWeight += trackViews[i].track().getWeight(currentTrack, nextTrack);
        }

        let target = (Math.random() * maxWeight) | 0;
        for (let i = 0; i < trackViews.length; ++i) {
            const trackView = trackViews[i];
            const track = trackView.track();
            const weight = track.getWeight(currentTrack, nextTrack);

            if (target < weight) {
                return new PlaylistTrack(track, trackView, this.getPlayedTrackOrigin(), {
                    generatedFromShuffle: true
                });
            }
            target -= weight;
        }

        target = (Math.random() * trackViews.length) | 0;
        const view = trackViews[target];

        if (view && view.track()) {
            return new PlaylistTrack(view.track(), view, this.getPlayedTrackOrigin(), {
                generatedFromShuffle: true
            });
        }
        return nextPlaylistTrack;
    }

    _nextPlaylistTrackFromRepeatMode(currentPlaylistTrack) {
        if (currentPlaylistTrack.hasError()) {
            return this._nextPlaylistTrackFromNormalMode(currentPlaylistTrack);
        }
        return currentPlaylistTrack || DUMMY_PLAYLIST_TRACK;
    }

    _setCurrentTrack(playlistTrack) {
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            currentPlaylistTrack.track().stopPlaying();
        }

        this._setCurrentPlaylistTrack(playlistTrack);

        if (!playlistTrack.isDummy()) {
            playlistTrack.track().startPlaying();
        }

        this._nextPlaylistTrack = DUMMY_PLAYLIST_TRACK;
        this._updateNextTrack();
    }

    _nextTrackIsSameAs(playlistTrack) {
        const nextPlaylistTrack = this.getNextPlaylistTrack();
        if (nextPlaylistTrack.isDummy()) {
            return playlistTrack.isDummy();
        }
        return nextPlaylistTrack.track() === playlistTrack.track();
    }

    _changeTrackImplicitly(playlistTrack, doNotRecordHistory, isUserInitiatedSkip) {
        return this._changeTrack(playlistTrack, !!doNotRecordHistory, KIND_IMPLICIT, !!isUserInitiatedSkip);
    }

    _setNextPlaylistTrack(playlistTrack) {
        if (!(playlistTrack instanceof PlaylistTrack)) {
            throw new Error(`invalid playlistTrack`);
        }
        this._nextPlaylistTrack = playlistTrack;
    }

    _setCurrentPlaylistTrack(playlistTrack) {
        if (!(playlistTrack instanceof PlaylistTrack)) {
            throw new Error(`invalid playlistTrack`);
        }
        this._currentPlaylistTrack = playlistTrack;
    }

    _updateNextTrack() {
        const currentNextPlaylistTrack = this._nextPlaylistTrack;
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();
        const nextPlaylistTrack = this._nextPlaylistTrackFromCurrentMode(currentPlaylistTrack);
        this._setNextPlaylistTrack(nextPlaylistTrack);

        if (this.getNextPlaylistTrack().hasError()) {
            this._setNextPlaylistTrack(DUMMY_PLAYLIST_TRACK);
        }

        if (currentNextPlaylistTrack !== this._nextPlaylistTrack) {
            this.emit(NEXT_TRACK_CHANGE_EVENT);
        }
    }

    _changeTrack(playlistTrack, doNotRecordHistory, trackChangeKind, isUserInitiatedSkip) {
        if (!playlistTrack || playlistTrack.isDummy() || this._errorCount >= MAX_ERRORS) {
            this._errorCount = 0;
            this._setCurrentTrack(DUMMY_PLAYLIST_TRACK);
            this.emit(PLAYLIST_STOPPED_EVENT);
            return false;
        }
        const currentPlaylistTrack = this.getCurrentPlaylistTrack();

        if (!currentPlaylistTrack.isDummy()) {
            if (!doNotRecordHistory) {
                if (this._trackHistory.push(currentPlaylistTrack) > MAX_HISTORY) {
                    this._trackHistory.shift();
                }
                this.emit(HISTORY_CHANGE_EVENT);
            }
        }

        this._setCurrentTrack(playlistTrack);
        const trackHasError = playlistTrack.hasError();
        if (trackHasError && trackChangeKind === KIND_IMPLICIT) {
            this._errorCount++;
            if (this._mode === `repeat` && this.length > 1) {
                playlistTrack = this._nextPlaylistTrackFromNormalMode(playlistTrack);
                this._setCurrentTrack(playlistTrack);
            } else {
                return this.next(false);
            }
        }

        this._currentPlayId = nextPlayId++;
        this.emit(TRACK_PLAYING_STATUS_CHANGE_EVENT, playlistTrack);
        this.emit(CURRENT_TRACK_CHANGE_EVENT, playlistTrack.track(), !!isUserInitiatedSkip);
        playlistTrack.startedPlay();
        return true;
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
            id: `remove-from-playlist`,
            content: this.menuContext.createMenuItem(`Remove from playlist`, `material-icons small-material-icon delete`),
            onClick: () => {
                this.removeTrackView(this._singleTrackViewSelected);
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
                e.preventRipple();
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

        if (!haveTouch) {
            menu.push({
                id: `play`,
                disabled: true,
                content: this.menuContext.createMenuItem(`Play`, `glyphicon glyphicon-play-circle`),
                onClick: actionHandler(false, this, `playPrioritySelection`),
                enabledPredicate: moreThan0Selected
            });
        }

        menu.push({
            id: `remove-from-playlist`,
            disabled: true,
            content: this.menuContext.createMenuItem(`Remove from playlist`, `material-icons small-material-icon delete`),
            onClick: actionHandler(false, this, `removeSelected`),
            enabledPredicate: moreThan0Selected
        });

        menu.push({
            divider: true
        });

        if (!haveTouch) {
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
        }

        menu.push({
            id: `sort`,
            disabled: true,
            content: this.menuContext.createMenuItem(`Sort by`, `glyphicon glyphicon-sort`),
            enabledPredicate: moreThan1Selected,
            children: [{
                id: `sort-by-album`,
                content: this.menuContext.createMenuItem(`Album`, `material-icons small-material-icon album`),
                onClick: actionHandler(true, this, `sortByAlbum`),
                enabledPredicate: moreThan1Selected
            }, {
                id: `sort-by-artist`,
                content: this.menuContext.createMenuItem(`Artist`, `material-icons small-material-icon mic`),
                onClick: actionHandler(true, this, `sortByArtist`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-album-artist`,
                content: this.menuContext.createMenuItem(`Album artist`, `material-icons small-material-icon perm_camera_mic`),
                onClick: actionHandler(true, this, `sortByAlbumArtist`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-title`,
                content: this.menuContext.createMenuItem(`Title`, `material-icons small-material-icon music_note`),
                onClick: actionHandler(true, this, `sortByTitle`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-rating`,
                content: this.menuContext.createMenuItem(`Rating`, `material-icons small-material-icon grade`),
                onClick: actionHandler(true, this, `sortByRating`),
                enabledPredicate: moreThan1Selected

            }, {
                id: `sort-by-duration`,
                content: this.menuContext.createMenuItem(`Duration`, `material-icons small-material-icon access_time`),
                onClick: actionHandler(true, this, `sortByDuration`),
                enabledPredicate: moreThan1Selected
            }, {
                divider: true
            }, {
                id: `sort-by-shuffling`,
                content: this.menuContext.createMenuItem(`Shuffle`, `material-icons small-material-icon shuffle`),
                onClick: actionHandler(true, this, `sortByShuffling`),
                enabledPredicate: moreThan1Selected
            }, {
                id: `sort-by-reverse-order`,
                content: this.menuContext.createMenuItem(`Reverse order`, `material-icons small-material-icon undo`),
                onClick: actionHandler(true, this, `sortByReverseOrder`),
                enabledPredicate: moreThan1Selected
            }]
        });

        if (!haveTouch) {
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
        }

        return {
            target,
            menu,
            zIndex,
            align,
            manualTrigger: true
        };
    }
}

Object.assign(PlaylistController.prototype, TrackSorterTrait);
