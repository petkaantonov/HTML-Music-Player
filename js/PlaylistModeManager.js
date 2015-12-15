const PlaylistModeManager = (function() {"use strict";

const SHUFFLE = "shuffle";
const NORMAL = "normal";
const REPEAT = "repeat";

const SHUFFLE_MODE_TOOLTIP = "<p>The next track is randomly chosen. Higher rated tracks " +
        "and tracks that have not been recently played are more likely to be chosen.</p>";

function PlaylistModeManager(dom, playlist) {
    var self = this;
    this.playlist = playlist;
    this._domNode = $(dom);

    this.shuffleTooltip = GlobalUi.makeTooltip(this.$shuffle(), function() {
        return self.getMode() === SHUFFLE ? "<p><strong>Disable</strong> shuffle mode</p>"
                                          : "<p><strong>Enable</strong> shuffle mode</p>" +
                                            SHUFFLE_MODE_TOOLTIP;
    });

    this.repeatTooltip = GlobalUi.makeTooltip(this.$repeat(), function() {
        return self.getMode() === REPEAT ? "<p><strong>Disable</strong> repeat mode</p>"
                                         : "<p><strong>Enable</strong> repeat mode</p>";
    });

    this.shuffleClicked = this.shuffleClicked.bind(this);
    this.repeatClicked = this.repeatClicked.bind(this);
    this.update = this.update.bind(this);

    playlist.on("modeChange", this.update);
    this.$shuffle().on("click", this.shuffleClicked);
    this.$repeat().on("click", this.repeatClicked);

    this.update();
}

PlaylistModeManager.prototype.$ = function() {
    return this._domNode;
};

PlaylistModeManager.prototype.$allButtons = function() {
    return this.$shuffle().add(this.$repeat());
};

PlaylistModeManager.prototype.$shuffle = function() {
    return this.$().find(".shuffle-mode-button");
};

PlaylistModeManager.prototype.$repeat = function() {
    return this.$().find(".repeat-mode-button");
};

PlaylistModeManager.prototype.shuffleClicked = function() {
    this.$allButtons().removeClass("just-deactivated");
    this.setMode(this.getMode() === SHUFFLE ? NORMAL : SHUFFLE);

    if (this.getMode() !== SHUFFLE) {
        this.$shuffle().addClass("just-deactivated");
    }
    this.$shuffle().one("mouseleave", function() {
        $(this).removeClass("just-deactivated");
    });
};

PlaylistModeManager.prototype.repeatClicked = function() {
    this.$allButtons().removeClass("just-deactivated");
    this.setMode(this.getMode() === REPEAT ? NORMAL : REPEAT);

    if (this.getMode() !== REPEAT) {
        this.$repeat().addClass("just-deactivated");
    }

    this.$repeat().one("mouseleave", function() {
        $(this).removeClass("just-deactivated");
    });
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



return PlaylistModeManager; })();
