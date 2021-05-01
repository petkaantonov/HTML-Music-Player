import { animationPromisify } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import { DECELERATE_CUBIC } from "ui/ui/animation/easing";
import EventEmitter from "vendor/events";

export const ABOVE_TOOLBAR_Z_INDEX = 942;
const DURATION = 300;

const animationOptions: KeyframeAnimationOptions = {
    duration: DURATION,
    easing: DECELERATE_CUBIC,
    fill: `both`,
    composite: "replace",
};

type Deps = SelectDeps<"page" | "globalEvents">;
interface Opts {
    toolbars: string[];
    activeToolbar: string;
}

export default class ToolbarManager extends EventEmitter {
    private _page: Page;
    private _globalEvents: GlobalEvents;
    private _toolbars: DomWrapper[];
    private _rect: DOMRect;
    private _activeToolbarIndex: number;
    private _currentActivation: null | Promise<any>;
    constructor(opts: Opts, deps: Deps) {
        super();
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._toolbars = opts.toolbars.map(sel => this._page.$(sel));
        this._rect = this._toolbars[0]![0]!.getBoundingClientRect();
        this._activeToolbarIndex = -1;
        const activeToolbarIndex = opts.toolbars.findIndex(t => t === opts.activeToolbar);
        if (activeToolbarIndex < 0) {
            throw new Error(`opts.activeToolbar not found: ${opts.activeToolbar}`);
        }
        this._toolbars.forEach(t => t.hide());
        this._toolbars[activeToolbarIndex]!.show(`grid`);
        this._activeToolbarIndex = activeToolbarIndex;
        this._globalEvents.on(`resize`, this._resize);
        this._currentActivation = null;
    }

    async activateToolbar(index: number, animationAppropriate: boolean) {
        if (index === this._activeToolbarIndex) {
            return;
        }

        if (this._currentActivation) {
            await this._currentActivation;
            this._currentActivation = null;
        }
        const currentlyActiveIndex = this._activeToolbarIndex;
        const toolbar = this._toolbars[index]!.show(`grid`);
        const currentToolbar = this._toolbars[currentlyActiveIndex]!;

        let promises: Promise<void>[] | undefined;
        this._activeToolbarIndex = index;

        animationOptions.duration = animationAppropriate ? DURATION : 0;

        if (index > currentlyActiveIndex) {
            toolbar.setTransform(`translate3d(-${this._rect.width}px, 0, 0)`);
            promises = [
                animationPromisify(toolbar.animateTranslate(-this._rect.width, 0, 0, 0, animationOptions)),
                animationPromisify(currentToolbar.animateTranslate(0, 0, this._rect.width, 0, animationOptions)),
            ];
        } else if (index < currentlyActiveIndex) {
            toolbar.setTransform(`translate3d(${this._rect.width}px, 0, 0)`);
            promises = [
                animationPromisify(toolbar.animateTranslate(this._rect.width, 0, 0, 0, animationOptions)),
                animationPromisify(currentToolbar.animateTranslate(0, 0, -this._rect.width, 0, animationOptions)),
            ];
        }

        this._currentActivation = Promise.all(promises!);
    }

    _resize = () => {
        this._rect = this._toolbars[0]![0]!.getBoundingClientRect();
    };
}
