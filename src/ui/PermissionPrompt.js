"use strict";

const TRANSITION_DELAY = 300;

export default function PermissionPrompt(opts, deps) {
    this.page = deps.page;

    this._target = this.page.$(opts.target);
    this._zIndex = opts.zIndex;
    this._dimmerClass = opts.dimmerClass;
    this._delayTimerId = -1;
    this._dimmer = null;

    this._dimBackground = this._dimBackground.bind(this);

    deps.ensure();
}

PermissionPrompt.prototype._clearDelay = function() {
    this.page.clearTimeout(this._delayTimerId);
    this._delayTimerId = -1;
};

PermissionPrompt.prototype._promptStarted = function() {
    this._clearDelay();
    this._delayTimerId = this.page.setTimeout(this._dimBackground, 100);
};

PermissionPrompt.prototype._promptEnded = function() {
    this._clearDelay();
    this._undimBackground();
};

PermissionPrompt.prototype._dimBackground = function() {
    if (this._dimmer === null) {
        this._dimmer = this.page.createElement("div")
                        .addClass([this._dimmerClass, "initial", "transition-in"])
                        .setStyle("zIndex", this._zIndex)
                        .appendTo(this._target)
                        .forceReflow()
                        .removeClass("initial");
    }
};

PermissionPrompt.prototype._undimBackground = function() {
    if (this._dimmer !== null) {
        var dimmer = this._dimmer;
        this._dimmer = null;
        dimmer.removeClass("transition-in")
              .addClass(["transition-out", "initial"])
              .forceReflow()
              .removeClass("initial");
        setTimeout(function() {
            dimmer.remove();
        }, TRANSITION_DELAY);
    }
};

PermissionPrompt.prototype.prompt = function(prompter) {
    var self = this;
    return Promise.resolve().then(function() {
        self._promptStarted();
        return prompter();
    }).finally(function() {
        self._promptEnded();
    });
};
