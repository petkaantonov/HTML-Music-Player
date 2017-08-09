import EventEmitter from "events";
import {equals, _, animationPromisify} from "util";
import {DECELERATE_CUBIC} from "ui/animation/easing";

export const ABOVE_TOOLBAR_Z_INDEX = 942;
const DURATION = 300;

const animationOptions = {
    duration: DURATION,
    easing: DECELERATE_CUBIC,
    fill: `both`,
    noComposite: true
};

export default class ToolbarManager extends EventEmitter {
    constructor(opts, deps) {
        super();
        this._page = deps.page;
        this._globalEvents = deps.globalEvents;
        this._currentToolbar = 0;
        this._toolbars = opts.toolbars.map(sel => this._page.$(sel));
        this._rect = this._toolbars[0][0].getBoundingClientRect();
        this._activeToolbarIndex = -1;
        const activeToolbarIndex = opts.toolbars.findIndex(equals(opts.activeToolbar));
        if (activeToolbarIndex < 0) {
            throw new Error(`opts.activeToolbar not found: ${opts.activeToolbar}`);
        }
        this._toolbars.forEach(_.hide);
        this._toolbars[activeToolbarIndex].show("grid");
        this._activeToolbarIndex = activeToolbarIndex;
        this._globalEvents.on(`resize`, this._resize.bind(this));
        this._currentActivation = null;
    }

    async activateToolbar(index, animationAppropriate) {
        if (index === this._activeToolbarIndex) {
            return;
        }

        if (this._currentActivation) {
            await this._currentActivation;
            this._currentActivation = null;
        }
        const currentlyActiveIndex = this._activeToolbarIndex;
        const toolbar = this._toolbars[index].show("grid");
        const currentToolbar = this._toolbars[currentlyActiveIndex];

        let promises;
        this._activeToolbarIndex = index;

        animationOptions.duration = animationAppropriate ? DURATION : 0;

        if (index > currentlyActiveIndex) {
            toolbar.setTransform(`translate3d(-${this._rect.width}px, 0, 0)`);
            promises = [
                animationPromisify(toolbar.animateTranslate(-this._rect.width, 0, 0, 0, animationOptions)),
                animationPromisify(currentToolbar.animateTranslate(0, 0, this._rect.width, 0, animationOptions))
            ];
        } else if (index < currentlyActiveIndex) {
            toolbar.setTransform(`translate3d(${this._rect.width}px, 0, 0)`);
            promises = [
                animationPromisify(toolbar.animateTranslate(this._rect.width, 0, 0, 0, animationOptions)),
                animationPromisify(currentToolbar.animateTranslate(0, 0, -this._rect.width, 0, animationOptions))
            ];
        }


        this._currentActivation = Promise.all(promises);
    }

    _resize() {
        this._rect = this._toolbars[0][0].getBoundingClientRect();
    }

}
