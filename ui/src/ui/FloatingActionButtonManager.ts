import * as io from "io-ts";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import LocalFileHandler from "ui/platform/LocalFileHandler";
import PlayerController from "ui/player/PlayerController";
import PlaylistController from "ui/player/PlaylistController";

import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import Snackbar from "./Snackbar";

export const FLOATING_ACTION_BUTTON_HEIGHT = ((16 + 56) / 2) | 0;

const UNKNOWN_STATE = `unknown-state`;
const PLAY_BUTTON_STATE = `play-button-state`;
const PAUSE_BUTTON_STATE = `pause-button-state`;
const ADD_BUTTON_STATE = `add-button-state`;

const State = io.union([
    io.literal(UNKNOWN_STATE),
    io.literal(PLAY_BUTTON_STATE),
    io.literal(PAUSE_BUTTON_STATE),
    io.literal(ADD_BUTTON_STATE),
]);
type State = io.TypeOf<typeof State>;

type Deps = SelectDeps<"player" | "playlist" | "recognizerContext" | "localFileHandler" | "env" | "page" | "snackbar">;
interface Opts {
    target: DomWrapperSelector;
}

export default class FloatingActionButtonManager {
    private _playerController: PlayerController;
    private _playlistController: PlaylistController;
    private _localFileHandler: LocalFileHandler;
    private _env: Env;
    private _page: Page;
    private _snackbar: Snackbar;
    private _currentState: State;
    private _domNode: DomWrapper;
    private _recognizerContext: GestureRecognizerContext;
    constructor(opts: Opts, deps: Deps) {
        this._playerController = deps.player;
        this._playlistController = deps.playlist;
        this._recognizerContext = deps.recognizerContext;
        this._localFileHandler = deps.localFileHandler;
        this._env = deps.env;
        this._page = deps.page;
        this._snackbar = deps.snackbar;

        this._currentState = UNKNOWN_STATE;
        this._domNode = this._page.$(opts.target);

        if (this._env.hasTouch()) {
            this._playerController.on("playbackStateChanged", this._stateChanged);
            this._playlistController.on("playlistNextTrackChanged", this._stateChanged);
            this._playlistController.on("playlistCurrentTrackChanged", this._stateChanged);
            this._playlistController.on("playlistTrackPlayingStatusChanged", this._stateChanged);
            this._playlistController.on("playlistStopped", this._stateChanged);
            this._recognizerContext.createTapRecognizer(this._buttonClicked).recognizeBubbledOn(this.$());
            this._snackbar.on("snackbarWillShow", this._snackbarWillShow);
            this._snackbar.on("snackbarDidHide", this._snackbarDidHide);

            void this._awaitInitialState();
        }
    }

    $() {
        return this._domNode;
    }

    $icon() {
        return this.$().find(`.icon`);
    }

    async _awaitInitialState() {
        await Promise.all([this._playerController.preferencesLoaded(), this._playlistController.preferencesLoaded()]);
        this._stateChanged();
    }

    _buttonClicked = () => {
        switch (this._currentState) {
            case PLAY_BUTTON_STATE:
                this._playerController.play(true);
                break;

            case PAUSE_BUTTON_STATE:
                this._playerController.pause();
                break;

            case ADD_BUTTON_STATE:
                this._localFileHandler.openFilePicker();
                break;
        }
    };

    _snackbarWillShow = () => {
        this.$().hide();
    };

    _snackbarDidHide = () => {
        this.$().show("block");
    };

    _updateButtonState() {
        const root = this.$();
        const icon = this.$icon();

        root.removeClass(`preferred-action`).show();
        icon.removeClass([`play`, `add`, `pause`]);

        switch (this._currentState) {
            case PLAY_BUTTON_STATE:
                root.addClass(`preferred-action`);
                icon.addClass(`play`);
                break;

            case PAUSE_BUTTON_STATE:
                root.addClass(`preferred-action`);
                icon.addClass(`pause`);
                break;

            case ADD_BUTTON_STATE:
                icon.addClass(`add`);
                break;
        }
    }

    _stateChanged = () => {
        let newState: State;
        if (this._playerController.canPlayPause()) {
            newState = this._playerController.isPlaying ? PAUSE_BUTTON_STATE : PLAY_BUTTON_STATE;
        } else {
            newState = ADD_BUTTON_STATE;
        }

        if (this._currentState !== newState) {
            this._currentState = newState;
            this._updateButtonState();
        }
    };
}
