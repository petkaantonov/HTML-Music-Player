import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";

const TRANSITION_DELAY = 300;

type Deps = SelectDeps<"page">;

interface Opts {
    target: DomWrapperSelector;
    zIndex: number;
    dimmerClass: string;
}

export default class PermissionPrompt {
    page: Page;
    private _target: DomWrapper;
    private _zIndex: number;
    private _dimmerClass: string;
    private _delayTimerId: number;
    private _dimmer: null | DomWrapper;
    constructor(opts: Opts, deps: Deps) {
        this.page = deps.page;

        this._target = this.page.$(opts.target);
        this._zIndex = opts.zIndex;
        this._dimmerClass = opts.dimmerClass;
        this._delayTimerId = -1;
        this._dimmer = null;
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

    _dimBackground = () => {
        if (this._dimmer === null) {
            this._dimmer = this.page
                .createElement(`div`)
                .addClass([this._dimmerClass, `initial`, `transition-in`])
                .setStyle(`zIndex`, this._zIndex.toString())
                .appendTo(this._target)
                .forceReflow()
                .removeClass(`initial`);
        }
    };

    _undimBackground() {
        if (this._dimmer !== null) {
            const dimmer = this._dimmer;
            this._dimmer = null;
            dimmer
                .removeClass(`transition-in`)
                .addClass([`transition-out`, `initial`])
                .forceReflow()
                .removeClass(`initial`);
            this.page.setTimeout(() => {
                dimmer.remove();
            }, TRANSITION_DELAY);
        }
    }

    async prompt<T>(prompter: () => Promise<T>) {
        try {
            this._promptStarted();
            return await prompter();
        } finally {
            this._promptEnded();
        }
    }
}
