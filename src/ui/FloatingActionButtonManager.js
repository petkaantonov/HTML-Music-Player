import {PLAYBACK_STATE_CHANGE_EVENT} from "player/PlayerController";
import {NEXT_TRACK_CHANGE_EVENT,
        CURRENT_TRACK_CHANGE_EVENT,
        TRACK_PLAYING_STATUS_CHANGE_EVENT,
        PLAYLIST_STOPPED_EVENT} from "player/PlaylistController";

const UNKNOWN_STATE = "unknown-state";
const PLAY_BUTTON_STATE = "play-button-state";
const PAUSE_BUTTON_STATE = "pause-button-state";
const ADD_BUTTON_STATE = "add-button-state";

export default class FloatingActionButtonManager {
    constructor(deps) {
        this._playerController = deps.player;
        this._playlistController = deps.playlist;
        this._recognizerContext = deps.recognizerContext;
        this._localFileHandler = deps.localFileHandler;
        this._currentState = UNKNOWN_STATE;

        this._stateChanged = this._stateChanged.bind(this);
        this._playerController.on(PLAYBACK_STATE_CHANGE_EVENT, this._stateChanged);
        this._playlistController.on(NEXT_TRACK_CHANGE_EVENT, this._stateChanged);
        this._playlistController.on(CURRENT_TRACK_CHANGE_EVENT, this._stateChanged);
        this._playlistController.on(TRACK_PLAYING_STATUS_CHANGE_EVENT, this._stateChanged);
        this._playlistController.on(PLAYLIST_STOPPED_EVENT, this._stateChanged);

        this._awaitInitialState();
    }

    async _awaitInitialState() {
        await Promise.all([
            this._playerController.preferencesLoaded(),
            this._playlistController.preferencesLoaded()
        ]);
        this._stateChanged();
    }

    _buttonClicked() {
        switch (this._currentState) {
        case PLAY_BUTTON_STATE:
            this._playerController.play();
            break;

        case PAUSE_BUTTON_STATE:
            this._playerController.pause();
            break;

        case ADD_BUTTON_STATE:
            this._localFileHandler.openFilePicker();
            break;
        }
    }

    _updateButtonState() {

    }

    _stateChanged() {
        let newState;
        if (this._playerController.canPlayPause()) {
            newState = this._playerController.isPlaying ? PAUSE_BUTTON_STATE : PLAY_BUTTON_STATE;
        } else {
            newState = ADD_BUTTON_STATE;
        }

        if (this._currentState !== newState) {
            this._currentState = newState;
            this._updateButtonState();
        }
    }
}
