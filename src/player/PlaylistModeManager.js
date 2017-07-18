import {noUndefinedGet} from "util";

const SHUFFLE = `shuffle`;
const NORMAL = `normal`;
const REPEAT = `repeat`;
const SHUFFLE_MODE_TOOLTIP = `The next track is randomly chosen. Higher rated tracks ` +
        `and tracks that have not been recently played are more likely to be chosen.`;

export default class PlaylistModeManager {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.tooltipContext = deps.tooltipContext;
        this.playlist = deps.playlist;
        this._domNode = this.page.$(opts.target).eq(0);
        this._shuffleButton = this.$().find(`.shuffle-mode-button`);
        this._repeatButton = this.$().find(`.repeat-mode-button`);

        this.shuffleTooltip = this.tooltipContext.createTooltip(this.$shuffle(), () => (this.getMode() === SHUFFLE ? `Disable shuffle mode`
                                              : [`Enable shuffle mode`, SHUFFLE_MODE_TOOLTIP]));

        this.repeatTooltip = this.tooltipContext.createTooltip(this.$repeat(), () => (this.getMode() === REPEAT ? `Disable repeat mode`
                                             : `Enable repeat mode`));

        this.justDeactivatedMouseLeft = this.justDeactivatedMouseLeft.bind(this);
        this.shuffleClicked = this.shuffleClicked.bind(this);
        this.repeatClicked = this.repeatClicked.bind(this);
        this.update = this.update.bind(this);

        this.playlist.on(`modeChange`, this.update);

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
        this.setMode(this.getMode() === SHUFFLE ? NORMAL : SHUFFLE);

        if (this.getMode() !== SHUFFLE) {
            this.$shuffle().addClass(`just-deactivated`);
        }
        this.$shuffle().addEventListener(`mouseleave`, this.justDeactivatedMouseLeft);
    }

    repeatClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.$allButtons().removeClass(`just-deactivated`);
        this.setMode(this.getMode() === REPEAT ? NORMAL : REPEAT);

        if (this.getMode() !== REPEAT) {
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

        this.shuffleTooltip.refresh();
        this.repeatTooltip.refresh();

    }

    setMode(mode) {
        this.playlist.tryChangeMode(mode);
    }
}
