import { animationPromisify } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector } from "ui/platform/dom/Page";
import { DECELERATE_QUINT, LINEAR } from "ui/ui/animation/easing";

const BOUNDED_OPACITY_DURATION = 850;
const BOUNDED_RADIUS_DURATION = 650;
const UNBOUNDED_OPACITY_DURATION = 600;
const UNBOUNDED_RADIUS_DURATION = 300;

const UNBOUNDED_START_OPACITY = 0.4;
const UNBOUNDED_END_OPACITY = 0.0;
const BOUNDED_START_OPACITY = 0.14;
const BOUNDED_END_OPACITY = 0.0;

const boundedOpacityAnimationKeyFrames = [{ opacity: BOUNDED_START_OPACITY }, { opacity: BOUNDED_END_OPACITY }];

const boundedOpacityAnimationOptions: KeyframeAnimationOptions = {
    duration: BOUNDED_OPACITY_DURATION,
    easing: LINEAR,
    // Fill: `both`
};

const boundedScaleAnimationOptions: KeyframeAnimationOptions = {
    easing: DECELERATE_QUINT,
    duration: BOUNDED_RADIUS_DURATION,
};

const unboundedOpacityAnimationKeyFrames = [{ opacity: UNBOUNDED_START_OPACITY }, { opacity: UNBOUNDED_END_OPACITY }];

const unboundedOpacityAnimationOptions: KeyframeAnimationOptions = {
    duration: UNBOUNDED_OPACITY_DURATION,
    easing: LINEAR,
    fill: `both`,
};

const unboundedScaleAnimationOptions: KeyframeAnimationOptions = {
    easing: DECELERATE_QUINT,
    duration: UNBOUNDED_RADIUS_DURATION,
    fill: `both`,
};

const BASE_RADIUS = 250;
const radiusToScale = function (radius: number) {
    return radius / BASE_RADIUS;
};

type BoundingType = "unbounded" | "bounded";

export class Ripple {
    readonly rippler: Rippler;
    x: number;
    y: number;
    boundsRect: DOMRect | null;
    color: string | null;
    bounderNode: DomWrapper;
    rippleNode: DomWrapper;
    animations: null | Animation[];
    type: BoundingType;
    id: null | HTMLElement;
    private _promise: null | Promise<any>;

    constructor(rippler: Rippler) {
        this.rippler = rippler;
        this.x = -1;
        this.y = -1;
        this.boundsRect = null;
        this.color = null;
        this.bounderNode = this.page().NULL();
        this.rippleNode = this.page().NULL();
        this.animations = null;
        this.type = `unbounded`;
        this.id = null;
        this._promise = null;
    }

    finished() {
        return Promise.resolve(this._promise);
    }

    $bounder() {
        return this.bounderNode;
    }

    $ripple() {
        return this.rippleNode;
    }

    initBoundedDom() {
        const boundsRect = this.boundsRect!;
        const color = this.color!;
        this.bounderNode = this.page()
            .createElement(`div`, { class: `bounder-node` })
            .setStyles({
                transform: `translate3d(${boundsRect.left}px, ${boundsRect.top}px, 0)`,
                width: `${boundsRect.width}px`,
                height: `${boundsRect.height}px`,
            });

        const x = this.x - boundsRect.left - BASE_RADIUS;
        const y = this.y - boundsRect.top - BASE_RADIUS;

        this.rippleNode = this.page()
            .createElement(`div`, { class: `ripple-node` })
            .setStyles({
                backgroundColor: color,
                transform: `translate3d(${x}px, ${y}px, 0)`,
                width: `${BASE_RADIUS * 2}px`,
                height: `${BASE_RADIUS * 2}px`,
            });

        this.rippleNode.appendTo(this.bounderNode);
        this.bounderNode.appendTo(this.rippler.$());
    }

    initUnboundedDom() {
        const color = this.color!;
        const x = this.x - BASE_RADIUS;
        const y = this.y - BASE_RADIUS;
        this.rippleNode = this.page()
            .createElement(`div`, { class: `ripple-node` })
            .setStyles({
                backgroundColor: color,
                transform: `translate3d(${x}px, ${y}px, 0)`,
                width: `${BASE_RADIUS * 2}px`,
                height: `${BASE_RADIUS * 2}px`,
            });

        this.rippleNode.appendTo(this.rippler.$());
    }

    _getScaleAnimationKeyFrames(startScale: number, endScale: number) {
        return this.$ripple().getScaleKeyFrames(startScale, startScale, endScale, endScale);
    }

    async initBounded(x: number, y: number, boundsRect: DOMRect, color: string, zIndex: number) {
        this.id = null;
        this.type = `bounded`;
        this.x = x;
        this.y = y;
        this.boundsRect = boundsRect;
        this.color = color;
        this.initBoundedDom();

        this.$ripple().setStyle(`zIndex`, zIndex + "");
        this.$bounder().setStyle(`zIndex`, zIndex + "");

        const centerX = boundsRect.left + boundsRect.width / 2;
        const centerY = boundsRect.top + boundsRect.height / 2;

        const cornerX = x > centerX ? boundsRect.left : boundsRect.right;
        const cornerY = y > centerY ? boundsRect.top : boundsRect.bottom;

        const endRadius = Math.sqrt(Math.pow(Math.abs(cornerX - x), 2) + Math.pow(Math.abs(cornerY - y), 2)) * 1.1;

        const startScale = radiusToScale(1);
        const endScale = radiusToScale(endRadius);

        const opacityAnimation = this.$ripple().animate(
            boundedOpacityAnimationKeyFrames,
            boundedOpacityAnimationOptions
        );
        const scaleAnimation = this.$ripple().animate(
            this._getScaleAnimationKeyFrames(startScale, endScale),
            boundedScaleAnimationOptions
        );

        this.animations = [opacityAnimation, scaleAnimation];

        try {
            this._promise = Promise.all(this.animations.map(animationPromisify));
            await this._promise;
        } finally {
            this.end();
        }
    }

    async initUnbounded(x: number, y: number, size: number, color: string) {
        this.id = null;
        this.type = `unbounded`;
        this.x = x;
        this.y = y;
        this.color = color;
        this.initUnboundedDom();

        this.$ripple().setStyle(`zIndex`, ``);

        const endRadius = size;
        const startScale = radiusToScale(1);
        const endScale = radiusToScale(endRadius);
        const opacityAnimation = this.$ripple().animate(
            unboundedOpacityAnimationKeyFrames,
            unboundedOpacityAnimationOptions
        );
        const scaleAnimation = this.$ripple().animate(
            this._getScaleAnimationKeyFrames(startScale, endScale),
            unboundedScaleAnimationOptions
        );
        this.animations = [opacityAnimation, scaleAnimation];
        try {
            this._promise = Promise.all(this.animations.map(animationPromisify));
            await this._promise;
        } finally {
            this.end();
        }
    }

    cancel() {
        if (this.animations) {
            this.animations.forEach(a => a.cancel());
            this.$bounder().remove();
            this.$ripple().remove();
        }
    }

    end() {
        this._promise = null;
        this.animations = null;
        this.$bounder().remove();
        this.$ripple().remove();
        this.rippleNode = this.page().NULL();
        this.bounderNode = this.page().NULL();
        this.rippler.rippleEnded(this);
    }

    page() {
        return this.rippler._page;
    }
}

type Deps = SelectDeps<"page">;

interface Opts {
    target: DomWrapperSelector;
    zIndex: number;
}

export default class Rippler {
    readonly _page: Page;
    private _domNode: any;
    private _ongoingRipples: Ripple[];
    private _shown: boolean;
    private _baseZIndex: number;

    constructor(opts: Opts, deps: Deps) {
        this._page = deps.page;
        this._domNode = this._page.$(opts.target);
        this._ongoingRipples = [];
        this._shown = false;
        this._baseZIndex = opts.zIndex;
    }

    $() {
        return this._domNode;
    }

    rippleStarted(ripple: Ripple) {
        this._ongoingRipples.push(ripple);
        if (this._shown) return;
        this._shown = true;
    }

    rippleEnded(ripple: Ripple) {
        const i = this._ongoingRipples.indexOf(ripple);
        if (i >= 0) {
            this._ongoingRipples.splice(i, 1);
        }
        if (this._ongoingRipples.length === 0) {
            this._shown = false;
        }
    }

    rippleElement(elem: HTMLElement, x: number, y: number, color?: string, zIndex?: number) {
        const $elem = this._page.$(elem).eq(0);
        const rect = $elem[0]!.getBoundingClientRect();
        const id = $elem[0];

        for (let i = 0; i < this._ongoingRipples.length; ++i) {
            if (this._ongoingRipples[i]!.id === id) {
                return this._ongoingRipples[i]!;
            }
        }

        if (!color) color = `#000`;

        const ripple = new Ripple(this);
        this.rippleStarted(ripple);
        void ripple.initBounded(x, y, rect, color, zIndex ?? this._baseZIndex);
        ripple.id = id!;

        for (let i = 0; i < this._ongoingRipples.length; ++i) {
            const ongoingRipple = this._ongoingRipples[i]!;
            if (ongoingRipple.type === `unbounded`) {
                for (const anim of ongoingRipple.animations!) {
                    anim.cancel();
                }
            }
        }
        return ripple;
    }

    rippleAt(x: number, y: number, size: number, color = `#777`) {
        for (let i = 0; i < this._ongoingRipples.length; ++i) {
            const ongoingRipple = this._ongoingRipples[i]!;
            if (ongoingRipple.type === `bounded`) {
                return;
            } else {
                const deltaX = Math.abs(x - ongoingRipple.x);
                const deltaY = Math.abs(y - ongoingRipple.y);
                if (deltaX < 24 && deltaY < 24) {
                    return;
                }
            }
        }

        const ripple = new Ripple(this);
        this.rippleStarted(ripple);
        void ripple.initUnbounded(x, y, size, color);
    }
}
