import { SelectDeps } from "ui/Application";
import { Track } from "ui/metadata/MetadataManagerFrontend";
import Page from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";

import PlayerController from "./PlayerController";
import PlayerPictureManager from "./PlayerPictureManager";
import PlaylistController from "./PlaylistController";

function getPlaybackState(isPlaying: boolean, isPaused: boolean): MediaSessionPlaybackState {
    let state: MediaSessionPlaybackState;
    if (!isPlaying && !isPaused) {
        state = "none";
    } else if (isPaused) {
        state = "paused";
    } else if (isPlaying) {
        state = "playing";
    } else {
        uiLog(`invalid state combination isPlaying=${isPlaying}, isPaused=${isPaused}`);
        state = "none";
    }
    return state;
}

function getArtwork(imageSrc?: string) {
    return imageSrc ? [{ src: imageSrc }] : [];
}

type Deps = SelectDeps<"env" | "page" | "player" | "playlist" | "globalEvents" | "playerPictureManager">;

export default class MediaSessionWrapper {
    readonly env: Env;
    readonly page: Page;
    readonly player: PlayerController;
    readonly playlist: PlaylistController;
    readonly globalEvents: GlobalEvents;
    readonly pictureManager: PlayerPictureManager;
    private enabled: boolean;
    private _currentTrack: null | Track;
    private _mediaSession: MediaSession | undefined;

    constructor(deps: Deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.player = deps.player;
        this.playlist = deps.playlist;
        this.globalEvents = deps.globalEvents;
        this.pictureManager = deps.playerPictureManager;

        this.enabled = this.env.mediaSessionSupport();
        this._currentTrack = null;

        if (this.enabled) {
            this._mediaSession = this.page.window().navigator.mediaSession!;
            this._mediaSession.playbackState = "none";
            this._mediaSession.metadata = new MediaMetadata();
            this._mediaSession.setActionHandler("play", this._actionPlay);
            this._mediaSession.setActionHandler("pause", this._actionPause);
            this._mediaSession.setActionHandler("stop", this._actionStop);
            this._mediaSession.setActionHandler("seekto", this._seekAction);
            this._mediaSession.setActionHandler("seekbackward", this._actionBackward);
            this._mediaSession.setActionHandler("seekforward", this._actionForward);
            this._mediaSession.setActionHandler("previoustrack", this._actionPrev);
            this._mediaSession.setActionHandler("nexttrack", this._actionNext);
            this.playlist.on("playlistNextTrackChanged", this._stateChanged);
            this.playlist.on("playlistTrackPlayingStatusChanged", this._stateChanged);
            this.player.on("playbackStateChanged", this._stateChanged);
            this.player.on("playbackResumedAfterIdle", this._refreshMediaSession);
            this.pictureManager.on("imageChanged", this._stateChanged);
            this.globalEvents.on("foreground", this._refreshMediaSession);
        } else {
            this._mediaSession = undefined;
        }
    }

    get title() {
        return this._mediaSession!.metadata!.title;
    }

    set title(value) {
        this._mediaSession!.metadata!.title = value;
    }

    get artist() {
        return this._mediaSession!.metadata!.artist;
    }

    set artist(value) {
        this._mediaSession!.metadata!.artist = value;
    }

    get album() {
        return this._mediaSession!.metadata!.album;
    }

    set album(value) {
        this._mediaSession!.metadata!.album = value;
    }

    get artwork() {
        return this._mediaSession?.metadata?.artwork;
    }

    set artwork(value) {
        if (value) {
            this._mediaSession!.metadata!.artwork = value;
        }
    }

    get playbackState() {
        return this._mediaSession!.playbackState;
    }

    set playbackState(value) {
        this._mediaSession!.playbackState = value;
    }

    _ensureSessionMetadata = () => {
        if (!this._mediaSession!.metadata) {
            this._mediaSession!.metadata = new MediaMetadata();
        }
    };

    _refreshMediaSession = () => {
        this._mediaSession!.metadata = new MediaMetadata();
        this._stateChanged();
    };

    _disableMediaSession = () => {
        this._mediaSession!.metadata = null;
    };

    _actionForward = (details: MediaSessionActionDetails) => {
        const progressToMove = details.seekOffset ? this.player.getTimeAsProgress(details.seekOffset) : 0.01;
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p + progressToMove), 0));
        }
    };

    _actionBackward = (details: MediaSessionActionDetails) => {
        const progressToMove = details.seekOffset ? this.player.getTimeAsProgress(details.seekOffset) : 0.01;
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p - progressToMove), 0));
        }
    };

    _seekAction = (details: Required<Pick<MediaSessionActionDetails, "seekTime">> & MediaSessionActionDetails) => {
        if (details.fastSeek) {
            return;
        }
        this.player.seek(details.seekTime);
    };

    _actionPrev = () => {
        this.playlist.prev();
    };

    _actionNext = () => {
        this.playlist.next(true);
    };

    _actionPlay = () => {
        this.player.play(true);
    };

    _actionPause = () => {
        this.player.pause();
    };

    _actionStop = () => {
        this.player.stop();
    };

    _stateChanged = () => {
        if (!this.enabled) return;
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        const track = playlistTrack.track();

        if (!track) {
            if (this._currentTrack) {
                this._currentTrack.removeListener("tagDataUpdated", this._stateChanged);
                this._currentTrack = null;
            }

            this.playbackState = "none";
            this._disableMediaSession();
            return;
        }

        this._ensureSessionMetadata();
        const previousTrack = this._currentTrack;

        if (track !== previousTrack) {
            if (previousTrack) {
                previousTrack.removeListener("tagDataUpdated", this._stateChanged);
            }
            track.on("tagDataUpdated", this._stateChanged);
            this._currentTrack = track;
        }

        const { isPlaying, isPaused } = this.player;
        this.playbackState = getPlaybackState(isPlaying, isPaused);

        const { album, title, artist } = track;
        this.title = `${playlistTrack.formatIndex()}${title}`;
        this.artist = artist;
        this.album = album;

        const { artwork } = this;
        const imageSrc = this.pictureManager.getCurrentImage().src;
        if (!artwork || artwork.length === 0 || artwork[0]!.src !== imageSrc) {
            this.artwork = getArtwork(imageSrc);
        }
    };
}
