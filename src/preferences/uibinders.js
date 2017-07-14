import {titleCase} from "util";

export class SingleSelectableValuePreferenceUiBinding {
    constructor(container,
                singleSelectableValue,
                preferenceValueKey,
                parent) {
        this._singleSelectableValue = singleSelectableValue;
        singleSelectableValue.onValueChange = this._valueChanged.bind(this);
        this._parent = parent;
        const {preferences} = parent;

        this._valueGetter = preferences[`get${titleCase(preferenceValueKey)}`];
        this._valueSetter = preferences[`set${titleCase(preferenceValueKey)}`];
        singleSelectableValue.renderTo(container);
    }

    _valueChanged(value) {
        const {preferences} = this._parent;
        this._valueSetter.call(preferences, value);
        this._parent.preferencesUpdated(true);
    }

    update() {
        const {preferences} = this._parent;
        const value = this._valueGetter.call(preferences);
        this._singleSelectableValue.setValue(value);
    }

    layoutUpdated() {
        // NOOP
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
