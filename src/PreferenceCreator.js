"use strict";

import { titleCase } from "lib/util";

const isObject = function(val) {
    return typeof val === "object" && val !== null;
};

const valueFunction = function(value) {
    if (Array.isArray(value)) {
        var ret = new Array(value.length);
        for (var i = 0; i < value.length; ++i) {
            ret[i] = valueFunction(value[i]);
        }
        return ret;
    } else if (isObject(value)) {
        var ret = {};
        var keys = Object.keys(value);
        for (var i = 0; i < keys.length; ++i) {
            ret[keys[i]] = valueFunction(value[keys[i]]);
        }
        return ret;
    } else {
        return value;
    }
};

const arrayEquals = function(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
        return false;
    }
    if (a.length !== b.length) {
        return false;
    }
    for (var i = 0; i < a.length; ++i) {
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

    var aKeys = Object.keys(a);
    var bKeys = Object.keys(b);

    if (aKeys.length !== bKeys.length) {
        return false;
    }

    aKeys.sort();
    bKeys.sort();

    for (var i = 0; i < aKeys.length; ++i) {
        var aKey = aKeys[i];
        var bKey = bKeys[i];

        if (aKey !== bKey) {
            return false;
        }

        if (!equals(a[aKey], b[bKey])) {
            return false;
        }
    }

    return true;
};

const equals = function(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) {
        return arrayEquals(a, b);
    }

    if (isObject(a) || isObject(b)) {
        return objectEquals(a, b);
    }

    return a === b;
};

const createPreferences = function(spec) {
    spec = Object(spec);
    spec.preferences = Object(spec.preferences);
    spec.methods = Object(spec.methods);
    const preferenceNames = Object.keys(spec.preferences);

    const fieldsCode = preferenceNames.map(function(name) {
        var defaultName = "this.default" + titleCase(name);
        return "this.set" + titleCase(name) +"(('" + name + "' in fields) ? fields." + name + " : "+defaultName + ")";
    }).join(";\n");

    const constructorCode = "fields = Object(fields);\n" +
        fieldsCode + ";\n" +
        "Object.seal(this);\n"

    const Constructor = new Function("fields", constructorCode);

    preferenceNames.forEach(function(name) {
        var asValidMethodName = "asValid" + titleCase(name);
        var defaultName = "default" + titleCase(name);
        Constructor.prototype[asValidMethodName] = spec.preferences[name].asValidValue;
        Constructor.prototype[defaultName] = valueFunction(spec.preferences[name].defaultValue);
    });

    const equalsCode = "if (!other || !(other instanceof this.constructor)) return false;\n" +
        "return " + preferenceNames.map(function(name) {
        return "this._equals(this." + name + ", other." + name + ")";
    }).join(" &&\n") + ";\n";


    Constructor.prototype.equals = new Function("other", equalsCode);

    const copyFromCode = preferenceNames.map(function(name) {
        return "this.set" + titleCase(name) + "(other." + name + ")";
    }).join(";\n");

    Constructor.prototype.copyFrom = new Function("other", copyFromCode);

    const toJSONCode = "return {\n" +
        preferenceNames.map(function(name) {
            return "    " + name + ": this." + name;
        }).join(",\n") +
        "};\n";

    Constructor.prototype.toJSON = new Function(toJSONCode);

    Constructor.prototype.snapshot = function() {
        return new Constructor(this.toJSON());
    };

    preferenceNames.forEach(function(name) {
        var setterName = "set" + titleCase(name);
        var inplaceSetterName = "setInPlace" + titleCase(name);
        var getterName = "get" + titleCase(name);
        var inPlaceGetterName = "getInPlace" + titleCase(name);
        var setterCode = "this." + name + " = this.asValid" + titleCase(name) + "(this._value(value));\n";
        var inplaceSetterCode = "this." + name + " = value;\n";
        var getterCode = "return this._value(this." + name + ");\n";
        var inPlaceGetterCode = "return this." + name + ";\n";
        Constructor.prototype[getterName] = new Function(getterCode);
        Constructor.prototype[inPlaceGetterName] = new Function(inPlaceGetterCode);
        Constructor.prototype[setterName] = new Function("value", setterCode);
        Constructor.prototype[inplaceSetterName] = new Function("value", inplaceSetterCode);

    });

    Constructor.prototype._equals = equals;
    Constructor.prototype._value = valueFunction;

    Object.keys(spec.methods).forEach(function(methodName) {
        Constructor.prototype[methodName] = spec.methods[methodName];
    });

    return Constructor;
};

module.exports = createPreferences;
