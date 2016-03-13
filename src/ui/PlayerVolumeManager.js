"use strict";
import $ from "lib/jquery";

export default function PlayerVolumeManager(dom, player, opts) {
    var self = this;
    opts = Object(opts);
    this.sliderMaker = opts.sliderMaker;
    this.recognizerMaker = opts.recognizerMaker;
    this.rippler = opts.rippler;
    this.player = player;
    this.tooltipMaker = opts.tooltipMaker;
    this.volumeSlider = opts.sliderMaker.createSlider(opts.volumeSlider);

    this._domNode = $(dom);
    this._muteDom = this.$().find(opts.muteDom);
    this._muteTooltip = this.tooltipMaker.makeTooltip(this.$mute(),function() {
        return self.player.isMuted() ? "<p><strong>Unmute</strong> volume.</p>"
                                     : "<p><strong>Mute</strong> volume.</p>";
    });

    this.slided = this.slided.bind(this);
    this.volumeChanged = this.volumeChanged.bind(this);
    this.muteClicked = this.muteClicked.bind(this);
    this.muteChanged = this.muteChanged.bind(this);

    this.volumeSlider.on("slide", this.slided);
    this.player.on("volumeChange", this.volumeChanged);
    this.player.on("muted", this.muteChanged);

    this.$mute().click(this.muteClicked);
    this.recognizerMaker.createTapRecognizer(this.muteClicked).recognizeBubbledOn(this.$mute());

    this.volumeChanged();
    this.muteChanged(this.player.isMuted());
}


PlayerVolumeManager.prototype.$mute = function() {
    return this._muteDom;
};

PlayerVolumeManager.prototype.$ = function() {
    return this._domNode;
};

PlayerVolumeManager.prototype.volumeChanged = function() {
    if (this.player.isMuted()) {
        this.player.toggleMute();
    }
    this.volumeSlider.setValue(this.player.getVolume());
};

PlayerVolumeManager.prototype.slided = function(percentage) {
    this.player.setVolume(percentage);
};

PlayerVolumeManager.prototype.muteClicked = function(e) {
    this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.player.toggleMute();
};

PlayerVolumeManager.prototype.muteChanged = function(muted) {
    var elems = this.volumeSlider.$().add(
                    this.volumeSlider.$fill(),
                    this.volumeSlider.$knob());
    if (muted) {
        this.$mute().find(".glyphicon")
                .removeClass("glyphicon-volume-up")
                .addClass("glyphicon-volume-off");
        elems.addClass("slider-inactive");
    } else {
        this.$mute().find(".glyphicon")
                .addClass("glyphicon-volume-up")
                .removeClass("glyphicon-volume-off");
        elems.removeClass("slider-inactive");
    }
    this._muteTooltip.refresh();
};
