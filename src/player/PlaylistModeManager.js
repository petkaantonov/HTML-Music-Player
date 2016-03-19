"use strict";

const SHUFFLE = "shuffle";
const NORMAL = "normal";
const REPEAT = "repeat";
const SHUFFLE_MODE_TOOLTIP = "<p>The next track is randomly chosen. Higher rated tracks " +
        "and tracks that have not been recently played are more likely to be chosen.</p>";

var instance = false;
export default function PlaylistModeManager(dom, playlist, opts) {
    if (instance) throw new Error("only one instance can be made");
    instance = true;
    opts = Object(opts);
    this.page = opts.page;
    this.recognizerContext = opts.recognizerContext;
    this.rippler = opts.rippler;
    this.tooltipContext = opts.tooltipContext;
    var self = this;
    this.playlist = playlist;
    this._domNode = this.page.$(dom).eq(0);
    this._shuffleButton = this.$().find(".shuffle-mode-button");
    this._repeatButton = this.$().find(".repeat-mode-button");

    this.shuffleTooltip = this.tooltipContext.makeTooltip(this.$shuffle(), function() {
        return self.getMode() === SHUFFLE ? "<p><strong>Disable</strong> shuffle mode</p>"
                                          : "<p><strong>Enable</strong> shuffle mode</p>" +
                                            SHUFFLE_MODE_TOOLTIP;
    });

    this.repeatTooltip = this.tooltipContext.makeTooltip(this.$repeat(), function() {
        return self.getMode() === REPEAT ? "<p><strong>Disable</strong> repeat mode</p>"
                                         : "<p><strong>Enable</strong> repeat mode</p>";
    });

    this.justDeactivatedMouseLeft = this.justDeactivatedMouseLeft.bind(this);
    this.shuffleClicked = this.shuffleClicked.bind(this);
    this.repeatClicked = this.repeatClicked.bind(this);
    this.update = this.update.bind(this);

    playlist.on("modeChange", this.update);

    this.$shuffle().addEventListener("click", this.shuffleClicked);
    this.$repeat().addEventListener("click", this.repeatClicked);
    this.recognizerContext.createTapRecognizer(this.shuffleClicked).recognizeBubbledOn(this.$shuffle());
    this.recognizerContext.createTapRecognizer(this.repeatClicked).recognizeBubbledOn(this.$repeat());
    this.update();
}

PlaylistModeManager.prototype.$ = function() {
    return this._domNode;
};

PlaylistModeManager.prototype.$allButtons = function() {
    return this.$shuffle().add(this.$repeat());
};

PlaylistModeManager.prototype.$shuffle = function() {
    return this._shuffleButton;
};

PlaylistModeManager.prototype.$repeat = function() {
    return this._repeatButton;
};

PlaylistModeManager.prototype.justDeactivatedMouseLeft = function(e) {
    e.currentTarget.removeEventListener("mouseleave", this.justDeactivatedMouseLeft);
    e.currentTarget.classList.remove("just-deactivated");
};

PlaylistModeManager.prototype.shuffleClicked = function(e) {
    this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.$allButtons().removeClass("just-deactivated");
    this.setMode(this.getMode() === SHUFFLE ? NORMAL : SHUFFLE);

    if (this.getMode() !== SHUFFLE) {
        this.$shuffle().addClass("just-deactivated");
    }
    this.$shuffle().addEventListener("mouseleave", this.justDeactivatedMouseLeft);
};

PlaylistModeManager.prototype.repeatClicked = function(e) {
    this.rippler.rippleElement(e.currentTarget, e.clientX, e.clientY);
    this.$allButtons().removeClass("just-deactivated");
    this.setMode(this.getMode() === REPEAT ? NORMAL : REPEAT);

    if (this.getMode() !== REPEAT) {
        this.$repeat().addClass("just-deactivated");
    }

    this.$repeat().addEventListener("mouseleave", this.justDeactivatedMouseLeft);
};

PlaylistModeManager.prototype.getMode = function() {
    return this.playlist.getMode();
};

PlaylistModeManager.prototype.update = function() {
    this.$allButtons().removeClass("active");

    switch (this.getMode()) {
        case "shuffle":
        this.$shuffle().addClass("active");
        break;

        case "repeat":
        this.$repeat().addClass("active");
        break;
    }

    this.shuffleTooltip.refresh();
    this.repeatTooltip.refresh();

};

PlaylistModeManager.prototype.setMode = function(mode) {
    this.playlist.tryChangeMode(mode);
};
