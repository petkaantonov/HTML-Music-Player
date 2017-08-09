import {noUndefinedGet} from "util";
import {MODE_CHANGE_EVENT,
         SHUFFLE_MODE,
         NORMAL_MODE,
         REPEAT_MODE} from "player/PlaylistController";
import {ABOVE_TOOLBAR_Z_INDEX} from "ui/ToolbarManager";

export default class PlaylistModeManager {
    constructor(deps) {
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.playlist = deps.playlist;
        this._shuffleButton = this.page.$(`.js-shuffle-mode`);
        this._repeatButton = this.page.$(`.js-repeat-mode`);


        this.shuffleClicked = this.shuffleClicked.bind(this);
        this.repeatClicked = this.repeatClicked.bind(this);
        this.update = this.update.bind(this);

        this.playlist.on(MODE_CHANGE_EVENT, this.update);

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

    shuffleClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, ABOVE_TOOLBAR_Z_INDEX);
        this.setMode(this.getMode() === SHUFFLE_MODE ? NORMAL_MODE : SHUFFLE_MODE);
    }

    repeatClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY, null, ABOVE_TOOLBAR_Z_INDEX);
        this.setMode(this.getMode() === REPEAT_MODE ? NORMAL_MODE : REPEAT_MODE);
    }

    getMode() {
        return this.playlist.getMode();
    }

    update() {
        this.$allButtons().removeClass(`active`);

        switch (this.getMode()) {
            case `shuffle`:
            this.$shuffle().addClass(`active`);
            break;

            case `repeat`:
            this.$repeat().addClass(`active`);
            break;
        }
    }

    setMode(mode) {
        this.playlist.tryChangeMode(mode);
    }
}
