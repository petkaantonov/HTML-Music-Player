import {noUndefinedGet} from "util";
import {VOLUME_CHANGE_EVENT,
        VOLUME_MUTE_EVENT} from "player/PlayerController";

export default class PlayerVolumeManager {
    constructor(opts, deps) {
        opts = noUndefinedGet(opts);
        this.page = deps.page;
        this.sliderContext = deps.sliderContext;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.player = deps.player;
        this.volumeSlider = deps.sliderContext.createSlider({
            target: opts.volumeSlider
        });

        this._domNode = this.page.$(opts.target);
        this._muteDom = this.$().find(opts.muteDom);

        this.slided = this.slided.bind(this);
        this.volumeChanged = this.volumeChanged.bind(this);
        this.muteClicked = this.muteClicked.bind(this);
        this.muteChanged = this.muteChanged.bind(this);

        this.volumeSlider.on(`slide`, this.slided);
        this.player.on(VOLUME_CHANGE_EVENT, this.volumeChanged);
        this.player.on(VOLUME_MUTE_EVENT, this.muteChanged);

        this.$mute().addEventListener(`click`, this.muteClicked);
        this.recognizerContext.createTapRecognizer(this.muteClicked).recognizeBubbledOn(this.$mute());

        this.volumeChanged();
        this.muteChanged(this.player.isMuted());
    }

    $mute() {
        return this._muteDom;
    }

    $() {
        return this._domNode;
    }

    volumeChanged() {
        if (this.player.isMuted()) {
            this.player.toggleMute();
        }
        this.volumeSlider.setValue(this.player.getVolume());
    }

    slided(percentage) {
        this.player.setVolume(percentage);
    }

    muteClicked(e) {
        this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
        this.player.toggleMute();
    }

    muteChanged(muted) {
        const elems = this.volumeSlider.$().add(
                        this.volumeSlider.$fill(),
                        this.volumeSlider.$knob());
        if (muted) {
            this.$mute().find(`.glyphicon`).
                    removeClass(`glyphicon-volume-up`).
                    addClass(`glyphicon-volume-off`);
            elems.addClass(`slider-inactive`);
        } else {
            this.$mute().find(`.glyphicon`).
                    addClass(`glyphicon-volume-up`).
                    removeClass(`glyphicon-volume-off`);
            elems.removeClass(`slider-inactive`);
        }
    }
}
