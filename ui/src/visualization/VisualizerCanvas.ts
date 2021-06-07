import { EventEmitterInterface } from "shared/types/helpers";
import { throttle } from "shared/util";
import { MAX_CANVAS_WIDTH } from "shared/visualizer";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapperSelector } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

type Deps = SelectDeps<"page" | "globalEvents">;

interface Opts {
    target: DomWrapperSelector;
    enabledMediaMatcher: MediaQueryList;
}

export default class VisualizerCanvas extends EventEmitter implements Deps {
    page: Page;
    globalEvents: GlobalEvents;
    canvas: HTMLCanvasElement;
    width: number = -1;
    height: number = -1;
    private sectionContainerSelector: string;
    private enabledMediaMatcher: MediaQueryList;
    private _enabled: boolean;

    constructor(opts: Opts, deps: Deps) {
        super();
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.canvas = this.page.$(opts.target).get(0)! as HTMLCanvasElement;
        this.width = -1;
        this.sectionContainerSelector = `.visualizer-section-container`;
        this.enabledMediaMatcher = opts.enabledMediaMatcher;

        // TODO: User preference
        this._enabled = true;
    }

    set enabled(val: boolean) {
        if (this._enabled !== val) {
            this._enabled = !!val;
            this.emit("visibilityChange", this);
            this._visibilityChanged();
        }
    }

    get isVisible() {
        return this.enabledMediaMatcher.matches && this._enabled;
    }

    async initialize() {
        const width = (Math.min(this.canvas.clientWidth, MAX_CANVAS_WIDTH) * this.page.devicePixelRatio()) | 0 || 120;
        const height = (this.canvas.clientHeight * this.page.devicePixelRatio()) | 0 || 50;
        this.width = width;
        this.height = height;
        this.canvas.width = width;
        this.canvas.height = height;
        this.enabledMediaMatcher.onchange = throttle(this.enabledMediaMatchChanged, 300);
        this.globalEvents.on(`resize`, this.binSizeMediaMatchChanged);
        this._visibilityChanged();
    }

    enabledMediaMatchChanged = () => {
        this.emit("visibilityChange", this);
        this._visibilityChanged();
    };

    _visibilityChanged = () => {
        if (this.isVisible) {
            this.page.$(this.canvas).closest(this.sectionContainerSelector).show("block");
        } else {
            this.page.$(this.canvas).closest(this.sectionContainerSelector).hide();
        }
    };

    binSizeMediaMatchChanged = () => {
        const width = (Math.min(MAX_CANVAS_WIDTH, this.canvas.clientWidth) * this.page.devicePixelRatio()) | 0;
        if (width !== this.width) {
            this.width = width;
            this.emit("dimensionChange", this);
        }
    };
}

interface VisualizerCanvasEventsMap {
    dimensionChange: (visualizerCanvas: VisualizerCanvas) => void;
    visibilityChange: (visualizer: VisualizerCanvas) => void;
}
export default interface VisualizerCanvas extends EventEmitterInterface<VisualizerCanvasEventsMap> {}
