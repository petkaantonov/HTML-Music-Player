"use strict";

const Animator = require("./Animator");
const $ = require("../lib/jquery");

const NULL = $(null);

const interp = function(currentTime, endTime) {
    var value = currentTime / endTime;
    return (1 - Math.pow(400, -value * 0.7142857142857143)) * 1.0140424162340527;
};

const BOUNDED_OPACITY_DURATION = 850;
const BOUNDED_RADIUS_DURATION = 650;
const UNBOUNDED_OPACITY_DURATION = 600;
const UNBOUNDED_RADIUS_DURATION = 300;

const UNBOUNDED_START_OPACITY = 40;
const UNBOUNDED_END_OPACITY = 0;
const BOUNDED_START_OPACITY = 14;
const BOUNDED_END_OPACITY = 0;

const BASE_RADIUS = 250;
const radiusToScale = function(radius) {
    return radius / BASE_RADIUS;
};

function Ripple(rippler) {
    this.rippler = rippler;
    this.x = -1;
    this.y = -1;
    this.boundsRect = null;
    this.color = null;
    this.bounderNode = NULL;
    this.rippleNode = NULL;
    this.end = this.end.bind(this);
}

Ripple.prototype.$bounder = function() {
    return this.bounderNode;
};

Ripple.prototype.$ripple = function() {
    return this.rippleNode;
};

Ripple.prototype.initBoundedDom = function() {
    this.bounderNode = $("<div>", {class: "bounder-node"}).css({
        transform: "translate3d("+this.boundsRect.left+"px, "+this.boundsRect.top+"px, 0)",
        width: this.boundsRect.width,
        height: this.boundsRect.height
    });

    var x = this.x - this.boundsRect.left - BASE_RADIUS;
    var y = this.y - this.boundsRect.top - BASE_RADIUS;

    this.rippleNode = $("<div>", {class: "ripple-node"}).css({
        backgroundColor: this.color,
        transform: "translate3d("+x+"px, "+y+"px, 0)",
        width: BASE_RADIUS * 2,
        height: BASE_RADIUS * 2
    });

    this.rippleNode.appendTo(this.bounderNode);
    this.bounderNode.appendTo(this.rippler.$());
};

Ripple.prototype.initUnboundedDom = function() {
    var x = this.x - BASE_RADIUS;
    var y = this.y - BASE_RADIUS;
    this.rippleNode = $("<div>", {class: "ripple-node"}).css({
        backgroundColor: this.color,
        transform: "translate3d("+x+"px, "+y+"px, 0)",
        width: BASE_RADIUS * 2,
        height: BASE_RADIUS * 2
    });

    this.rippleNode.appendTo(this.rippler.$());
};

Ripple.prototype.initBounded = function(x, y, boundsRect, color) {
    this.x = x;
    this.y = y;
    this.boundsRect = boundsRect;
    this.color = color;
    this.initBoundedDom();

    var centerX = boundsRect.left + boundsRect.width / 2;
    var centerY = boundsRect.top + boundsRect.height / 2;

    var cornerX = x > centerX ? boundsRect.left : boundsRect.right;
    var cornerY = y > centerY ? boundsRect.top : boundsRect.bottom;


    var endRadius = Math.sqrt(Math.pow(Math.abs(cornerX - x), 2) +
                           Math.pow(Math.abs(cornerY - y), 2)) * 1.1;

    var startScale = radiusToScale(1);
    var endScale = radiusToScale(endRadius);
    var animator = new Animator(this.$ripple()[0], {
        properties: [{
            name: "opacity",
            start: BOUNDED_START_OPACITY,
            end: BOUNDED_END_OPACITY,
            unit: "%",
            duration: BOUNDED_OPACITY_DURATION,
            interpolate: Animator.LINEAR
        }, {
            name: "scale",
            start: [startScale, startScale],
            end: [endScale, endScale],
            duration: BOUNDED_RADIUS_DURATION,
            interpolate: interp
        }]
    });

    animator.animate(Math.max(BOUNDED_RADIUS_DURATION, BOUNDED_OPACITY_DURATION)).then(this.end);
};

Ripple.prototype.initUnbounded = function(x, y, size, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.initUnboundedDom();

    var endRadius = size;
    var startScale = radiusToScale(1);
    var endScale = radiusToScale(endRadius);

    var animator = new Animator(this.$ripple()[0], {
        properties: [{
            name: "opacity",
            start: UNBOUNDED_START_OPACITY,
            end: UNBOUNDED_END_OPACITY,
            unit: "%",
            duration: UNBOUNDED_OPACITY_DURATION,
            interpolate: Animator.LINEAR
        }, {
            name: "scale",
            start: [startScale, startScale],
            end: [endScale, endScale],
            duration: UNBOUNDED_RADIUS_DURATION,
            interpolate: interp
        }]
    });

    animator.animate(Math.max(UNBOUNDED_RADIUS_DURATION, UNBOUNDED_OPACITY_DURATION)).then(this.end);
};

Ripple.prototype.end = function() {
    this.$bounder().remove();
    this.$ripple().remove();
    this.rippleNode = NULL;
    this.bounderNode = NULL;
    this.rippler.rippleEnded(this);
};

function Rippler(dom) {
    this._domNode = $($(dom)[0]);
    this._freeRipples = [];
    this._shown = false;
    this._rippleCount = 0;
    this.$().remove();
}

Rippler.prototype.$ = function() {
    return this._domNode;
};

Rippler.prototype.rippleStarted = function() {
    this._rippleCount++;
    if (this._shown) return;
    this._shown = true;
    this.$().appendTo("body");
};

Rippler.prototype.rippleEnded = function(ripple) {
    this._freeRipples.push(ripple);
    this._rippleCount--;
    if (this._rippleCount === 0) {
        this._shown = false;
        this.$().remove();
    }
};

Rippler.prototype.rippleElement = function(elem, x, y, color) {
    var $elem = $($(elem)[0]);
    var rect = $elem[0].getBoundingClientRect();
    if (!color) color = "#000";

    var ripple = this._freeRipples.length ? this._freeRipples.shift() : new Ripple(this);
    this.rippleStarted();
    ripple.initBounded(x, y, rect, color);
};

Rippler.prototype.rippleAt = function(x, y, size, color) {
    if (!color) color = "#777";
    var ripple = this._freeRipples.length ? this._freeRipples.shift() : new Ripple(this);
    this.rippleStarted();
    ripple.initUnbounded(x, y, size, color);
}

module.exports = Rippler;
