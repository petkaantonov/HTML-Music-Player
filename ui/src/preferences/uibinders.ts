import { Preferences } from "shared/preferences";
import { BooleanKeysOf, NumberKeysOf } from "shared/types/helpers";
import { DomWrapper } from "ui/platform/dom/Page";
import AbstractUiBindingManager from "ui/ui/AbstractUiBindingManager";
import {
    SimpleValueUiBindingTemplate,
    SingleSelectableValue,
    SlideableValue,
    ToggleableSlideableValue,
    ToggleableValue,
} from "ui/ui/templates";

import { AbstractPreferenceManager } from "./PreferenceCreator";

export interface UiBinding {
    update: () => void;
    layoutUpdated: () => void;
}

abstract class ValueUiBinding<P extends Preferences, PM extends AbstractPreferenceManager<P>, Key extends keyof P> {
    abstract parent(): AbstractUiBindingManager<P, PM>;
    abstract key(): Key;

    getValue(): P[Key] {
        return this.parent().preferencesManager.get(this.key());
    }

    setValue(value: P[Key]) {
        this.parent().preferencesManager.set(this.key(), value);
    }
}

abstract class Value2UiBinding<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    Key1 extends keyof P,
    Key2 extends keyof P
> {
    abstract parent(): AbstractUiBindingManager<P, PM>;
    abstract key1(): Key1;
    abstract key2(): Key2;

    getValue1(): P[Key1] {
        return this.parent().preferencesManager.get(this.key1());
    }

    setValue1(value: P[Key1]) {
        this.parent().preferencesManager.set(this.key1(), value);
    }

    getValue2(): P[Key2] {
        return this.parent().preferencesManager.get(this.key2());
    }

    setValue2(value: P[Key2]) {
        this.parent().preferencesManager.set(this.key2(), value);
    }
}

class SimpleValuePreferenceUiBinding<
        P extends Preferences,
        PM extends AbstractPreferenceManager<P>,
        Key extends keyof P
    >
    extends ValueUiBinding<P, PM, Key>
    implements UiBinding {
    private _preferenceValueKey: Key;
    private _parent: AbstractUiBindingManager<P, PM>;
    private _template: SimpleValueUiBindingTemplate;
    constructor(
        container: DomWrapper,
        template: SimpleValueUiBindingTemplate,
        preferenceValueKey: Key,
        parent: AbstractUiBindingManager<P, PM>
    ) {
        super();
        this._template = template;
        this._parent = parent;
        this._preferenceValueKey = preferenceValueKey;
        template.renderTo(container);
    }

    parent() {
        return this._parent;
    }

    key() {
        return this._preferenceValueKey;
    }

    _valueChanged = (value: number | string) => {
        this._parent.willUpdate(this._preferenceValueKey, this.getValue(), value as any);
        this.setValue(value as any);
        this._parent.preferencesUpdated();
    };

    update() {
        const value = this.getValue();
        this._template.setValue(value);
    }

    layoutUpdated() {
        this._template.layoutUpdated();
    }
}

export class SlideableValuePreferenceUiBinding<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    Key extends keyof P
> extends SimpleValuePreferenceUiBinding<P, PM, Key> {
    constructor(
        container: DomWrapper,
        slideableValue: SlideableValue,
        preferenceValueKey: Key,
        parent: AbstractUiBindingManager<P, PM>
    ) {
        super(container, slideableValue, preferenceValueKey, parent);
        slideableValue.onSlide = this._valueChanged;
    }
}

export class SingleSelectableValuePreferenceUiBinding<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    Key extends keyof P,
    T extends string | number
> extends SimpleValuePreferenceUiBinding<P, PM, Key> {
    constructor(
        container: DomWrapper,
        singleSelectableValue: SingleSelectableValue<T>,
        preferenceValueKey: Key,
        parent: AbstractUiBindingManager<P, PM>
    ) {
        super(container, singleSelectableValue, preferenceValueKey, parent);
        singleSelectableValue.onValueChange = this._valueChanged;
    }
}

export class ToggleableValuePreferenceUiBinding<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    Key extends BooleanKeysOf<P>
> extends ValueUiBinding<P, PM, Key> {
    private _toggleableValue: ToggleableValue;
    private _parent: AbstractUiBindingManager<P, PM>;
    private _preferenceToggleKey: Key;
    constructor(
        container: DomWrapper,
        toggleableValue: ToggleableValue,
        preferenceToggleKey: Key,
        parent: AbstractUiBindingManager<P, PM>
    ) {
        super();
        this._toggleableValue = toggleableValue;
        toggleableValue.onCheckboxChange = this._toggleChanged;
        this._parent = parent;
        this._preferenceToggleKey = preferenceToggleKey;
        this._toggleableValue.renderTo(container);
    }

    parent() {
        return this._parent;
    }

    key() {
        return this._preferenceToggleKey;
    }

    _toggleChanged = (toggle: boolean) => {
        this._parent.willUpdate(this._preferenceToggleKey, this.getValue(), (toggle as unknown) as P[Key]);
        this.setValue(toggle as any);
        this._parent.preferencesUpdated();
    };

    update() {
        this._toggleableValue.setToggle(this.getValue() as any);
    }

    /* eslint-disable class-methods-use-this */
    layoutUpdated() {
        // NOOP
    }
    /* eslint-enable class-methods-use-this */
}

export class ToggleableSlideableValuePreferenceUiBinding<
    P extends Preferences,
    PM extends AbstractPreferenceManager<P>,
    Key1 extends NumberKeysOf<P>,
    Key2 extends BooleanKeysOf<P>
> extends Value2UiBinding<P, PM, Key1, Key2> {
    private _toggleableSlideableValue: ToggleableSlideableValue;
    private _parent: AbstractUiBindingManager<P, PM>;
    private _preferenceValueKey: Key1;
    private _preferenceToggleKey: Key2;
    constructor(
        container: DomWrapper,
        toggleableSlideableValue: ToggleableSlideableValue,
        preferenceValueKey: Key1,
        preferenceToggleKey: Key2,
        parent: AbstractUiBindingManager<P, PM>
    ) {
        super();
        this._toggleableSlideableValue = toggleableSlideableValue;
        toggleableSlideableValue.onSlide = this._valueChanged;
        toggleableSlideableValue.onCheckboxChange = this._toggleChanged;
        this._parent = parent;
        this._preferenceValueKey = preferenceValueKey;
        this._preferenceToggleKey = preferenceToggleKey;
        this._toggleableSlideableValue.renderTo(container);
    }
    parent() {
        return this._parent;
    }

    key1() {
        return this._preferenceValueKey;
    }

    key2() {
        return this._preferenceToggleKey;
    }

    _valueChanged = (value: number) => {
        this._parent.willUpdate(this._preferenceValueKey, this.getValue1(), value as any);
        this._parent.willUpdate(this._preferenceToggleKey, this.getValue2(), (true as unknown) as P[Key2]);
        this.setValue1(value as any);
        this.setValue2((true as unknown) as P[Key2]);
        this._parent.preferencesUpdated();
    };

    _toggleChanged = (toggle: boolean) => {
        this._parent.willUpdate(this._preferenceToggleKey, this.getValue2(), toggle as any);
        this.setValue2(toggle as any);
        this._parent.preferencesUpdated();
    };

    update() {
        const toggle = this.getValue2();
        const value = this.getValue1();
        this._toggleableSlideableValue.setValueAndToggle(value as any, toggle as any);
    }

    layoutUpdated() {
        this._toggleableSlideableValue.layoutUpdated();
    }
}
