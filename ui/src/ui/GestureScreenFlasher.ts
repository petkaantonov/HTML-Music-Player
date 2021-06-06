import { DECELERATE_CUBIC } from "shared/src/easing";
import { typedKeys } from "shared/types/helpers";
import { animationPromisify } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { BaseKeyFrames, DomWrapper } from "ui/platform/dom/Page";

const fadeInAnimationOptions: KeyframeAnimationOptions = {
    fill: `both`,
    easing: DECELERATE_CUBIC,
    duration: 250,
};

const fadeOutAnimationOptions: KeyframeAnimationOptions = {
    fill: `both`,
    easing: DECELERATE_CUBIC,
    duration: 250,
    direction: `reverse`,
};

const fadeKeyFrames: BaseKeyFrames = [
    {
        opacity: 0,
    },
    {
        opacity: 0.8,
    },
];

const gestureIcon = function (icon: string) {
    return `<div class="gesture-flash"><span class="gesture-flash-icon ${icon}"></span></div>`;
};

const gestureNameMap = {
    next: gestureIcon(`glyphicon glyphicon-step-forward`),
    previous: gestureIcon(`glyphicon glyphicon-step-backward`),
};

type GestureKey = keyof typeof gestureNameMap;

type Deps = SelectDeps<"page">;

export default class GestureScreenFlasher {
    private _page: Page;
    private _gestureMap: Partial<Record<GestureKey, DomWrapper>>;
    private _current: null | Promise<void>;
    private _queue: GestureKey[];

    constructor(deps: Deps) {
        this._page = deps.page;
        this._queue = [];
        this._current = null;
        this._gestureMap = {};
        typedKeys(gestureNameMap).forEach(key => {
            this._gestureMap[key] = this._page.parse(gestureNameMap[key]);
        });
    }

    _next() {
        this._current = null;
        if (this._queue.length === 0) return;
        const name = this._queue.shift()!;
        const $dom = this._gestureMap[name]!.remove().removeAttribute(`style`);
        $dom.appendTo(`body`);

        const fadeIn = $dom.animate(fadeKeyFrames, fadeInAnimationOptions);
        fadeIn.pause();

        const fadeOut = $dom.animate(fadeKeyFrames, fadeOutAnimationOptions);
        fadeOut.pause();

        this._current = (async () => {
            try {
                fadeIn.play();
                await animationPromisify(fadeIn);
                fadeOut.play();
                await animationPromisify(fadeOut);
                $dom.remove().removeAttribute(`style`);
            } finally {
                this._next();
            }
        })();
    }

    flashGesture(name: GestureKey) {
        if (this._current) {
            this._queue[0] = name;
            return;
        }
        this._queue.push(name);
        if (!this._current) {
            this._next();
        }
    }
}
