import {slugTitle} from "util";

function randomClass(base) {
    return `${slugTitle(base).slice(0, 30)}-${Date.now()}`;
}

export class SingleSelectableValue {
    constructor({label, valueTextMap, onValueChange}) {
        this.label = label;
        this.valueTextMap = valueTextMap;
        this.onValueChange = onValueChange;

        this._domNode = null;
        this._selectNode = null;
    }

    $() {
        return this._domNode;
    }

    $select() {
        return this._selectNode;
    }

    renderTo(domNode) {
        this._domNode = domNode;

        const {label, valueTextMap} = this;


        const labelSlug = randomClass(label);

        const selectClass = `${labelSlug}-select`;

        const values = Array.isArray(valueTextMap)
                ? valueTextMap.map(key => `<option value="${key}">${key}</option>`).join(`\n`)
                : Object.keys(valueTextMap).map(key => `<option value="${key}">${valueTextMap[key]}</option>`).join(`\n`);


        const html = `<div class="inputs-container">
            <div class="label">${label}</div>
            <div class="select-container">
                <select class="${selectClass}">
                    ${values}
                </select>
            </div>
        </div>`;
        this.$().setHtml(html);

        this._selectNode = this.$().find(`.${selectClass}`);
        this.$select().addEventListener(`change`, () => {
            const value = this.$select().value();
            this.onValueChange(value);
        });
    }

    setValue(value) {
        this._updateSelect(value);
    }

    /* eslint-disable class-methods-use-this */
    layoutUpdated() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */

    _updateSelect(value) {
        this.$select().setValue(value);
    }
}

export class ToggleableValue {
    constructor({checkboxLabel, onCheckboxChange}) {
        this.checkboxLabel = checkboxLabel;
        this.onCheckboxChange = onCheckboxChange;

        this._domNode = null;
        this._checkboxNode = null;
    }

    $() {
        return this._domNode;
    }

    $checkbox() {
        return this._checkboxNode;
    }

    renderTo(domNode) {
        this._domNode = domNode;

        const {checkboxLabel} = this;
        const checkboxLabelSlug = randomClass(checkboxLabel);

        const checkboxClass = `${checkboxLabelSlug}-checkbox`;
        const checkboxId = `${checkboxLabelSlug}-label-id`;
        const labelClass = `${checkboxLabelSlug}-label`;

        const html = `<div class='inputs-container'>
            <div class='checkbox-container'>
                <input type='checkbox' class='${checkboxClass} checkbox' id='${checkboxId}'>
            </div>
            <div class='${labelClass} label wide-label'>
                <label for='${checkboxId}'>${checkboxLabel}</label>
            </div>
        </div>`;

        this.$().setHtml(html);

        this._checkboxNode = this.$().find(`.${checkboxClass}`);
        this.$checkbox().addEventListener(`change`, () => {
            const toggle = this.$checkbox()[0].checked;
            this.onCheckboxChange(toggle);
        });
    }

    setToggle(toggle) {
        this._updateCheckbox(toggle);
    }

    /* eslint-disable class-methods-use-this */
    layoutUpdated() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */
    _updateCheckbox(toggle) {
        this.$checkbox().setProperty(`checked`, toggle);
    }
}


export class ToggleableSlideableValue {
    constructor({checkboxLabel, sliderLabel,
        onSlide, onCheckboxChange, minValue, maxValue,
        valueFormatter}, deps) {
        this.sliderContext = deps.sliderContext;
        this.checkboxLabel = checkboxLabel;
        this.sliderLabel = sliderLabel;
        this.onSlide = onSlide;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.valueFormatter = valueFormatter;

        this.onCheckboxChange = onCheckboxChange;
        this._domNode = null;
        this._sliderValueNode = null;
        this._sliderNode = null;
        this._checkboxNode = null;
        this._slider = null;
        this._renderedValue = -1;
        this._renderedToggle = null;
    }

    $() {
        return this._domNode;
    }

    $sliderValue() {
        return this._sliderValueNode;
    }

    $slider() {
        return this._sliderNode;
    }

    $checkbox() {
        return this._checkboxNode;
    }

    renderTo(domNode) {
        this._domNode = domNode;

        const {checkboxLabel, sliderLabel} = this;
        const checkboxLabelSlug = randomClass(checkboxLabel);

        const checkboxClass = `${checkboxLabelSlug}-checkbox`;
        const checkboxId = `${checkboxLabelSlug}-label-id`;
        const labelClass = `${checkboxLabelSlug}-label`;
        const sliderClass = `${checkboxLabelSlug}-slider`;
        const sliderValueClass = `${checkboxLabelSlug}-slider-value`;



        const html = `
        <div class='inputs-container'>
            <div class='checkbox-container'>
                <input type='checkbox' class='${checkboxClass} checkbox' id='${checkboxId}'>
            </div>
            <div class='${labelClass} label wide-label'>
                <label for='${checkboxId}'>${checkboxLabel}</label>
            </div>
        </div>

        <div class='inputs-container'>
            <div class='label'>${sliderLabel}</div>
            <div class='${sliderClass} slider horizontal-slider'>
                <div class='slider-knob'></div>
                <div class='slider-background'>
                    <div class='slider-fill'></div>
                </div>
            </div>
            <div class='${sliderValueClass} slider-value-indicator'></div>
        </div>`;

        this.$().setHtml(html);

        this._checkboxNode = this.$().find(`.${checkboxClass}`);
        this._sliderValueNode = this.$().find(`.${sliderValueClass}`);
        this._sliderNode = this.$().find(`.${sliderClass}`);

        this._slider = this.sliderContext.createSlider({
            target: this.$slider()
        });
        this._slider.on(`slide`, (p) => {
            const value = p * (this.maxValue - this.minValue) + this.minValue;
            this._updateSlider(value, true, false);
            this._updateCheckbox(true);
            this.onSlide(value);
        });
        this.$checkbox().addEventListener(`change`, () => {
            const toggle = this.$checkbox()[0].checked;
            this._updateSlider(this._renderedValue, toggle);
            this.onCheckboxChange(toggle);
        });
    }

    setValueAndToggle(value, toggle) {
        if (toggle !== this._renderedToggle ||
            value !== this._renderedValue) {
            this._updateSlider(value, toggle);
        }

        if (toggle !== this._renderedToggle) {
            this._updateCheckbox(toggle);
        }
    }

    layoutUpdated() {
        this._slider.forceRelayout();
    }

    _updateCheckbox(toggle) {
        this._renderedToggle = toggle;
        this.$checkbox().setProperty(`checked`, toggle);
    }

    _updateSlider(value, toggle, forceRelayout = true) {
        this._renderedValue = value;
        this.$sliderValue().setText(this.valueFormatter(value));
        if (toggle) {
            this.$slider().removeClass(`slider-inactive`);
        } else {
            this.$slider().addClass(`slider-inactive`);
        }
        if (forceRelayout) {
            this._slider.forceRelayout();
        }
        this._slider.setValue((value - this.minValue) / (this.maxValue - this.minValue), forceRelayout);
    }
}

export class SlideableValue {
    constructor({sliderLabel,
        onSlide, minValue, maxValue, valueFormatter}, deps) {
        this.sliderContext = deps.sliderContext;
        this.sliderLabel = sliderLabel;
        this.minValue = minValue;
        this.maxValue = maxValue;
        this.valueFormatter = valueFormatter;
        this.onSlide = onSlide;

        this._domNode = null;
        this._sliderValueNode = null;
        this._sliderNode = null;
        this._slider = null;
        this._renderedValue = -1;
    }

    $() {
        return this._domNode;
    }

    $sliderValue() {
        return this._sliderValueNode;
    }

    $slider() {
        return this._sliderNode;
    }


    renderTo(domNode) {
        this._domNode = domNode;

        const {sliderLabel} = this;
        const labelSlug = randomClass(sliderLabel);

        const sliderClass = `${labelSlug}-slider`;
        const sliderValueClass = `${labelSlug}-slider-value`;

        const html = `

        <div class='inputs-container'>
            <div class='label'>${sliderLabel}</div>
            <div class='${sliderClass} slider horizontal-slider'>
                <div class='slider-knob'></div>
                <div class='slider-background'>
                    <div class='slider-fill'></div>
                </div>
            </div>
            <div class='${sliderValueClass} slider-value-indicator'></div>
        </div>`;

        this.$().setHtml(html);


        this._sliderValueNode = this.$().find(`.${sliderValueClass}`);
        this._sliderNode = this.$().find(`.${sliderClass}`);
        this._slider = this.sliderContext.createSlider({
            target: this.$slider()
        });
        this._slider.on(`slide`, (p) => {
            const value = p * (this.maxValue - this.minValue) + this.minValue;
            this._updateSlider(value, false);
            this.onSlide(value);
        });
    }

    setValue(value) {
        if (value !== this._renderedValue) {
            this._updateSlider(value);
        }
    }

    layoutUpdated() {
        this._slider.forceRelayout();
    }

    _updateSlider(value, forceRelayout = true) {
        this._renderedValue = value;
        this.$sliderValue().setText(this.valueFormatter(value));
        if (forceRelayout) {
            this._slider.forceRelayout();
        }
        this._slider.setValue((value - this.minValue) / (this.maxValue - this.minValue), forceRelayout);
    }
}
