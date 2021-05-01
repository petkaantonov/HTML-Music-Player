import { EventEmitterInterface } from "shared/types/helpers";
import { SelectDeps } from "ui/Application";
import Page, { DomWrapper, DomWrapperSelector, isTouchEvent } from "ui/platform/dom/Page";
import GlobalEvents from "ui/platform/GlobalEvents";
import EventEmitter from "vendor/events";

import DragRecognizer from "./gestures/DragRecognizer";
import GestureObject from "./gestures/GestureObject";
import GestureRecognizerContext from "./gestures/GestureRecognizerContext";
import TouchdownRecognizer from "./gestures/TouchdownRecognizer";

type Deps = SelectDeps<"page" | "recognizerContext" | "globalEvents">;

type DirectionType = "horizontal" | "vertical";

export interface SliderOpts {
    direction?: DirectionType;
    value?: number;
    updateDom?: boolean;
    target: DomWrapperSelector;
    knobSelector: string;
    fillSelector: string;
}

interface SliderEventsMap {
    slideBegin: (e?: MouseEvent | GestureObject) => void;
    slideEnd: (percentage?: number) => void;
    slide: (percentage: number) => void;
}

export default interface Slider extends EventEmitterInterface<SliderEventsMap> {}

export default class Slider extends EventEmitter {
    page: Page;
    recognizerContext: GestureRecognizerContext;
    globalEvents: GlobalEvents;
    private _domNode: DomWrapper;
    private _knobNode: DomWrapper;
    private _fillNode: DomWrapper;
    private _direction: DirectionType;
    private _containerRect: null | DOMRect;
    private _knobRect: null | DOMRect;
    private _sliding: boolean;
    private _value: number;
    dragRecognizer: DragRecognizer;
    touchdownRecognizer: TouchdownRecognizer;
    private _shouldUpdateDom: boolean;
    private _lastEvent: null | MouseEvent | GestureObject;

    constructor(opts: SliderOpts, deps: Deps) {
        super();
        this.page = deps.page;
        this.globalEvents = deps.globalEvents;
        this.recognizerContext = deps.recognizerContext;
        this._domNode = this.page.$(opts.target);
        this._knobNode = this.$().find(opts.knobSelector);
        this._fillNode = this.$().find(opts.fillSelector);
        this._direction = opts.direction ?? `horizontal`;
        this._containerRect = this._knobRect = null;
        this._sliding = false;
        this._value = opts.value ?? 0;
        this.dragRecognizer = this.recognizerContext.createDragRecognizer(this._onMousemove, this._onMouseup);
        this.touchdownRecognizer = this.recognizerContext.createTouchdownRecognizer(this._onMousedown);
        this._lastEvent = null;
        this._shouldUpdateDom = opts.updateDom ?? true;
        if (this.shouldUpdateDom()) {
            this._calculateDimensions();
            this._setupKeyboard();
        }

        this.globalEvents.on(`foreground`, this._onReLayout);
        this.globalEvents.on(`resize`, this._onReLayout);
        this.$().addEventListener(`mousedown`, this._onMousedown);
        this.touchdownRecognizer.recognizeBubbledOn(this.$());
    }

    $() {
        return this._domNode;
    }

    $knob() {
        return this._knobNode;
    }

    $fill() {
        return this._fillNode;
    }

    shouldUpdateDom() {
        return this._shouldUpdateDom;
    }

    forceRelayout() {
        this._onReLayout();
    }

    setWidth(px: number) {
        if (this._direction !== `vertical`) {
            throw new Error(`cannot set width of horizontal slider`);
        }

        this.$().setStyle(`width`, `${px}px`);
        this._onReLayout();
    }

    setHeight(px: number) {
        if (this._direction !== `horizontal`) {
            throw new Error(`cannot set height of vertical slider`);
        }
        this.$().setStyle(`height`, `${px}px`);
        this._onReLayout();
    }

    _onMousedown = (e: MouseEvent | GestureObject) => {
        if (this._sliding) {
            return;
        }
        let cancelable: boolean = false;
        if (isTouchEvent(e)) {
            if (e.isFirst === false) {
                return;
            }
        } else {
            cancelable = true;
            if ((e.buttons & 1) !== 1) {
                return;
            }
        }

        this._sliding = true;
        this._calculateDimensions();

        if (this.shouldUpdateDom()) {
            this.$knob().addClass(`focused`).setStyle(`willChange`, `transform`);
            this.$fill().setStyle(`willChange`, `transform`);
            this.$().addClass(`sliding`);
        }

        this.emit(`slideBegin`, e);
        this.emit(`slide`, this._percentage(e));

        this.page.addDocumentListener(`mousemove`, this._onMousemove);
        this.page.addDocumentListener(`mouseup`, this._onMouseup);
        this.dragRecognizer.recognizeBubbledOn(this.page.document());

        if (cancelable) {
            e.preventDefault();
        }
    };

    _keydowned = (e: KeyboardEvent) => {
        const { key } = e;

        switch (key) {
            case `Escape`:
            case `Enter`:
                this.$knob().blur();
                break;

            case `ArrowLeft`:
            case `ArrowRight`:
                if (this._direction === `horizontal`) {
                    let value = key === `ArrowLeft` ? this._value - 0.01 : this._value + 0.01;
                    value = Math.min(1, Math.max(0, value));
                    this.setValue(value);
                    this.emit(`slide`, value);
                }
                break;

            case `ArrowDown`:
            case `ArrowUp`:
                if (this._direction === `vertical`) {
                    let value = key === `ArrowDown` ? this._value - 0.01 : this._value + 0.01;
                    value = Math.min(1, Math.max(0, value));
                    this.setValue(value);
                    this.emit(`slide`, value);
                }
                break;

            default:
        }
    };

    _knobFocused = () => {
        this.$knob()
            .addEventListener(`keydown`, this._keydowned, true)
            .addClass(`focused`)
            .setStyle(`willChange`, `transform`);
        this.$fill().setStyle(`willChange`, `transform`);
        this.$().addClass(`sliding`);
        this.emit(`slideBegin`);
    };

    _knobBlurred = () => {
        this.$knob()
            .removeEventListener(`keydown`, this._keydowned, true)
            .removeClass(`focused`)
            .setStyle(`willChange`, ``)
            .setStyle(`willChange`, ``);
        this.$().removeClass(`sliding`);
        this.emit(`slideEnd`);
    };

    _setupKeyboard() {
        this.$knob().setProperty(`tabIndex`, 0);
        this._knobFocused = this._knobFocused.bind(this);
        this._knobBlurred = this._knobBlurred.bind(this);
        this._keydowned = this._keydowned.bind(this);

        this.$knob().addEventListener(`focus`, this._knobFocused).addEventListener(`blur`, this._knobBlurred);
    }

    _onMousemove = (e: MouseEvent | GestureObject) => {
        if (!isTouchEvent(e) && (e.buttons & 1) !== 1) {
            if (this._lastEvent) {
                this._onMouseup(this._lastEvent);
            }
            return;
        }

        this._lastEvent = e;
        const percentage = this._percentage(e);
        this.setValue(percentage);
        this.emit(`slide`, percentage);
    };

    setValue(value: number, force?: boolean) {
        value = Math.min(1, Math.max(0, +value));
        if (!force && this._value === value) return;
        this._value = value;
        if (this.shouldUpdateDom()) {
            const knobHalf = (this._direction === `horizontal` ? this._knobRect!.width : this._knobRect!.height) / 2;
            const full = this._direction === `horizontal` ? this._containerRect!.width : this._containerRect!.height;

            let knobTranslate, fillTranslate;
            knobTranslate = fillTranslate = `translateZ(0) `;
            if (this._direction === `horizontal`) {
                const knobMin = -knobHalf;
                const knobMax = full - knobHalf;
                const knobValuePx = Math.round(value * (knobMax - knobMin) + knobMin);
                knobTranslate += `translateX(${knobValuePx}px)`;
                fillTranslate += `translateX(-${(1 - value) * 100}%)`;
            } else {
                const knobMin = full - knobHalf;
                const knobMax = -knobHalf;
                const knobValuePx = Math.round(value * (knobMax - knobMin) + knobMin);
                knobTranslate += `translateY(${knobValuePx}px)`;
                fillTranslate += `translateY(${(1 - value) * 100}%)`;
            }

            this.$fill().setTransform(fillTranslate);
            this.$knob().setTransform(knobTranslate);
        }
    }

    _onMouseup = (e: MouseEvent | GestureObject) => {
        if (!this._sliding) return;
        this._sliding = false;

        if (this.shouldUpdateDom()) {
            this.$knob().removeClass(`focused`).setStyle(`willChange`, ``);
            this.$fill().setStyle(`willChange`, ``);
            this.$().removeClass(`sliding`);
        }

        this.emit(`slideEnd`, this._percentage(e));

        this.page.removeDocumentListener(`mousemove`, this._onMousemove);
        this.page.removeDocumentListener(`mouseup`, this._onMouseup);
        this.dragRecognizer.unrecognizeBubbledOn(this.page.document());
        e.preventDefault();
    };

    _calculateDimensions() {
        this._containerRect = this.$()[0]!.getBoundingClientRect();
        if (this.shouldUpdateDom()) {
            this._knobRect = this.$knob()[0]!.getBoundingClientRect();
        }
    }

    _onReLayout = () => {
        this.page.changeDom(() => {
            this._calculateDimensions();
            this.setValue(this._value, true);
        });
    };

    _percentage(e: MouseEvent | GestureObject) {
        const r =
            this._direction === `vertical`
                ? 1 - (e.clientY - this._containerRect!.top) / this._containerRect!.height
                : (e.clientX - this._containerRect!.left) / this._containerRect!.width;
        return Math.max(0, Math.min(1, r));
    }
}
