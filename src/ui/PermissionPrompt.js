const TRANSITION_DELAY = 300;

export default class PermissionPrompt {
    constructor(opts, deps) {
        this.page = deps.page;

        this._target = this.page.$(opts.target);
        this._zIndex = opts.zIndex;
        this._dimmerClass = opts.dimmerClass;
        this._delayTimerId = -1;
        this._dimmer = null;

        this._dimBackground = this._dimBackground.bind(this);
    }

    _clearDelay() {
        this.page.clearTimeout(this._delayTimerId);
        this._delayTimerId = -1;
    }

    _promptStarted() {
        this._clearDelay();
        this._delayTimerId = this.page.setTimeout(this._dimBackground, 100);
    }

    _promptEnded() {
        this._clearDelay();
        this._undimBackground();
    }

    _dimBackground() {
        if (this._dimmer === null) {
            this._dimmer = this.page.createElement(`div`).
                            addClass([this._dimmerClass, `initial`, `transition-in`]).
                            setStyle(`zIndex`, this._zIndex).
                            appendTo(this._target).
                            forceReflow().
                            removeClass(`initial`);
        }
    }

    _undimBackground() {
        if (this._dimmer !== null) {
            const dimmer = this._dimmer;
            this._dimmer = null;
            dimmer.removeClass(`transition-in`).
                  addClass([`transition-out`, `initial`]).
                  forceReflow().
                  removeClass(`initial`);
            this.page.setTimeout(() => {
                dimmer.remove();
            }, TRANSITION_DELAY);
        }
    }

    async prompt(prompter) {
        try {
            this._promptStarted();
            return await prompter();
        } finally {
            this._promptEnded();
        }
    }
}
