import {NEXT_TRACK_CHANGE_EVENT,
       TRACK_PLAYING_STATUS_CHANGE_EVENT} from "player/PlaylistController";
import {TAG_DATA_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";
import {MediaMetadata} from "platform/platform";
import {PLAYBACK_STATE_CHANGE_EVENT,
        PLAYBACK_RESUME_AFTER_IDLE_EVENT} from "player/PlayerController";
import {FOREGROUND_EVENT} from "platform/GlobalEvents";

const PLAYBACK_STATE_NONE = `none`;
const PLAYBACK_STATE_PLAYING = `playing`;
const PLAYBACK_STATE_PAUSED = `paused`;




function getPlaybackState(isPlaying, isPaused) {
    let state;
    if (!isPlaying && !isPaused) {
        state = PLAYBACK_STATE_NONE;
    } else if (isPaused) {
        state = PLAYBACK_STATE_PAUSED;
    } else if (isPlaying) {
        state = PLAYBACK_STATE_PLAYING;
    } else {
        self.uiLog(`invalid state combination isPlaying=${isPlaying}, isPaused=${isPaused}`);
        state = PLAYBACK_STATE_NONE;
    }
    return state;
}

function getArtwork(imageSrc) {
    return imageSrc ? [{src: imageSrc}] : [];
}

export default class MediaSessionWrapper {
    constructor(deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.player = deps.player;
        this.playlist = deps.playlist;
        this.globalEvents = deps.globalEvents;
        this.pictureManager = deps.playerPictureManager;

        this.enabled = this.env.mediaSessionSupport();
        this._currentTrack = null;
        this._stateChanged = this._stateChanged.bind(this);
        this._refreshMediaSession = this._refreshMediaSession.bind(this);

        if (this.enabled) {
            this._mediaSession = this.page.window().navigator.mediaSession;
            this._mediaSession.playbackState = PLAYBACK_STATE_NONE;
            this._mediaSession.metadata = new MediaMetadata();
            this._mediaSession.setActionHandler(`play`, this._actionPlay.bind(this));
            this._mediaSession.setActionHandler(`pause`, this._actionPause.bind(this));
            this._mediaSession.setActionHandler(`seekbackward`, this._actionBackward.bind(this));
            this._mediaSession.setActionHandler(`seekforward`, this._actionForward.bind(this));
            this._mediaSession.setActionHandler(`previoustrack`, this._actionPrev.bind(this));
            this._mediaSession.setActionHandler(`nexttrack`, this._actionNext.bind(this));
            this.playlist.on(NEXT_TRACK_CHANGE_EVENT, this._stateChanged);
            this.playlist.on(TRACK_PLAYING_STATUS_CHANGE_EVENT, this._stateChanged);
            this.player.on(PLAYBACK_STATE_CHANGE_EVENT, this._stateChanged);
            this.player.on(PLAYBACK_RESUME_AFTER_IDLE_EVENT, this._refreshMediaSession);
            this.pictureManager.on(`imageChange`, this._stateChanged);
            this.globalEvents.on(FOREGROUND_EVENT, this._refreshMediaSession);
        }
    }

    get title() {
        return this._mediaSession.metadata.title;
    }

    set title(value) {
        this._mediaSession.metadata.title = value;
    }

    get artist() {
        return this._mediaSession.metadata.artist;
    }

    set artist(value) {
        this._mediaSession.metadata.artist = value;
    }

    get album() {
        return this._mediaSession.metadata.album;
    }

    set album(value) {
        this._mediaSession.metadata.album = value;
    }

    get artwork() {
        return this._mediaSession.metadata.artwork;
    }

    set artwork(value) {
        this._mediaSession.metadata.artwork = value;
    }

    get playbackState() {
        return this._mediaSession.playbackState;
    }

    set playbackState(value) {
        this._mediaSession.playbackState = value;
    }

    _ensureSessionMetadata() {
        if (!this._mediaSession.metadata) {
            this._mediaSession.metadata = new MediaMetadata();
        }
    }

    _refreshMediaSession() {
        this._mediaSession.metadata = new MediaMetadata();
        this._stateChanged();
    }

    _disableMediaSession() {
        this._mediaSession.metadata = null;
    }

    _actionForward() {
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p + 0.01), 0));
        }
    }

    _actionBackward() {
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p - 0.01), 0));
        }
    }

    _actionPrev() {
        this.playlist.prev();
    }

    _actionNext() {
        this.playlist.next(true);
    }

    _actionPlay() {
        this.player.play();
    }

    _actionPause() {
        this.player.pause();
    }

    _stateChanged() {
        if (!this.enabled) return;
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();
        const track = playlistTrack.track();


        if (!track) {
            if (this._currentTrack) {
                this._currentTrack.removeListener(TAG_DATA_UPDATE_EVENT, this._stateChanged);
                this._currentTrack = null;
            }

            this.playbackState = PLAYBACK_STATE_NONE;
            this._disableMediaSession();
            return;
        }

        this._ensureSessionMetadata();
        const previousTrack = this._currentTrack;

        if (track !== previousTrack) {
            if (previousTrack) {
                previousTrack.removeListener(TAG_DATA_UPDATE_EVENT, this._stateChanged);
            }
            track.on(TAG_DATA_UPDATE_EVENT, this._stateChanged);
            this._currentTrack = track;
        }

        const {isPlaying, isPaused} = this.player;
        this.playbackState = getPlaybackState(isPlaying, isPaused);

        const {album, title, artist} = track;
        this.title = `${playlistTrack.formatIndex()}${title}`;
        this.artist = artist;
        this.album = album;

        const {artwork} = this;
        const imageSrc = this.pictureManager.getCurrentImage().src;
        if (!artwork || artwork.length === 0 || artwork[0].src !== imageSrc) {
            this.artwork = getArtwork(imageSrc);
        }
    }
}
