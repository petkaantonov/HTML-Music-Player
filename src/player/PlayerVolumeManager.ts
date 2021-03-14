import { SelectDeps } from "Application";
import Page, { DomWrapper, DomWrapperSelector } from "platform/dom/Page";
import GestureObject from "ui/gestures/GestureObject";
import GestureRecognizerContext from "ui/gestures/GestureRecognizerContext";
import Rippler from "ui/Rippler";
import Slider from "ui/Slider";
import SliderContext from "ui/SliderContext";

import PlayerController from "./PlayerController";

type Deps = SelectDeps<"page" | "sliderContext" | "recognizerContext" | "rippler" | "player">;

interface Opts {
    muteDom: DomWrapperSelector;
    volumeSlider: DomWrapperSelector;
}

export default class PlayerVolumeManager {
    page: Page;
    sliderContext: SliderContext;
    recognizerContext: GestureRecognizerContext;
    rippler: Rippler;
    player: PlayerController;
    volumeSlider: Slider;
    private _muteDom: DomWrapper;

    constructor(opts: Opts, deps: Deps) {
        this.page = deps.page;
        this.sliderContext = deps.sliderContext;
        this.recognizerContext = deps.recognizerContext;
        this.rippler = deps.rippler;
        this.player = deps.player;
        this.volumeSlider = deps.sliderContext.createSlider({
            target: opts.volumeSlider,
        });

        this._muteDom = this.page.$(opts.muteDom);
        this.volumeSlider.on(`slide`, this.slided);
        this.player.on("volumeChanged", this.volumeChanged);
        this.player.on("volumeMuted", this.muteChanged);

        this.$mute().addEventListener(`click`, this.muteClicked);
        this.recognizerContext.createTapRecognizer(this.muteClicked).recognizeBubbledOn(this.$mute());

        this.volumeChanged();
        this.muteChanged(this.player.isMuted());
    }

    $mute() {
        return this._muteDom;
    }

    volumeChanged = () => {
        if (this.player.isMuted()) {
            this.player.toggleMute();
        }
        this.volumeSlider.setValue(this.player.getVolume());
    };

    slided = (percentage: number) => {
        this.player.setVolume(percentage);
    };

    muteClicked = (e: MouseEvent | GestureObject) => {
        this.rippler.rippleElement(e.currentTarget as HTMLElement, e.clientX, e.clientY);
        this.player.toggleMute();
    };

    muteChanged(muted: boolean) {
        const elems = this.volumeSlider.$().add(this.volumeSlider.$fill(), this.volumeSlider.$knob());
        if (muted) {
            this.$mute().find(`.glyphicon`).removeClass(`glyphicon-volume-up`).addClass(`glyphicon-volume-off`);
            elems.addClass(`slider-inactive`);
        } else {
            this.$mute().find(`.glyphicon`).addClass(`glyphicon-volume-up`).removeClass(`glyphicon-volume-off`);
            elems.removeClass(`slider-inactive`);
        }
    }
}
