import {TRACK_PLAYING_STATUS_CHANGE_EVENT} from "player/PlaylistController";
import {TAG_DATA_UPDATE_EVENT} from "metadata/MetadataManagerFrontend";

export default class PlayerRatingManager {
    constructor(opts, deps) {
        this._page = deps.page;
        this._playlist = deps.playlist;
        this._rippler = deps.rippler;
        this._recognizerContext = deps.recognizerContext;

        this._currentTrack = null;
        this._domNode = this._page.$(opts.target);
        this._trackTagDataUpdated = this._trackTagDataUpdated.bind(this);
        this._buttonClicked = this._buttonClicked.bind(this);

        this.$().addEventListener(`click`, this._buttonClicked);
        this._recognizerContext.createTapRecognizer(this._buttonClicked).recognizeBubbledOn(this.$());

        this._playlist.on(TRACK_PLAYING_STATUS_CHANGE_EVENT, (playlistTrack) => {
            this._trackChanged(playlistTrack.track());
        });

    }

    $() {
        return this._domNode;
    }

    _buttonClicked(e) {
        this._rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    }

    _updateState(track) {
        if (track.isRated()) {
            this.$().addClass(`rated`);
        } else {
            this.$().removeClass(`rated`);
        }
    }

    _trackTagDataUpdated() {
        if (this._currentTrack) {
            this._updateState(this._currentTrack);
        }
    }

    _trackChanged(track) {
        if (track === this._currentTrack) {
            return;
        }

        if (this._currentTrack) {
            this._currentTrack.removeListener(TAG_DATA_UPDATE_EVENT, this._trackTagDataUpdated);
            this._currentTrack = null;
        }

        if (track) {
            this._currentTrack = track;
            this._currentTrack.on(TAG_DATA_UPDATE_EVENT, this._trackTagDataUpdated);
            this._updateState(track);
        }
    }
}
