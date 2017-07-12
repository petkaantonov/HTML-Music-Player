import EventEmitter from "events";
import {inherits, noUndefinedGet} from "util";
import {isTouchEvent} from "platform/dom/Page";

export default function Slider(opts, deps) {
    opts = Object(opts);
    opts.direction = opts.direction || `horizontal`;
    opts.value = `value` in opts ? +opts.value : 0;
    opts.updateDom = `updateDom` in opts ? !!opts.updateDom : true;
    opts = noUndefinedGet(opts);
    EventEmitter.call(this);
    this.page = deps.page;
    this.globalEvents = deps.globalEvents;
    this.recognizerContext = deps.recognizerContext;
    this._domNode = this.page.$(opts.target);
    this._knobNode = this.$().find(opts.knobSelector);
    this._fillNode = this.$().find(opts.fillSelector);
    this._direction = opts.direction;
    this._containerRect = this._fillRect = this._knobRect = null;
    this._sliding = false;
    this._value = opts.value;

    this._onMousemove = this._onMousemove.bind(this);
    this._onMouseup = this._onMouseup.bind(this);
    this._onMousedown = this._onMousedown.bind(this);
    this._onReLayout = this._onReLayout.bind(this);

    this.dragRecognizer = this.recognizerContext.createDragRecognizer(this._onMousemove, this._onMouseup);
    this.touchdownRecognizer = this.recognizerContext.createTouchdownRecognizer(this._onMousedown);


    this._shouldUpdateDom = opts.updateDom;
    if (this.shouldUpdateDom()) {
        this._calculateDimensions();
        this._setupKeyboard();
    }

    this.globalEvents.on(`foreground`, this._onReLayout);
    this.globalEvents.on(`resize`, this._onReLayout);
    this.$().addEventListener(`mousedown`, this._onMousedown);
    this.touchdownRecognizer.recognizeBubbledOn(this.$());

}
inherits(Slider, EventEmitter);

Slider.prototype.$ = function() {
    return this._domNode;
};

Slider.prototype.$knob = function() {
    return this._knobNode;
};

Slider.prototype.$fill = function() {
    return this._fillNode;
};

Slider.prototype.shouldUpdateDom = function() {
    return this._shouldUpdateDom;
};

Slider.prototype.setWidth = function(px) {
    if (this._direction !== `vertical`) {
        throw new Error(`cannot set width of horizontal slider`);
    }

    this.$().setStyle(`width`, `${px}px`);
    this._onReLayout();
};

Slider.prototype.setHeight = function(px) {
    if (this._direction !== `horizontal`) {
        throw new Error(`cannot set height of vertical slider`);
    }
    this.$().setStyle(`height`, `${px}px`);
    this._onReLayout();
};

Slider.prototype._onMousedown = function(e) {
    const wasTouchEvent = isTouchEvent(e);
    if (this._sliding ||
        (!wasTouchEvent && e.which !== 1) ||
        (wasTouchEvent && e.isFirst === false)) {
        return;
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

    if (e.cancelable) {
        e.preventDefault();
    }
};

Slider.prototype._keydowned = function(e) {
    const {key} = e;

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

Slider.prototype._knobFocused = function() {
    this.$knob().addEventListener(`keydown`, this._keydowned, true).
                addClass(`focused`).
                setStyle(`willChange`, `transform`);
    this.$fill().setStyle(`willChange`, `transform`);
    this.$().addClass(`sliding`);
    this.emit(`slideBegin`);
};

Slider.prototype._knobBlurred = function() {
    this.$knob().removeEventListener(`keydown`, this._keydowned, true).
                removeClass(`focused`).setStyle(`willChange`, ``).
                setStyle(`willChange`, ``);
    this.$().removeClass(`sliding`);
    this.emit(`slideEnd`);
};

Slider.prototype._setupKeyboard = function() {
    this.$knob().setProperty(`tabIndex`, 0);
    this._knobFocused = this._knobFocused.bind(this);
    this._knobBlurred = this._knobBlurred.bind(this);
    this._keydowned = this._keydowned.bind(this);

    this.$knob().addEventListener(`focus`, this._knobFocused).
                addEventListener(`blur`, this._knobBlurred);
};

Slider.prototype._onMousemove = function(e) {
    if (!isTouchEvent(e) && e.which !== 1) {
        this._onMouseup(this._lastEvent);
        return;
    }

    this._lastEvent = e;
    const percentage = this._percentage(e);
    this.setValue(percentage);
    this.emit(`slide`, percentage);
};

Slider.prototype.setValue = function(value, force) {
    value = Math.min(1, Math.max(0, +value));
    if (!force && this._value === value) return;
    this._value = value;
    if (this.shouldUpdateDom()) {
        const knobHalf = (this._direction === `horizontal` ? this._knobRect.width : this._knobRect.height) / 2;
        const full = this._direction === `horizontal` ? this._containerRect.width : this._containerRect.height;

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
};

Slider.prototype._onMouseup = function(e) {
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


Slider.prototype._calculateDimensions = function() {
    this._containerRect = this.$()[0].getBoundingClientRect();
    if (this.shouldUpdateDom()) {
        this._knobRect = this.$knob()[0].getBoundingClientRect();
        this._fillRect = this.$fill()[0].getBoundingClientRect();
    }
};

Slider.prototype._onReLayout = function() {
    this.page.changeDom(() => {
        this._calculateDimensions();
        this.setValue(this._value, true);
    });
};

Slider.prototype._percentage = function(e) {
    const r = this._direction === `vertical` ?
        1 - ((e.clientY - this._containerRect.top) / this._containerRect.height) :
        (e.clientX - this._containerRect.left) / this._containerRect.width;
    return Math.max(0, Math.min(1, r));
};

