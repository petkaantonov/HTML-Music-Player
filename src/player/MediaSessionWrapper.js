import {NEXT_TRACK_CHANGE_EVENT,
       TRACK_PLAYING_STATUS_CHANGE_EVENT} from "player/PlaylistController";
import {TAG_DATA_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";

class MediaSessionRenderedState {
    constructor(isPlaying, isPaused, track, imageSrc) {
        this.isPlaying = isPlaying;
        this.isPaused = isPaused;
        this.track = track;
        this.imageSrc = imageSrc;
    }

    equals(other) {
        return other.isPlaying === this.isPlaying &&
               other.isPaused === this.isPaused &&
               other.track === this.track &&
               other.imageSrc === this.imageSrc;
    }
}

const EMPTY_STATE = new MediaSessionRenderedState(false, false, null, null);

export default class MediaSessionWrapper {
    constructor(deps) {
        this.env = deps.env;
        this.page = deps.page;
        this.player = deps.player;
        this.playlist = deps.playlist;
        this.pictureManager = deps.playerPictureManager;

        this.enabled = this.env.mediaSessionSupport();
        this._currentState = EMPTY_STATE;
        this._currentTrack = null;

        this.stateChanged = this.stateChanged.bind(this);

        if (this.enabled) {
            this.page.addMediaActionListener(`play`, this.actionPlay.bind(this));
            this.page.addMediaActionListener(`pause`, this.actionPause.bind(this));
            this.page.addMediaActionListener(`seekbackward`, this.actionBackward.bind(this));
            this.page.addMediaActionListener(`seekforward`, this.actionForward.bind(this));
            this.page.addMediaActionListener(`previoustrack`, this.actionPrev.bind(this));
            this.page.addMediaActionListener(`nexttrack`, this.actionNext.bind(this));
            this.playlist.on(NEXT_TRACK_CHANGE_EVENT, this.stateChanged);
            this.playlist.on(TRACK_PLAYING_STATUS_CHANGE_EVENT, this.stateChanged);
            this.pictureManager.on(`imageChange`, this.stateChanged);
        }
    }

    actionForward() {
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p + 0.01), 0));
        }
    }

    actionBackward() {
        const p = this.player.getProgress();
        if (p !== -1) {
            this.player.setProgress(Math.max(Math.min(1, p - 0.01), 0));
        }
    }

    actionPrev() {
        this.playlist.prev();
    }

    actionNext() {
        this.playlist.next(true);
    }

    actionPlay() {
        this.player.play();
    }

    actionPause() {
        this.player.pause();
    }

    stateChanged() {
        if (!this.enabled) return;
        const {isPlaying, isPaused} = this.player;
        const playlistTrack = this.playlist.getCurrentPlaylistTrack();

        if (!playlistTrack.track()) {
            if (this._currentTrack) {
                this._currentTrack.removeListener(TAG_DATA_UPDATE_EVENT, this.stateChanged);
                this._currentTrack = null;
            }
            this._currentState = EMPTY_STATE;
            this.page.platform().disableMediaState();
            return;
        }

        const track = playlistTrack.track();
        const imageSrc = this.pictureManager.getCurrentImage().src;
        const state = new MediaSessionRenderedState(isPlaying, isPaused, track, imageSrc);
        if (state.equals(this._currentState)) {
            return;
        }
        this._currentState = state;
        const previousTrack = this._currentTrack;

        if (track !== previousTrack) {
            if (previousTrack) {
                previousTrack.removeListener(TAG_DATA_UPDATE_EVENT, this.stateChanged);
            }
            track.on(TAG_DATA_UPDATE_EVENT, this.stateChanged);
            this._currentTrack = track;
        }

        const artwork = [{src: imageSrc}];
        const info = track.getArtistAndTitle();
        const title = `${playlistTrack.formatIndex()}${info.title}`;
        const {artist} = info;
        const album = track.formatTime();
        this.page.platform().setMediaState({
            title,
            artist,
            album,
            isPlaying,
            isPaused,
            artwork
        });
    }
}
