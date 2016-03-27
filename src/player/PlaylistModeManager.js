"use strict";

const SHUFFLE = "shuffle";
const NORMAL = "normal";
const REPEAT = "repeat";
const SHUFFLE_MODE_TOOLTIP = "<p>The next track is randomly chosen. Higher rated tracks " +
        "and tracks that have not been recently played are more likely to be chosen.</p>";

export default function PlaylistModeManager(opts, deps) {
    opts = Object(opts);
    this.page = deps.page;
    this.recognizerContext = deps.recognizerContext;
    this.rippler = deps.rippler;
    this.tooltipContext = deps.tooltipContext;
    this.playlist = deps.playlist;
    var self = this;
    this._domNode = this.page.$(opts.target).eq(0);
    this._shuffleButton = this.$().find(".shuffle-mode-button");
    this._repeatButton = this.$().find(".repeat-mode-button");

    this.shuffleTooltip = this.tooltipContext.createTooltip(this.$shuffle(), function() {
        return self.getMode() === SHUFFLE ? "<p><strong>Disable</strong> shuffle mode</p>"
                                          : "<p><strong>Enable</strong> shuffle mode</p>" +
                                            SHUFFLE_MODE_TOOLTIP;
    });

    this.repeatTooltip = this.tooltipContext.createTooltip(this.$repeat(), function() {
        return self.getMode() === REPEAT ? "<p><strong>Disable</strong> repeat mode</p>"
                                         : "<p><strong>Enable</strong> repeat mode</p>";
    });

    this.justDeactivatedMouseLeft = this.justDeactivatedMouseLeft.bind(this);
    this.shuffleClicked = this.shuffleClicked.bind(this);
    this.repeatClicked = this.repeatClicked.bind(this);
    this.update = this.update.bind(this);

    this.playlist.on("modeChange", this.update);

    this.$shuffle().addEventListener("click", this.shuffleClicked);
    this.$repeat().addEventListener("click", this.repeatClicked);
    this.recognizerContext.createTapRecognizer(this.shuffleClicked).recognizeBubbledOn(this.$shuffle());
    this.recognizerContext.createTapRecognizer(this.repeatClicked).recognizeBubbledOn(this.$repeat());
    this.update();
    deps.ensure();
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
