import {titleCase} from "util";

class SimpleValuePreferenceUiBinding {
    constructor(container,
                template,
                preferenceValueKey,
                parent) {
        this._template = template;
        this._parent = parent;
        const {preferences} = parent;

        this._valueGetter = preferences[`get${titleCase(preferenceValueKey)}`];
        this._valueSetter = preferences[`set${titleCase(preferenceValueKey)}`];
        template.renderTo(container);
    }

    _valueChanged(value) {
        const {preferences} = this._parent;
        this._valueSetter.call(preferences, value);
        this._parent.preferencesUpdated(true);
    }

    update() {
        const {preferences} = this._parent;
        const value = this._valueGetter.call(preferences);
        this._template.setValue(value);
    }

    layoutUpdated() {
        this._template.layoutUpdated();
    }
}

export class SlideableValuePreferenceUiBinding extends SimpleValuePreferenceUiBinding {
    constructor(container,
                slideableValue,
                preferenceValueKey,
                parent) {
        super(container, slideableValue, preferenceValueKey, parent);
        this._template.onSlide = this._valueChanged.bind(this);
    }
}


export class SingleSelectableValuePreferenceUiBinding extends SimpleValuePreferenceUiBinding {
    constructor(container,
                singleSelectableValue,
                preferenceValueKey,
                parent) {
        super(container, singleSelectableValue, preferenceValueKey, parent);
        this._template.onValueChange = this._valueChanged.bind(this);
    }
}

export class ToggleableValuePreferenceUiBinding {
    constructor(container,
                toggleableValue,
                preferenceToggleKey,
                parent) {
        this._toggleableValue = toggleableValue;
        toggleableValue.onCheckboxChange = this._toggleChanged.bind(this);
        this._parent = parent;
        const {preferences} = parent;

        this._toggleGetter = preferences[`get${titleCase(preferenceToggleKey)}`];
        this._toggleSetter = preferences[`set${titleCase(preferenceToggleKey)}`];
        this._toggleableValue.renderTo(container);
    }

    _toggleChanged(toggle) {
        const {preferences} = this._parent;
        this._toggleSetter.call(preferences, toggle);
        this._parent.preferencesUpdated(true);
    }

    update() {
        const {preferences} = this._parent;
        const toggle = this._toggleGetter.call(preferences);
        this._toggleableValue.setToggle(toggle);
    }

    layoutUpdated() {
        // NOOP
    }
}


export class ToggleableSlideableValuePreferenceUiBinding {
    constructor(container,
                toggleableSlideableValue,
                preferenceValueKey,
                preferenceToggleKey,
                parent) {
        this._toggleableSlideableValue = toggleableSlideableValue;
        toggleableSlideableValue.onSlide = this._valueChanged.bind(this);
        toggleableSlideableValue.onCheckboxChange = this._toggleChanged.bind(this);
        this._parent = parent;
        const {preferences} = parent;

        this._toggleGetter = preferences[`get${titleCase(preferenceToggleKey)}`];
        this._toggleSetter = preferences[`set${titleCase(preferenceToggleKey)}`];
        this._valueGetter = preferences[`get${titleCase(preferenceValueKey)}`];
        this._valueSetter = preferences[`set${titleCase(preferenceValueKey)}`];
        this._toggleableSlideableValue.renderTo(container);
    }

    _valueChanged(value) {
        const {preferences} = this._parent;
        this._valueSetter.call(preferences, value);
        this._toggleSetter.call(preferences, true);
        this._parent.preferencesUpdated(true);
    }

    _toggleChanged(toggle) {
        const {preferences} = this._parent;
        this._toggleSetter.call(preferences, toggle);
        this._parent.preferencesUpdated(true);
    }

    update() {
        const {preferences} = this._parent;
        const toggle = this._toggleGetter.call(preferences);
        const value = this._valueGetter.call(preferences);
        this._toggleableSlideableValue.setValueAndToggle(value, toggle);
    }

    layoutUpdated() {
        this._toggleableSlideableValue.layoutUpdated();
    }
}
