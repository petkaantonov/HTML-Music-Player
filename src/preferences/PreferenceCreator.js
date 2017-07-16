import {titleCase, noUndefinedGet} from "util";

const isObject = function(val) {
    return typeof val === `object` && val !== null;
};

const valueFunction = function(value) {
    if (Array.isArray(value)) {
        const ret = new Array(value.length);
        for (let i = 0; i < value.length; ++i) {
            ret[i] = valueFunction(value[i]);
        }
        return ret;
    } else if (isObject(value)) {
        const ret = {};
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; ++i) {
            ret[keys[i]] = valueFunction(value[keys[i]]);
        }
        return ret;
    } else {
        return value;
    }
};

/* eslint-disable no-use-before-define */
export const equals = function(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
        return arrayEquals(a, b);
    }

    if (isObject(a) || isObject(b)) {
        return objectEquals(a, b);
    }

    return a === b;
};
/* eslint-enable no-use-before-define */

const arrayEquals = function(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        return false;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; ++i) {
        if (!equals(a[i], b[i])) {
            return false;
        }
    }
    return true;
};

const objectEquals = function(a, b) {
    if (!isObject(a) || !isObject(b)) {
        return false;
    }

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    if (aKeys.length !== bKeys.length) {
        return false;
    }

    aKeys.sort();
    bKeys.sort();

    for (let i = 0; i < aKeys.length; ++i) {
        const aKey = aKeys[i];
        const bKey = bKeys[i];

        if (aKey !== bKey) {
            return false;
        }

        if (!equals(a[aKey], b[bKey])) {
            return false;
        }
    }

    return true;
};

const createPreferences = function(spec) {
    spec = Object(spec);
    const preferenceNames = Object.keys(spec.preferences);

    const fieldsCode = preferenceNames.map((name) => {
        const defaultName = `this.default${titleCase(name)}`;
        return `this.set${titleCase(name)}(('${name}' in fields) ? fields.${name} : ${defaultName})`;
    }).join(`;\n`);

    const constructorCode = `fields = Object(fields);\n${
        fieldsCode};\n` +
        `Object.seal(this);\n`;

    const Constructor = new Function(`fields`, constructorCode);

    preferenceNames.forEach((name) => {
        const asValidMethodName = `asValid${titleCase(name)}`;
        const defaultName = `default${titleCase(name)}`;
        Constructor.prototype[asValidMethodName] = spec.preferences[name].asValidValue;
        Constructor.prototype[defaultName] = valueFunction(spec.preferences[name].defaultValue);
    });

    const equalsCode = `${`if (!other || !(other instanceof this.constructor)) return false;\n` +
        `return `}${preferenceNames.map(name => `this._equals(this.${name}, other.${name})`).join(` &&\n`)};\n`;


    Constructor.prototype.equals = new Function(`other`, equalsCode);

    const copyFromCode = preferenceNames.map(name => `this.set${titleCase(name)}(other.${name})`).join(`;\n`);

    Constructor.prototype.copyFrom = new Function(`other`, copyFromCode);

    const toJSONCode = `return {\n${
        preferenceNames.map(name => `    ${name}: this.${name}`).join(`,\n`)
        }};\n`;

    Constructor.prototype.toJSON = new Function(toJSONCode);

    Constructor.prototype.snapshot = function() {
        return new Constructor(this.toJSON());
    };

    preferenceNames.forEach((name) => {
        const setterName = `set${titleCase(name)}`;
        const inplaceSetterName = `setInPlace${titleCase(name)}`;
        const getterName = `get${titleCase(name)}`;
        const inPlaceGetterName = `getInPlace${titleCase(name)}`;
        const setterCode = `this.${name} = this.asValid${titleCase(name)}(this._value(value));\n`;
        const inplaceSetterCode = `this.${name} = value;\n`;
        const getterCode = `return this._value(this.${name});\n`;
        const inPlaceGetterCode = `return this.${name};\n`;
        Constructor.prototype[getterName] = new Function(getterCode);
        Constructor.prototype[inPlaceGetterName] = new Function(inPlaceGetterCode);
        Constructor.prototype[setterName] = new Function(`value`, setterCode);
        Constructor.prototype[inplaceSetterName] = new Function(`value`, inplaceSetterCode);

    });

    Constructor.prototype.set = function(key, value) {
        this[key] = spec.preferences[key].asValidValue.call(this, valueFunction(value));
    };

    Constructor.prototype.get = function(key) {
        return valueFunction(this[key]);
    };

    Constructor.prototype._equals = equals;
    Constructor.prototype._value = valueFunction;

    Object.keys(spec.methods).forEach((methodName) => {
        Constructor.prototype[methodName] = spec.methods[methodName];
    });

    return Constructor;
};

export default createPreferences;
