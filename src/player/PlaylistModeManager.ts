import { PlaylistMode, SelectDeps } from "Application";
import Page, { DomWrapper } from "platform/dom/Page";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import Rippler from "ui/Rippler";
import { ABOVE_TOOLBAR_Z_INDEX } from "ui/ToolbarManager";

import PlaylistController from "./PlaylistController";

type Deps = SelectDeps<"page" | "recognizerContext" | "rippler" | "playlist">;

export default class PlaylistModeManager {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    playlist: PlaylistController;
    private _shuffleButton: DomWrapper;
    private _repeatButton: DomWrapper;

    constructor(deps: Deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.playlist = deps.playlist;
        this._shuffleButton = this.page.$(`.js-shuffle-mode`);
        this._repeatButton = this.page.$(`.js-repeat-mode`);

        this.playlist.on("playlistModeChanged", this.update);
        this.$shuffle().addEventListener(`click`, this.shuffleClicked);
        this.$repeat().addEventListener(`click`, this.repeatClicked);
        this.recognizerContext.createTapRecognizer(this.shuffleClicked).recognizeBubbledOn(this.$shuffle());
        this.recognizerContext.createTapRecognizer(this.repeatClicked).recognizeBubbledOn(this.$repeat());
        this.update();
    }

    $allButtons() {
        return this.$shuffle().add(this.$repeat());
    }

    $shuffle() {
        return this._shuffleButton;
    }

    $repeat() {
        return this._repeatButton;
    }

    shuffleClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            ABOVE_TOOLBAR_Z_INDEX
        );
        this.setMode(this.getMode() === "shuffle" ? "normal" : "shuffle");
    };

    repeatClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            ABOVE_TOOLBAR_Z_INDEX
        );
        this.setMode(this.getMode() === "repeat" ? "normal" : "repeat");
    };

    getMode() {
        return this.playlist.getMode();
    }

    update = () => {
        this.$allButtons().removeClass(`active`);

        switch (this.getMode()) {
            case `shuffle`:
                this.$shuffle().addClass(`active`);
                break;

            case `repeat`:
                this.$repeat().addClass(`active`);
                break;
        }
    };

    setMode(mode: PlaylistMode) {
        this.playlist.tryChangeMode(mode);
    }
}
