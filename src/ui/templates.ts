import { SelectDeps } from "Application";
import { DomWrapper } from "platform/dom/Page";

import { noop, slugTitle } from "../util";
import Slider from "./Slider";
import SliderContext from "./SliderContext";

function randomClass(base: string) {
    return `${slugTitle(base).slice(0, 30)}-${Date.now()}`;
}

export interface UiBindingTemplate {
    renderTo: (domNode: DomWrapper) => void;
    layoutUpdated: () => void;
}
export interface SimpleValueUiBindingTemplate extends UiBindingTemplate {
    setValue: (value: any) => void;
}

interface SingleSelectableValueOpts<T> {
    label: string;
    valueTextMap: Record<string, T> | T[];
    onValueChange: (v: T) => void;
}

export class SingleSelectableValue<T> {
    label: string;
    valueTextMap: Record<string, T> | T[];
    onValueChange: (v: T) => void;
    private _domNode: null | DomWrapper;
    private _selectNode: null | DomWrapper;
    constructor({ label, valueTextMap, onValueChange }: SingleSelectableValueOpts<T>) {
        this.label = label;
        this.valueTextMap = valueTextMap;
        this.onValueChange = onValueChange;

        this._domNode = null;
        this._selectNode = null;
    }

    $(): DomWrapper {
        return this._domNode!;
    }

    $select(): DomWrapper {
        return this._selectNode!;
    }

    renderTo(domNode: DomWrapper) {
        this._domNode = domNode;

        const { label, valueTextMap } = this;

        const labelSlug = randomClass(label);

        const selectClass = `${labelSlug}-select`;

        const values = Array.isArray(valueTextMap)
            ? valueTextMap.map(key => `<option value="${key}">${key}</option>`).join(`\n`)
            : Object.keys(valueTextMap)
                  .map(key => `<option value="${key}">${valueTextMap[key]}</option>`)
                  .join(`\n`);

        const html = `
            <label class="input-label">${label}</label>
            <select class="input-control ${selectClass}">
                ${values}
            </select>
        `;
        this.$().appendHtml(html);

        this._selectNode = this.$().find(`.${selectClass}`);
        this.$select().addEventListener(`change`, () => {
            const value = this.$select().value();
            this.onValueChange((value as unknown) as T);
        });
    }

    setValue(value: T) {
        this._updateSelect(value);
    }

    /* eslint-disable class-methods-use-this */
    layoutUpdated() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    _updateSelect(value: T) {
        this.$select().setValue(`${value}`);
    }
}

interface ToggleableValueOpts {
    checkboxLabel: string;
}

export class ToggleableValue {
    checkboxLabel: string;
    onCheckboxChange: (v: boolean) => void;
    private _domNode: null | DomWrapper;
    private _checkboxNode: null | DomWrapper;
    constructor({ checkboxLabel }: ToggleableValueOpts) {
        this.checkboxLabel = checkboxLabel;
        this.onCheckboxChange = noop;

        this._domNode = null;
        this._checkboxNode = null;
    }

    $() {
        return this._domNode!;
    }

    $checkbox() {
        return this._checkboxNode!;
    }

    renderTo(domNode: DomWrapper) {
        this._domNode = domNode;

        const { checkboxLabel } = this;
        const checkboxLabelSlug = randomClass(checkboxLabel);

        const checkboxClass = `${checkboxLabelSlug}-checkbox`;
        const checkboxId = `${checkboxLabelSlug}-label-id`;
        const labelClass = `${checkboxLabelSlug}-label`;

        const html = `
            <input type='checkbox' class='${checkboxClass} toggle-checkbox checkbox' id='${checkboxId}'>
            <label class="${labelClass} toggle-checkbox-label" for='${checkboxId}'>${checkboxLabel}</label>
        `;

        this.$().appendHtml(html);

        this._checkboxNode = this.$().find(`.${checkboxClass}`);
        this.$checkbox().addEventListener(`change`, () => {
            const toggle = (this.$checkbox()[0] as HTMLInputElement).checked;
            this.onCheckboxChange(toggle);
        });
    }

    setToggle(toggle: boolean) {
        this._updateCheckbox(toggle);
    }

    /* eslint-disable class-methods-use-this */
    layoutUpdated() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */
    _updateCheckbox(toggle: boolean) {
        this.$checkbox().setProperty<HTMLInputElement>(`checked`, toggle);
    }
}

interface ToggleableSlideableValueOpts {
    checkboxLabel: string;
    sliderLabel: string;
    minValue: number;
    maxValue: number;
    valueFormatter: (v: number) => string;
}
type ToggleableSlideableValueDeps = SelectDeps<"sliderContext">;

export class ToggleableSlideableValue {
    sliderContext: SliderContext;
    checkboxLabel: string;
    sliderLabel: string;
    onSlide: (v: number) => void;
    minValue: number;
    maxValue: number;
    valueFormatter: (v: number) => string;
    onCheckboxChange: (v: boolean) => void;
    private _domNode: null | DomWrapper;
    private _sliderValueNode: null | DomWrapper;
    private _sliderNode: null | DomWrapper;
    private _checkboxNode: null | DomWrapper;
    private _slider: null | Slider;
    private _renderedValue: number;
    private _renderedToggle: null | boolean;
    constructor(
        {
            checkboxLabel,
            sliderLabel,

            minValue,
            maxValue,
            valueFormatter,
        }: ToggleableSlideableValueOpts,
        deps: ToggleableSlideableValueDeps
    ) {
        this.sliderContext = deps.sliderContext;
        this.checkboxLabel = checkboxLabel;
        this.sliderLabel = sliderLabel;
        this.onSlide = noop;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.valueFormatter = valueFormatter;
        this.onCheckboxChange = noop;
        this._domNode = null;
        this._sliderValueNode = null;
        this._sliderNode = null;
        this._checkboxNode = null;
        this._slider = null;
        this._renderedValue = -1;
        this._renderedToggle = null;
    }

    $() {
        return this._domNode!;
    }

    $sliderValue() {
        return this._sliderValueNode!;
    }

    $slider() {
        return this._sliderNode!;
    }

    $checkbox() {
        return this._checkboxNode!;
    }

    renderTo(domNode: DomWrapper) {
        this._domNode = domNode;

        const { checkboxLabel, sliderLabel } = this;
        const checkboxLabelSlug = randomClass(checkboxLabel);

        const checkboxClass = `${checkboxLabelSlug}-checkbox`;
        const checkboxId = `${checkboxLabelSlug}-label-id`;
        const labelClass = `${checkboxLabelSlug}-label`;
        const sliderClass = `${checkboxLabelSlug}-slider`;
        const sliderValueClass = `${checkboxLabelSlug}-slider-value`;

        const html = `
            <input type='checkbox' class='${checkboxClass} toggle-checkbox checkbox' id='${checkboxId}'>
            <label class="${labelClass} toggle-checkbox-label" for='${checkboxId}'>${checkboxLabel}</label>

            <label class="slider-label">${sliderLabel}</label>
            <div class="slider-input">
                <div class='${sliderClass} slider horizontal-slider'>
                    <div class='slider-knob'></div>
                    <div class='slider-background'>
                        <div class='slider-fill'></div>
                    </div>
                </div>
            </div>

            <div class="slider-value ${sliderValueClass}"></div>
        `;

        this.$().appendHtml(html);

        this._checkboxNode = this.$().find(`.${checkboxClass}`);
        this._sliderValueNode = this.$().find(`.${sliderValueClass}`);
        this._sliderNode = this.$().find(`.${sliderClass}`);

        this._slider = this.sliderContext.createSlider({
            target: this.$slider(),
        });
        this._slider.on(`slide`, p => {
            const value = p * (this.maxValue - this.minValue) + this.minValue;
            this._updateSlider(value, true, false);
            this._updateCheckbox(true);
            this.onSlide(value);
        });
        this.$checkbox().addEventListener(`change`, () => {
            const toggle = (this.$checkbox()[0] as HTMLInputElement).checked;
            this._updateSlider(this._renderedValue, toggle);
            this.onCheckboxChange(toggle);
        });
    }

    setValueAndToggle(value: number, toggle: boolean) {
        if (toggle !== this._renderedToggle || value !== this._renderedValue) {
            this._updateSlider(value, toggle);
        }

        if (toggle !== this._renderedToggle) {
            this._updateCheckbox(toggle);
        }
    }

    layoutUpdated() {
        this._slider!.forceRelayout();
    }

    _updateCheckbox(toggle: boolean) {
        this._renderedToggle = toggle;
        this.$checkbox().setProperty<HTMLInputElement>(`checked`, toggle);
    }

    _updateSlider(value: number, toggle: boolean, forceRelayout = true) {
        this._renderedValue = value;
        this.$sliderValue().setText(this.valueFormatter(value));
        if (toggle) {
            this.$slider().removeClass(`slider-inactive`);
        } else {
            this.$slider().addClass(`slider-inactive`);
        }
        if (forceRelayout) {
            this._slider!.forceRelayout();
        }
        this._slider!.setValue((value - this.minValue) / (this.maxValue - this.minValue), forceRelayout);
    }
}

interface SlideableValueOpts {
    sliderLabel: string;
    minValue: number;
    maxValue: number;
    valueFormatter: (v: number) => string;
}
type SlideableValueDeps = SelectDeps<"sliderContext">;

export class SlideableValue {
    onSlide: (v: number) => void;
    sliderContext: SliderContext;
    sliderLabel: string;
    minValue: number;
    maxValue: number;
    valueFormatter: (v: number) => string;
    private _domNode: null | DomWrapper;
    private _sliderValueNode: null | DomWrapper;
    private _sliderNode: null | DomWrapper;
    private _slider: null | Slider;
    private _renderedValue: number;
    constructor({ sliderLabel, minValue, maxValue, valueFormatter }: SlideableValueOpts, deps: SlideableValueDeps) {
        this.sliderContext = deps.sliderContext;
        this.sliderLabel = sliderLabel;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.valueFormatter = valueFormatter;
        this.onSlide = noop;

        this._domNode = null;
        this._sliderValueNode = null;
        this._sliderNode = null;
        this._slider = null;
        this._renderedValue = -1;
    }

    $() {
        return this._domNode!;
    }

    $sliderValue() {
        return this._sliderValueNode!;
    }

    $slider() {
        return this._sliderNode!;
    }

    renderTo(domNode: DomWrapper) {
        this._domNode = domNode;

        const { sliderLabel } = this;
        const labelSlug = randomClass(sliderLabel);

        const sliderClass = `${labelSlug}-slider`;
        const sliderValueClass = `${labelSlug}-slider-value`;

        const html = `
            <label class="slider-label">${sliderLabel}</label>
            <div class="slider-input">
                <div class='${sliderClass} slider horizontal-slider'>
                    <div class='slider-knob'></div>
                    <div class='slider-background'>
                        <div class='slider-fill'></div>
                    </div>
                </div>
            </div>

            <div class="slider-value ${sliderValueClass}"></div>
        `;

        this.$().appendHtml(html);

        this._sliderValueNode = this.$().find(`.${sliderValueClass}`);
        this._sliderNode = this.$().find(`.${sliderClass}`);
        this._slider = this.sliderContext.createSlider({
            target: this.$slider(),
        });
        this._slider.on(`slide`, p => {
            const value = p * (this.maxValue - this.minValue) + this.minValue;
            this._updateSlider(value, false);
            this.onSlide(value);
        });
    }

    setValue(value: number) {
        if (value !== this._renderedValue) {
            this._updateSlider(value);
        }
    }

    layoutUpdated() {
        this._slider!.forceRelayout();
    }

    _updateSlider(value: number, forceRelayout = true) {
        this._renderedValue = value;
        this.$sliderValue().setText(this.valueFormatter(value));
        if (forceRelayout) {
            this._slider!.forceRelayout();
        }
        this._slider!.setValue((value - this.minValue) / (this.maxValue - this.minValue), forceRelayout);
    }
}
