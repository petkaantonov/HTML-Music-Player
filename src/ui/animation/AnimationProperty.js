"use strict";

const TRANSFORM = 1;
const FILTER = 2;
const CSS = 3;
const NONE = 1;
const CYCLE = 2;
const REPEAT = 3;

const validProperties = [
    "scale", "scaleX", "scaleY", "scaleZ", "scale3d",
    "rotate", "rotateX", "rotateY", "rotateZ", "rotate3d",
    "translateX", "translateY", "translateZ", "translate", "translate3d",
    "skew", "skewX", "skewY", "matrix", "matrix3d",
    "opacity", "blur", "brightness", "contrast", "drop-shadow",
    "greyscale", "hue-rotate", "invert", "saturate", "sepia"];

const multiProperties = ["matrix", "matrix3d", "scale", "skew",
                         "translate", "scale3d", "translate3d",
                         "rotate3d", "drop-shadow"];
const transformProperties = [
    "scale", "scaleX", "scaleY", "scaleZ", "scale3d",
    "rotate", "rotateX", "rotateY", "rotateZ", "rotate3d",
    "translateX", "translateY", "translateZ", "translate", "translate3d",
    "skew", "skewX", "skewY", "matrix", "matrix3d"];

const filterProperties = [
    "blur", "brightness", "contrast",
    "drop-shadow", "greyscale", "hue-rotate",
    "invert", "saturate", "sepia", "opacity"];


const makePropertyClassifier = function(names) {
    const map = Object.create(null);
    for (var i = 0; i < names.length; ++i) map[names[i]] = true;
    Object.freeze(map);
    return function(v) {
        return map[v] === true;
    };
};

const isTransformProperty = makePropertyClassifier(transformProperties);
const isFilterProperty = makePropertyClassifier(filterProperties);
const isMultiProperty = makePropertyClassifier(multiProperties);
const isValidProperty = makePropertyClassifier(validProperties);

export default function AnimationProperty(animator, name, spec) {
    if (!isValidProperty(name)) {
        throw new Error(name + " is not animatable");
    }
    this._animator = animator;
    this._name = name;
    this._type = isFilterProperty(name) ? FILTER :
                 isTransformProperty(name) ? TRANSFORM :
                 CSS;
    this._isMulti = isMultiProperty(name);
    this._interp = spec.interpolate || animator.constructor.SWIFT_OUT;
    if (typeof this._interp !== "function") {
        throw new Error("interpolate must be a function");
    }
    this._unit = (spec.unit || "") + "";
    this._repeat = spec.repeat === "cycle" ? CYCLE :
                   spec.repeat === "repeat" ? REPEAT :
                   NONE;
    this._duration = +spec.duration || 300;
    this._baseValue = spec.baseValue === undefined ? "" : (spec.baseValue + "");

    var range = spec.range;

    if (this._isMulti) {
        this._start = range[0];
        this._end = range[1];
        if (!Array.isArray(this._start) ||
            !Array.isArray(this._end) ||
            this._start.length !== this._end.length) {
            throw new Error("multi property range must be an array");
        }
    } else {
        this._start = +range[0];
        this._end = +range[1];
    }
}

AnimationProperty.prototype.start = function($dom) {
    if (this._type === FILTER) {
        $dom.setFilter(this._baseValue);
    } else if (this._type === TRANSFORM) {
        $dom.setTransform(this._baseValue);
    } else {
        $dom.setStyle(this._name, this._baseValue);
    }
};

AnimationProperty.prototype.tween = function($dom, timeElapsed) {
    var total = this._duration;
    var finished = false;

    if (timeElapsed >= total) {
        if (this._repeat === NONE) {
            timeElapsed = total;
            finished = true;
        } else if (this._repeat === CYCLE) {
            if (Math.floor(timeElapsed / total) % 2 === 1) {
                timeElapsed = total - (timeElapsed % total);
            } else {
                timeElapsed = timeElapsed % total;
            }
        } else {
            timeElapsed = timeElapsed % total;
        }
    }

    var progress = this._interp(timeElapsed, total);
    var result = this._baseValue;

    if (this._isMulti) {
        for (var i = 0; i < this._start.length; ++i) {
            var start = +this._start[i];
            var end = +this._end[i];
            var value = Math.round(((progress * (end - start)) + start) * 1e6) / 1e6;

            if (i < this._start.length - 1) {
                result += (" " + value + this._unit + ",");
            } else {
                result += (" " + value + this._unit);
            }
        }
    } else {
        var start = this._start;
        var end = this._end;
        var value = Math.round(((progress * (end - start)) + start) * 1e6) / 1e6;
        result += (" " + value + this._unit);
    }

    if (this._type === FILTER) {
        $dom.setFilter(result);
    } else if (this._type === TRANSFORM) {
        $dom.setTransform(result);
    } else {
        $dom.setStyle(this._name, result);
    }

    return finished;
};

AnimationProperty.prototype.end = function($dom) {
    this.tween($dom, this._duration);
};
