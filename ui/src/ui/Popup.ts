import { PopupPreferenceKey, Xy } from "shared/src/preferences";
import { EventEmitterInterface } from "shared/types/helpers";
import { noop } from "shared/util";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, isTouchEvent, preventDefaultHandler } from "ui/platform/dom/Page";
import Env from "ui/platform/Env";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

import GestureObject from "./gestures/GestureObject";
import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import TapRecognizer from "./gestures/TapRecognizer";
import Rippler from "./Rippler";
import ContentScroller from "./scrolling/ContentScroller";
import ScrollerContext from "./scrolling/ScrollerContext";

function toFunction(val: string | (() => string)): () => string {
    if (typeof val === "string") {
        return () => val;
    }
    return val;
}

const TEMPLATE = `
    <section class="popup-header js-popup-header">
        <header class="header-text js-header-text"></header>
        <div class="header-border"></div>
        <div class="close-button js-close-button glyphicon glyphicon-remove"></div>
    </section>
    <section class="popup-body js-popup-body"></section>
    <section class="popup-footer js-popup-footer"></section>
    <section class="last-focus-item js-last-focus-item" tabindex="0"></section>
`;

export interface PopupButtonOpts {
    id: string;
    action: (e: MouseEvent | GestureObject) => void;
    text: string;
}

class PopupButton {
    private _popup: Popup;
    readonly _id: string;
    private _action: (e: MouseEvent | GestureObject) => void;
    private _text: string;
    private _enabled: boolean;
    private _domNode: any;
    private _tapRecognizer: TapRecognizer;
    constructor(popup: Popup, opts: PopupButtonOpts) {
        this._popup = popup;
        this._id = opts.id;
        this._action = opts.action;
        this._text = opts.text;
        this._enabled = true;
        this._domNode = this.page()
            .createElement(`div`)
            .addClass(`popup-button`)
            .setProperty(`tabIndex`, "0")
            .setText(this._text);
        this._tapRecognizer = this._popup.recognizerContext.createTapRecognizer(this._clicked);

        this.$().addEventListener(`click`, this._clicked).addEventListener(`mousedown`, preventDefaultHandler);
        this._tapRecognizer.recognizeBubbledOn(this.$());
    }

    page() {
        return this._popup.page;
    }

    id() {
        return this._id;
    }

    $() {
        return this._domNode;
    }

    disable() {
        if (!this._enabled) return;
        this._enabled = false;
        this.$().blur().setProperty(`tabIndex`, -1);
        this.$().addClass(`disabled`);
    }

    enable() {
        if (this._enabled) return;
        this._enabled = true;
        this.$().setProperty(`tabIndex`, 0);
        this.$().removeClass(`disabled`);
    }

    _clicked = (e: GestureObject | MouseEvent) => {
        this._popup.rippler.rippleElement(
            e.currentTarget as HTMLElement,
            e.clientX,
            e.clientY,
            undefined,
            this._popup.zIndexAbove()
        );
        if (!this._enabled) return;
        this._action.call(null, e);
    };

    destroy() {
        this.$().remove();
    }
}

type Deps = SelectDeps<"page" | "env" | "globalEvents" | "recognizerContext" | "scrollerContext" | "rippler">;

type TransitionFn = (node: DomWrapper, rect: DOMRect) => Promise<void>;

interface Opts {
    body: (() => string) | string;
    title: (() => string) | string;
    beforeTransitionIn?: TransitionFn;
    beforeTransitionOut?: TransitionFn;
    zIndex: number;
    preferenceKey: PopupPreferenceKey;
    footerButtons?: PopupButtonOpts[];
}

export default interface Popup
    extends EventEmitterInterface<{
        open: (popup: Popup, firstToOpen: boolean) => void;
        close: (popup: Popup) => void;
        layoutUpdate: () => void;
    }> {}

export default class Popup extends EventEmitter {
    preferenceKey: PopupPreferenceKey;
    page: Page;
    env: Env;
    globalEvents: GlobalEvents;
    recognizerContext: GestureRecognizerContext;
    scrollerContext: ScrollerContext;
    rippler: Rippler;
    beforeTransitionIn: TransitionFn | (() => void);
    beforeTransitionOut: TransitionFn | (() => void);
    body: () => string;
    title: () => string;
    private _x: number;
    private _y: number;
    private _rect: null | DOMRect;
    private _anchorDistanceX: number;
    private _anchorDistanceY: number;
    private _shown: boolean;
    private _dragging: boolean;
    private _frameId: number;
    private _scrollTop: number;
    private _zIndex: number;
    private _footerButtons: PopupButton[];
    private _contentScroller: null | ContentScroller;
    closerTapRecognizer: TapRecognizer;
    private _popupDom: DomWrapper;
    private _viewPort: null | { width: number; height: number };
    private _activeElementBeforeOpen: null | HTMLElement;

    constructor(opts: Opts, deps: Deps) {
        super();
        this.page = deps.page;
        this.env = deps.env;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this.scrollerContext = deps.scrollerContext;
        this.rippler = deps.rippler;
        this.beforeTransitionIn = opts.beforeTransitionIn ?? noop;
        this.beforeTransitionOut = opts.beforeTransitionOut ?? noop;

        this.preferenceKey = opts.preferenceKey;
        this.body = toFunction(opts.body || ``);
        this.title = toFunction(opts.title || ``);
        this._x = -1;
        this._y = -1;
        this._rect = null;
        this._anchorDistanceX = -1;
        this._anchorDistanceY = -1;
        this._shown = false;
        this._dragging = false;
        this._frameId = -1;
        this._scrollTop = 0;
        this._zIndex = +opts.zIndex;
        this._footerButtons = (opts.footerButtons || []).map(opts => new PopupButton(this, opts));
        this._contentScroller = null;
        this.closerTapRecognizer = this.recognizerContext.createTapRecognizer(this.closerClicked);
        this._popupDom = this.page.NULL();
        this._viewPort = null;
        this._activeElementBeforeOpen = null;
        this.globalEvents.on(`resize`, this._reLayout);
    }

    $() {
        return this._popupDom;
    }

    $body() {
        return this.$().findOne(`.js-popup-body`);
    }

    $closer() {
        return this.$().findOne(`.js-close-button`);
    }

    $headerText() {
        return this.$().findOne(`.js-header-text`);
    }

    $footer() {
        return this.$().findOne(`.js-popup-footer`);
    }

    $header() {
        return this.$().findOne(`.js-popup-header`);
    }

    $lastFocusItem() {
        return this.$().findOne(`.js-last-focus-item`);
    }

    isMobile() {
        return this.env.isMobileScreenSize(this._viewPort);
    }

    _buttonById(id: string) {
        return this._footerButtons.find(b => b._id === id)!;
    }

    disableButton(id: string) {
        this._buttonById(id).disable();
    }

    enableButton(id: string) {
        this._buttonById(id).enable();
    }

    setButtonEnabledState(id: string, state: boolean) {
        const button = this._buttonById(id);
        if (state) {
            button.enable();
        } else {
            button.disable();
        }
    }

    _deinitDom() {
        this.$().hide();
    }

    _initDom() {
        if (this._popupDom !== this.page.NULL()) {
            this.$().show(`grid`);
            return;
        }

        this._popupDom = this.page
            .createElement(`div`)
            .addClass(`popup-container`)
            .setProperty(`tabIndex`, -1)
            .appendTo(`body`)
            .setHtml(TEMPLATE);

        this.$headerText().setText(`${this.title()}`);
        this.$body().setHtml(`${this.body()}`);
        this._footerButtons.forEach(b => b.$().appendTo(this.$footer()));

        this.$closer().addEventListener(`click`, this.closerClicked);
        this.$header().addEventListener(`mousedown`, this.headerMouseDowned);
        this.closerTapRecognizer.recognizeBubbledOn(this.$closer());

        this._contentScroller = this.scrollerContext.createContentScroller({
            target: this.$(),
            contentContainer: this.$body(),
        });
    }

    zIndex() {
        return this._zIndex;
    }

    zIndexAbove() {
        return this.zIndex() + 40;
    }

    destroy() {
        this.globalEvents.removeListener(`resize`, this._reLayout);
        this._deinitDom();
    }

    _getViewPort() {
        return {
            width: this.page.width(),
            height: this.page.height(),
        };
    }

    _elementFocused = (e: FocusEvent) => {
        if (this._shown) {
            const target = e.target as HTMLElement;
            const $target = this.page.$(target);
            if ($target.closest(this.$()).length === 0 || $target.is(this.$lastFocusItem())) {
                e.stopPropagation();
                this.$().focus();
            } else {
                if ($target.closest(this.$body()).length !== 0) {
                    this._contentScroller!.scrollIntoViewIfNotVisible(target);
                }
            }
        }
    };

    _updateLayout = () => {
        this._updateRect();
        this.position();
        this._contentScroller!.resize();
    };

    _reLayout = () => {
        if (!this._shown) return;
        this._viewPort = this._getViewPort();
        this._updateLayout();
        this.emit(`layoutUpdate`);
    };

    position = () => {
        this._frameId = -1;
        if (!this._shown) return;
        if (this.isMobile()) {
            this._x = 0;
            this._y = 0;
        } else {
            let x = this._x;
            let y = this._y;
            const box = this._rect!;
            const maxX = this._viewPort!.width - box.width;
            const maxY = this._viewPort!.height - box.height;

            if (x === -1) x = (maxX + box.width) / 2 - box.width / 2;
            if (y === -1) y = (maxY + box.height) / 2 - box.height / 2;

            x = Math.max(0, Math.min(x, maxX));
            y = Math.max(0, Math.min(y, maxY));

            this._x = x;
            this._y = y;
        }
        this._renderCssPosition();
    };

    refresh() {
        if (!this._shown) return;
        this.draggingEnd();
        this.position();
    }

    closerClicked = () => {
        void this.close();
    };

    _renderCssPosition() {
        if (this._dragging) {
            this.$().setTransform(`translate(${this._x}px, ${this._y}px`);
        } else {
            this.$().setStyles({
                left: `${this._x}px`,
                top: `${this._y}px`,
            });
        }
    }

    _updateRect() {
        this._rect = this._popupDom[0]!.getBoundingClientRect();
    }

    isShown() {
        return this._shown;
    }

    async open() {
        if (this._shown) return;
        this._activeElementBeforeOpen = this.page.activeElement();
        this._shown = true;

        const firstOpen = this._popupDom === this.page.NULL();
        this._initDom();
        this.emit(`open`, this, firstOpen);
        this._viewPort = this._getViewPort();
        this._updateLayout();
        this._contentScroller!.setScrollTop(this._scrollTop);

        this.emit(`layoutUpdate`);
        await this.beforeTransitionIn(this.$(), this._rect!);
        this.emit(`layoutUpdate`);
        this.$().focus();

        this.page.addDocumentListener(`focus`, this._elementFocused, { capture: true });
    }

    mousemoved = (e: GestureObject | MouseEvent) => {
        if (!this._shown || this.isMobile()) return;
        if (!isTouchEvent(e) && (e.buttons & 1) !== 1) {
            this.draggingEnd();
            return;
        }
        this._x = Math.max(0, e.clientX - this._anchorDistanceX);
        this._y = Math.max(0, e.clientY - this._anchorDistanceY);
        if (this._frameId === -1) {
            this._frameId = this.page.requestAnimationFrame(this.position);
        }
    };

    headerMouseDowned = (e: GestureObject | MouseEvent) => {
        if (this.isMobile() || !this._shown || this._dragging || (isTouchEvent(e) && e.isFirst === false)) return;
        const target = e.target as HTMLElement;
        if (this.page.$(target).closest(this.$closer()).length > 0) return;
        this._dragging = true;
        this._anchorDistanceX = e.clientX - this._x;
        this._anchorDistanceY = e.clientY - this._y;
        this._updateRect();
        this._viewPort = this._getViewPort();

        this.page.addDocumentListener(`mouseup`, this.draggingEnd);
        this.page.addDocumentListener(`mousemove`, this.mousemoved);

        this.$()
            .setStyles({ left: `0px`, top: `0px`, willChange: `transform` })
            .setTransform(`translate(${this._x}px,${this._y}px)`);
    };

    draggingEnd = () => {
        if (!this._dragging) return;
        this._dragging = false;
        this.page.removeDocumentListener(`mouseup`, this.draggingEnd);
        this.page.removeDocumentListener(`mousemove`, this.mousemoved);

        this.$()
            .setStyles({ left: `${this._x}px`, top: `${this._y}px`, willChange: `` })
            .setTransform(`none`);
    };

    close = async () => {
        if (!this._shown) return;
        const elementToFocus = this._activeElementBeforeOpen;
        this._activeElementBeforeOpen = null;

        this.page.removeDocumentListener(`focus`, this._elementFocused, { capture: true });
        this._shown = false;
        this._scrollTop = this._contentScroller!.getScrollTop();

        this.emit(`close`, this);
        const deferredDeinit = Promise.resolve(this.beforeTransitionOut(this._popupDom, this._rect!));
        this.draggingEnd();

        if (elementToFocus) {
            elementToFocus.focus();
        }

        try {
            await deferredDeinit;
        } finally {
            this._deinitDom();
        }
    };

    getScrollPosition() {
        return {
            x: 0,
            y: this._scrollTop,
        };
    }

    setScrollPosition(pos: Xy) {
        if (!pos) return;
        const y = +pos.y;
        if (!isFinite(y)) return;
        this._scrollTop = y;
        if (this._contentScroller && this._shown) {
            this._contentScroller.setScrollTop(this._scrollTop);
        }
    }

    getScreenPosition() {
        if (this._x === -1 || this._y === -1) return undefined;
        return {
            x: this._x,
            y: this._y,
        };
    }

    setScreenPosition(pos: Xy) {
        if (!pos) return;
        const { x, y } = pos;
        if (!isFinite(x) || !isFinite(y)) return;
        this._x = x;
        this._y = y;
        this.position();
    }
}
