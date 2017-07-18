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

        this.stateChanged = this.stateChanged.bind(this);

        if (this.enabled) {
            this.page.addMediaActionListener(`play`, this.actionPlay.bind(this));
            this.page.addMediaActionListener(`pause`, this.actionPause.bind(this));
            this.page.addMediaActionListener(`seekbackward`, this.actionBackward.bind(this));
            this.page.addMediaActionListener(`seekforward`, this.actionForward.bind(this));
            this.page.addMediaActionListener(`previoustrack`, this.actionPrev.bind(this));
            this.page.addMediaActionListener(`nexttrack`, this.actionNext.bind(this));
            this.player.on(`currentTrackMetadataChange`, this.stateChanged);
            this.player.on(`newTrackLoad`, this.stateChanged);
            this.playlist.on(`highlyRelevantTrackMetadataUpdate`, this.stateChanged);
            this.playlist.on(`nextTrackChange`, this.stateChanged);
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

    async stateChanged() {
        if (!this.enabled) return;
        const {isPlaying, isPaused} = this.player;
        const track = this.playlist.getCurrentTrack();

        if (!track) {
            this._currentState = EMPTY_STATE;
            this.page.platform().disableMediaState();
            return;
        }

        const imageSrc = this.pictureManager.getCurrentImage().src;

        const state = new MediaSessionRenderedState(isPlaying, isPaused, track, imageSrc);
        if (state.equals(this._currentState)) {
            return;
        }
        this._currentState = state;

        const artwork = [{src: imageSrc}];
        const info = track.getArtistAndTitle();
        const title = `${track.getIndex() + 1}. ${info.title}`;
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
