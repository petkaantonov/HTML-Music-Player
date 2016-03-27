"use strict";

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
    this.bounderNode = this.page().NULL();
    this.rippleNode = this.page().NULL();
    this.animator = null;
    this.type = "unbounded";
    this.id = null;
    this.end = this.end.bind(this);
}

Ripple.prototype.$bounder = function() {
    return this.bounderNode;
};

Ripple.prototype.$ripple = function() {
    return this.rippleNode;
};

Ripple.prototype.initBoundedDom = function() {
    this.bounderNode = this.page().createElement("div", {class: "bounder-node"}).setStyles({
        transform: "translate3d("+this.boundsRect.left+"px, "+this.boundsRect.top+"px, 0)",
        width: this.boundsRect.width + "px",
        height: this.boundsRect.height + "px"
    });

    var x = this.x - this.boundsRect.left - BASE_RADIUS;
    var y = this.y - this.boundsRect.top - BASE_RADIUS;

    this.rippleNode = this.page().createElement("div", {class: "ripple-node"}).setStyles({
        backgroundColor: this.color,
        transform: "translate3d("+x+"px, "+y+"px, 0)",
        width: (BASE_RADIUS * 2) + "px",
        height: (BASE_RADIUS * 2) + "px"
    });

    this.rippleNode.appendTo(this.bounderNode);
    this.bounderNode.appendTo(this.rippler.$());
};

Ripple.prototype.initUnboundedDom = function() {
    var x = this.x - BASE_RADIUS;
    var y = this.y - BASE_RADIUS;
    this.rippleNode = this.page().createElement("div", {class: "ripple-node"}).setStyles({
        backgroundColor: this.color,
        transform: "translate3d("+x+"px, "+y+"px, 0)",
        width: (BASE_RADIUS * 2) + "px",
        height: (BASE_RADIUS * 2) + "px"
    });

    this.rippleNode.appendTo(this.rippler.$());
};

Ripple.prototype.initBounded = function(x, y, boundsRect, color, zIndex) {
    this.id = null;
    this.type = "bounded";
    this.x = x;
    this.y = y;
    this.boundsRect = boundsRect;
    this.color = color;
    this.initBoundedDom();

    this.$ripple().setStyle("zIndex", zIndex);
    this.$bounder().setStyle("zIndex", zIndex);

    var centerX = boundsRect.left + boundsRect.width / 2;
    var centerY = boundsRect.top + boundsRect.height / 2;

    var cornerX = x > centerX ? boundsRect.left : boundsRect.right;
    var cornerY = y > centerY ? boundsRect.top : boundsRect.bottom;


    var endRadius = Math.sqrt(Math.pow(Math.abs(cornerX - x), 2) +
                                Math.pow(Math.abs(cornerY - y), 2)) * 1.1;

    var startScale = radiusToScale(1);
    var endScale = radiusToScale(endRadius);

    var animator = this.animationContext().createAnimator(this.$ripple(), {
        opacity: {
            range: [BOUNDED_START_OPACITY, BOUNDED_END_OPACITY],
            interpolate: this.animationContext().LINEAR,
            duration: BOUNDED_OPACITY_DURATION,
            unit: "%"
        },
        scale: {
            range: [
                [startScale, startScale],
                [endScale, endScale]
            ],
            interpolate: interp,
            duration: BOUNDED_RADIUS_DURATION,
            baseValue: this.$ripple().getTransform()
        }
    });

    this.animator = animator;
    animator.start(Math.max(BOUNDED_RADIUS_DURATION, BOUNDED_OPACITY_DURATION)).finally(this.end);
};

Ripple.prototype.initUnbounded = function(x, y, size, color) {
    this.id = null;
    this.type = "unbounded";
    this.x = x;
    this.y = y;
    this.color = color;
    this.initUnboundedDom();

    this.$ripple().setStyle("zIndex", "");

    var endRadius = size;
    var startScale = radiusToScale(1);
    var endScale = radiusToScale(endRadius);

    var animator = this.animationContext().createAnimator(this.$ripple(), {
        opacity: {
            range: [UNBOUNDED_START_OPACITY, UNBOUNDED_END_OPACITY],
            interpolate: this.animationContext().LINEAR,
            duration: UNBOUNDED_OPACITY_DURATION,
            unit: "%"
        },
        scale: {
            range: [
                [startScale, startScale],
                [endScale, endScale]
            ],
            interpolate: interp,
            duration: UNBOUNDED_RADIUS_DURATION,
            baseValue: this.$ripple().getTransform()
        }
    });

    this.animator = animator;
    animator.start(Math.max(UNBOUNDED_RADIUS_DURATION, UNBOUNDED_OPACITY_DURATION)).finally(this.end);
};

Ripple.prototype.end = function() {
    this.animator = null;
    this.$bounder().remove();
    this.$ripple().remove();
    this.rippleNode = this.page().NULL();
    this.bounderNode = this.page().NULL();
    this.rippler.rippleEnded(this);
};

Ripple.prototype.page = function() {
    return this.rippler._page;
};

Ripple.prototype.animationContext = function() {
    return this.rippler._animationContext;
};

export default function Rippler(opts, deps) {
    opts = Object(opts);
    this._animationContext = deps.animationContext;
    this._page = deps.page;
    this._domNode = this._page.$(opts.target);
    this._freeRipples = [];
    this._ongoingRipples = [];
    this._shown = false;
    this._baseZIndex = opts.zIndex;
    deps.ensure();
}

Rippler.prototype.$ = function() {
    return this._domNode;
};

Rippler.prototype.rippleStarted = function(ripple) {
    this._ongoingRipples.push(ripple);
    if (this._shown) return;
    this._shown = true;
};

Rippler.prototype.rippleEnded = function(ripple) {
    var i = this._ongoingRipples.indexOf(ripple);
    if (i >= 0) {
        this._ongoingRipples.splice(i, 1);
    }
    this._freeRipples.push(ripple);
    if (this._ongoingRipples.length === 0) {
        this._shown = false;
    }
};

Rippler.prototype.rippleElement = function(elem, x, y, color, zIndex) {
    var $elem = this._page.$(elem).eq(0);
    var rect = $elem[0].getBoundingClientRect();
    var id = $elem[0];

    for (var i = 0; i < this._ongoingRipples.length; ++i) {
        var ongoingRipple = this._ongoingRipples[i];
        if (ongoingRipple.id === id) {
            return;
        }
    }

    if (!color) color = "#000";
    if (zIndex == null) zIndex = "";
    if (zIndex !== "") zIndex = (+zIndex) + "";
    if (zIndex === "") zIndex = this._baseZIndex;
    var ripple = this._freeRipples.length ? this._freeRipples.shift() : new Ripple(this);
    this.rippleStarted(ripple);
    ripple.initBounded(x, y, rect, color, zIndex);
    ripple.id = id;

    for (var i = 0; i < this._ongoingRipples.length; ++i) {
        var ongoingRipple = this._ongoingRipples[i];
        if (ongoingRipple.type === "unbounded") {
            ongoingRipple.animator.stop();
        }
    }
};

Rippler.prototype.rippleAt = function(x, y, size, color) {
    if (!color) color = "#777";

    for (var i = 0; i < this._ongoingRipples.length; ++i) {
        var ongoingRipple = this._ongoingRipples[i];
        if (ongoingRipple.type === "bounded") {
            return;
        } else {
            var deltaX = Math.abs(x - ongoingRipple.x);
            var deltaY = Math.abs(y - ongoingRipple.y);
            if (deltaX < 24 && deltaY < 24) {
                return;
            }
        }
    }

    var ripple = this._freeRipples.length ? this._freeRipples.shift() : new Ripple(this);
    this.rippleStarted(ripple);
    ripple.initUnbounded(x, y, size, color);
};
