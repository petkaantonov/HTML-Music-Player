import { SelectDeps } from "Application";
import { Track } from "metadata/MetadataManagerFrontend";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import Rippler from "ui/Rippler";

import PlaylistController from "./PlaylistController";

type Deps = SelectDeps<"page" | "playlist" | "rippler" | "recognizerContext">;

interface Opts {
    target: DomWrapperSelector;
}
export default class PlayerRatingManager {
    _page: Page;
    _playlist: PlaylistController;
    _rippler: Rippler;
    _recognizerContext: GestureRecognizerContext;
    private _domNode: DomWrapper;
    private _currentTrack: null | Track;
    constructor(opts: Opts, deps: Deps) {
        this._page = deps.page;
        this._playlist = deps.playlist;
        this._rippler = deps.rippler;
        this._recognizerContext = deps.recognizerContext;

        this._currentTrack = null;
        this._domNode = this._page.$(opts.target);

        this.$().addEventListener(`click`, this._buttonClicked);
        this._recognizerContext.createTapRecognizer(this._buttonClicked).recognizeBubbledOn(this.$());

        this._playlist.on("playlistTrackPlayingStatusChanged", playlistTrack => {
            this._trackChanged(playlistTrack.track()!);
        });
    }

    $() {
        return this._domNode;
    }

    _buttonClicked = (e: MouseEvent | GestureObject) => {
        this._rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
    };

    _updateState = (track: Track) => {
        if (track.isRated()) {
            this.$().addClass(`rated`);
        } else {
            this.$().removeClass(`rated`);
        }
    };

    _trackTagDataUpdated = () => {
        if (this._currentTrack) {
            this._updateState(this._currentTrack);
        }
    };

    _trackChanged = (track: Track) => {
        if (track === this._currentTrack) {
            return;
        }

        if (this._currentTrack) {
            this._currentTrack.removeListener("tagDataUpdated", this._trackTagDataUpdated);
            this._currentTrack = null;
        }

        if (track) {
            this._currentTrack = track;
            this._currentTrack.on("tagDataUpdated", this._trackTagDataUpdated);
            this._updateState(track);
        }
    };
}
