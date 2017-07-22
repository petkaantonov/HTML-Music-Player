import {noUndefinedGet} from "util";
import {MODE_CHANGE_EVENT,
         SHUFFLE_MODE,
         NORMAL_MODE,
         REPEAT_MODE} from "player/PlaylistController";


export default class PlaylistModeManager {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.playlist = deps.playlist;
        this._domNode = this.page.$(opts.target).eq(0);
        this._shuffleButton = this.$().find(`.shuffle-mode-button`);
        this._repeatButton = this.$().find(`.repeat-mode-button`);

        this.justDeactivatedMouseLeft = this.justDeactivatedMouseLeft.bind(this);
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

    $() {
        return this._domNode;
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

    justDeactivatedMouseLeft(e) {
        e.currentTarget.removeEventListener(`mouseleave`, this.justDeactivatedMouseLeft);
        e.currentTarget.classList.remove(`just-deactivated`);
    }

    shuffleClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.$allButtons().removeClass(`just-deactivated`);
        this.setMode(this.getMode() === SHUFFLE_MODE ? NORMAL_MODE : SHUFFLE_MODE);

        if (this.getMode() !== SHUFFLE_MODE) {
            this.$shuffle().addClass(`just-deactivated`);
        }
        this.$shuffle().addEventListener(`mouseleave`, this.justDeactivatedMouseLeft);
    }

    repeatClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.$allButtons().removeClass(`just-deactivated`);
        this.setMode(this.getMode() === REPEAT_MODE ? NORMAL_MODE : REPEAT_MODE);

        if (this.getMode() !== REPEAT_MODE) {
            this.$repeat().addClass(`just-deactivated`);
        }

        this.$repeat().addEventListener(`mouseleave`, this.justDeactivatedMouseLeft);
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
