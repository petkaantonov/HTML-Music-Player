const PlayerVolumeManager = (function() {"use strict";

function PlayerVolumeManager(dom, player, opts) {
    var self = this;
    opts = Object(opts);
    this.player = player;
    this.volumeSlider = opts.volumeSlider;

    this._domNode = $(dom);
    this._muteDom = this.$().find(opts.muteDom);
    this._muteTooltip = PanelControls.makeTooltip(this.$mute(),function() {
        return self.player.isMuted() ? "<p><strong>Unmute</strong> volume.</p>"
                                     : "<p><strong>Mute</strong> volume.</p>";
    });

    this.slideBegun = this.slideBegun.bind(this);
    this.slideEnded = this.slideEnded.bind(this);
    this.slided = this.slided.bind(this);
    this.volumeChanged = this.volumeChanged.bind(this);
    this.muteClicked = this.muteClicked.bind(this);
    this.muteChanged = this.muteChanged.bind(this);

    this.volumeSlider.on("slideBegin", this.slideBegun);
    this.volumeSlider.on("slideEnd", this.slideEnded);
    this.volumeSlider.on("slide", this.slided);
    this.player.on("volumeChange", this.volumeChanged);
    this.player.on("muted", this.muteChanged);
    this.$mute().click(this.muteClicked);
    this.volumeChanged();
    this.muteChanged(this.player.isMuted());
}


PlayerVolumeManager.prototype.$mute = function() {
    return this._muteDom;
};

PlayerVolumeManager.prototype.$sliderBg = function() {
    return this.volumeSlider.$().find(".slider-bg");
};

PlayerVolumeManager.prototype.$sliderKnob = function() {
    return this.volumeSlider.$().find(".slider-knob");
};

PlayerVolumeManager.prototype.$ = function() {
    return this._domNode;
};

PlayerVolumeManager.prototype.volumeChanged = function() {
    if (this.player.isMuted()) {
        this.player.toggleMute();
    }
    var p = this.player.getVolume();
    var width = this.$sliderKnob().parent().width();
    this.$sliderBg().css("width", p * width);
    this.$sliderKnob().css("left", p * (width - 5) - 5);
};

PlayerVolumeManager.prototype.slideBegun = function() {};
PlayerVolumeManager.prototype.slideEnded = function(percentage) {};
PlayerVolumeManager.prototype.slided = function(percentage) {
    this.player.setVolume(percentage);
};

PlayerVolumeManager.prototype.muteClicked = function() {
    this.player.toggleMute();
};

PlayerVolumeManager.prototype.muteChanged = function(muted) {
    var elems = this.volumeSlider.$().add(
                    this.$sliderBg(),
                    this.$sliderKnob());
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

return PlayerVolumeManager;})();
