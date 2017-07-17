import {URL} from "platform/platform";
import CancellableOperations from "utils/CancellationToken";

export default class MediaSessionWrapper extends CancellableOperations(null, `imageWaitOperation`) {
    constructor(deps) {
        super();
        this.env = deps.env;
        this.page = deps.page;
        this.player = deps.player;
        this.playlist = deps.playlist;
        this.pictureManager = deps.playerPictureManager;

        this.enabled = this.env.mediaSessionSupport();
        this._currentState = {};

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

    _shouldRenderNewState(newState) {
        const keys = Object.keys(newState);
        const currentState = this._currentState;

        for (let i = 0; i < keys.length; ++i) {
            const key = keys[i];

            if (currentState[key] !== newState[key]) {
                return true;
            }
        }
        return false;
    }

    async stateChanged() {
        if (!this.enabled) return;
        const isPausedOrStopped = (this.player.isPaused || this.player.isStopped);
        const {isPlaying} = this.player;
        const track = this.playlist.getCurrentTrack() || this.playlist.getNextTrack();
        if (!track) {
            return;
        }

        const state = {
            isPlaying,
            isPausedOrStopped,
            track,
            tagDataState: track.getTagStateId()
        };

        if (!this._shouldRenderNewState(state)) {
            return;
        }

        this._currentState = state;
        this.cancelAllImageWaitOperations();
        const cancellationToken = this.cancellationTokenForImageWaitOperation();
        let image, imageUrl;
        try {
            image = await track.getImage(this.pictureManager);
            if (cancellationToken.isCancelled()) return;
            imageUrl = image ? (image.isGenerated ? URL.createObjectURL(image.blob) : image.src) : null;

            const info = track.getArtistAndTitle();
            const title = `${track.getIndex() + 1}. ${info.title}`;
            const {artist} = info;
            const album = track.formatTime();
            await this.page.platform().setMediaState({
                title,
                artist,
                album,
                artwork: [{src: imageUrl}],
                isPlaying: this.player.isPlaying,
                isPaused: this.player.isPaused
            });
        } finally {
            if (imageUrl && image && image.isGenerated) {
                try {
                    URL.revokeObjectURL(imageUrl);
                } catch (e) {
                    // NOOP
                }
            }
        }
    }
}
